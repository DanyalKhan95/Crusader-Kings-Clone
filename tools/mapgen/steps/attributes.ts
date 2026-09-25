/**
 * Step 7: per-region attributes — area, label point, neighbours (with river crossings and
 * straits), terrain type, development, coastal flag and names.
 *
 * Output: attributes.json (array indexed by region id - 1), rivers.json (projected polylines)
 */
import { join } from 'node:path';
import { HISTORICAL_CITIES } from '../curated/historicalCities.ts';
import { SEA_NAMES } from '../curated/seaNames.ts';
import { TERRAIN_ZONES } from '../curated/terrainZones.ts';
import { squaredEDT } from '../lib/edt.ts';
import { linesOf, loadFeatures, projectPath, projectPolygons } from '../lib/geo.ts';
import { CACHE_DIR } from '../lib/paths.ts';
import { MAP_H, MAP_W, latToY, lonToX, rowScales, xToLon, yToLat } from '../lib/projection.ts';
import { fillRings, strokePath } from '../lib/rasterize.ts';
import { loadArray, loadJSON, saveJSON } from '../lib/raster.ts';
import { loadBlueMarble, loadPlaces, sampleEquirect } from '../lib/sources.ts';
import type { AdmMeta } from './land.ts';
import type { ProvMeta } from './provinces.ts';
import type { RegionKind, RegionMeta } from './seas.ts';

export const TERRAINS = [
  'plains',
  'farmland',
  'hills',
  'mountains',
  'forest',
  'taiga',
  'jungle',
  'steppe',
  'drylands',
  'desert',
  'wetlands',
  'tundra',
  'ice',
] as const;
export type Terrain = (typeof TERRAINS)[number];

export interface Neighbor {
  id: number;
  km: number;
  river?: boolean;
  strait?: boolean;
}

export interface RegionAttrs {
  id: number;
  kind: RegionKind;
  name: string;
  areaKm2: number;
  label: [number, number];
  bbox: [number, number, number, number];
  lon: number;
  lat: number;
  neighbors: Neighbor[];
  // land only
  terrain?: Terrain;
  elevation?: number;
  dev?: number;
  coastal?: boolean;
  impassable?: boolean;
  adm0?: string;
  admin1?: string;
  city?: string;
}

const T = Object.fromEntries(TERRAINS.map((t, i) => [t, i])) as Record<Terrain, number>;

