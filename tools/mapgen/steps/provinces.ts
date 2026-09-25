/**
 * Step 4: land provinces (~3,000) from admin-1 units.
 *
 *  1. A "weight" field says how much a place matters (habitability, population, region).
 *  2. Each admin-1 unit wants weight/A0 provinces. Tiny units merge with neighbours in the same
 *     modern country and the same 1066 realm; big units split into several provinces.
 *  3. Splits: weighted k-means picks seeds, then constrained Dijkstra growth fills the unit, which
 *     keeps every province in one piece.
 *
 * Outputs: prov.u16 (land province id, 0 = water), provMeta.json
 */
import { MinHeap } from '../lib/heap.ts';
import { MAP_H, MAP_W, rowScales, xToLon, yToLat } from '../lib/projection.ts';
import { debugImage, hasWork, labelColor, loadArray, loadJSON, saveArray, saveJSON } from '../lib/raster.ts';
import { loadBlueMarble, loadPlaces, sampleEquirect } from '../lib/sources.ts';
import type { AdmMeta } from './land.ts';

export const TARGET_LAND_PROVINCES = 3000;
const MERGE_BELOW = 0.5;
/** Units smaller than this (km²) always merge, however dense their population. */
const MIN_KM2 = 700;
/** Islets smaller than this (km²) with no land neighbour join the nearest unit across the water. */
const ISLET_KM2 = 150;
const Q = 4; // weight field resolution divisor

export interface ProvMeta {
  id: number;
  units: number[];
  adm0: string;
  realm: number;
  seedX: number;
  seedY: number;
  /** Number of provinces the parent group was split into (1 = whole/merged group). */
  splitOf: number;
}

/** Relative importance of regions for a 1066-centred game (Europe = 1). */
function regionFactor(lon: number, lat: number): number {
  if (lat > 66) return 0.12;
  if (lon >= -12 && lon <= 45 && lat >= 34 && lat <= 62) return lat > 60 ? 0.6 : 1.0;
  if (lon > 45 && lon <= 65 && lat >= 44 && lat <= 62) return 0.5; // Volga, Urals
  if (lon >= 25 && lon <= 63 && lat >= 12 && lat < 44) return 0.85; // Middle East
  if (lon >= -18 && lon < 25 && lat >= 27 && lat < 38) return 0.8; // Maghreb, Libya
  if (lon >= 60 && lon <= 98 && lat >= 5 && lat <= 37) return 0.8; // India
  if (lon >= 98 && lon <= 146 && lat >= 20 && lat <= 47) return 0.75; // China, Korea, Japan
  if (lon >= 92 && lon <= 141 && lat >= -11 && lat < 20) return 0.55; // SE Asia
  if (lon > 45 && lon < 98 && lat > 37 && lat <= 56) return 0.4; // Central Asia
  if (lon >= 25 && lon <= 60 && lat > 62) return 0.35;
  if (lon > 60 && lat > 47) return 0.15; // Siberia
  if (lon >= -18 && lon <= 52 && lat >= -36 && lat < 27) return lat > 12 && lon > 30 ? 0.35 : 0.24; // Africa (Horn/Nubia a bit denser)
  if (lon >= -110 && lon <= -77 && lat >= 7 && lat <= 26) return 0.3; // Mesoamerica
  if (lon >= -82 && lon <= -63 && lat >= -35 && lat < 7) return 0.22; // Andes
  if (lon < -30) return 0.1; // rest of the Americas
  if (lon >= 110 && lat < -10) return 0.13; // Australia, NZ
  return 0.3;
}

