/**
 * Navies: fleets of warships and their admirals, the sea lanes, naval battles and blockades, and the
 * transports that carry armies over the sea, where enemy ships may catch them.
 */
import {
  LONGSHIPS,
  SHIP_LINES,
  SHIP_ORDER,
  SHIPS,
  STEAM_LOOKS,
  SUBMARINE_ERA,
  sailSpeed,
  shipDef,
  TRANSPORT_CAPACITY,
  transportCost,
  transportUpkeep,
  type ShipLook,
} from '../data/ships';
import { cultureGroup } from './beliefs';
import { alive, character, die, makeCharacter, skill } from './characters';
import { accessSet } from './diplomacy';
import { revealAround } from './exploration';
import { firstFree, log } from './log';
import { findPath, isWater, stepDays } from './movement';
import { armySize, atWar, provincesOf, sideOf } from './queries';
import { chance, jitter } from './rng';
import { knowsId, militaryEra, techEffect } from './tech';
import type { Army, Country, Fleet, FleetSide, GameState, NavalBattle, Ships, ShipType, UnitType } from './types';
import type { SimWorld } from './world';

// ── Ships ─────────────────────────────────────────────────────────

/** What a realm's ships of a role are called and look like, by its military era. */
export function shipLook(c: Country | undefined, t: ShipType | 'transport'): ShipLook {
  const era = c ? militaryEra(c) : 0;
  if (era === 0 && t === 'heavy' && c && cultureGroup(c.culture) === 'norse') return LONGSHIPS;
  if (era === 3 && c && knowsId(c, 'steamships')) {
    const steam = STEAM_LOOKS[t];
    if (steam) return steam;
  }
  return SHIP_LINES[t][era] ?? SHIP_LINES[t][0];
}

export function shipsIn(s: Ships): number {
  let n = 0;
  for (const k in s) n += s[k as ShipType] ?? 0;
  return n;
}

export const fleetSize = (f: Fleet) => shipsIn(f.ships);

export function fleetsOf(state: GameState, owner: number): Fleet[] {
  return state.fleets.filter((f) => f.owner === owner);
}

export function fleetById(state: GameState, id: number): Fleet | undefined {
  return state.fleets.find((f) => f.id === id);
}

/** Roles of warship a realm can build: submarines from the modern era. */
export function availableShips(c: Country): ShipType[] {
  return SHIP_ORDER.filter((t) => t !== 'submarine' || militaryEra(c) >= SUBMARINE_ERA);
}

/** Sailing speed of a fleet: its slowest ships, in the realm's era. */
export function fleetSpeed(state: GameState, f: Fleet): number {
  const c = state.countries[f.owner];
  let slowest = Infinity;
  for (const t of SHIP_ORDER) if ((f.ships[t] ?? 0) >= 1) slowest = Math.min(slowest, SHIPS[t].speed);
  if (slowest === Infinity) slowest = 1;
  return sailSpeed(c ? militaryEra(c) : 0, !!c && knowsId(c, 'steamships')) * slowest;
}

export function fleetStepDays(state: GameState, world: SimWorld, f: Fleet, from: number, to: number): number {
  return Math.max(1, Math.round(stepDays(world, from, to, true) / fleetSpeed(state, f)));
}

/** Fighting strength of a fleet, for comparisons: guns and hulls, and the crews' spirit. */
export function fleetPower(state: GameState, f: Fleet): number {
  const c = state.countries[f.owner];
  const era = c ? militaryEra(c) : 0;
  let p = 0;
  for (const [t, n] of Object.entries(f.ships) as [ShipType, number][]) {
    const d = shipDef(t, era);
    p += n * Math.sqrt(d.attack * d.hull);
  }
  return p * (0.5 + 0.5 * f.morale);
}

/** True when a fleet lies in port rather than at sea. */
export function inPort(world: SimWorld, f: Fleet): boolean {
  return world.region(f.location)?.kind === 'land';
}

// ── Transports ────────────────────────────────────────────────────

/** Men the realm's transports can carry at once. */
export function transportCapacity(c: Country): number {
  return Math.floor(c.transports) * TRANSPORT_CAPACITY[militaryEra(c)];
}

