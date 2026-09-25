/**
 * Step 5: sea zones and lakes.
 *
 * Seeds are Poisson-disk samples whose spacing grows with distance from the coast (and in remote
 * oceans), grown over water with Dijkstra, so zones are always contiguous. Water bodies that got
 * no seed become lakes when large, or join the neighbouring land province when tiny.
 *
 * Outputs: regions.u16 (all regions: land 1..P, then seas, then lakes), regionsMeta.json
 */
import { squaredEDT } from '../lib/edt.ts';
import { MinHeap } from '../lib/heap.ts';
import { MAP_H, MAP_W, rowScales, xToLon } from '../lib/projection.ts';
import { debugImage, labelColor, loadArray, loadJSON, saveArray, saveJSON } from '../lib/raster.ts';
import type { ProvMeta } from './provinces.ts';

export type RegionKind = 'land' | 'sea' | 'lake';
export interface RegionMeta {
  id: number;
  kind: RegionKind;
  seedX: number;
  seedY: number;
}

const MIN_LAKE_KM2 = 1800;

function seaImportance(lon: number, lat: number): number {
  if (lat > 68 || lat < -45) return 2.2;
  if (lon >= -20 && lon <= 45 && lat >= 28 && lat <= 66) return 0.8; // Europe, Mediterranean
  if (lon > 45 && lon <= 60 && lat >= 35 && lat <= 48) return 0.8; // Caspian
  if (lon >= 30 && lon <= 80 && lat >= 0 && lat < 32) return 1.1; // Red Sea, Gulf, Arabian Sea
  if (lon > 80 && lon <= 150 && lat >= -12 && lat < 45) return 1.25; // Bay of Bengal → Japan
  if (lon < -30) return 1.7; // Americas
  return 1.6;
}