export async function buildProvinces(): Promise<void> {
  const W = MAP_W,
    H = MAP_H,
    N = W * H;
  const adm = loadArray('adm.u16', Uint16Array);
  const units = loadJSON<AdmMeta[]>('admMeta.json');
  const U = units.length + 1;
  const elev = loadArray('elev.i16', Int16Array);
  const realmRaster = hasWork('realm.u16') ? loadArray('realm.u16', Uint16Array) : loadArray('hist.u16', Uint16Array);
  const { kx, ky, area } = rowScales(H);

  console.log('  weight field');
  const wq = await weightField(elev);
  const QW = W / Q;
  const weightAt = (p: number) => {
    const x = p % W,
      y = (p - x) / W;
    return wq[((y / Q) | 0) * QW + ((x / Q) | 0)];
  };

  console.log('  unit statistics');
  const px = new Float64Array(U);
  const S = new Float64Array(U);
  const km = new Float64Array(U);
  for (let y = 0; y < H; y++) {
    const a = area[y];
    const qrow = ((y / Q) | 0) * QW;
    for (let x = 0; x < W; x++) {
      const u = adm[y * W + x];
      if (!u) continue;
      px[u]++;
      km[u] += a;
      S[u] += wq[qrow + ((x / Q) | 0)] * a;
    }
  }
  const unitRealm = majorityRealm(adm, realmRaster, W, H, U);

  console.log('  unit adjacency');
  const landPairs = new Map<number, number>();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      const a = adm[p];
      if (!a) continue;
      const r = adm[x < W - 1 ? p + 1 : p - W + 1];
      if (r && r !== a) bump(landPairs, a, r, ky[y]);
      if (y < H - 1) {
        const d = adm[p + W];
        if (d && d !== a) bump(landPairs, a, d, kx[y]);
      }
    }
  const seaPairs = maritimePairs(adm, W, H, 40);

  const merge = (A0: number) => mergeUnits(A0, U, S, px, km, units, unitRealm, landPairs, seaPairs);
  const count = (A0: number) => {
    const { groups } = merge(A0);
    let n = 0;
    for (const g of groups) n += Math.max(1, Math.round(g.S / A0));
    return n;
  };
  let lo = 100,
    hi = 1e7;
  for (let it = 0; it < 40; it++) {
    const mid = Math.sqrt(lo * hi);
    if (count(mid) > TARGET_LAND_PROVINCES) lo = mid;
    else hi = mid;
  }
  const A0 = hi;
  const { groups, unitGroup } = merge(A0);
  console.log(`  A0=${A0.toFixed(0)} → ${count(A0)} provinces from ${groups.length} unit groups (${U - 1} units)`);

  // Group raster (compact ids 1..G).
  const groupOfUnit = new Int32Array(U);
  for (let u = 1; u < U; u++) groupOfUnit[u] = unitGroup[u] + 1;
  const grp = new Uint16Array(N);
  for (let p = 0; p < N; p++) if (adm[p]) grp[p] = groupOfUnit[adm[p]];

  console.log('  seeding split groups');
  const prov = new Uint16Array(N);
  const metas: ProvMeta[] = [];
  const groupFirstProv = new Int32Array(groups.length + 1);
  const splitSeeds: { p: number; id: number }[] = [];
  const pixelsOfGroup = bucketPixels(grp, groups.length + 1);
  for (let g = 0; g < groups.length; g++) {
    const G = groups[g];
    const n = Math.max(1, Math.round(G.S / A0));
    const pixels = pixelsOfGroup[g + 1];
    if (!pixels || pixels.length === 0) continue;
    groupFirstProv[g + 1] = metas.length + 1;
    if (n === 1) {
      const c = pixels[(pixels.length / 2) | 0];
      metas.push(meta(metas.length + 1, G, c % W, (c / W) | 0, 1));
      continue;
    }
    const seeds = kmeansSeeds(pixels, n, W, kx, ky, weightAt);
    for (const s of seeds) {
      const id = metas.length + 1;
      metas.push(meta(id, G, s % W, (s / W) | 0, seeds.length));
      splitSeeds.push({ p: s, id });
    }
  }
  // Whole groups: assign directly.
  for (let p = 0; p < N; p++) {
    const g = grp[p];
    if (!g) continue;
    if (metas[groupFirstProv[g] - 1]?.splitOf === 1) prov[p] = groupFirstProv[g];
  }

  console.log(`  growing ${splitSeeds.length} seeded provinces`);
  growWithin(prov, grp, splitSeeds, W, H, kx, ky);
  assignOrphans(prov, grp, metas, W, H);

  saveArray('prov.u16', prov);
  saveJSON('provMeta.json', metas);
  console.log(`  ${metas.length} land provinces`);

  const col = (i: number): [number, number, number] => (prov[i] ? labelColor(prov[i]) : [20, 30, 60]);
  await debugImage('04-prov.png', W, H, col, { step: 8 });
  await debugImage('04-prov-europe.png', W, H, col, {
    x0: 7700,
    y0: 1900,
    x1: 10100,
    y1: 3500,
    step: 2,
  });
  await debugImage('04-prov-asia.png', W, H, col, {
    x0: 10500,
    y0: 2400,
    x1: 14500,
    y1: 4600,
    step: 2,
  });
}