const afloat = new WeakMap<GameState, { day: number; men: Map<number, number> }>();

/** Men of a country at sea, counted once a day and again whenever an army takes ship. */
export function menAtSea(state: GameState, world: SimWorld, owner: number): number {
  let hit = afloat.get(state);
  if (!hit || hit.day !== state.day) {
    const men = new Map<number, number>();
    for (const a of state.armies)
      if (isWater(world.region(a.location))) men.set(a.owner, (men.get(a.owner) ?? 0) + armySize(a));
    afloat.set(state, (hit = { day: state.day, men }));
  }
  return hit.men.get(owner) ?? 0;
}

/** An army took ship: count again. */
export function embarked(state: GameState) {
  afloat.delete(state);
}

/** Room left on the transports. */
export function freeTransport(state: GameState, world: SimWorld, owner: number): number {
  const c = state.countries[owner];
  return c ? transportCapacity(c) - menAtSea(state, world, owner) : 0;
}

/** Whether an army may take to the sea now: it is already afloat, or there is room on the transports. */
export function canShip(state: GameState, world: SimWorld, army: Army): boolean {
  return isWater(world.region(army.location)) || freeTransport(state, world, army.owner) >= armySize(army);
}

/** Coastal provinces where a realm can build ships: its own, held, and not blockaded. */
export function shipyards(state: GameState, world: SimWorld, c: Country): number[] {
  const blocked = blockades(state);
  return provincesOf(state, c.index).filter(
    (id) => world.region(id).coastal && state.provinces[id].controller === c.index && !blocked.has(id),
  );
}

export type NavalCheck = { ok: true; cost: number } | { ok: false; reason: string };

export function canBuildTransports(state: GameState, world: SimWorld, c: Country, n: number): NavalCheck {
  if (n < 1) return { ok: false, reason: 'Nothing to build' };
  if (!shipyards(state, world, c).length) return { ok: false, reason: 'You hold no free port' };
  const cost = Math.round(transportCost(militaryEra(c)) * n);
  if (c.gold < cost) return { ok: false, reason: `Needs ${cost} gold` };
  return { ok: true, cost };
}

export function buildTransports(state: GameState, world: SimWorld, c: Country, n: number): NavalCheck {
  const check = canBuildTransports(state, world, c, n);
  if (!check.ok) return check;
  c.gold -= check.cost;
  c.transports += n;
  return check;
}

// ── Building warships ─────────────────────────────────────────────

export function shipCost(c: Country, t: ShipType, n: number): number {
  return shipDef(t, militaryEra(c)).cost * n;
}

export function canBuildShips(
  state: GameState,
  world: SimWorld,
  c: Country,
  province: number,
  t: ShipType,
  n: number,
): NavalCheck {
  const p = state.provinces[province];
  if (!p || p.owner !== c.index) return { ok: false, reason: 'Not your province' };
  if (!world.region(province).coastal) return { ok: false, reason: 'Needs a coast' };
  if (p.controller !== c.index) return { ok: false, reason: 'The province is occupied' };
  if (blockades(state).has(province)) return { ok: false, reason: 'The port is blockaded' };
  if (!availableShips(c).includes(t)) return { ok: false, reason: 'Not yet known' };
  if (n < 1) return { ok: false, reason: 'Nothing to build' };
  const cost = shipCost(c, t, n);
  if (c.gold < cost) return { ok: false, reason: `Needs ${cost} gold` };
  return { ok: true, cost };
}

/** Builds warships in a port: they join a fleet lying there, or form a new one. */
export function buildShips(
  state: GameState,
  world: SimWorld,
  c: Country,
  province: number,
  t: ShipType,
  n: number,
): Fleet | null {
  const check = canBuildShips(state, world, c, province, t, n);
  if (!check.ok) return null;
  c.gold -= check.cost;
  const here = state.fleets.find(
    (f) => f.owner === c.index && f.location === province && !f.path.length && !f.mission && !fleetInBattle(state, f),
  );
  if (here) {
    here.ships[t] = (here.ships[t] ?? 0) + n;
    return here;
  }
  return newFleet(state, world, c, province, { [t]: n });
}

