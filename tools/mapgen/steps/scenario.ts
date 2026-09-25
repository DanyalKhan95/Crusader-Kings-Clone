/**
 * Step: the 1066 scenario — province owners, cultures, religions, and the country list.
 * Output: scenario.json (work dir)
 */
import {
  CULTURE_ZONES,
  CULTURES,
  HIST_CULTURE,
  RELIGION_ZONES,
  RELIGIONS,
  STATE_CULTURE,
  STATE_RELIGION,
  UNINHABITED,
} from '../curated/cultures.ts';
import { REALMS, type RealmDef } from '../curated/realms1066.ts';
import { MAP_H, MAP_W, latToY, lonToX } from '../lib/projection.ts';
import { debugImage, loadArray, loadJSON, saveJSON } from '../lib/raster.ts';
import type { RegionAttrs } from './attributes.ts';
import type { HistMeta } from './history.ts';

export interface ScenarioProvince {
  id: number;
  owner: string | null;
  culture: string | null;
  religion: string | null;
}

export interface ScenarioCountry {
  tag: string;
  name: string;
  short: string;
  adj: string;
  gov: RealmDef['gov'];
  rank: RealmDef['rank'];
  color: string;
  liege?: string;
  capital: number;
  culture: string;
  religion: string;
  ruler?: RealmDef['ruler'];
}

export interface Scenario {
  start: string;
  countries: ScenarioCountry[];
  provinces: ScenarioProvince[];
}