function meta(id: number, G: Group, x: number, y: number, splitOf: number): ProvMeta {
  return { id, units: G.units, adm0: G.adm0, realm: G.realm, seedX: x, seedY: y, splitOf };
}

function bump(m: Map<number, number>, a: number, b: number, v: number) {
  const k = a < b ? a * 65536 + b : b * 65536 + a;
  m.set(k, (m.get(k) ?? 0) + v);
}

async function weightField(elev: Int16Array): Promise<Float32Array> {
  const W = MAP_W,
    H = MAP_H;
  const QW = W / Q,
    QH = H / Q;
  const bm = await loadBlueMarble();
  // Population density on a coarse grid (sqrt(pop) deposits, Gaussian blur ~120 km).
  const PW = 1024,
    PH = 512;
  const pop = new Float64Array(PW * PH);
  for (const pl of loadPlaces()) {
    const cx = Math.floor((pl.x / W) * PW),
      cy = Math.floor((pl.y / H) * PH);
    if (cy < 0 || cy >= PH) continue;
    pop[cy * PW + (((cx % PW) + PW) % PW)] += Math.sqrt(pl.pop + 1000);
  }
  const blurred = gaussianBlur(pop, PW, PH, 3);
  const landVals: number[] = [];
  for (let i = 0; i < blurred.length; i++) if (blurred[i] > 1e-3) landVals.push(blurred[i]);
  landVals.sort((a, b) => a - b);
  const Dm = landVals[(landVals.length / 2) | 0] || 1;

  const wq = new Float32Array(QW * QH);
  const rgb = new Float64Array(3);
  for (let qy = 0; qy < QH; qy++) {
    const y = qy * Q + Q / 2;
    const lat = yToLat(y);
    for (let qx = 0; qx < QW; qx++) {
      const x = qx * Q + Q / 2;
      const lon = xToLon(x);
      sampleEquirect(bm, lon, lat, rgb);
      const [r, g, b] = rgb;
      const ndvi = (g - r) / (g + r + 1);
      const bright = (r + g + b) / 3;
      const arid = Math.min(1, Math.max(0, (0.03 - ndvi) / 0.1)) * Math.min(1, Math.max(0, (bright - 80) / 60));
      const ice = bright > 185 && Math.max(r, g, b) - Math.min(r, g, b) < 40;
      const alat = Math.abs(lat);
      const cold = alat > 56 ? Math.max(0.12, 1 - (alat - 56) / 14) : 1;
      const e = elev[Math.floor(y) * W + Math.floor(x)];
      const alt = e > 1800 ? Math.max(0.3, 1 - (e - 1800) / 3000) : 1;
      const hab = (1 - 0.82 * arid) * cold * alt * (ice ? 0.04 : 1);
      const D = blurred[Math.floor((y / H) * PH) * PW + Math.floor((x / W) * PW)];
      const popF = 0.55 + (0.95 * D) / (D + Dm);
      wq[qy * QW + qx] = hab * popF * regionFactor(lon, lat);
    }
  }
  return wq;
}

function gaussianBlur(src: Float64Array, w: number, h: number, sigma: number): Float64Array {
  const r = Math.ceil(sigma * 3);
  const k = new Float64Array(r * 2 + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) sum += k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float64Array(w * h);
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) s += src[y * w + ((((x + i) % w) + w) % w)] * k[i + r];
      tmp[y * w + x] = s;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) {
        const yy = Math.min(h - 1, Math.max(0, y + i));
        s += tmp[yy * w + x] * k[i + r];
      }
      out[y * w + x] = s;
    }
  return out;
}