// ── Fleets ────────────────────────────────────────────────────────

/** The first number free among the realm's fleets: a fleet lost leaves its name to the next. */
function fleetName(state: GameState, c: Country): string {
  const taken = state.fleets.filter((f) => f.owner === c.index).map((f) => f.name);
  return firstFree(taken, (nth) => `${nth} Fleet of ${c.short.replace(/^the /, '')}`);
}

/** Characters free to command a fleet, best sailors first: those who lead no army or fleet. */
export function freeAdmirals(state: GameState, c: Country): number[] {
  const busy = new Set([...state.armies.map((a) => a.commander), ...state.fleets.map((f) => f.admiral)]);
  const pool = [c.council.marshal, ...c.courtiers, c.heir, c.ruler].filter(
    (id, i, all) => id && alive(state, id) && !busy.has(id) && all.indexOf(id) === i,
  );
  return pool.sort((a, b) => skill(character(state, b), 'mar') - skill(character(state, a), 'mar'));
}

export function newFleet(state: GameState, world: SimWorld, c: Country, location: number, ships: Ships): Fleet {
  let admiral = freeAdmirals(state, c)[0] ?? 0;
  if (!admiral) {
    const a = makeCharacter(state, world, c, { place: true, talent: 1 });
    c.courtiers.push(a.id);
    admiral = a.id;
  }
  const fleet: Fleet = {
    id: state.nextId++,
    owner: c.index,
    name: fleetName(state, c),
    admiral,
    location,
    ships,
    morale: 1,
    path: [],
    progress: 0,
    stepDays: 0,
    replan: state.day,
    objective: 0,
  };
  state.fleets.push(fleet);
  return fleet;
}

export function mergeFleets(state: GameState, target: Fleet, other: Fleet) {
  const total = fleetSize(target) + fleetSize(other);
  target.morale = total ? (target.morale * fleetSize(target) + other.morale * fleetSize(other)) / total : 1;
  for (const [t, n] of Object.entries(other.ships) as [ShipType, number][])
    target.ships[t] = (target.ships[t] ?? 0) + n;
  if (skill(character(state, other.admiral), 'mar') > skill(character(state, target.admiral), 'mar'))
    target.admiral = other.admiral;
  state.fleets = state.fleets.filter((f) => f !== other);
}

/** Splits a fleet in two halves; the new one gets the next best free admiral. */
export function splitFleet(state: GameState, world: SimWorld, f: Fleet): Fleet | null {
  if (fleetSize(f) < 2 || fleetInBattle(state, f)) return null;
  const c = state.countries[f.owner];
  const half: Ships = {};
  for (const [t, n] of Object.entries(f.ships) as [ShipType, number][]) {
    const h = Math.floor(n / 2);
    if (h > 0) half[t] = h;
    f.ships[t] = n - h;
  }
  if (!shipsIn(half)) return null;
  const other = newFleet(state, world, c, f.location, half);
  other.morale = f.morale;
  return other;
}

/** Ships paid off: the fleet is gone. */
export function disbandFleet(state: GameState, f: Fleet): boolean {
  if (fleetInBattle(state, f)) return false;
  state.fleets = state.fleets.filter((x) => x !== f);
  return true;
}

// ── Sea lanes and orders ──────────────────────────────────────────

/** Whether a fleet of `owner` may put in at a coastal province: held by its realm or by friends. */
export function mayDock(state: GameState, owner: number, province: number): boolean {
  const ctrl = state.provinces[province]?.controller ?? 0;
  if (!ctrl) return false;
  if (ctrl === owner) return true;
  return accessSet(state, owner).has(ctrl) && !atWar(state, owner, ctrl);
}

const oceans = new WeakMap<SimWorld, Set<number>>();

/** Open ocean: water with no coast in sight, closed to ships that cannot cross the ocean. */
export function isOpenOcean(world: SimWorld, id: number): boolean {
  let set = oceans.get(world);
  if (!set) {
    set = new Set();
    for (const r of world.regions)
      if (isWater(r) && !r.adj.some(([n]) => world.region(n)?.kind === 'land')) set.add(r.id);
    oceans.set(world, set);
  }
  return set.has(id);
}

