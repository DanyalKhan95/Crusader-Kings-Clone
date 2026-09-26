/**
 * Armies: raising and disbanding, recruiting men-at-arms, merging and splitting, marching, supply and
 * attrition.
 */
import { MAA_TYPES, UNITS } from '../data/units';
import { alive, character, makeCharacter, skill } from './characters';
import { accessSet, mayEnter } from './diplomacy';
import { buildingEffect } from './economy';
import { log } from './log';
import { findPath, stepDays } from './movement';
import { armySize, atWar, menIn } from './queries';
import type { Army, Country, GameState, UnitType, Units } from './types';
import type { SimWorld } from './world';

// ── Men-at-arms ───────────────────────────────────────────────────

/** Which men-at-arms a country can recruit. */
export function availableMaa(c: Country): UnitType[] {
  const steppe =
    c.gov === 'nomadic' ||
    ['cuman', 'oghuz', 'bulgar', 'karluk', 'uyghur', 'mongol', 'khitan', 'alan'].includes(c.culture);
  return MAA_TYPES.filter((t) => {
    if (t === 'horse_archers') return steppe;
    if (t === 'knights') return c.gov === 'feudal' || c.gov === 'imperial' || c.gov === 'theocracy';
    return true;
  });
}

export function recruitCost(t: UnitType, regiments: number): number {
  return (UNITS[t].cost * UNITS[t].regiment * regiments) / 100;
}

/** Recruits regiments of men-at-arms into the reserve at home. */
export function recruit(c: Country, t: UnitType, regiments = 1): boolean {
  if (!availableMaa(c).includes(t) || regiments < 1) return false;
  const cost = recruitCost(t, regiments);
  if (c.gold < cost) return false;
  c.gold -= cost;
  c.reserve[t] = (c.reserve[t] ?? 0) + UNITS[t].regiment * regiments;
  return true;
}

// ── Raising and disbanding ────────────────────────────────────────

const ARMY_NAMES = ['Host', 'Army', 'Warband', 'Levy', 'Guard', 'Vanguard'];

function armyName(state: GameState, c: Country): string {
  const n = state.armies.filter((a) => a.owner === c.index).length;
  const ordinal = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth'][n] ?? `${n + 1}th`;
  return `${ordinal} ${ARMY_NAMES[c.gov === 'nomadic' || c.gov === 'tribal' ? 2 : 1]} of ${c.short.replace(/^the /, '')}`;
}

export function newArmy(state: GameState, c: Country, location: number, units: Units, commander = 0): Army {
  const army: Army = {
    id: state.nextId++,
    owner: c.index,
    name: armyName(state, c),
    commander,
    location,
    units,
    morale: 1,
    path: [],
    progress: 0,
    stepDays: 0,
    replan: state.day,
    objective: 0,
  };
  state.armies.push(army);
  return army;
}

/** Characters of a country free to lead an army, best first. */
export function freeCommanders(state: GameState, c: Country): number[] {
  const busy = new Set(state.armies.map((a) => a.commander));
  const pool = [c.ruler, c.council.marshal, ...c.courtiers, c.heir].filter(
    (id, i, all) => id && alive(state, id) && !busy.has(id) && all.indexOf(id) === i,
  );
  return pool.sort((a, b) => skill(character(state, b), 'mar') - skill(character(state, a), 'mar'));
}

/**
 * Calls up every available levy and all men-at-arms at home, gathered at the capital (or another
 * province the country controls).
 */
export function raiseArmy(state: GameState, world: SimWorld, c: Country, at = c.capital): Army | null {
  const p = state.provinces[at];
  if (!p || p.controller !== c.index)
    at = state.provinces.findIndex(
      (q, id) => q?.owner === c.index && q.controller === c.index && world.region(id).kind === 'land',
    );
  if (at <= 0) return null;
  const units: Units = { ...c.reserve };
  const levies = Math.floor(c.manpower);
  if (levies > 0) units.levy = levies;
  if (menIn(units) < 50) return null;
  c.reserve = {};
  c.manpower -= levies;
  let commander = freeCommanders(state, c)[0] ?? 0;
  if (!commander) {
    const general = makeCharacter(state, world, c, { place: true, talent: 1 });
    c.courtiers.push(general.id);
    commander = general.id;
  }
  const army = newArmy(state, c, at, units, commander);
  // Merge with an army already standing there.
  const other = state.armies.find(
    (a) => a !== army && a.owner === c.index && a.location === at && !a.path.length && !inBattle(state, a),
  );
  if (other) {
    mergeInto(state, other, army);
    return other;
  }
  return army;
}