export async function buildAttributes(): Promise<void> {
  const W = MAP_W,
    H = MAP_H,
    N = W * H;
  const reg = loadArray('regions.u16', Uint16Array);
  const metas = loadJSON<RegionMeta[]>('regionsMeta.json');
  const provMeta = loadJSON<ProvMeta[]>('provMeta.json');
  const admMeta = loadJSON<AdmMeta[]>('admMeta.json');
  const adm = loadArray('adm.u16', Uint16Array);
  const elev = loadArray('elev.i16', Int16Array);
  const R = metas.length;
  const { kx, ky, area } = rowScales(H);
  const ne = (n: string) => join(CACHE_DIR, 'ne', `${n}.geojson`);

  console.log('  area, bounds, adjacency');
  const px = new Float64Array(R + 1),
    km2 = new Float64Array(R + 1);
  const minX = new Int32Array(R + 1).fill(W),
    minY = new Int32Array(R + 1).fill(H),
    maxX = new Int32Array(R + 1).fill(-1),
    maxY = new Int32Array(R + 1).fill(-1);
  const elevSum = new Float64Array(R + 1);
  const adj = new Map<number, number>();
  const key = (a: number, b: number) => (a < b ? a * 65536 + b : b * 65536 + a);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      const r = reg[p];
      px[r]++;
      km2[r] += area[y];
      elevSum[r] += elev[p];
      if (x < minX[r]) minX[r] = x;
      if (x > maxX[r]) maxX[r] = x;
      if (y < minY[r]) minY[r] = y;
      if (y > maxY[r]) maxY[r] = y;
      const right = reg[x < W - 1 ? p + 1 : p - W + 1];
      if (right !== r) {
        const k = key(r, right);
        adj.set(k, (adj.get(k) ?? 0) + ky[y]);
      }
      if (y < H - 1) {
        const down = reg[p + W];
        if (down !== r) {
          const k = key(r, down);
          adj.set(k, (adj.get(k) ?? 0) + kx[y]);
        }
      }
    }
  }

  console.log('  label points');
  const d2 = squaredEDT(W, H, (p) => {
    const r = reg[p];
    const x = p % W;
    return (
      (p >= W && reg[p - W] !== r) ||
      (p < N - W && reg[p + W] !== r) ||
      reg[x > 0 ? p - 1 : p + W - 1] !== r ||
      reg[x < W - 1 ? p + 1 : p - W + 1] !== r
    );
  });
  const best = new Float32Array(R + 1).fill(-1);
  const bestP = new Int32Array(R + 1);
  for (let p = 0; p < N; p++) {
    const r = reg[p];
    if (d2[p] > best[r]) {
      best[r] = d2[p];
      bestP[r] = p;
    }
  }

  console.log('  rivers');
  const riverMask = new Uint8Array(N);
  const majorRiverMask = new Uint8Array(N);
  const rivers: { w: number; pts: number[] }[] = [];
  const addRivers = (file: string, maxRank: number, widthOf: (rank: number) => number) => {
    for (const f of loadFeatures<Record<string, number | string | null>>(ne(file))) {
      const rank = Number(f.properties.scalerank ?? 99);
      if (rank > maxRank || f.properties.featurecla === 'Lake Centerline') continue;
      for (const line of linesOf(f.geometry)) {
        const pp = projectPath(line);
        strokePath(pp, W, H, (x, y) => (riverMask[y * W + x] = 1));
        if (file === 'ne_10m_rivers_lake_centerlines' && rank <= 6)
          strokePath(pp, W, H, (x, y) => (majorRiverMask[y * W + x] = 1));
        const simple = simplifyLine(pp, 0.8);
        if (simple.length >= 4) rivers.push({ w: widthOf(rank), pts: simple.map((v) => Math.round(v * 4) / 4) });
      }
    }
  };
  addRivers('ne_10m_rivers_lake_centerlines', 8, (r) => (r <= 2 ? 3 : r <= 5 ? 2 : 1));
  addRivers('ne_10m_rivers_europe', 11, () => 1);
  // River crossing: share of border pixels touching a river.
  const riverBorder = new Map<number, number>();
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const p = y * W + x;
      const r = reg[p];
      for (const q of [p + 1, p + W]) {
        const s = reg[q];
        if (s === r) continue;
        if (
          riverMask[p] ||
          riverMask[q] ||
          riverMask[p - 1] ||
          riverMask[q + 1] ||
          riverMask[p - W] ||
          riverMask[q + W]
        ) {
          const k = key(r, s);
          riverBorder.set(k, (riverBorder.get(k) ?? 0) + (q === p + 1 ? ky[y] : kx[y]));
        }
      }
    }

  console.log('  terrain classification');
  const glacier = new Uint8Array(N);
  for (const f of loadFeatures(ne('ne_10m_glaciated_areas')))
    fillRings(projectPolygons(f.geometry), W, H, (row, a, b) => glacier.fill(1, row * W + a, row * W + b + 1));
  const zones = new Uint8Array(N);
  TERRAIN_ZONES.forEach((z, i) =>
    fillRings([projectPath(z.ring)], W, H, (row, a, b) => zones.fill(i + 1, row * W + a, row * W + b + 1)),
  );
  const bm = await loadBlueMarble();
  const terrainVotes = new Float64Array((R + 1) * TERRAINS.length);
  const rgb = new Float64Array(3);
  const STEP = 2;
  const nearRiver = (x: number, y: number) => {
    for (let j = -4; j <= 4; j += 2)
      for (let k = -4; k <= 4; k += 2) {
        const yy = y + j;
        if (yy < 0 || yy >= H) continue;
        if (majorRiverMask[yy * W + ((x + k + W) % W)]) return true;
      }
    return false;
  };
  for (let y = STEP; y < H - STEP; y += STEP) {
    const lat = yToLat(y + 0.5);
    const alat = Math.abs(lat);
    for (let x = STEP; x < W - STEP; x += STEP) {
      const p = y * W + x;
      const r = reg[p];
      if (metas[r - 1].kind !== 'land') continue;
      const e = elev[p];
      // local relief over ±6 px (~±15 km)
      let lo = e,
        hi = e;
      for (let k = -6; k <= 6; k += 3)
        for (let j = -6; j <= 6; j += 3) {
          const yy = Math.min(H - 1, Math.max(0, y + j));
          const xx = (x + k + W) % W;
          const v = elev[yy * W + xx];
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      const relief = hi - lo;
      sampleEquirect(bm, xToLon(x + 0.5), lat, rgb);
      const [cr, cg, cb] = rgb;
      const ndvi = (cg - cr) / (cg + cr + 1);
      const bright = (cr + cg + cb) / 3;
      let t: number;
      if (glacier[p]) t = T.ice;
      else if ((e > 3600 && relief > 400) || relief > 1250) t = T.mountains;
      else if (relief > 520) t = T.hills;
      else if (alat > 68 || (alat > 62 && lat > 0 && xToLon(x) < -60 && xToLon(x) > -170))
        t = ndvi > 0.08 && bright < 80 ? T.taiga : T.tundra;
      else if (alat > 60 && bright > 140)
        t = T.taiga; // snow-covered boreal forest
      else if (ndvi < -0.15) t = bright > 90 || relief < 100 ? T.desert : T.drylands;
      else if (bright > 125 && ndvi < -0.02) t = T.desert;
      else if (bright > 95 && ndvi < -0.03) t = alat >= 38 ? T.steppe : T.drylands;
      else if (ndvi < -0.08 && alat >= 38 && alat <= 55) t = bright < 85 ? T.steppe : T.drylands;
      else if (ndvi > 0.09 || (bright < 32 && ndvi > 0))
        t = alat < 15 ? T.jungle : alat > borealLat(xToLon(x)) ? T.taiga : T.forest;
      else if (alat > borealLat(xToLon(x)) && ndvi > 0.035) t = T.taiga;
      else t = T.plains;
      // Historical overrides on lowland pixels.
      const z = zones[p];
      if (z && t !== T.mountains && t !== T.hills && t !== T.ice) t = T[TERRAIN_ZONES[z - 1].terrain];
      let weight = area[y];
      // River floodplains in dry lands were farmland (Nile, Tigris, Euphrates, Indus, Oxus…).
      if ((t === T.desert || t === T.drylands) && nearRiver(x, y)) {
        t = T.farmland;
        weight *= 4;
      }
      terrainVotes[r * TERRAINS.length + t] += weight;
    }
  }

  console.log('  development');
  const cityInRegion = new Map<number, { name: string; dev: number }>();
  const cityDev = new Float64Array(R + 1);
  const cityMax = new Float64Array(R + 1);
  for (const c of HISTORICAL_CITIES) {
    const cx = Math.floor(lonToX(c.lon)),
      cy = Math.floor(latToY(c.lat));
    let r = reg[cy * W + cx];
    if (metas[r - 1].kind !== 'land') r = nearestLand(reg, metas, cx, cy, W, H);
    if (!r) continue;
    cityDev[r] += c.dev;
    cityMax[r] = Math.max(cityMax[r], c.dev);
    const cur = cityInRegion.get(r);
    if (!cur || c.dev > cur.dev) cityInRegion.set(r, { name: c.name, dev: c.dev });
  }

  console.log('  names');
  const places = loadPlaces();
  const placesIn = new Map<number, typeof places>();
  for (const pl of places) {
    const x = Math.floor(pl.x),
      y = Math.floor(pl.y);
    if (y < 0 || y >= H) continue;
    const r = reg[y * W + (((x % W) + W) % W)];
    if (metas[r - 1]?.kind !== 'land') continue;
    const list = placesIn.get(r);
    if (list) list.push(pl);
    else placesIn.set(r, [pl]);
  }
  const geoNames = majorityNames(
    loadFeatures<Record<string, string | number | null>>(ne('ne_10m_geography_regions_polys')).filter((f) =>
      [
        'Range/mtn',
        'Plateau',
        'Desert',
        'Plain',
        'Basin',
        'Lowland',
        'Valley',
        'Tundra',
        'Wetlands',
        'Peninsula',
        'Pen/cape',
        'Geoarea',
        'Delta',
        'Coast',
        'Island',
        'Island group',
        'Foothills',
        'Depression',
      ].includes(String(f.properties.FEATURECLA)),
    ),
    (f) => String(f.properties.NAME_EN ?? f.properties.NAME ?? ''),
    reg,
    R,
  );
  const marine = loadFeatures<Record<string, string | number | null>>(ne('ne_10m_geography_marine_polys'));
  const marineClass = new Map(
    marine.map((f) => [String(f.properties.name_en ?? f.properties.name), String(f.properties.featurecla)]),
  );
  const seaNames = majorityNames(marine, (f) => String(f.properties.name_en ?? f.properties.name ?? ''), reg, R, true);
  const lakeNames = majorityNames(
    loadFeatures<Record<string, string | number | null>>(ne('ne_10m_lakes')),
    (f) => String(f.properties.name_en ?? f.properties.name ?? ''),
    reg,
    R,
  );
  // Dominant admin-1 unit per land region
  const admVotes = new Map<number, Map<number, number>>();
  for (let y = 0; y < H; y += 3)
    for (let x = 0; x < W; x += 3) {
      const p = y * W + x;
      const a = adm[p];
      if (!a) continue;
      const r = reg[p];
      let m = admVotes.get(r);
      if (!m) admVotes.set(r, (m = new Map()));
      m.set(a, (m.get(a) ?? 0) + 1);
    }

  console.log('  straits');
  const straits = findStraits(reg, metas, W, H, kx, 10);

  console.log('  assembling');
  const attrs: RegionAttrs[] = [];
  const neighborLists: Neighbor[][] = Array.from({ length: R + 1 }, () => []);
  for (const [k, km] of adj) {
    const a = Math.floor(k / 65536),
      b = k % 65536;
    const rb = riverBorder.get(k) ?? 0;
    const bothLand = metas[a - 1].kind === 'land' && metas[b - 1].kind === 'land';
    const river = bothLand && rb / km > 0.3;
    neighborLists[a].push({ id: b, km: round1(km), ...(river ? { river } : {}) });
    neighborLists[b].push({ id: a, km: round1(km), ...(river ? { river } : {}) });
  }
  for (const [k, km] of straits) {
    const a = Math.floor(k / 65536),
      b = k % 65536;
    if (adj.has(k)) continue;
    neighborLists[a].push({ id: b, km: round1(km), strait: true });
    neighborLists[b].push({ id: a, km: round1(km), strait: true });
  }
  for (let r = 1; r <= R; r++) {
    const m = metas[r - 1];
    const lp = bestP[r];
    const lx = lp % W,
      ly = (lp - lx) / W;
    const a: RegionAttrs = {
      id: r,
      kind: m.kind,
      name: '',
      areaKm2: Math.round(km2[r]),
      label: [lx + 0.5, ly + 0.5],
      bbox: [minX[r], minY[r], maxX[r] + 1, maxY[r] + 1],
      lon: round2(xToLon(lx + 0.5)),
      lat: round2(yToLat(ly + 0.5)),
      neighbors: neighborLists[r].sort((p, q) => q.km - p.km),
    };
    if (m.kind === 'land') {
      const votes = terrainVotes.subarray(r * TERRAINS.length, (r + 1) * TERRAINS.length);
      a.terrain = pickTerrain(votes);
      a.elevation = Math.round(elevSum[r] / px[r]);
      a.coastal = a.neighbors.some((n) => metas[n.id - 1].kind === 'sea');
      const av = admVotes.get(r);
      let bestA = 0,
        bv = -1;
      if (av)
        for (const [u, v] of av)
          if (v > bv) {
            bv = v;
            bestA = u;
          }
      const unit = admMeta[bestA - 1];
      a.adm0 = unit?.adm0 ?? provMeta[r - 1]?.adm0 ?? '';
      a.admin1 = unit ? cleanAdmin(unit.nameEn || unit.name) : '';
      a.city = cityInRegion.get(r)?.name;
      a.dev = 0; // filled below
    }
    attrs.push(a);
  }

  // Development: habitability of the terrain + historical cities, normalised.
  const terrainDev: Record<Terrain, number> = {
    farmland: 7,
    plains: 5.5,
    forest: 3.5,
    hills: 4,
    wetlands: 3,
    steppe: 2.5,
    drylands: 2.5,
    jungle: 2.5,
    taiga: 1.5,
    mountains: 1.8,
    desert: 1,
    tundra: 0.8,
    ice: 0.2,
  };
  for (const a of attrs) {
    if (a.kind !== 'land') continue;
    const regionMul = devRegion(a.lon, a.lat);
    const sizeMul = Math.min(1.5, Math.max(0.6, Math.sqrt(a.areaKm2 / 15000)));
    const base = terrainDev[a.terrain!] * regionMul * sizeMul;
    const cities = cityMax[a.id] + 0.3 * (cityDev[a.id] - cityMax[a.id]);
    a.dev = Math.max(1, Math.min(40, Math.round(base + cities * 0.8)));
    // farmland upgrade for fertile, developed lowlands next to rivers
    if (a.terrain === 'plains' && a.dev >= 8 && a.neighbors.some((n) => n.river)) a.terrain = 'farmland';
    a.impassable =
      a.terrain === 'ice' ||
      (a.terrain === 'mountains' && (a.elevation ?? 0) > 4300 && !placesIn.get(a.id)?.length) ||
      (a.terrain === 'desert' && a.dev <= 1 && !placesIn.get(a.id)?.length && a.areaKm2 > 150000);
  }

  // Names
  const americasOrOceania = (a: RegionAttrs) =>
    a.lon < -30 || (a.lon > 110 && a.lat < -10) || (a.lon > 60 && a.lat > 52);
  for (const a of attrs) {
    if (a.kind === 'land') {
      const pl = (placesIn.get(a.id) ?? []).slice().sort((p, q) => score(q) - score(p));
      const geo = geoNames.get(a.id);
      const cityName = a.city ?? pl[0]?.name;
      if (a.city) a.name = a.city;
      else if (americasOrOceania(a))
        a.name = a.admin1 || (geo && geo.share > 0.35 ? titleCase(geo.name) : cityName) || 'Wilds';
      else a.name = cityName || a.admin1 || titleCase(geo?.name ?? 'Frontier');
    } else if (a.kind === 'lake') {
      a.name = lakeName(lakeNames.get(a.id)?.name);
    } else {
      const sn = seaNames.get(a.id);
      const ln = lakeNames.get(a.id);
      a.name = ln && ln.share > 0.5 ? lakeName(ln.name) : sn?.name ? titleCase(sn.name) : 'Open Sea';
    }
  }
  // Curated sub-sea names win over Natural Earth's broad ones.
  const namedZones = new Set<number>();
  for (const sn of SEA_NAMES) {
    const x = Math.floor(lonToX(sn.lon)),
      y = Math.floor(latToY(sn.lat));
    const r = reg[y * W + (((x % W) + W) % W)];
    if (metas[r - 1].kind !== 'sea' || namedZones.has(r)) continue;
    namedZones.add(r);
    attrs[r - 1].name = sn.name;
  }
  // Coastal ocean zones: "Coast of X" instead of a whole ocean's name.
  for (const a of attrs) {
    if (a.kind !== 'sea') continue;
    const cls = marineClass.get(a.name) ?? marineClass.get(a.name.toUpperCase());
    const isOcean = cls === 'ocean' || /ocean/i.test(a.name);
    if (!isOcean || namedZones.has(a.id)) continue;
    const coast = a.neighbors.filter((n) => attrs[n.id - 1].kind === 'land').sort((p, q) => q.km - p.km)[0];
    if (coast && coast.km > 60) a.name = `Coast of ${attrs[coast.id - 1].name}`;
  }
  disambiguate(attrs);

  saveJSON('attributes.json', attrs);
  saveJSON('rivers.json', rivers);
  const counts: Record<string, number> = {};
  for (const a of attrs) if (a.terrain) counts[a.terrain] = (counts[a.terrain] ?? 0) + 1;
  console.log('  terrain counts', counts);
  console.log(
    `  ${attrs.filter((a) => a.impassable).length} impassable provinces, ${straits.size} strait candidates, ${rivers.length} river lines`,
  );
}