export function oceanGoing(c: Country | undefined): boolean {
  return !!c && techEffect(c, 'ocean') > 0;
}

/** The route a fleet may sail: through water it can navigate, ending in a friendly port or at sea. */
export function fleetRoute(state: GameState, world: SimWorld, f: Fleet, from: number, to: number): number[] | null {
  const target = world.region(to);
  if (!target) return null;
  if (target.kind === 'land' && !mayDock(state, f.owner, to)) return null;
  const ocean = oceanGoing(state.countries[f.owner]);
  if (!ocean && isOpenOcean(world, to)) return null;
  return findPath(world, from, to, {
    fleet: true,
    penalty: (id) => {
      if (world.region(id).kind === 'land') return id === to ? 0 : Infinity;
      return !ocean && isOpenOcean(world, id) ? Infinity : 0;
    },
  });
}

/** Orders a fleet to sail; false if there is no way. */
export function orderFleet(state: GameState, world: SimWorld, f: Fleet, to: number): boolean {
  if (fleetInBattle(state, f) || f.retreating) return false;
  if (to === f.location) {
    f.path = [];
    f.progress = 0;
    return true;
  }
  // Keep on to the next region if already under way.
  const from = f.path.length && f.progress > 0 ? f.path[0] : f.location;
  const path = fleetRoute(state, world, f, from, to);
  if (!path) return false;
  if (from !== f.location) f.path = [from, ...path];
  else {
    f.path = path;
    f.progress = 0;
    f.stepDays = path.length ? fleetStepDays(state, world, f, f.location, path[0]) : 0;
  }
  return true;
}

/** The nearest port a fleet can reach and put in at, with the way there. */
export function homePort(state: GameState, world: SimWorld, f: Fleet): { port: number; path: number[] } | null {
  const here = world.region(f.location);
  const own = provincesOf(state, f.owner).filter(
    (id) => world.region(id).coastal && state.provinces[id].controller === f.owner,
  );
  const dist = (id: number) => {
    const r = world.region(id);
    return (r.lat - here.lat) ** 2 + (r.lon - here.lon) ** 2;
  };
  for (const id of own.sort((a, b) => dist(a) - dist(b)).slice(0, 6)) {
    if (id === f.location) return { port: id, path: [] };
    const path = fleetRoute(state, world, f, f.location, id);
    if (path) return { port: id, path };
  }
  return null;
}

// ── Sailing ───────────────────────────────────────────────────────

/** Moves every sailing fleet a day along its way; fleets see the waters and coasts they reach. */
export function dailySail(state: GameState, world: SimWorld): Fleet[] {
  const arrived: Fleet[] = [];
  for (const f of state.fleets) {
    if (!f.path.length || fleetInBattle(state, f)) continue;
    if (f.stepDays <= 0) f.stepDays = fleetStepDays(state, world, f, f.location, f.path[0]);
    f.progress++;
    if (f.progress < f.stepDays) continue;
    const next = f.path[0];
    // A port that closed to us on the way (a war, a treaty ended): stay at sea.
    if (world.region(next).kind === 'land' && !mayDock(state, f.owner, next)) {
      f.path = [];
      f.progress = 0;
      f.retreating = false;
      continue;
    }
    f.location = f.path.shift()!;
    f.progress = 0;
    f.stepDays = f.path.length ? fleetStepDays(state, world, f, f.location, f.path[0]) : 0;
    if (!f.path.length) f.retreating = false;
    const fresh = revealAround(state, world, f.owner, f.location, 1);
    if (fresh && f.mission === 'explore' && f.owner === state.player) reportDiscovery(state, world, f);
    arrived.push(f);
  }
  return arrived;
}

/** News of an expedition's discoveries, at most one a month. */
function reportDiscovery(state: GameState, world: SimWorld, f: Fleet) {
  const last = state.messages.findLast((m) => m.kind === 'discovery');
  if (last && state.day - last.day < 30) return;
  const coast = world
    .region(f.location)
    .adj.map(([n]) => world.region(n))
    .find((r) => r.kind === 'land');
  const where = coast ? `the coast of ${coast.name}` : `the ${world.region(f.location).name}`;
  log(state, [f.owner], 'discovery', `${f.name} has charted ${where}.`, { province: f.location });
}