/** Sends an army home: levies return to the pool, men-at-arms to the reserve. */
export function disband(state: GameState, army: Army): boolean {
  if (inBattle(state, army)) return false;
  const c = state.countries[army.owner];
  if (c) {
    for (const [t, men] of Object.entries(army.units) as [UnitType, number][]) {
      if (t === 'levy') c.manpower += men;
      else c.reserve[t] = (c.reserve[t] ?? 0) + men;
    }
  }
  state.armies = state.armies.filter((a) => a !== army);
  return true;
}

export function mergeInto(state: GameState, target: Army, other: Army) {
  const total = armySize(target) + armySize(other);
  target.morale = total ? (target.morale * armySize(target) + other.morale * armySize(other)) / total : 1;
  for (const [t, men] of Object.entries(other.units) as [UnitType, number][])
    target.units[t] = (target.units[t] ?? 0) + men;
  if (skill(character(state, other.commander), 'mar') > skill(character(state, target.commander), 'mar'))
    target.commander = other.commander;
  state.armies = state.armies.filter((a) => a !== other);
}

/** Splits an army in two halves; the new half gets the next best free commander. */
export function split(state: GameState, army: Army): Army | null {
  if (armySize(army) < 200 || inBattle(state, army)) return null;
  const c = state.countries[army.owner];
  const half: Units = {};
  for (const [t, men] of Object.entries(army.units) as [UnitType, number][]) {
    const h = Math.floor(men / 2);
    if (h > 0) half[t] = h;
    army.units[t] = men - h;
  }
  const other = newArmy(state, c, army.location, half, freeCommanders(state, c)[0] ?? 0);
  other.morale = army.morale;
  return other;
}

export function inBattle(state: GameState, army: Army): boolean {
  return state.battles.some((b) => b.attacker.armies.includes(army.id) || b.defender.armies.includes(army.id));
}

// ── Orders ────────────────────────────────────────────────────────

/** The route an army of `owner` may take: only through land it has the right to enter. */
export function routeFor(state: GameState, world: SimWorld, owner: number, from: number, to: number): number[] | null {
  const allowed = accessSet(state, owner);
  return findPath(world, from, to, {
    penalty: (id) => {
      const o = state.provinces[id]?.owner ?? 0;
      return !o || allowed.has(o) ? 0 : Infinity;
    },
  });
}

/** Orders an army to march; false if there is no route. */
export function orderMove(state: GameState, world: SimWorld, army: Army, to: number): boolean {
  if (inBattle(state, army) || army.retreating) return false;
  if (to === army.location) {
    army.path = [];
    army.progress = 0;
    return true;
  }
  // Keep going to the next region if already underway, so the army does not teleport back.
  const from = army.path.length && army.progress > 0 ? army.path[0] : army.location;
  const path = routeFor(state, world, army.owner, from, to);
  if (!path) return false;
  if (from !== army.location) {
    army.path = [from, ...path];
  } else {
    army.path = path;
    army.progress = 0;
    army.stepDays = path.length ? stepDays(world, army.location, path[0]) : 0;
  }
  return true;
}

// ── Supply and attrition ──────────────────────────────────────────

const SUPPLY_TERRAIN: Record<string, number> = {
  farmland: 1.5,
  plains: 1.2,
  steppe: 0.9,
  hills: 0.9,
  forest: 0.9,
  drylands: 0.7,
  taiga: 0.6,
  jungle: 0.6,
  wetlands: 0.6,
  mountains: 0.5,
  desert: 0.4,
  tundra: 0.4,
  ice: 0.2,
};

