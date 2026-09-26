/**
 * Pestilence. Plagues break out in their time and place (see PLAGUES in data/events.ts) and spread
 * from province to province, over land and along the sea lanes between ports. A province struck
 * loses people (development), pays and serves half while the sickness rages, and is spared for
 * years once it has passed; the land fills again slowly. Quarantine and public health slow it.
 */
import { PLAGUE_BY_ID, PLAGUES, type PlagueDef } from '../data/events';
import { toDate, years } from './calendar';
import { character, die } from './characters';
import { fireEvent } from './events';
import { log } from './log';
import { modifierEffect } from './modifiers';
import { chance, pick, randInt, random } from './rng';
import { knowsId } from './tech';
import type { Country, GameState } from './types';
import { distanceKm, type SimWorld } from './world';

/** Monthly chance that a province emptied by pestilence wins back a point of development. */
const REGROWTH = 0.01;

const coastCache = new WeakMap<SimWorld, Map<number, number[]>>();

/** Coastal land provinces on a sea zone, for the ships that carry the sickness. */
function coastsOf(world: SimWorld, sea: number): number[] {
  let map = coastCache.get(world);
  if (!map) coastCache.set(world, (map = new Map()));
  let list = map.get(sea);
  if (!list) {
    list = world
      .region(sea)
      .adj.map(([n]) => n)
      .filter((n) => world.region(n).kind === 'land');
    map.set(sea, list);
  }
  return list;
}

/** How much better a realm withstands pestilence: its physicians and sanitation. */
function health(c: Country | undefined): number {
  return c && knowsId(c, 'public_health') ? 0.5 : 1;
}

function capitalise(s: string): string {
  return s[0].toUpperCase() + s.slice(1);
}

export function plagueName(state: GameState): string {
  return state.plague ? (PLAGUE_BY_ID[state.plague.id]?.name ?? 'pestilence') : '';
}

/** The sickness takes hold in a province. */
function infect(state: GameState, world: SimWorld, def: PlagueDef, id: number): boolean {
  const p = state.provinces[id];
  const r = world.region(id);
  if (!p || r.kind !== 'land' || r.impassable || p.plague !== undefined || (p.immune ?? 0) > state.day) return false;
  if (p.dev <= 0) return false;
  const owner = p.owner ? state.countries[p.owner] : undefined;
  const h = health(owner);
  p.plague = state.day + randInt(state, def.months[0], def.months[1]) * 30;
  p.immune = p.plague + years(def.immunity);
  const loss = Math.min(p.dev - 1, Math.round(p.dev * def.severity * h * (0.5 + random(state))));
  if (loss > 0) {
    p.dev -= loss;
    p.lost = (p.lost ?? 0) + loss;
  }
  state.mapVersion++;
  if (!owner?.alive) return true;
  const key = `plague:${def.id}`;
  if (owner.history[key] === undefined) {
    owner.history[key] = state.day;
    log(state, [owner.index], 'plague', `${capitalise(def.name)} has reached ${r.name}.`, { province: id });
    fireEvent(state, world, owner, 'plague_arrives', { province: id });
  }
  // The court is not spared.
  if (id === owner.capital && chance(state, def.severity * 0.6 * h)) {
    const ruler = character(state, owner.ruler);
    if (ruler) die(state, world, ruler);
  }
  return true;
}

/** The chance a month that the sickness passes into a province from a neighbour. */
function spreadInto(state: GameState, def: PlagueDef, id: number): number {
  const owner = state.countries[state.provinces[id]?.owner ?? 0];
  const shut = Math.min(0.9, modifierEffect(owner, 'quarantine'));
  return def.spread * (1 - shut) * health(owner);
}

/** A plague whose time has come breaks out near its origin. */
function outbreak(state: GameState, world: SimWorld) {
  const year = toDate(state.day).y;
  for (const def of PLAGUES) {
    if (year < def.from || year > def.to || state.happened[def.id] !== undefined) continue;
    if (def.after && state.happened[def.after] === undefined) continue;
    if (!chance(state, def.chance)) continue;
    const [lon, lat, km] = def.origin;
    const centre = { lon, lat } as Parameters<typeof distanceKm>[0];
    const places = world.regions.filter(
      (r) => r.kind === 'land' && !r.impassable && state.provinces[r.id]?.owner && distanceKm(centre, r) <= km,
    );
    if (!places.length) continue;
    breakOut(state, world, def.id, pick(state, places).id);
    return;
  }
}

/** A plague breaks out in a province, and the world hears of it. */
export function breakOut(state: GameState, world: SimWorld, id: string, province: number) {
  const def = PLAGUE_BY_ID[id];
  if (!def) return;
  state.happened[def.id] = state.day;
  state.plague = { id: def.id, since: state.day };
  const player = state.countries[state.player];
  const near = !!player?.capital && distanceKm(world.region(player.capital), world.region(province)) < 3000;
  log(state, 'all', 'plague', `${capitalise(def.name)} has broken out in ${world.region(province).name}.`, {
    province,
    important: near,
  });
  infect(state, world, def, province);
}

/** Each month the sickness spreads, runs its course, or dies out; emptied land fills again. */
export function monthlyPlague(state: GameState, world: SimWorld) {
  const infected: number[] = [];
  state.provinces.forEach((p, id) => {
    if (!p) return;
    if (p.plague !== undefined) {
      if (p.plague <= state.day) {
        delete p.plague;
        state.mapVersion++;
      } else infected.push(id);
    } else if (p.lost && chance(state, REGROWTH)) {
      p.lost--;
      p.dev++;
      if (!p.lost) delete p.lost;
    }
  });
  if (!state.plague) {
    outbreak(state, world);
    return;
  }
  const def = PLAGUE_BY_ID[state.plague.id];
  if (!def || !infected.length) {
    log(state, 'all', 'plague', `${capitalise(def?.name ?? 'the pestilence')} has run its course.`);
    state.plague = null;
    return;
  }
  for (const id of infected) {
    for (const [n] of world.region(id).adj) {
      const r = world.region(n);
      if (r.kind === 'land') {
        if (chance(state, spreadInto(state, def, n))) infect(state, world, def, n);
      } else if (state.provinces[id].buildings.port && chance(state, def.spread * 0.4)) {
        // Ships carry it along the coasts of the same waters.
        const coasts = coastsOf(world, n);
        const to = coasts.length ? pick(state, coasts) : 0;
        if (to && chance(state, spreadInto(state, def, to) / def.spread)) infect(state, world, def, to);
      }
    }
  }
}