function majorityRealm(adm: Uint16Array, realm: Uint16Array, w: number, h: number, U: number) {
  const counts = new Map<number, number>();
  for (let y = 1; y < h; y += 3)
    for (let x = 1; x < w; x += 3) {
      const p = y * w + x;
      const u = adm[p];
      if (!u) continue;
      const k = u * 65536 + realm[p];
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  const total = new Int32Array(U);
  const any = new Int32Array(U); // most common realm, "none" included
  const anyCount = new Int32Array(U);
  const real = new Int32Array(U); // most common actual realm
  const realCount = new Int32Array(U);
  for (const [k, c] of counts) {
    const u = Math.floor(k / 65536),
      r = k % 65536;
    total[u] += c;
    if (c > anyCount[u]) {
      anyCount[u] = c;
      any[u] = r;
    }
    if (r && c > realCount[u]) {
      realCount[u] = c;
      real[u] = r;
    }
  }
  // The basemap's coarse coastline leaves coastal towns "outside" every realm: a real realm covering
  // a quarter of the unit wins over that.
  const best = new Int32Array(U);
  for (let u = 1; u < U; u++) best[u] = realCount[u] >= total[u] * 0.25 ? real[u] : any[u];
  return best;
}

/** Water-crossing proximity between admin-1 units: BFS from coasts, up to maxDist px. */
function maritimePairs(adm: Uint16Array, w: number, h: number, maxDist: number) {
  const n = w * h;
  const lab = new Uint16Array(adm);
  const dist = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0,
    tail = 0;
  for (let p = 0; p < n; p++) if (adm[p]) queue[tail++] = p;
  const pairs = new Map<number, number>();
  const note = (a: number, b: number, d: number) => {
    const k = a < b ? a * 65536 + b : b * 65536 + a;
    const old = pairs.get(k);
    if (old === undefined || d < old) pairs.set(k, d);
  };
  while (head < tail) {
    const p = queue[head++];
    const x = p % w;
    const nb = [p - w, p + w, x > 0 ? p - 1 : p + w - 1, x < w - 1 ? p + 1 : p - w + 1];
    for (const q of nb) {
      if (q < 0 || q >= n || adm[q]) continue;
      if (lab[q]) {
        if (lab[q] !== lab[p]) note(lab[p], lab[q], dist[p] + dist[q] + 1);
        continue;
      }
      if (dist[p] + 1 > maxDist) continue;
      lab[q] = lab[p];
      dist[q] = dist[p] + 1;
      queue[tail++] = q;
    }
  }
  return pairs;
}

interface Group {
  S: number;
  px: number;
  units: number[];
  adm0: string;
  realm: number;
}

function mergeUnits(
  A0: number,
  U: number,
  S: Float64Array,
  px: Float64Array,
  km: Float64Array,
  units: AdmMeta[],
  unitRealm: Int32Array,
  landPairs: Map<number, number>,
  seaPairs: Map<number, number>,
) {
  const parent = new Int32Array(U);
  for (let i = 0; i < U; i++) parent[i] = i;
  const find = (a: number): number => {
    while (parent[a] !== a) a = parent[a] = parent[parent[a]];
    return a;
  };
  const gS = Float64Array.from(S);
  const gK = Float64Array.from(km);
  const small = (u: number) => gS[u] / A0 < MERGE_BELOW || gK[u] < MIN_KM2;
  const land = new Map<number, Map<number, number>>();
  const sea = new Map<number, Map<number, number>>();
  const link = (m: Map<number, Map<number, number>>, a: number, b: number, v: number, min: boolean) => {
    for (const [x, y] of [
      [a, b],
      [b, a],
    ]) {
      let mm = m.get(x);
      if (!mm) m.set(x, (mm = new Map()));
      const old = mm.get(y);
      mm.set(y, old === undefined ? v : min ? Math.min(old, v) : old + v);
    }
  };
  // Same modern country and same 1066 realm; land outside every realm fits in anywhere.
  const compatible = (a: number, b: number) =>
    units[a - 1].adm0 === units[b - 1].adm0 &&
    (unitRealm[a] === unitRealm[b] || unitRealm[a] === 0 || unitRealm[b] === 0);
  for (const [k, v] of landPairs) {
    const a = Math.floor(k / 65536),
      b = k % 65536;
    if (compatible(a, b)) link(land, a, b, v, false);
  }
  for (const [k, v] of seaPairs) {
    const a = Math.floor(k / 65536),
      b = k % 65536;
    if (compatible(a, b) && v <= 30) link(sea, a, b, v, true);
  }
  const heap = new MinHeap();
  for (let u = 1; u < U; u++) if (px[u] > 0 && small(u)) heap.push(gS[u], u);
  while (heap.size) {
    const s = heap.peekPriority();
    const u = heap.pop();
    if (find(u) !== u || gS[u] !== s) continue;
    let best = -1,
      bestScore = -Infinity;
    const lm = land.get(u);
    if (lm && lm.size) {
      let maxB = 0;
      for (const v of lm.values()) maxB = Math.max(maxB, v);
      for (const [g, b] of lm) {
        if (b < maxB * 0.25) continue;
        const score = -gS[g] / A0 + b / maxB;
        if (score > bestScore) {
          bestScore = score;
          best = g;
        }
      }
    } else {
      const sm = sea.get(u);
      if (sm)
        for (const [g, d] of sm) {
          const score = -d - gS[g] / A0;
          if (score > bestScore) {
            bestScore = score;
            best = g;
          }
        }
    }
    if (best < 0) continue;
    // Merge u into best.
    parent[u] = best;
    gS[best] += gS[u];
    gK[best] += gK[u];
    for (const m of [land, sea]) {
      const mu = m.get(u);
      if (!mu) continue;
      let mb = m.get(best);
      if (!mb) m.set(best, (mb = new Map()));
      const isSea = m === sea;
      for (const [g, v] of mu) {
        if (g === best) continue;
        const old = mb.get(g);
        mb.set(g, old === undefined ? v : isSea ? Math.min(old, v) : old + v);
        const mg = m.get(g)!;
        mg.delete(u);
        const og = mg.get(best);
        mg.set(best, og === undefined ? v : isSea ? Math.min(og, v) : og + v);
      }
      mb.delete(u);
      m.delete(u);
    }
    if (small(best)) heap.push(gS[best], best);
  }

  // Slivers the rules above could not place (micro-states, slivers between two realms) join the
  // neighbour they share the longest border with, whatever its country or realm. Islets with no land
  // neighbour join the nearest unit across the water.
  const landAll = new Map<number, [number, number][]>();
  const seaAll = new Map<number, [number, number][]>();
  const add = (m: Map<number, [number, number][]>, a: number, b: number, v: number) => {
    let l = m.get(a);
    if (!l) m.set(a, (l = []));
    l.push([b, v]);
  };
  for (const [k, v] of landPairs) {
    const a = Math.floor(k / 65536),
      b = k % 65536;
    add(landAll, a, b, v);
    add(landAll, b, a, v);
  }
  for (const [k, v] of seaPairs) {
    if (v > 30) continue;
    const a = Math.floor(k / 65536),
      b = k % 65536;
    add(seaAll, a, b, v);
    add(seaAll, b, a, v);
  }
  const members = new Map<number, number[]>();
  for (let u = 1; u < U; u++) {
    if (px[u] === 0) continue;
    const r = find(u);
    const l = members.get(r);
    if (l) l.push(u);
    else members.set(r, [u]);
  }
  const tiny = (r: number) => gK[r] < MIN_KM2 || gS[r] / A0 < MERGE_BELOW * 0.25;
  const roots = [...members.keys()].filter(tiny).sort((a, b) => gK[a] - gK[b]);
  for (const r of roots) {
    if (find(r) !== r || !tiny(r)) continue;
    const border = new Map<number, number>();
    for (const u of members.get(r)!)
      for (const [v, b] of landAll.get(u) ?? []) {
        const rv = find(v);
        if (rv !== r) border.set(rv, (border.get(rv) ?? 0) + b);
      }
    let best = -1,
      bestV = -Infinity;
    for (const [rv, b] of border)
      if (b > bestV) {
        bestV = b;
        best = rv;
      }
    if (best < 0 && gK[r] < ISLET_KM2)
      for (const u of members.get(r)!)
        for (const [v, d] of seaAll.get(u) ?? []) {
          const rv = find(v);
          if (rv !== r && -d > bestV) {
            bestV = -d;
            best = rv;
          }
        }
    if (best < 0) continue;
    parent[r] = best;
    gS[best] += gS[r];
    gK[best] += gK[r];
    members.get(best)!.push(...members.get(r)!);
    members.delete(r);
  }

  const rootIndex = new Map<number, number>();
  const groups: Group[] = [];
  const unitGroup = new Int32Array(U).fill(-1);
  for (let u = 1; u < U; u++) {
    if (px[u] === 0) continue;
    const r = find(u);
    let gi = rootIndex.get(r);
    if (gi === undefined) {
      gi = groups.length;
      rootIndex.set(r, gi);
      groups.push({ S: gS[r], px: 0, units: [], adm0: units[r - 1].adm0, realm: unitRealm[r] });
    }
    groups[gi].units.push(u);
    groups[gi].px += px[u];
    unitGroup[u] = gi;
  }
  return { groups, unitGroup };
}

function bucketPixels(grp: Uint16Array, G: number): Int32Array[] {
  const counts = new Int32Array(G);
  for (let p = 0; p < grp.length; p++) counts[grp[p]]++;
  const out: Int32Array[] = [];
  for (let g = 0; g < G; g++) out.push(new Int32Array(g === 0 ? 0 : counts[g]));
  const fill = new Int32Array(G);
  for (let p = 0; p < grp.length; p++) {
    const g = grp[p];
    if (g) out[g][fill[g]++] = p;
  }
  return out;
}

/** Weighted k-means++ on a sample of the group's pixels; returns seed pixel indices. */
function kmeansSeeds(
  pixels: Int32Array,
  n: number,
  w: number,
  kx: Float64Array,
  ky: Float64Array,
  weightAt: (p: number) => number,
): number[] {
  // Seeding: rng with fixed seed for reproducibility.
  let seed = (pixels[0] * 2654435761) >>> 0;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Random (not strided) samples: strided raster-order samples line up into diagonals.
  const m = Math.min(pixels.length, 40000);
  const sx = new Float64Array(m),
    sy = new Float64Array(m),
    sw = new Float64Array(m),
    sp = new Int32Array(m);
  // Unwrap x around the first pixel so groups crossing the seam stay contiguous, then measure in
  // km relative to the group's centre (absolute x*kx(y) would shear the space into bands).
  const refX = pixels[0] % w;
  const picked = new Int32Array(m);
  let mx = 0,
    my = 0;
  for (let i = 0; i < m; i++) {
    const p = m === pixels.length ? pixels[i] : pixels[Math.floor(rnd() * pixels.length)];
    picked[i] = p;
    let x = p % w;
    if (x - refX > w / 2) x -= w;
    else if (refX - x > w / 2) x += w;
    mx += x;
    my += (p - (p % w)) / w;
  }
  mx /= m;
  my /= m;
  for (let i = 0; i < m; i++) {
    const p = picked[i];
    let x = p % w;
    if (x - refX > w / 2) x -= w;
    else if (refX - x > w / 2) x += w;
    const y = (p - (p % w)) / w;
    sx[i] = (x - mx) * kx[y];
    sy[i] = (y - my) * ky[y];
    // Mild weighting only: strong weights line seeds up along populated rims → strip-shaped cells.
    sw[i] = Math.pow(Math.max(1e-6, weightAt(p)), 0.3);
    sp[i] = p;
  }
  const cx: number[] = [],
    cy: number[] = [];
  const d2 = new Float64Array(m).fill(Infinity);
  let first = 0,
    bw = -1;
  for (let i = 0; i < m; i++)
    if (sw[i] > bw) {
      bw = sw[i];
      first = i;
    }
  cx.push(sx[first]);
  cy.push(sy[first]);
  while (cx.length < n) {
    let total = 0;
    const c = cx.length - 1;
    for (let i = 0; i < m; i++) {
      const dx = sx[i] - cx[c],
        dy = sy[i] - cy[c];
      const d = dx * dx + dy * dy;
      if (d < d2[i]) d2[i] = d;
      total += d2[i] * sw[i];
    }
    let r = rnd() * total;
    let pick = m - 1;
    for (let i = 0; i < m; i++) {
      r -= d2[i] * sw[i];
      if (r <= 0) {
        pick = i;
        break;
      }
    }
    cx.push(sx[pick]);
    cy.push(sy[pick]);
  }
  const assign = new Int32Array(m);
  for (let iter = 0; iter < 12; iter++) {
    const ax = new Float64Array(n),
      ay = new Float64Array(n),
      aw = new Float64Array(n);
    for (let i = 0; i < m; i++) {
      let best = 0,
        bd = Infinity;
      for (let c = 0; c < n; c++) {
        const dx = sx[i] - cx[c],
          dy = sy[i] - cy[c];
        const d = dx * dx + dy * dy;
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      assign[i] = best;
      ax[best] += sx[i] * sw[i];
      ay[best] += sy[i] * sw[i];
      aw[best] += sw[i];
    }
    for (let c = 0; c < n; c++)
      if (aw[c] > 0) {
        cx[c] = ax[c] / aw[c];
        cy[c] = ay[c] / aw[c];
      }
  }
  // Snap each centre to its closest assigned sample.
  const seeds: number[] = [];
  const bestD = new Float64Array(n).fill(Infinity);
  const bestP = new Int32Array(n).fill(-1);
  for (let i = 0; i < m; i++) {
    const c = assign[i];
    const dx = sx[i] - cx[c],
      dy = sy[i] - cy[c];
    const d = dx * dx + dy * dy;
    if (d < bestD[c]) {
      bestD[c] = d;
      bestP[c] = sp[i];
    }
  }
  const used = new Set<number>();
  for (let c = 0; c < n; c++)
    if (bestP[c] >= 0 && !used.has(bestP[c])) {
      used.add(bestP[c]);
      seeds.push(bestP[c]);
    }
  return seeds;
}

/** Multi-source Dijkstra; pixels only join seeds of the same group. */
function growWithin(
  label: Uint16Array,
  grp: Uint16Array,
  seeds: { p: number; id: number }[],
  w: number,
  h: number,
  kx: Float64Array,
  ky: Float64Array,
) {
  const dist = new Float32Array(w * h).fill(Infinity);
  const heap = new MinHeap(1 << 20);
  for (const s of seeds) {
    dist[s.p] = 0;
    label[s.p] = s.id;
    heap.push(0, s.p);
  }
  const dxs = [1, -1, 0, 0, 1, 1, -1, -1];
  const dys = [0, 0, 1, -1, 1, -1, 1, -1];
  while (heap.size) {
    const d = heap.peekPriority();
    const p = heap.pop();
    if (d > dist[p]) continue;
    const x = p % w,
      y = (p - x) / w;
    const g = grp[p],
      l = label[p];
    for (let k = 0; k < 8; k++) {
      const ny = y + dys[k];
      if (ny < 0 || ny >= h) continue;
      let nx = x + dxs[k];
      if (nx < 0) nx += w;
      else if (nx >= w) nx -= w;
      const q = ny * w + nx;
      if (grp[q] !== g) continue;
      const cost = k < 2 ? kx[y] : k < 4 ? ky[y] : Math.sqrt(kx[y] * kx[y] + ky[y] * ky[y]);
      const nd = Math.fround(d + cost);
      if (nd < dist[q]) {
        dist[q] = nd;
        label[q] = l;
        heap.push(nd, q);
      }
    }
  }
}

/** Pixels of split groups that no seed reached (islands without a seed) join the nearest seed. */
function assignOrphans(prov: Uint16Array, grp: Uint16Array, metas: ProvMeta[], w: number, h: number) {
  const n = w * h;
  const seen = new Uint8Array(n);
  const stack: number[] = [];
  let orphans = 0;
  for (let s = 0; s < n; s++) {
    if (!grp[s] || prov[s] || seen[s]) continue;
    const g = grp[s];
    const comp: number[] = [];
    stack.push(s);
    seen[s] = 1;
    let sx = 0,
      sy = 0;
    while (stack.length) {
      const p = stack.pop()!;
      comp.push(p);
      const x = p % w,
        y = (p - x) / w;
      sx += x;
      sy += y;
      for (const q of [p - w, p + w, x > 0 ? p - 1 : p + w - 1, x < w - 1 ? p + 1 : p - w + 1]) {
        if (q < 0 || q >= n || seen[q] || grp[q] !== g || prov[q]) continue;
        seen[q] = 1;
        stack.push(q);
      }
    }
    const cx = sx / comp.length,
      cy = sy / comp.length;
    let best = 0,
      bd = Infinity;
    for (const m of metas) {
      if (!m.units.length) continue;
      const dx = Math.abs(m.seedX - cx),
        ddx = Math.min(dx, w - dx),
        dy = m.seedY - cy;
      const d = ddx * ddx + dy * dy;
      if (d < bd && grpOfMeta(m, grp, w) === g) {
        bd = d;
        best = m.id;
      }
    }
    for (const p of comp) prov[p] = best;
    orphans += comp.length;
  }
  if (orphans) console.log(`  ${orphans} orphan pixels joined their nearest province`);
}

function grpOfMeta(m: ProvMeta, grp: Uint16Array, w: number) {
  return grp[m.seedY * w + m.seedX];
}
