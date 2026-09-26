/** Read-only questions about the state: realms, wars, strength. Cached where it matters. */
import type { Army, Country, GameState, Units, War } from './types';

/** Top liege of a country (itself if independent). */
export function topLiege(state: GameState, index: number): number {
  let c = index;
  for (let guard = 0; guard < 16 && state.countries[c]?.liege; guard++) c = state.countries[c].liege;
  return c;
}

/** True if `index` is `owner` or one of its lieges. */
export function isInRealm(state: GameState, owner: number, index: number): boolean {
  for (let c = owner, guard = 0; c && guard < 16; c = state.countries[c]?.liege ?? 0, guard++)
    if (c === index) return true;
  return false;
}

interface OwnerCache {
  version: number;
  byOwner: number[][];
}
const ownerCache = new WeakMap<GameState, OwnerCache>();

function owned(state: GameState): number[][] {
  let c = ownerCache.get(state);
  if (!c || c.version !== state.mapVersion) {
    const byOwner: number[][] = state.countries.map(() => []);
    state.provinces.forEach((p, id) => {
      if (p?.owner) byOwner[p.owner]?.push(id);
    });
    c = { version: state.mapVersion, byOwner };
    ownerCache.set(state, c);
  }
  return c.byOwner;
}

/** Provinces a country owns directly. The array is shared: do not modify it. */
export function provincesOf(state: GameState, index: number): number[] {
  return owned(state)[index] ?? [];
}

/** Provinces held by a country and by its vassals (at any depth). */
export function realmProvinces(state: GameState, index: number): number[] {
  const out: number[] = [];
  for (const c of state.countries)
    if (c?.alive && isInRealm(state, c.index, index)) out.push(...provincesOf(state, c.index));
  return out;
}

export function vassalsOf(state: GameState, index: number): Country[] {
  return state.countries.filter((c) => c?.alive && c.liege === index);
}

export function countryByTag(state: GameState, tag: string): Country | undefined {
  return state.countries.find((c) => c?.tag === tag);
}

// ── Wars ──────────────────────────────────────────────────────────

export function warsOf(state: GameState, index: number): War[] {
  return state.wars.filter((w) => w.attackers.includes(index) || w.defenders.includes(index));
}

export function sideOf(war: War, index: number): 'attacker' | 'defender' | null {
  if (war.attackers.includes(index)) return 'attacker';
  if (war.defenders.includes(index)) return 'defender';
  return null;
}

/** True if the two countries fight on opposite sides of some war. */
export function atWar(state: GameState, a: number, b: number): boolean {
  if (!a || !b || a === b) return false;
  for (const w of state.wars) {
    if (w.attackers.includes(a) && w.defenders.includes(b)) return true;
    if (w.defenders.includes(a) && w.attackers.includes(b)) return true;
  }
  return false;
}

export function hasTruce(state: GameState, a: number, b: number): boolean {
  return state.truces.some((t) => ((t.a === a && t.b === b) || (t.a === b && t.b === a)) && t.until > state.day);
}

// ── Armies ────────────────────────────────────────────────────────

export function menIn(units: Units): number {
  let n = 0;
  for (const k in units) n += units[k as keyof Units] ?? 0;
  return n;
}

export const armySize = (a: Army) => menIn(a.units);

export function armiesOf(state: GameState, index: number): Army[] {
  return state.armies.filter((a) => a.owner === index);
}

export function armiesAt(state: GameState, province: number): Army[] {
  return state.armies.filter((a) => a.location === province);
}

export function armyById(state: GameState, id: number): Army | undefined {
  return state.armies.find((a) => a.id === id);
}

/** Men a country could put in the field now: armies, reserve men-at-arms and unraised levies. */
export function militaryStrength(state: GameState, index: number): number {
  const c = state.countries[index];
  if (!c) return 0;
  let n = c.manpower + menIn(c.reserve);
  for (const a of state.armies) if (a.owner === index) n += armySize(a);
  return n;
}

/** Strength of a country together with its vassals. */
export function realmStrength(state: GameState, index: number): number {
  let n = 0;
  for (const c of state.countries)
    if (c?.alive && isInRealm(state, c.index, index)) n += militaryStrength(state, c.index);
  return n;
}