/**
 * Crews recover in port and slowly at sea; sunk fleets are gone. A fleet whose port has fallen to the
 * enemy, or closed to it, puts to sea.
 */
export function dailyFleets(state: GameState, world: SimWorld) {
  const fighting = new Set<number>();
  for (const b of state.navalBattles) for (const id of [...b.attacker.fleets, ...b.defender.fleets]) fighting.add(id);
  const checkPorts = state.day % 5 === 0;
  let sunk = false;
  for (const f of state.fleets) {
    if (fleetSize(f) < 0.5) sunk = true;
    if (fighting.has(f.id)) continue;
    const port = world.region(f.location).kind === 'land';
    const safe = !checkPorts || !port || f.path.length || state.provinces[f.location]?.controller === f.owner;
    if (!safe && !mayDock(state, f.owner, f.location)) {
      const sea = world.region(f.location).adj.find(([n]) => isWater(world.region(n)));
      if (sea) {
        f.location = sea[0];
        log(state, [f.owner], 'naval', `${f.name} put to sea: its port is no longer safe.`, { province: sea[0] });
      }
    }
    if (f.morale < 1) {
      const doctrine = techEffect(state.countries[f.owner], 'morale');
      f.morale = Math.min(1, f.morale + (port ? 0.04 : 0.01) + doctrine / 2);
    }
  }
  if (sunk) state.fleets = state.fleets.filter((f) => fleetSize(f) >= 0.5);
}

// ── Naval battles ─────────────────────────────────────────────────

const MAX_BATTLE_DAYS = 8;

export function navalBattleAt(state: GameState, zone: number): NavalBattle | undefined {
  return state.navalBattles.find((b) => b.zone === zone);
}

export function fleetInBattle(state: GameState, f: Fleet): boolean {
  for (const b of state.navalBattles)
    if (b.attacker.fleets.includes(f.id) || b.defender.fleets.includes(f.id)) return true;
  return false;
}

function fleetsOfSide(state: GameState, side: FleetSide): Fleet[] {
  return side.fleets.map((id) => fleetById(state, id)).filter((f): f is Fleet => !!f);
}

function sideShips(fleets: Fleet[]): Ships {
  const s: Ships = {};
  for (const f of fleets) for (const [t, n] of Object.entries(f.ships) as [ShipType, number][]) s[t] = (s[t] ?? 0) + n;
  return s;
}

/** Hostile fleets that meet at sea give battle; those lying in port are safe. */
export function startNavalBattles(state: GameState, world: SimWorld, arrived: Fleet[]) {
  if (state.fleets.length < 2 || !state.wars.length) return;
  const fighting = new Set<number>();
  for (const w of state.wars) for (const x of [...w.attackers, ...w.defenders]) fighting.add(x);
  const byZone = new Map<number, Fleet[]>();
  for (const f of state.fleets) {
    if (!fighting.has(f.owner) || f.retreating || !isWater(world.region(f.location)) || fleetSize(f) < 0.5) continue;
    let list = byZone.get(f.location);
    if (!list) byZone.set(f.location, (list = []));
    list.push(f);
  }
  for (const [zone, fleets] of byZone) {
    if (fleets.length < 2) continue;
    const existing = navalBattleAt(state, zone);
    if (existing) {
      for (const f of fleets) {
        if (existing.attacker.fleets.includes(f.id) || existing.defender.fleets.includes(f.id)) continue;
        if (atWar(state, f.owner, existing.defender.country)) existing.attacker.fleets.push(f.id);
        else if (atWar(state, f.owner, existing.attacker.country)) existing.defender.fleets.push(f.id);
      }
      continue;
    }
    let pair: [Fleet, Fleet] | null = null;
    for (let i = 0; i < fleets.length && !pair; i++)
      for (let j = i + 1; j < fleets.length; j++)
        if (atWar(state, fleets[i].owner, fleets[j].owner)) {
          pair = [fleets[i], fleets[j]];
          break;
        }
    if (!pair) continue;
    const [x, y] = pair;
    const sideX = fleets.filter((f) => atWar(state, f.owner, y.owner) && !atWar(state, f.owner, x.owner));
    const sideY = fleets.filter((f) => atWar(state, f.owner, x.owner) && !atWar(state, f.owner, y.owner));
    const xAttacks = sideX.some((f) => arrived.includes(f)) || !sideY.some((f) => arrived.includes(f));
    const att = xAttacks ? sideX : sideY;
    const def = xAttacks ? sideY : sideX;
    for (const f of [...att, ...def]) {
      f.path = [];
      f.progress = 0;
    }
    state.navalBattles.push({
      id: state.nextId++,
      zone,
      day: state.day,
      attacker: { fleets: att.map((f) => f.id), country: att[0].owner, start: shipsIn(sideShips(att)), losses: 0 },
      defender: { fleets: def.map((f) => f.id), country: def[0].owner, start: shipsIn(sideShips(def)), losses: 0 },
    });
  }
}

