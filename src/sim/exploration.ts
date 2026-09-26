/**
 * Terra incognita. Each realm knows only part of the world: at first the lands around its own and
 * the holy places of its faith, then whatever its armies and fleets see, what its allies and subjects
 * share, and, once it has cartography, the maps of every realm of its faith that has them too. From
 * the industrial era every realm knows the whole world.
 *
 * What a realm knows is kept in the state as a bit set in base64 (`Country.known`, "*" for the whole
 * world); decoded copies are cached per country.
 */
import { eraOfLevel } from '../data/eras';
import { faithFamily, holySites } from './beliefs';
import { provincesOf, topLiege } from './queries';
import { techEffect } from './tech';
import type { Country, GameState } from './types';
import { distanceKm, type SimWorld } from './world';

export const ALL_KNOWN = '*';

/** From this era of its society technology, a realm knows the whole world. */
const WORLD_KNOWN_ERA = 3;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = new Map([...B64].map((ch, i) => [ch, i]));

function encode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  return out;
}

function decode(s: string, size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  if (s === ALL_KNOWN) return bytes.fill(255);
  for (let i = 0, o = 0; i + 3 < s.length && o < size; i += 4) {
    const n =
      ((B64_INDEX.get(s[i]) ?? 0) << 18) |
      ((B64_INDEX.get(s[i + 1]) ?? 0) << 12) |
      ((B64_INDEX.get(s[i + 2]) ?? 0) << 6) |
      (B64_INDEX.get(s[i + 3]) ?? 0);
    bytes[o++] = (n >> 16) & 255;
    if (o < size) bytes[o++] = (n >> 8) & 255;
    if (o < size) bytes[o++] = n & 255;
  }
  return bytes;
}

/** Bytes in a bit set of the world's regions. */
function setSize(world: SimWorld): number {
  return (world.regions.length + 8) >> 3;
}

const decoded = new WeakMap<Country, { s: string; bits: Uint8Array }>();

/** What a country knows, as bits by region id. The array is shared: change it through `learn`. */
export function knownBits(world: SimWorld, c: Country): Uint8Array {
  const hit = decoded.get(c);
  if (hit && hit.s === c.known) return hit.bits;
  const bits = decode(c.known ?? '', setSize(world));
  decoded.set(c, { s: c.known, bits });
  return bits;
}

export function knows(world: SimWorld, c: Country | undefined, id: number): boolean {
  if (!c) return true;
  if (c.known === ALL_KNOWN) return true;
  return (knownBits(world, c)[id >> 3] & (1 << (id & 7))) !== 0;
}

export function knowsWorld(c: Country): boolean {
  return c.known === ALL_KNOWN;
}

/** Writes changed bits back into the state. */
function store(world: SimWorld, c: Country, bits: Uint8Array) {
  let all = true;
  const size = setSize(world);
  for (let id = 1; id <= world.regions.length && all; id++) if (!(bits[id >> 3] & (1 << (id & 7)))) all = false;
  c.known = all ? ALL_KNOWN : encode(bits.subarray(0, size));
  decoded.set(c, { s: c.known, bits });
}

/** Teaches a country some regions; returns how many were new to it. */
export function learn(world: SimWorld, c: Country, ids: Iterable<number>): number {
  if (c.known === ALL_KNOWN) return 0;
  const bits = knownBits(world, c);
  let fresh = 0;
  for (const id of ids) {
    const m = 1 << (id & 7);
    if (bits[id >> 3] & m) continue;
    bits[id >> 3] |= m;
    fresh++;
  }
  if (fresh) store(world, c, bits);
  return fresh;
}

/** Adds another set of known regions to a country's; true if it learned anything. */
function learnAll(world: SimWorld, c: Country, other: Uint8Array): boolean {
  if (c.known === ALL_KNOWN) return false;
  const bits = knownBits(world, c);
  let changed = false;
  for (let i = 0; i < bits.length; i++) {
    const v = bits[i] | other[i];
    if (v !== bits[i]) {
      bits[i] = v;
      changed = true;
    }
  }
  if (changed) store(world, c, bits);
  return changed;
}