function devRegion(lon: number, lat: number): number {
  if (lon >= -12 && lon <= 45 && lat >= 34 && lat <= 60) return 1;
  if (lon >= 25 && lon <= 75 && lat >= 12 && lat < 45) return 1.05; // Middle East, Iran
  if (lon >= -18 && lon < 25 && lat >= 27 && lat < 38) return 0.9;
  if (lon >= 60 && lon <= 98 && lat >= 5 && lat <= 37) return 1.1; // India
  if (lon >= 98 && lon <= 146 && lat >= 18 && lat <= 47) return 1.2; // China, Korea, Japan
  if (lon >= 92 && lon <= 141 && lat >= -11 && lat < 18) return 0.8;
  if (lon < -30) return 0.55;
  if (lon >= -18 && lon <= 52 && lat < 27) return 0.65;
  if (lon > 110 && lat < -10) return 0.35;
  return 0.6;
}

function pickTerrain(votes: Float64Array): Terrain {
  let total = 0;
  for (const v of votes) total += v;
  if (total === 0) return 'plains';
  const share = (t: Terrain) => votes[T[t]] / total;
  if (share('ice') > 0.5) return 'ice';
  if (share('mountains') > 0.4) return 'mountains';
  if (share('wetlands') > 0.3) return 'wetlands';
  if (share('farmland') > 0.3) return 'farmland';
  let best = 0;
  for (let i = 1; i < votes.length; i++) if (votes[i] > votes[best]) best = i;
  const t = TERRAINS[best];
  if (t === 'plains' && share('hills') + share('mountains') > 0.35) return 'hills';
  return t;
}