export async function buildSeas(): Promise<void> {
  const W = MAP_W,
    H = MAP_H,
    N = W * H;
  const prov = loadArray('prov.u16', Uint16Array);
  const provMeta = loadJSON<ProvMeta[]>('provMeta.json');
  const P = provMeta.length;
  const { kx, ky, area, lat } = rowScales(H);

  console.log('  distance to land');
  const d2 = squaredEDT(W, H, (i) => prov[i] !== 0);

  console.log('  placing sea seeds');
  const rng = mulberry32(1066);
  const cands: number[] = [];
  const G = 12;
  for (let gy = 0; gy < H; gy += G)
    for (let gx = 0; gx < W; gx += G) {
      const x = gx + Math.floor(rng() * G),
        y = Math.min(H - 1, gy + Math.floor(rng() * G));
      const p = y * W + x;
      if (!prov[p] && d2[p] >= 4) cands.push(p);
    }
  // Prefer coastal candidates first so coastlines get evenly covered.
  shuffle(cands, rng);
  cands.sort((a, b) => d2[a] - d2[b]);
  const CELL = 128;
  const cols = W / CELL;
  const hash = new Map<number, number[]>();
  const seeds: number[] = [];
  const spacingKm = (p: number) => {
    const y = (p / W) | 0;
    const dKm = Math.sqrt(d2[p]) * (kx[y] + ky[y]) * 0.5;
    const t = Math.min(1, Math.max(0, (dKm - 60) / 840));
    return (300 + 900 * t) * seaImportance(xToLon(p % W), lat[y]);
  };
  for (const p of cands) {
    const x = p % W,
      y = (p - x) / W;
    const s = spacingKm(p);
    const rx = Math.ceil(s / kx[y] / CELL) + 1,
      ry = Math.ceil(s / ky[y] / CELL) + 1;
    const cx = Math.floor(x / CELL),
      cy = Math.floor(y / CELL);
    let ok = true;
    for (let j = -ry; j <= ry && ok; j++)
      for (let i = -rx; i <= rx && ok; i++) {
        const key = (cy + j) * cols + ((((cx + i) % cols) + cols) % cols);
        const list = hash.get(key);
        if (!list) continue;
        for (const q of list) {
          const qx = q % W,
            qy = (q - qx) / W;
          let dx = Math.abs(qx - x);
          if (dx > W / 2) dx = W - dx;
          const my = ((y + qy) / 2) | 0;
          const dk = Math.hypot(dx * kx[my], (qy - y) * ky[my]);
          if (dk < s) {
            ok = false;
            break;
          }
        }
      }
    if (!ok) continue;
    seeds.push(p);
    const key = cy * cols + cx;
    const list = hash.get(key);
    if (list) list.push(p);
    else hash.set(key, [p]);
  }
  console.log(`  ${seeds.length} sea seeds`);

  const regions = new Uint16Array(prov);
  const metas: RegionMeta[] = provMeta.map((m) => ({
    id: m.id,
    kind: 'land' as const,
    seedX: m.seedX,
    seedY: m.seedY,
  }));
  const seaSeeds = seeds.map((p, i) => ({ p, id: P + 1 + i }));
  for (const s of seaSeeds) metas.push({ id: s.id, kind: 'sea', seedX: s.p % W, seedY: (s.p / W) | 0 });

  console.log('  growing sea zones');
  growWater(regions, seaSeeds, W, H, kx, ky);

  console.log('  unseeded water bodies');
  const seen = new Uint8Array(N);
  let lakes = 0,
    absorbed = 0;
  for (let s = 0; s < N; s++) {
    if (regions[s] || seen[s]) continue;
    const comp: number[] = [];
    const stack = [s];
    seen[s] = 1;
    let km2 = 0;
    const border = new Map<number, number>();
    while (stack.length) {
      const p = stack.pop()!;
      comp.push(p);
      const x = p % W,
        y = (p - x) / W;
      km2 += area[y];
      for (const q of [p - W, p + W, x > 0 ? p - 1 : p + W - 1, x < W - 1 ? p + 1 : p - W + 1]) {
        if (q < 0 || q >= N) continue;
        const r = regions[q];
        if (r) {
          if (r <= P) border.set(r, (border.get(r) ?? 0) + 1);
          continue;
        }
        if (seen[q]) continue;
        seen[q] = 1;
        stack.push(q);
      }
    }
    if (km2 >= MIN_LAKE_KM2) {
      const id = metas.length + 1;
      const c = comp[(comp.length / 2) | 0];
      metas.push({ id, kind: 'lake', seedX: c % W, seedY: (c / W) | 0 });
      for (const p of comp) regions[p] = id;
      lakes++;
    } else {
      let best = 0,
        bb = -1;
      for (const [r, b] of border)
        if (b > bb) {
          bb = b;
          best = r;
        }
      for (const p of comp) regions[p] = best;
      absorbed++;
    }
  }
  console.log(`  ${lakes} lakes, ${absorbed} tiny water bodies absorbed into land`);

  saveArray('regions.u16', regions);
  saveJSON('regionsMeta.json', metas);
  const kindOf = (r: number) => metas[r - 1]?.kind;
  const col = (i: number): [number, number, number] => {
    const r = regions[i];
    const k = kindOf(r);
    if (k === 'land') return [205, 195, 170];
    const c = labelColor(r);
    return k === 'lake' ? [40, 160, 200] : [c[0] >> 1, c[1] >> 1, (c[2] >> 1) + 90];
  };
  await debugImage('05-seas.png', W, H, col, { step: 8 });
  await debugImage('05-seas-europe.png', W, H, col, {
    x0: 7400,
    y0: 1500,
    x1: 10400,
    y1: 3500,
    step: 3,
  });
}

function growWater(
  label: Uint16Array,
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
  const firstSea = seeds.length ? seeds[0].id : 0;
  while (heap.size) {
    const d = heap.peekPriority();
    const p = heap.pop();
    if (d > dist[p]) continue;
    const x = p % w,
      y = (p - x) / w;
    const l = label[p];
    const diag = Math.sqrt(kx[y] * kx[y] + ky[y] * ky[y]);
    for (let k = 0; k < 8; k++) {
      const ny = y + dys[k];
      if (ny < 0 || ny >= h) continue;
      let nx = x + dxs[k];
      if (nx < 0) nx += w;
      else if (nx >= w) nx -= w;
      const q = ny * w + nx;
      const lq = label[q];
      if (lq && lq < firstSea) continue; // land
      const nd = Math.fround(d + (k < 2 ? kx[y] : k < 4 ? ky[y] : diag));
      if (nd < dist[q]) {
        dist[q] = nd;
        label[q] = l;
        heap.push(nd, q);
      }
    }
  }
}

function mulberry32(a: number) {
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(a: T[], rng: () => number) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}