function counterShare(t: ShipType, enemy: Ships, total: number): number {
  if (!total) return 0;
  let n = 0;
  for (const e of SHIP_ORDER) if (SHIPS[e].counters.includes(t)) n += enemy[e] ?? 0;
  return n / total;
}

function sideMorale(fleets: Fleet[]): number {
  const n = fleets.reduce((s, f) => s + fleetSize(f), 0);
  return n ? fleets.reduce((s, f) => s + f.morale * fleetSize(f), 0) / n : 0;
}

function bestAdmiral(state: GameState, fleets: Fleet[]): number {
  return fleets.reduce((m, f) => Math.max(m, skill(character(state, f.admiral), 'mar')), 0);
}

/** Damage a side deals in a day of battle. */
function volley(state: GameState, fleets: Fleet[], enemy: Ships): number {
  const total = shipsIn(enemy);
  let d = 0;
  for (const f of fleets) {
    const era = militaryEra(state.countries[f.owner]);
    for (const [t, n] of Object.entries(f.ships) as [ShipType, number][])
      d += n * shipDef(t, era).attack * (1 - 0.5 * counterShare(t, enemy, total));
  }
  return d * (1 + 0.05 * bestAdmiral(state, fleets)) * (0.5 + 0.5 * sideMorale(fleets)) * (1 + 0.15 * jitter(state));
}

/** Sinks ships of a side in proportion to their numbers; returns ships lost. */
function sink(state: GameState, fleets: Fleet[], damage: number): number {
  const total = fleets.reduce((s, f) => s + fleetSize(f), 0);
  if (!total) return 0;
  let lost = 0;
  for (const f of fleets) {
    const era = militaryEra(state.countries[f.owner]);
    for (const [t, n] of Object.entries(f.ships) as [ShipType, number][]) {
      const l = Math.min(n, (damage * (n / total)) / shipDef(t, era).hull);
      f.ships[t] = n - l;
      lost += l;
    }
  }
  return lost;
}

