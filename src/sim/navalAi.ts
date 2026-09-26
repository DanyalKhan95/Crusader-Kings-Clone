/**
 * The AI at sea. Each month a realm with a coast keeps transports for part of its army (all of it
 * when at war), a navy whose upkeep is a share of its income, and, once its ships can cross the
 * ocean, now and then an expedition. Fleets re-plan every few days: at war they hunt weaker fleets,
 * make for port before stronger ones, and blockade the richest enemy coast in reach; at peace they
 * lie in port. Expeditions, the player's too, sail on to the nearest waters no one has charted.
 */
import { shipDef, TRANSPORT_CAPACITY, transportCost, transportUpkeep } from '../data/ships';
import { toDate } from './calendar';
import { income } from './economy';
import { knows, knowsWorld } from './exploration';
import { log } from './log';
import { fleetGraph, isWater } from './movement';
import {
  availableShips,
  blockades,
  buildShips,
  buildTransports,
  canBuildShips,
  fleetInBattle,
  fleetPower,
  fleetSize,
  homePort,
  inPort,
  isOpenOcean,
  mergeFleets,
  navyUpkeep,
  newFleet,
  oceanGoing,
  orderFleet,
  shipCost,
  shipyards,
  transportCapacity,
} from './naval';
import { armiesOf, armySize, menIn, provincesOf, realmNeighbours, topLiege, warsOf } from './queries';
import { chance, random } from './rng';
import { militaryEra } from './tech';
import type { Country, Fleet, GameState, ShipType } from './types';
import { distanceKm, type SimWorld } from './world';

// ── Monthly: the navy a realm keeps ───────────────────────────────

export function navyAI(state: GameState, world: SimWorld, c: Country) {
  // A realm reviews its navy once a season.
  if (c.rebel || c.loans.length || c.gold < 40 || (toDate(state.day).m + c.index) % 3) return;
  const yards = shipyards(state, world, c);
  if (!yards.length) return;
  const own = provincesOf(state, c.index);
  const coast = yards.length / Math.max(1, own.length);
  const monthly = income(state, c).total;
  const fighting = warsOf(state, c.index).length > 0;
  const era = militaryEra(c);
  const reserve = Math.max(30, monthly * 3);
  let purse = Math.max(0, (c.gold - reserve) * 0.4);
  const port = yards.includes(c.capital)
    ? c.capital
    : yards.reduce((a, b) => (state.provinces[b].dev > state.provinces[a].dev ? b : a));

  // Transports for a share of the army, and for the largest army when an enemy lies over the sea.
  const armies = armiesOf(state, c.index);
  const men = c.manpower + menIn(c.reserve) + armies.reduce((s, a) => s + armySize(a), 0);
  let want = men * Math.min(0.8, 0.1 + coast * 0.5);
  if (fighting) {
    const near = realmNeighbours(state, world, c.index);
    if ([...enemiesOf(state, c.index)].some((e) => !near.has(topLiege(state, e))))
      for (const a of armies) want = Math.max(want, Math.min(armySize(a), men * 0.5));
  }
  // Never more ships than a sixteenth of the income can keep.
  want = Math.min(want, ((monthly * 0.06) / transportUpkeep(era)) * TRANSPORT_CAPACITY[era]);
  // In peace, ships beyond need are sold off.
  if (!fighting && transportCapacity(c) > want * 1.5 + 5000)
    c.transports = Math.max(0, c.transports - Math.ceil(c.transports * 0.1));
  const short = Math.ceil((want - transportCapacity(c)) / TRANSPORT_CAPACITY[era]);
  if (short > 0 && purse > 0) {
    const n = Math.min(short, Math.floor(purse / transportCost(era)));
    const built = n > 0 ? buildTransports(state, world, c, n) : null;
    if (built?.ok) purse -= built.cost;
  }

  // Warships: upkeep up to a share of income that grows with the coast, and in war.
  const target = monthly * (0.02 + 0.08 * coast) * (fighting ? 1.5 : 1);
  const upkeep = navyUpkeep(state, c).fleets;
  if (upkeep < target * 0.8 && purse > 0) {
    const t = nextShip(state, c);
    const n = Math.min(
      Math.floor(purse / shipCost(c, t, 1)),
      Math.max(1, Math.ceil((target - upkeep) / shipDef(t, era).upkeep)),
    );
    if (n > 0) buildShips(state, world, c, port, t, n);
  }

  // Fleets lying idle in the same port sail together.
  const idle = state.fleets.filter(
    (f) => f.owner === c.index && inPort(world, f) && !f.path.length && !f.mission && !fleetInBattle(state, f),
  );
  for (const f of idle) {
    const other = idle.find((g) => g !== f && g.location === f.location && state.fleets.includes(g));
    if (other && state.fleets.includes(f)) mergeFleets(state, other, f);
  }

  // Once its ships can cross the ocean, a realm sends out an expedition now and then.
  if (
    !fighting &&
    oceanGoing(c) &&
    !knowsWorld(c) &&
    c.gold > reserve + 60 &&
    chance(state, 0.08) &&
    !state.fleets.some((f) => f.owner === c.index && f.mission === 'explore')
  ) {
    const check = canBuildShips(state, world, c, port, 'light', 2);
    if (check.ok) {
      c.gold -= check.cost;
      const f = newFleet(state, world, c, port, { light: 2 });
      f.name = `Expedition of ${c.short.replace(/^the /, '')}`;
      f.mission = 'explore';
    }
  }
}