/** A region and its neighbours, `rings` steps out. */
export function around(world: SimWorld, id: number, rings = 1): number[] {
  const seen = new Set([id]);
  let edge = [id];
  for (let r = 0; r < rings; r++) {
    const next: number[] = [];
    for (const x of edge)
      for (const [n] of world.region(x).adj)
        if (!seen.has(n)) {
          seen.add(n);
          next.push(n);
        }
    edge = next;
  }
  return [...seen];
}

/** What those on the spot see: the region and its neighbours. Returns how many were new. */
export function revealAround(state: GameState, world: SimWorld, owner: number, id: number, rings = 1): number {
  const c = state.countries[owner];
  if (!c?.alive || c.known === ALL_KNOWN) return 0;
  return learn(world, c, around(world, id, rings));
}

// ── The known world of 1066 ───────────────────────────────────────

/** How far a realm of each rank knows the world around its own land, in km. */
const KNOWN_KM: Record<string, number> = { county: 700, duchy: 1000, kingdom: 1400, empire: 2000 };
const HOLY_KM = 400;
/** Pilgrims, merchants and letters: a realm knows the lands of its faith family this far around. */
const FAITH_KM = 800;
/** …but only this far from its capital (kingdoms; empires see farther). */
const WORLD_KM = { kingdom: 3500, empire: 5000 };

interface Grid {
  cell: number;
  cells: Map<number, number[]>;
}
const grids = new WeakMap<SimWorld, Grid>();

/** Regions bucketed by 5° of latitude and longitude, for "what lies within so many km". */
function grid(world: SimWorld): Grid {
  let g = grids.get(world);
  if (!g) {
    const cell = 5;
    const cells = new Map<number, number[]>();
    for (const r of world.regions) {
      const key = Math.floor((r.lat + 90) / cell) * 1000 + Math.floor((r.lon + 180) / cell);
      let list = cells.get(key);
      if (!list) cells.set(key, (list = []));
      list.push(r.id);
    }
    grids.set(world, (g = { cell, cells }));
  }
  return g;
}

/** Regions whose centres lie within `km` of a region's centre. */
export function withinKm(world: SimWorld, id: number, km: number): number[] {
  const { cell, cells } = grid(world);
  const r = world.region(id);
  const dLat = km / 111;
  const dLon = Math.min(180, km / (111 * Math.max(0.1, Math.cos((r.lat * Math.PI) / 180))));
  const out: number[] = [];
  const y0 = Math.floor((r.lat - dLat + 90) / cell),
    y1 = Math.floor((r.lat + dLat + 90) / cell);
  const cols = Math.round(360 / cell);
  const x0 = Math.floor((r.lon - dLon + 180) / cell),
    x1 = Math.floor((r.lon + dLon + 180) / cell);
  const seenCols = new Set<number>();
  for (let x = x0; x <= x1; x++) {
    const col = ((x % cols) + cols) % cols;
    if (seenCols.has(col)) continue;
    seenCols.add(col);
    for (let y = y0; y <= y1; y++)
      for (const n of cells.get(y * 1000 + col) ?? []) if (distanceKm(r, world.region(n)) <= km) out.push(n);
  }
  return out;
}

/**
 * What every realm knows at the start: the lands and seas around its own, farther for greater
 * realms and for the peoples of the steppe, the holy places of its faith and, for kingdoms and
 * empires, the lands where its faith family rules, as far as news travels. A realm knows what its
 * liege and its vassals know.
 */