export function dailyNavalBattles(state: GameState, world: SimWorld) {
  for (const battle of [...state.navalBattles]) {
    const att = fleetsOfSide(state, battle.attacker);
    const def = fleetsOfSide(state, battle.defender);
    battle.attacker.fleets = att.map((f) => f.id);
    battle.defender.fleets = def.map((f) => f.id);
    const nA = att.reduce((s, f) => s + fleetSize(f), 0);
    const nD = def.reduce((s, f) => s + fleetSize(f), 0);
    if (nA < 0.5 || nD < 0.5) {
      endNavalBattle(state, world, battle, nA >= 0.5 ? 'attacker' : 'defender');
      continue;
    }
    const sA = sideShips(att),
      sD = sideShips(def);
    const dmgA = volley(state, att, sD);
    const dmgD = volley(state, def, sA);
    const lostD = sink(state, def, dmgA * 0.3);
    const lostA = sink(state, att, dmgD * 0.3);
    battle.attacker.losses += lostA;
    battle.defender.losses += lostD;
    for (const f of att) f.morale = Math.max(0, f.morale - (lostA / nA) * 2 - 0.05);
    for (const f of def) f.morale = Math.max(0, f.morale - (lostD / nD) * 2 - 0.05);
    const leftA = nA - lostA,
      leftD = nD - lostD;
    const brokenA = sideMorale(att) <= 0.2 || leftA < battle.attacker.start * 0.25;
    const brokenD = sideMorale(def) <= 0.2 || leftD < battle.defender.start * 0.25;
    if (brokenA || brokenD || state.day - battle.day >= MAX_BATTLE_DAYS) {
      let winner: 'attacker' | 'defender';
      if (brokenA && !brokenD) winner = 'defender';
      else if (brokenD && !brokenA) winner = 'attacker';
      else winner = leftA / battle.attacker.start >= leftD / battle.defender.start ? 'attacker' : 'defender';
      endNavalBattle(state, world, battle, winner);
    }
  }
}

function endNavalBattle(state: GameState, world: SimWorld, battle: NavalBattle, winner: 'attacker' | 'defender') {
  state.navalBattles = state.navalBattles.filter((b) => b !== battle);
  const W = winner === 'attacker' ? battle.attacker : battle.defender;
  const L = winner === 'attacker' ? battle.defender : battle.attacker;
  const winners = fleetsOfSide(state, W);
  const losers = fleetsOfSide(state, L);
  // The beaten make for home; a fleet with no port to reach is lost.
  for (const f of losers) {
    f.morale = 0;
    const home = homePort(state, world, f);
    if (!home) {
      L.losses += fleetSize(f);
      f.ships = {};
      continue;
    }
    f.path = home.path;
    f.progress = 0;
    f.stepDays = home.path.length ? fleetStepDays(state, world, f, f.location, home.path[0]) : 0;
    f.retreating = home.path.length > 0;
    f.objective = 0;
    f.mission = undefined;
  }
  state.fleets = state.fleets.filter((f) => fleetSize(f) >= 0.5);
  for (const f of losers) {
    const a = character(state, f.admiral);
    if (a && chance(state, 0.08)) die(state, world, a);
  }
  const war = state.wars.find((w) => {
    const sw = sideOf(w, W.country),
      sl = sideOf(w, L.country);
    return sw && sl && sw !== sl;
  });
  if (war) {
    const swing = Math.min(8, (30 * L.losses) / Math.max(1, W.start + L.start) + 1);
    const sign = sideOf(war, W.country) === 'attacker' ? 1 : -1;
    war.battleScore = Math.max(-40, Math.min(40, war.battleScore + sign * swing));
  }
  const place = world.region(battle.zone).name;
  const wc = state.countries[W.country],
    lc = state.countries[L.country];
  const n = (x: number) => Math.round(x);
  log(
    state,
    [...winners.map((f) => f.owner), ...losers.map((f) => f.owner)],
    'naval',
    `Battle of the ${place}: ${wc.adj} victory at sea over the ${lc?.adj ?? 'enemy'} fleet. Ships sunk: ${n(W.losses)} against ${n(L.losses)}.`,
    { province: battle.zone, important: losers.some((f) => f.owner === state.player) },
  );
}

// ── Blockades ─────────────────────────────────────────────────────

const blockadeMaps = new WeakMap<GameState, Map<number, number>>();
const NONE = new Map<number, number>();

/**
 * Finds the enemy coasts under blockade: a coastal province held by an enemy, next to a sea where one
 * of our fleets lies undefeated. Worked out once a day, after the battles at sea.
 */
export function updateBlockades(state: GameState, world: SimWorld) {
  if (!state.fleets.length) {
    blockadeMaps.set(state, NONE);
    return;
  }
  const map = new Map<number, number>();
  const fighting = new Set<number>();
  for (const w of state.wars) for (const x of [...w.attackers, ...w.defenders]) fighting.add(x);
  for (const f of state.fleets) {
    if (!fighting.has(f.owner) || f.retreating || !isWater(world.region(f.location))) continue;
    if (fleetSize(f) < 1 || fleetInBattle(state, f)) continue;
    for (const [n] of world.region(f.location).adj) {
      const r = world.region(n);
      if (r.kind !== 'land' || !r.coastal) continue;
      const ctrl = state.provinces[n]?.controller ?? 0;
      if (ctrl && atWar(state, f.owner, ctrl)) map.set(n, f.owner);
    }
  }
  blockadeMaps.set(state, map);
}

