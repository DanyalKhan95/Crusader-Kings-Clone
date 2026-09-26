/** Read-only questions about the state: realms, wars, strength. Cached where it matters. */
import type { Army, Country, GameState, Units, War } from './types';
import type { SimWorld } from './world';

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

export function tributariesOf(state: GameState, index: number): Country[] {
  return state.countries.filter((c) => c?.alive && c.overlord === index);
}

/** The country a subject answers to: its liege, or else its overlord (0 when independent). */
export function lordOf(state: GameState, index: number): number {
  const c = state.countries[index];
  return c ? c.liege || c.overlord : 0;
}

interface MemberCache {
  version: number;
  byRealm: Map<number, number[]>;
}
const memberCache = new WeakMap<GameState, MemberCache>();

/** Every living country in a realm: the ruler's own and all vassals below. A fresh array. */
export function realmMembers(state: GameState, index: number): number[] {
  let c = memberCache.get(state);
  if (!c || c.version !== state.borderVersion)
    memberCache.set(state, (c = { version: state.borderVersion, byRealm: new Map() }));
  let list = c.byRealm.get(index);
  if (!list) {
    list = state.countries.filter((x) => x?.alive && isInRealm(state, x.index, index)).map((x) => x.index);
    c.byRealm.set(index, list);
  }
  return list.slice();
}

/** True if the province touches land of the realm (across a border, river or strait). */
export function touchesRealm(state: GameState, world: SimWorld, realm: number, province: number): boolean {
  for (const [n] of world.region(province).adj) {
    const o = state.provinces[n]?.owner ?? 0;
    if (o && isInRealm(state, o, realm)) return true;
  }
  return false;
}

interface NeighbourCache {
  version: number;
  sets: Map<number, Set<number>>;
}
const neighbourCache = new WeakMap<GameState, NeighbourCache>();

/** Independent realms whose land touches this realm's land. Keyed by top liege. */
export function realmNeighbours(state: GameState, world: SimWorld, index: number): Set<number> {
  let c = neighbourCache.get(state);
  if (!c || c.version !== state.borderVersion) {
    const sets = new Map<number, Set<number>>();
    const top = state.countries.map((x) => (x?.alive ? topLiege(state, x.index) : 0));
    state.provinces.forEach((p, id) => {
      if (!p?.owner) return;
      const a = top[p.owner];
      for (const [n] of world.region(id).adj) {
        const o = state.provinces[n]?.owner ?? 0;
        const b = o ? top[o] : 0;
        if (!b || b === a) continue;
        let set = sets.get(a);
        if (!set) sets.set(a, (set = new Set()));
        set.add(b);
      }
    });
    c = { version: state.borderVersion, sets };
    neighbourCache.set(state, c);
  }
  return c.sets.get(topLiege(state, index)) ?? new Set();
}

const tagIndex = new WeakMap<GameState, { count: number; map: Map<string, number> }>();

/** The first country with a tag (tags of dead realms may be taken up again by new ones). */
export function countryByTag(state: GameState, tag: string): Country | undefined {
  let ix = tagIndex.get(state);
  if (!ix || ix.count !== state.countries.length) {
    ix = { count: state.countries.length, map: new Map() };
    for (const c of state.countries) if (c && !ix.map.has(c.tag)) ix.map.set(c.tag, c.index);
    tagIndex.set(state, ix);
  }
  const i = ix.map.get(tag);
  return i ? state.countries[i] : undefined;
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

interface StrengthCache {
  key: string;
  own: Float64Array;
  realm: Map<number, number>;
}
const strengthCache = new WeakMap<GameState, StrengthCache>();

/**
 * `realmStrength` as of the start of the day, for the AI and for opinions, which ask for it thousands
 * of times a month. The UI shows the exact figure.
 */
export function strengthOf(state: GameState, index: number): number {
  const key = `${state.day}:${state.borderVersion}`;
  let c = strengthCache.get(state);
  if (!c || c.key !== key) {
    const own = new Float64Array(state.countries.length);
    for (const x of state.countries) if (x?.alive) own[x.index] = x.manpower + menIn(x.reserve);
    for (const a of state.armies) if (a.owner < own.length) own[a.owner] += armySize(a);
    c = { key, own, realm: new Map() };
    strengthCache.set(state, c);
  }
  let v = c.realm.get(index);
  if (v === undefined) {
    v = 0;
    for (const m of realmMembers(state, index)) v += c.own[m] ?? 0;
    c.realm.set(index, v);
  }
  return v;
}