export function initialKnowledge(state: GameState, world: SimWorld, only?: (c: Country) => boolean) {
  const size = setSize(world);
  const bits = new Map<number, Uint8Array>();
  // What each faith family knows between them: the lands of its realms and what lies close by.
  const families = new Map<string, Uint8Array>();
  for (const c of state.countries) {
    if (!c?.alive) continue;
    const f = faithFamily(c.religion) || c.religion;
    let b = families.get(f);
    if (!b) families.set(f, (b = new Uint8Array(size)));
    for (const id of provincesOf(state, c.index))
      for (const n of withinKm(world, id, FAITH_KM)) b[n >> 3] |= 1 << (n & 7);
  }
  for (const c of state.countries) {
    if (!c?.alive || (only && !only(c))) continue;
    const b = new Uint8Array(size);
    const set = (id: number) => (b[id >> 3] |= 1 << (id & 7));
    const km = (KNOWN_KM[c.rank] ?? 700) + (c.gov === 'nomadic' ? 300 : 0);
    const own = provincesOf(state, c.index);
    for (const id of own.length ? own : [c.capital]) for (const n of withinKm(world, id, km)) set(n);
    for (const site of holySites(c.religion)) for (const n of withinKm(world, site, HOLY_KM)) set(n);
    const family = families.get(faithFamily(c.religion) || c.religion);
    // Kings and emperors know the world of their faith, as far as news travels.
    if (family && (c.rank === 'kingdom' || c.rank === 'empire'))
      for (const n of withinKm(world, c.capital, WORLD_KM[c.rank])) if (family[n >> 3] & (1 << (n & 7))) set(n);
    bits.set(c.index, b);
  }
  // Realms share what they know.
  for (const [i, b] of bits) {
    const top = bits.get(topLiege(state, i));
    if (top && top !== b) for (let k = 0; k < size; k++) top[k] |= b[k];
  }
  for (const [i, b] of bits) {
    const top = bits.get(topLiege(state, i));
    if (top && top !== b) b.set(top);
  }
  for (const [i, b] of bits) {
    const c = state.countries[i];
    if (c.known && c.known !== ALL_KNOWN) {
      const had = knownBits(world, c);
      for (let k = 0; k < size; k++) b[k] |= had[k];
    }
    store(world, c, b);
  }
}

// ── Sharing maps ──────────────────────────────────────────────────

/**
 * Each month the realms of a realm, and allies, share their maps; each January the realms of a faith
 * family that know cartography share theirs. Realms of the industrial era know the world.
 */
export function monthlyMaps(state: GameState, world: SimWorld, january: boolean) {
  // Realms that have never looked at the world (from an old save, or new): the lands around them.
  if (state.countries.some((c) => c?.alive && !c.known)) initialKnowledge(state, world, (c) => !c.known);
  for (const c of state.countries) {
    if (!c?.alive || c.known === ALL_KNOWN) continue;
    if (eraOfLevel(c.tech.society) >= WORLD_KNOWN_ERA) {
      c.known = ALL_KNOWN;
      continue;
    }
    if (c.liege) {
      const top = state.countries[topLiege(state, c.index)];
      if (top?.alive) {
        learnAll(world, top, knownBits(world, c));
        learnAll(world, c, knownBits(world, top));
      }
    }
  }
  for (const p of state.pacts) {
    if (p.kind !== 'alliance') continue;
    const a = state.countries[p.a],
      b = state.countries[p.b];
    if (!a?.alive || !b?.alive) continue;
    learnAll(world, a, knownBits(world, b));
    learnAll(world, b, knownBits(world, a));
  }
  if (!january) return;
  const byFamily = new Map<string, Country[]>();
  for (const c of state.countries) {
    if (!c?.alive || c.liege || !techEffect(c, 'maps')) continue;
    const f = faithFamily(c.religion) || c.religion;
    let list = byFamily.get(f);
    if (!list) byFamily.set(f, (list = []));
    list.push(c);
  }
  for (const list of byFamily.values()) {
    if (list.length < 2) continue;
    const union = new Uint8Array(setSize(world));
    for (const c of list) {
      const b = knownBits(world, c);
      for (let k = 0; k < union.length; k++) union[k] |= b[k];
    }
    for (const c of list) learnAll(world, c, union);
  }
}

/** How many regions a country knows. */
export function knownCount(world: SimWorld, c: Country): number {
  if (c.known === ALL_KNOWN) return world.regions.length;
  const bits = knownBits(world, c);
  let n = 0;
  for (let id = 1; id <= world.regions.length; id++) if (bits[id >> 3] & (1 << (id & 7))) n++;
  return n;
}