/** Provinces under blockade as of this morning → the blockading country. */
export function blockades(state: GameState): Map<number, number> {
  return blockadeMaps.get(state) ?? NONE;
}

/** Share of a blockaded province's taxes lost to the blockade. */
export const BLOCKADE_TAX = 0.4;
/** Siege progress added where the besieged cannot be supplied from the sea. */
export const BLOCKADE_SIEGE = 0.25;

// ── Armies at sea ─────────────────────────────────────────────────

/** Men sunk a day by one point of raiding strength. */
const RAID_MEN = 10;

/**
 * Armies at sea where enemy warships lie, with no escort strong enough to fight them off, lose men
 * and transports every day until they make land.
 */
export function dailyInterception(state: GameState, world: SimWorld) {
  if (!state.fleets.length || !state.wars.length) return;
  let byZone: Map<number, Fleet[]> | null = null;
  for (const army of state.armies) {
    if (!isWater(world.region(army.location))) continue;
    if (!byZone) {
      byZone = new Map();
      for (const f of state.fleets) {
        if (f.retreating || fleetSize(f) < 0.5 || !isWater(world.region(f.location))) continue;
        let list = byZone.get(f.location);
        if (!list) byZone.set(f.location, (list = []));
        list.push(f);
      }
    }
    const here = byZone.get(army.location);
    if (!here) continue;
    const hostile = here.filter((f) => atWar(state, f.owner, army.owner) && !fleetInBattle(state, f));
    if (!hostile.length) continue;
    const escort = here
      .filter((f) => f.owner === army.owner || hostile.some((h) => atWar(state, f.owner, h.owner)))
      .reduce((s, f) => s + fleetPower(state, f), 0);
    const threat = hostile.reduce((s, f) => s + fleetPower(state, f), 0);
    if (escort >= threat * 0.5) continue;
    let raid = 0;
    for (const f of hostile) {
      const era = militaryEra(state.countries[f.owner]);
      for (const [t, n] of Object.entries(f.ships) as [ShipType, number][])
        raid += n * shipDef(t, era).attack * SHIPS[t].raid * (0.5 + 0.5 * f.morale);
    }
    const men = armySize(army);
    if (men <= 0) continue;
    const frac = Math.min(0.25, (raid * RAID_MEN) / men);
    for (const t of Object.keys(army.units) as UnitType[]) army.units[t] = (army.units[t] ?? 0) * (1 - frac);
    const owner = state.countries[army.owner];
    if (owner) {
      const perShip = TRANSPORT_CAPACITY[militaryEra(owner)];
      owner.transports = Math.max(0, owner.transports - (men * frac) / perShip);
    }
    if (!army.caught || state.day - army.caught > 30) {
      const enemy = state.countries[hostile[0].owner];
      log(
        state,
        [army.owner, hostile[0].owner],
        'naval',
        `${army.name} was caught at sea in the ${world.region(army.location).name} by the ${enemy?.adj ?? 'enemy'} fleet.`,
        { province: army.location, important: army.owner === state.player },
      );
    }
    army.caught = state.day;
  }
  state.armies = state.armies.filter((a) => armySize(a) >= 10);
}

// ── Upkeep ────────────────────────────────────────────────────────

/** Gold a month for the realm's warships and transports. */
export function navyUpkeep(state: GameState, c: Country): { fleets: number; transports: number } {
  const era = militaryEra(c);
  let fleets = 0;
  for (const f of state.fleets) {
    if (f.owner !== c.index) continue;
    for (const [t, n] of Object.entries(f.ships) as [ShipType, number][]) fleets += n * shipDef(t, era).upkeep;
  }
  return { fleets, transports: c.transports * transportUpkeep(era) };
}