/** The kind of warship the navy lacks most: a line of heavy ships, with escorts and submarines. */
function nextShip(state: GameState, c: Country): ShipType {
  const count: Record<ShipType, number> = { heavy: 0, light: 0, submarine: 0 };
  for (const f of state.fleets)
    if (f.owner === c.index) for (const [t, n] of Object.entries(f.ships) as [ShipType, number][]) count[t] += n;
  const total = count.heavy + count.light + count.submarine;
  const types = availableShips(c);
  if (types.includes('submarine') && count.submarine < total * 0.2) return 'submarine';
  return count.heavy < total * 0.4 ? 'heavy' : 'light';
}

// ── Daily: where fleets sail ──────────────────────────────────────

function enemiesOf(state: GameState, owner: number): Set<number> {
  const out = new Set<number>();
  for (const w of warsOf(state, owner))
    for (const e of w.attackers.includes(owner) ? w.defenders : w.attackers) out.add(e);
  return out;
}

export function planFleets(state: GameState, world: SimWorld) {
  for (const f of state.fleets) {
    if (f.replan > state.day) continue;
    // The player's fleets go where they are sent, but an expedition finds its own way.
    if (f.owner === state.player && f.mission !== 'explore') continue;
    f.replan = state.day + 5 + Math.floor(random(state) * 5);
    if (f.retreating || fleetInBattle(state, f)) continue;
    if (f.mission === 'explore') {
      explore(state, world, f);
      continue;
    }
    const enemies = enemiesOf(state, f.owner);
    if (!enemies.size) {
      // At peace a fleet goes home, and then waits for news.
      if (!inPort(world, f) && !f.path.length) sendHome(state, world, f);
      f.replan = state.day + 20 + Math.floor(random(state) * 10);
      continue;
    }
    warFleet(state, world, f, enemies);
  }
}

function sendHome(state: GameState, world: SimWorld, f: Fleet) {
  const home = homePort(state, world, f);
  if (home && home.port !== f.location) orderFleet(state, world, f, home.port);
  f.objective = 0;
}

function warFleet(state: GameState, world: SimWorld, f: Fleet, enemies: Set<number>) {
  const power = fleetPower(state, f);
  const here = world.region(f.location);
  const hostile = state.fleets.filter((e) => enemies.has(e.owner) && !e.retreating && fleetSize(e) >= 0.5);
  // On its way somewhere: sail on, unless a stronger enemy is close.
  if (f.objective && f.path.length) {
    const threat = hostile.some((e) => {
      const r = world.region(e.location);
      return isWater(r) && fleetPower(state, e) > power * 1.3 && distanceKm(here, r) < 800;
    });
    if (!threat) return;
  }
  // 1. Seek out a weaker enemy fleet at sea.
  let target = 0,
    best = -Infinity;
  for (const e of hostile) {
    const r = world.region(e.location);
    if (!isWater(r)) continue;
    const km = distanceKm(here, r);
    if (km > 2500) continue;
    const ratio = power / Math.max(1, fleetPower(state, e));
    if (ratio < 1.25) continue;
    const score = ratio * 50 - km / 25;
    if (score > best) {
      best = score;
      target = e.location;
    }
  }
  if (target) {
    if (orderFleet(state, world, f, target)) {
      f.objective = target;
      return;
    }
  }
  // 2. Make for port before a stronger enemy close by.
  const danger = hostile.some((e) => {
    const r = world.region(e.location);
    return isWater(r) && fleetPower(state, e) > power * 1.3 && distanceKm(here, r) < 800;
  });
  if (danger) {
    if (!inPort(world, f)) sendHome(state, world, f);
    return;
  }
  // 3. Blockade the richest enemy coast in reach, or keep up a blockade already laid.
  if (f.objective && f.path.length) return;
  if (isWater(here) && here.adj.some(([n]) => blockades(state).get(n) === f.owner)) return;
  const ocean = oceanGoing(state.countries[f.owner]);
  let zone = 0;
  best = -Infinity;
  for (const e of enemies)
    for (const id of provincesOf(state, e)) {
      const r = world.region(id);
      if (!r.coastal || !enemies.has(state.provinces[id].controller)) continue;
      const km = distanceKm(here, r);
      if (km > 3000) continue;
      const score = state.provinces[id].dev * 3 - km / 40;
      if (score <= best) continue;
      const sea = r.adj.find(([n]) => isWater(world.region(n)) && (ocean || !isOpenOcean(world, n)));
      if (!sea) continue;
      best = score;
      zone = sea[0];
    }
  if (zone && orderFleet(state, world, f, zone)) f.objective = zone;
  else if (!inPort(world, f) && !f.path.length) sendHome(state, world, f);
}

/** The nearest water the fleet can reach that is unknown, or borders what is unknown. */
function frontier(state: GameState, world: SimWorld, f: Fleet): number {
  const c = state.countries[f.owner];
  const ocean = oceanGoing(c);
  const { edges } = fleetGraph(world);
  const unknownNear = (id: number) => !knows(world, c, id) || world.region(id).adj.some(([n]) => !knows(world, c, n));
  const seen = new Set([f.location]);
  let queue = [f.location];
  for (let depth = 0; depth < 60 && queue.length; depth++) {
    const next: number[] = [];
    for (const id of queue)
      for (const e of edges[id] ?? []) {
        if (seen.has(e.to)) continue;
        seen.add(e.to);
        if (!isWater(world.region(e.to)) || (!ocean && isOpenOcean(world, e.to))) continue;
        if (unknownNear(e.to)) return e.to;
        next.push(e.to);
      }
    queue = next;
  }
  return 0;
}

function explore(state: GameState, world: SimWorld, f: Fleet) {
  if (f.path.length) return;
  const next = frontier(state, world, f);
  if (next && orderFleet(state, world, f, next)) return;
  f.mission = undefined;
  log(state, [f.owner], 'discovery', `${f.name} has charted every sea within its reach, and sails for home.`, {
    province: f.location,
  });
  sendHome(state, world, f);
}