/** Men a province can feed without losses. */
export function supplyLimit(state: GameState, world: SimWorld, id: number): number {
  const r = world.region(id);
  if (r.kind !== 'land') return Infinity;
  const p = state.provinces[id];
  const dev = p?.dev ?? r.dev ?? 1;
  const mult = (1 + (p ? buildingEffect(p, 'supply') : 0)) * (SUPPLY_TERRAIN[r.terrain ?? 'plains'] ?? 1);
  return Math.round((2500 + dev * 900) * mult);
}

/** Daily losses from hunger and disease, and morale recovery. */
export function dailyUpkeep(state: GameState, world: SimWorld) {
  for (const army of state.armies) {
    const size = armySize(army);
    if (size <= 0) continue;
    const r = world.region(army.location);
    let monthlyLoss = 0;
    if (r.kind !== 'land') monthlyLoss = 0.005;
    else {
      const limit = supplyLimit(state, world, army.location);
      if (size > limit) monthlyLoss += Math.min(0.12, 0.03 * (size / limit - 1) * 2);
      const ctrl = state.provinces[army.location]?.controller ?? 0;
      if (ctrl && atWar(state, army.owner, ctrl)) monthlyLoss += 0.01;
    }
    if (monthlyLoss > 0) {
      const f = monthlyLoss / 30;
      for (const t of Object.keys(army.units) as UnitType[])
        army.units[t] = Math.max(0, (army.units[t] ?? 0) * (1 - f));
    }
    if (!inBattle(state, army)) army.morale = Math.min(1, army.morale + 0.03);
  }
  state.armies = state.armies.filter((a) => armySize(a) >= 10);
}

// ── Marching ──────────────────────────────────────────────────────

/** Moves every marching army a day along its path. Returns armies that entered a new region. */
export function dailyMarch(state: GameState, world: SimWorld): { army: Army; from: number }[] {
  const arrived: { army: Army; from: number }[] = [];
  for (const army of state.armies) {
    if (!army.path.length || inBattle(state, army)) continue;
    if (army.stepDays <= 0) army.stepDays = stepDays(world, army.location, army.path[0]);
    army.progress++;
    if (army.progress < army.stepDays) continue;
    // The way ahead may have closed since the order was given (a treaty ended): find another.
    if (!army.retreating && !mayEnter(state, army.owner, army.path[0])) {
      const dest = army.path[army.path.length - 1];
      army.progress = 0;
      army.path = [];
      const path = mayEnter(state, army.owner, dest) ? routeFor(state, world, army.owner, army.location, dest) : null;
      if (path?.length) {
        army.path = path;
        army.stepDays = stepDays(world, army.location, path[0]);
      }
      continue;
    }
    const from = army.location;
    army.location = army.path.shift()!;
    army.progress = 0;
    army.stepDays = army.path.length ? stepDays(world, army.location, army.path[0]) : 0;
    if (!army.path.length) army.retreating = false;
    arrived.push({ army, from });
  }
  return arrived;
}

/**
 * Armies standing in land they have no right to be in (a war ended, a treaty lapsed) march home, or
 * are shipped home when no road leads there.
 */
export function expelArmies(state: GameState, world: SimWorld) {
  for (const army of state.armies) {
    if (army.retreating || inBattle(state, army) || world.region(army.location).kind !== 'land') continue;
    if (mayEnter(state, army.owner, army.location)) continue;
    const c = state.countries[army.owner];
    const home = c?.capital ?? 0;
    if (!home || state.provinces[home]?.owner !== c.index) continue;
    if (army.path.length && mayEnter(state, army.owner, army.path[army.path.length - 1])) continue;
    if (orderMove(state, world, army, home)) continue;
    army.location = home;
    army.path = [];
    army.progress = 0;
    army.objective = 0;
    log(state, [army.owner], 'army', `${army.name} had no right to stay abroad and has returned home.`, {
      province: home,
    });
  }
}

/** Fraction of the way to the next region, for drawing. */
export function marchFraction(army: Army): number {
  return army.path.length && army.stepDays > 0 ? Math.min(1, army.progress / army.stepDays) : 0;
}