function score(p: { pop: number; cls: string; capital: boolean }) {
  return Math.log10(p.pop + 10) + (p.capital ? 1.5 : 0) + (/Admin-1/.test(p.cls) ? 0.4 : 0);
}

function nearestLand(reg: Uint16Array, metas: RegionMeta[], x: number, y: number, w: number, h: number) {
  for (let r = 1; r < 12; r++)
    for (let j = -r; j <= r; j++)
      for (let i = -r; i <= r; i++) {
        const yy = y + j,
          xx = (x + i + w) % w;
        if (yy < 0 || yy >= h) continue;
        const id = reg[yy * w + xx];
        if (metas[id - 1].kind === 'land') return id;
      }
  return 0;
}

/** Rasterizes named polygons and returns, per region, the name covering most of it. */
function majorityNames<P>(
  features: { properties: P; geometry: import('../lib/geo.ts').Geometry | null }[],
  nameOf: (f: { properties: P }) => string,
  reg: Uint16Array,
  R: number,
  largestFirst = false,
): Map<number, { name: string; share: number }> {
  const W = MAP_W,
    H = MAP_H;
  const withRings = features
    .map((f) => ({ name: nameOf(f), rings: projectPolygons(f.geometry) }))
    .filter((f) => f.name && f.rings.length);
  if (largestFirst) {
    const size = (rings: Float64Array[]) => {
      let a = 0;
      for (const r of rings) {
        let s = 0;
        const n = r.length / 2;
        for (let i = 0, j = n - 1; i < n; j = i++) s += r[j * 2] * r[i * 2 + 1] - r[i * 2] * r[j * 2 + 1];
        a += Math.abs(s / 2);
      }
      return a;
    };
    withRings.sort((a, b) => size(b.rings) - size(a.rings));
  }
  const counts = new Map<number, Map<number, number>>();
  const total = new Float64Array(R + 1);
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) total[reg[y * W + x]]++;
  const label = new Int32Array(W * H).fill(-1);
  withRings.forEach((f, i) =>
    fillRings(f.rings, W, H, (row, a, b) => {
      label.fill(i, row * W + a, row * W + b + 1);
    }),
  );
  for (let y = 0; y < H; y += 2)
    for (let x = 0; x < W; x += 2) {
      const p = y * W + x;
      const l = label[p];
      if (l < 0) continue;
      const r = reg[p];
      let m = counts.get(r);
      if (!m) counts.set(r, (m = new Map()));
      m.set(l, (m.get(l) ?? 0) + 1);
    }
  const out = new Map<number, { name: string; share: number }>();
  for (const [r, m] of counts) {
    let bl = -1,
      bc = 0;
    for (const [l, c] of m)
      if (c > bc) {
        bc = c;
        bl = l;
      }
    if (bl >= 0) out.set(r, { name: withRings[bl].name, share: bc / Math.max(1, total[r]) });
  }
  return out;
}

