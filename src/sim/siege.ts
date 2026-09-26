/**
 * Sieges and occupation. An army standing unopposed in a province held by an enemy takes it: open
 * country falls within days, fortified provinces need a siege whose length grows with every level of
 * walls. Siege engines, a skilled spymaster and a large army all shorten it.
 */
import { taskSkill } from './politics';
import { fortLevel } from './economy';
import { log } from './log';
import { BLOCKADE_SIEGE, blockades } from './naval';
import { armySize, atWar } from './queries';
import { chance } from './rng';
import { militaryEra, techEffect } from './tech';
import type { Army, GameState, UnitType } from './types';
import { unitDef } from '../data/units';
import { battleAt } from './combat';
import type { SimWorld } from './world';

export const GARRISON_PER_FORT = 400;
const OPEN_DAYS = 8;

export function garrison(state: GameState, id: number): number {
  return fortLevel(state, id) * GARRISON_PER_FORT;
}

/** Siege power of an army: its engines or guns, as good as its realm can make them. */
function siegePower(state: GameState, army: Army): number {
  const owner = state.countries[army.owner];
  const era = militaryEra(owner);
  let p = 0;
  for (const [t, men] of Object.entries(army.units) as [UnitType, number][])
    p += ((men ?? 0) / 100) * unitDef(t, era).siege;
  return p * (1 + (owner ? techEffect(owner, 'siege') : 0));
}

/** Days a full siege would take at the current rate, for display. */
export function siegeDays(state: GameState, id: number, armies: Army[]): number {
  const fort = fortLevel(state, id);
  if (!fort) return OPEN_DAYS;
  const rate = dailyRate(state, id, armies);
  return rate > 0 ? Math.ceil(1 / rate) : Infinity;
}

function dailyRate(state: GameState, id: number, armies: Army[]): number {
  const fort = fortLevel(state, id);
  const men = armies.reduce((s, a) => s + armySize(a), 0);
  if (!fort) return 1 / OPEN_DAYS;
  const g = garrison(state, id);
  if (men < g) return 0;
  const engines = armies.reduce((s, a) => s + siegePower(state, a), 0);
  const owner = state.countries[armies[0].owner];
  const spy = owner ? taskSkill(state, owner, 'spymaster', 'sieges') : 0;
  const numbers = Math.min(1.5, men / (g * 4));
  // A garrison that cannot be supplied from the sea holds out less long.
  const blockade = blockades(state).has(id) ? 1 + BLOCKADE_SIEGE : 1;
  return ((1 + engines * 0.08) * (1 + spy * 0.02) * (0.5 + numbers) * blockade) / (35 * fort);
}

/** Which country takes a province an army occupies: the owner's side gets its own land back. */
function newController(state: GameState, id: number, army: Army): number {
  const owner = state.provinces[id].owner;
  if (!owner) return army.owner;
  if (!atWar(state, army.owner, owner)) return owner;
  return army.owner;
}

export function dailySieges(state: GameState, world: SimWorld) {
  const besiegers = new Map<number, Army[]>();
  for (const a of state.armies) {
    if (a.path.length || a.retreating) continue;
    const p = state.provinces[a.location];
    if (!p || world.region(a.location).kind !== 'land' || !p.owner) continue;
    // Hostile to whoever controls it, or retaking its own side's land.
    const hostile = p.controller && atWar(state, a.owner, p.controller);
    if (!hostile) continue;
    let list = besiegers.get(a.location);
    if (!list) besiegers.set(a.location, (list = []));
    list.push(a);
  }
  state.provinces.forEach((p, id) => {
    if (!p?.siege) return;
    if (!besiegers.has(id)) p.siege = undefined;
  });
  for (const [id, armies] of besiegers) {
    if (battleAt(state, id)) continue;
    const p = state.provinces[id];
    // Armies defending the province block the siege until beaten.
    if (state.armies.some((a) => a.location === id && !a.retreating && atWar(state, a.owner, armies[0].owner)))
      continue;
    if (!p.siege || p.siege.by !== armies[0].owner) p.siege = { progress: 0, by: armies[0].owner, start: state.day };
    let rate = dailyRate(state, id, armies);
    if (rate > 0 && fortLevel(state, id) && chance(state, 0.012)) rate += 0.1; // a breach, disease in the garrison…
    p.siege.progress += rate;
    if (p.siege.progress >= 1) occupy(state, world, id, armies[0]);
  }
}

function occupy(state: GameState, world: SimWorld, id: number, army: Army) {
  const p = state.provinces[id];
  const before = p.controller;
  p.controller = newController(state, id, army);
  p.siege = undefined;
  state.mapVersion++;
  const name = world.region(id).name;
  const taker = state.countries[p.controller];
  const loser = state.countries[before];
  const fort = fortLevel(state, id);
  const liberated = p.controller === p.owner;
  const text = liberated
    ? `${name} has been retaken by ${taker.name}.`
    : `${name} ${fort ? 'has fallen to' : 'is occupied by'} ${taker.name}.`;
  log(state, [taker.index, before, p.owner], 'siege', text, {
    province: id,
    important: !!loser && before === state.player && id === loser.capital,
  });
}
