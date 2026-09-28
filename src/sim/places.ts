/**
 * The names of places as their age and their masters give them (src/data/places.ts): period names in
 * place of the modern admin names the map pipeline fell back on, set on the regions when the world is
 * registered (`registerBeliefs`), and names by era and by the owner's culture, which `placeName`
 * works out. Everything that shows a province's name asks `placeName`.
 */
import { PLACES, type PlaceRule } from '../data/places';
import type { RegionData } from '../shared/dataTypes';
import { toDate } from './calendar';
import type { GameState } from './types';

let names: string[] = [];
let rules: (PlaceRule[] | undefined)[] = [];
let groupOf: Record<string, string> = {};

/** Gives provinces their period names and learns the rules for the rest (called by registerBeliefs). */
export function registerPlaces(regions: RegionData[], groups: Record<string, string>) {
  names = [];
  rules = [];
  groupOf = groups;
  for (const r of regions) {
    // The map's own name stays the key, even after a period name has replaced it.
    const key = r.mapName ?? r.name;
    const def = PLACES[key];
    if (def?.period && r.kind === 'land') {
      r.mapName = key;
      r.name = def.period;
    }
    names[r.id] = r.name;
    if (def?.names?.length) rules[r.id] = def.names;
  }
}

/** A province's name at this moment of the game: by the year, and by who holds it. */
export function placeName(state: GameState, id: number): string {
  const list = rules[id];
  if (!list) return names[id] ?? '';
  const year = toDate(state.day).y;
  const culture = state.countries[state.provinces[id]?.owner ?? 0]?.culture ?? '';
  for (const r of list) {
    if (r.from !== undefined && year < r.from) continue;
    if (r.until !== undefined && year >= r.until) continue;
    if (r.cultures && !r.cultures.includes(culture)) continue;
    if (r.groups && !r.groups.includes(groupOf[culture] ?? '')) continue;
    return r.name;
  }
  return names[id] ?? '';
}