/** Land provinces facing each other across narrow water (not otherwise adjacent). */
function findStraits(reg: Uint16Array, metas: RegionMeta[], w: number, h: number, kx: Float64Array, maxPx: number) {
  const out = new Map<number, number>();
  const isLand = (r: number) => metas[r - 1].kind === 'land';
  const dirs = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
    [-1, 0],
    [0, -1],
    [-1, -1],
    [-1, 1],
  ];
  for (let y = 1; y < h - 1; y += 1)
    for (let x = 0; x < w; x += 1) {
      const p = y * w + x;
      const a = reg[p];
      if (!isLand(a)) continue;
      for (const [dx, dy] of dirs) {
        const q0 = (y + dy) * w + ((x + dx + w) % w);
        if (isLand(reg[q0])) continue;
        for (let s = 2; s <= maxPx; s++) {
          const yy = y + dy * s;
          if (yy < 0 || yy >= h) break;
          const b = reg[yy * w + ((x + dx * s + w) % w)];
          if (!isLand(b)) continue;
          if (b !== a) {
            const k = a < b ? a * 65536 + b : b * 65536 + a;
            const km = s * kx[y] * Math.hypot(dx, dy);
            const old = out.get(k);
            if (old === undefined || km < old) out.set(k, km);
          }
          break;
        }
      }
    }
  return out;
}