type Ring = [number, number][];
function inRing(ring: Ring, lon: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i],
      [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export async function buildScenario(): Promise<void> {
  const W = MAP_W,
    H = MAP_H;
  const reg = loadArray('regions.u16', Uint16Array);
  const realm = loadArray('realm.u16', Uint16Array);
  const hist = loadArray('hist.u16', Uint16Array);
  const tags = loadJSON<string[]>('realmTags.json');
  const histMeta = loadJSON<HistMeta[]>('histMeta.json');
  const attrs = loadJSON<RegionAttrs[]>('attributes.json');

  console.log('  sampling owners');
  const ownerVotes = new Map<number, Map<number, number>>();
  const histVotes = new Map<number, Map<number, number>>();
  const vote = (m: Map<number, Map<number, number>>, r: number, v: number) => {
    let mm = m.get(r);
    if (!mm) m.set(r, (mm = new Map()));
    mm.set(v, (mm.get(v) ?? 0) + 1);
  };
  for (let y = 0; y < H; y += 2)
    for (let x = 0; x < W; x += 2) {
      const p = y * W + x;
      const r = reg[p];
      if (attrs[r - 1].kind !== 'land') continue;
      vote(ownerVotes, r, realm[p]);
      if (hist[p]) vote(histVotes, r, hist[p]);
    }
  const top = (m: Map<number, number> | undefined) => {
    let best = 0,
      bc = -1;
    if (m)
      for (const [k, c] of m)
        if (c > bc) {
          bc = c;
          best = k;
        }
    return best;
  };

  const provinces: ScenarioProvince[] = [];
  for (const a of attrs) {
    if (a.kind !== 'land') continue;
    const uninhabited = UNINHABITED.some((ring) => inRing(ring, a.lon, a.lat));
    const ownerId = top(ownerVotes.get(a.id));
    let owner = ownerId ? tags[ownerId - 1] : null;
    if (uninhabited || a.impassable) owner = null;
    let culture: string | null = null;
    if (!uninhabited && !a.impassable) {
      for (const [c, ring] of CULTURE_ZONES) if (inRing(ring, a.lon, a.lat)) culture = c;
      if (!culture) {
        const h = top(histVotes.get(a.id));
        if (h) culture = HIST_CULTURE[histMeta[h - 1].name] ?? null;
      }
    }
    provinces.push({ id: a.id, owner, culture, religion: null });
  }

  // Fill missing cultures from neighbours (repeat until stable).
  const byId = new Map(provinces.map((p) => [p.id, p]));
  for (let pass = 0; pass < 30; pass++) {
    let changed = 0;
    for (const p of provinces) {
      if (p.culture) continue;
      const a = attrs[p.id - 1];
      if (a.impassable || UNINHABITED.some((ring) => inRing(ring, a.lon, a.lat))) continue;
      const counts = new Map<string, number>();
      for (const n of a.neighbors) {
        const q = byId.get(n.id);
        if (q?.culture) counts.set(q.culture, (counts.get(q.culture) ?? 0) + n.km);
      }
      let best: string | null = null,
        bc = 0;
      for (const [c, k] of counts)
        if (k > bc) {
          bc = k;
          best = c;
        }
      if (best) {
        p.culture = best;
        changed++;
      }
    }
    if (!changed) break;
  }
  for (const p of provinces) {
    if (!p.culture) continue;
    const a = attrs[p.id - 1];
    let rel = CULTURES[p.culture][2];
    for (const [r, ring] of RELIGION_ZONES) if (inRing(ring, a.lon, a.lat)) rel = r;
    p.religion = rel;
  }

  // Islands the basemap left out (Wight, Jersey, the Aegean) go to whoever holds the facing coast.
  let islands = 0;
  const initialOwner = new Map(provinces.map((p) => [p.id, p.owner]));
  for (const p of provinces) {
    const a = attrs[p.id - 1];
    if (p.owner || a.impassable || UNINHABITED.some((ring) => inRing(ring, a.lon, a.lat))) continue;
    const land = a.neighbors.filter((n) => attrs[n.id - 1].kind === 'land');
    if (!land.length || land.some((n) => !n.strait)) continue;
    const facing = new Map<string, number>();
    for (const n of land) {
      const o = initialOwner.get(n.id);
      if (o) facing.set(o, (facing.get(o) ?? 0) + n.km + 1);
    }
    let best: string | null = null,
      bk = 0;
    for (const [o, k] of facing)
      if (k > bk) {
        bk = k;
        best = o;
      }
    if (best) {
      p.owner = best;
      islands++;
    }
  }
  console.log(`  ${islands} unclaimed islands given to the facing coast`);

  // Small realms (smaller than a province) get the province under their capital.
  const ownedTags = new Set(provinces.map((p) => p.owner));
  for (const def of REALMS) {
    if (ownedTags.has(def.tag) || !def.capital) continue;
    const x = Math.floor(lonToX(def.capital[0])),
      y = Math.floor(latToY(def.capital[1]));
    const p = byId.get(reg[y * W + x]);
    if (!p || attrs[p.id - 1].impassable) continue;
    const prevOwner = p.owner;
    if (prevOwner && provinces.filter((q) => q.owner === prevOwner).length <= 1) continue;
    p.owner = def.tag;
    ownedTags.add(def.tag);
  }

  console.log('  countries');
  const owned = new Map<string, ScenarioProvince[]>();
  for (const p of provinces) {
    if (!p.owner) continue;
    const list = owned.get(p.owner);
    if (list) list.push(p);
    else owned.set(p.owner, [p]);
  }
  const countries: ScenarioCountry[] = [];
  for (const def of REALMS) {
    const list = owned.get(def.tag);
    if (!list?.length) {
      console.warn(`  WARNING: ${def.tag} (${def.name}) owns no province`);
      continue;
    }
    let capital = list[0];
    if (def.capital) {
      const x = Math.floor(lonToX(def.capital[0])),
        y = Math.floor(latToY(def.capital[1]));
      const r = reg[y * W + x];
      const hit = list.find((p) => p.id === r);
      if (hit) capital = hit;
      else {
        // nearest owned province to the capital coordinate
        let bd = Infinity;
        for (const p of list) {
          const a = attrs[p.id - 1];
          const d = (a.lon - def.capital[0]) ** 2 + (a.lat - def.capital[1]) ** 2;
          if (d < bd) {
            bd = d;
            capital = p;
          }
        }
      }
    } else capital = list.reduce((b, p) => ((attrs[p.id - 1].dev ?? 0) > (attrs[b.id - 1].dev ?? 0) ? p : b));
    const culture = STATE_CULTURE[def.tag] ?? capital.culture ?? 'bantu';
    const religion = STATE_RELIGION[def.tag] ?? capital.religion ?? CULTURES[culture][2];
    countries.push({
      tag: def.tag,
      name: def.name,
      short: def.short,
      adj: def.adj,
      gov: def.gov,
      rank: def.rank,
      color: def.color ?? colorFor(def.tag),
      ...(def.liege ? { liege: def.liege } : {}),
      capital: capital.id,
      culture,
      religion,
      ...(def.ruler ? { ruler: def.ruler } : {}),
    });
  }
  const present = new Set(countries.map((c) => c.tag));
  for (const c of countries) if (c.liege && !present.has(c.liege)) delete c.liege;
  // Owned land the culture maps missed (small islands) takes its ruler's people and faith.
  const byTag = new Map(countries.map((c) => [c.tag, c]));
  for (const p of provinces) {
    const c = p.owner ? byTag.get(p.owner) : undefined;
    if (!c || p.culture) continue;
    p.culture = c.culture;
    p.religion = c.religion;
  }

  const scenario: Scenario = { start: '1066-09-15', countries, provinces };
  saveJSON('scenario.json', scenario);
  const natives = provinces.filter((p) => !p.owner && p.culture).length;
  const empty = provinces.filter((p) => !p.culture).length;
  console.log(`  ${countries.length} countries, ${natives} native provinces, ${empty} empty/impassable`);

  // Debug maps
  const provColor = new Map<number, [number, number, number]>();
  const hex = (h: string): [number, number, number] => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  const cmap = new Map(countries.map((c) => [c.tag, hex(c.color)]));
  for (const p of provinces)
    provColor.set(p.id, p.owner ? cmap.get(p.owner)! : p.culture ? [150, 140, 120] : [230, 230, 235]);
  const pol = (i: number): [number, number, number] => provColor.get(reg[i]) ?? [30, 45, 75];
  await debugImage('10-political.png', W, H, pol, { step: 8 });
  await debugImage('10-political-europe.png', W, H, pol, { x0: 7400, y0: 1700, x1: 10400, y1: 3600, step: 3 });
  const relColor = new Map<number, [number, number, number]>();
  for (const p of provinces) relColor.set(p.id, p.religion ? hex(RELIGIONS[p.religion].color) : [230, 230, 235]);
  await debugImage('10-religion.png', W, H, (i) => relColor.get(reg[i]) ?? [30, 45, 75], { step: 8 });
  const culColor = new Map<number, [number, number, number]>();
  for (const p of provinces) culColor.set(p.id, p.culture ? hsl(hash(p.culture) % 360, 0.45, 0.55) : [230, 230, 235]);
  await debugImage('10-culture.png', W, H, (i) => culColor.get(reg[i]) ?? [30, 45, 75], { step: 8 });
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function hsl(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

export function colorFor(tag: string): string {
  const [r, g, b] = hsl(hash(tag) % 360, 0.45, 0.5);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