function simplifyLine(p: Float64Array, tol: number): number[] {
  const n = p.length / 2;
  if (n <= 2) return Array.from(p);
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let far = -1,
      fd = tol * tol;
    const ax = p[a * 2],
      ay = p[a * 2 + 1],
      dx = p[b * 2] - ax,
      dy = p[b * 2 + 1] - ay;
    const len2 = dx * dx + dy * dy || 1;
    for (let i = a + 1; i < b; i++) {
      const t = Math.max(0, Math.min(1, ((p[i * 2] - ax) * dx + (p[i * 2 + 1] - ay) * dy) / len2));
      const d = (p[i * 2] - ax - t * dx) ** 2 + (p[i * 2 + 1] - ay - t * dy) ** 2;
      if (d > fd) {
        fd = d;
        far = i;
      }
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(p[i * 2], p[i * 2 + 1]);
  return out;
}

/** European boreal-forest boundary is pushed north by the Gulf Stream. */
function borealLat(lon: number): number {
  return lon > -12 && lon < 45 ? 59 : 53;
}

const POLISH: Record<string, string> = {
  Masovian: 'Masovia',
  Silesian: 'Silesia',
  'Lower Silesian': 'Lower Silesia',
  Pomeranian: 'Pomerania',
  'West Pomeranian': 'West Pomerania',
  'Kuyavian-Pomeranian': 'Kuyavia',
  'Warmian-Masurian': 'Warmia',
  Subcarpathian: 'Subcarpathia',
  Podlaskie: 'Podlasie',
  Świętokrzyskie: 'Sandomierz',
};

function cleanAdmin(name: string): string {
  let n = name
    .replace(/^(Province|Region|Department|City|Municipality|County|State|Governorate) of /i, '')
    .replace(
      / (Voivodeship|Canton|County|Province|Region|Oblast|Governorate|District|Prefecture|Department|Municipality|Krai|Kray|Autonomous Okrug|Autonomous Oblast|Autonomous Region|Autonomous Community|Autonomous Republic|Republic|Territory|State|Division|Emirate|Wilaya|Muhafazah|Rayon|Parish|Borough|Council|Area)$/i,
      '',
    )
    .trim();
  if (POLISH[n]) n = POLISH[n];
  return n;
}

function lakeName(n: string | undefined): string {
  if (!n) return 'Lake';
  return /lake|lago|lac |sea|reservoir|lagoon|laguna/i.test(n) ? n : `Lake ${n}`;
}

export function titleCase(s: string): string {
  if (s !== s.toUpperCase()) return s;
  return s
    .toLowerCase()
    .replace(/(^|[\s\-'(])([a-zà-ÿ])/g, (_m, a: string, b: string) => a + b.toUpperCase())
    .replace(/\b(Of|The|And|De|La|Du|Des|Da|Del)\b/g, (m) => m.toLowerCase());
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Makes names unique: duplicates get compass qualifiers relative to their group's centre. */
function disambiguate(attrs: RegionAttrs[]) {
  const groups = new Map<string, RegionAttrs[]>();
  for (const a of attrs) {
    const list = groups.get(a.name);
    if (list) list.push(a);
    else groups.set(a.name, [a]);
  }
  for (const [name, list] of groups) {
    if (list.length < 2) continue;
    // keep the plain name for the region containing the named city, else the largest
    list.sort((p, q) => Number(q.city === name) - Number(p.city === name) || q.areaKm2 - p.areaKm2);
    const cx = list.reduce((s, a) => s + a.label[0], 0) / list.length;
    const cy = list.reduce((s, a) => s + a.label[1], 0) / list.length;
    const used = new Set<string>([name]);
    for (let i = 1; i < list.length; i++) {
      const a = list[i];
      const dx = a.label[0] - cx,
        dy = a.label[1] - cy;
      const ang = (Math.atan2(-dy, dx) * 180) / Math.PI;
      const dirs = ['East', 'North-East', 'North', 'North-West', 'West', 'South-West', 'South', 'South-East'];
      const dir = dirs[((Math.round(ang / 45) % 8) + 8) % 8];
      let candidate = `${dir} ${name}`;
      let n = 2;
      while (used.has(candidate)) candidate = `${dir} ${name} ${roman(n++)}`;
      used.add(candidate);
      a.name = candidate;
    }
  }
}

function roman(n: number): string {
  const m: [number, string][] = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let s = '';
  for (const [v, r] of m)
    while (n >= v) {
      s += r;
      n -= v;
    }
  return s;
}
