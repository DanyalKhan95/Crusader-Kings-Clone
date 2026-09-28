/**
 * Step: the details the map's three styles draw (src/render/styles.ts). It reads the exported map,
 * so that everything lines up with the coasts and borders the game draws, and the elevation raster.
 *
 * Output, at a quarter of the working resolution (four map units a texel):
 *   terrain/shade.webp   hillshade of the land, lit from the north-west (128 = flat)
 *   terrain/slope.webp   steepness of the land, for the engraver's hachures
 *   terrain/coast.webp   signed distance from the coast, lossless: 128 + d/2 at sea, 128 − d/2 on land
 * and symbols.json: mountains, hills and forests for the map's symbols, each in the first of a few
 * tiers of spacing where it fits (so that the map thins them out as it zooms out), and where the
 * town of each province stands.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import sharp from 'sharp';
import type { RegionData } from '../../../src/shared/dataTypes.ts';
import { decodeMap, mapFilePayload, ringCoordinates } from '../../../src/shared/mapFormat.ts';
import { HISTORICAL_CITIES } from '../curated/historicalCities.ts';
import { squaredEDT } from '../lib/edt.ts';
import { OUT_DIR } from '../lib/paths.ts';
import { latToY, lonToX, MAP_H, MAP_W, rowScales, xToLon } from '../lib/projection.ts';
import { fillRings } from '../lib/rasterize.ts';
import { loadArray } from '../lib/raster.ts';
import { loadBlueMarble, loadPlaces, sampleEquirect } from '../lib/sources.ts';

/** Map units per texel of the detail textures and per cell of the symbol grid. */
const F = 4;

/** The symbols' kinds, in the order of their codes in symbols.json. */
export const SYMBOL_KINDS = ['mountain', 'hill', 'conifer', 'broadleaf', 'palm'] as const;

/** Spacing of each tier, in map units: tier 0 is shown farthest out. */
export const RELIEF_TIERS = [200, 100, 50, 25];
export const FOREST_TIERS = [120, 60, 30];

/** A small integer hash, for deterministic jitter. */
function hash(a: number, b: number, c = 0): number {
  let h = Math.imul(a, 0x27d4eb2d) ^ Math.imul(b, 0x165667b1) ^ Math.imul(c + 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

interface Candidate {
  x: number;
  y: number;
  kind: number;
  score: number;
  size: number;
}

/**
 * Picks symbols tier by tier: a candidate joins the first tier in which nothing already chosen (in
 * that tier or a coarser one, or among `avoid`) lies closer than the tier's spacing.
 */
function placeInTiers(
  cands: Candidate[],
  tiers: number[],
  avoid: { x: number; y: number }[] = [],
  avoidFactor = 0.6,
): { c: Candidate; tier: number }[] {
  const order = cands.slice().sort((a, b) => b.score - a.score);
  const chosen: { c: Candidate; tier: number }[] = [];
  const taken = new Uint8Array(order.length);
  for (let t = 0; t < tiers.length; t++) {
    const r = tiers[t];
    const cell = r;
    const grid = new Map<number, { x: number; y: number }[]>();
    const key = (cx: number, cy: number) => cy * 65536 + (((cx % 65536) + 65536) % 65536);
    const add = (p: { x: number; y: number }) => {
      const k = key(Math.floor(p.x / cell), Math.floor(p.y / cell));
      const list = grid.get(k);
      if (list) list.push(p);
      else grid.set(k, [p]);
    };
    const near = (x: number, y: number, rad: number) => {
      const cx = Math.floor(x / cell),
        cy = Math.floor(y / cell);
      const reach = Math.ceil(rad / cell);
      for (let j = -reach; j <= reach; j++)
        for (let i = -reach; i <= reach; i++) {
          const list = grid.get(key(cx + i, cy + j));
          if (!list) continue;
          for (const p of list) {
            let dx = Math.abs(p.x - x);
            if (dx > MAP_W / 2) dx = MAP_W - dx;
            if (dx * dx + (p.y - y) ** 2 < rad * rad) return true;
          }
        }
      return false;
    };
    for (const { c } of chosen) add(c);
    const avoidGrid: { x: number; y: number }[] = [];
    for (const p of avoid) avoidGrid.push(p);
    const avoidR = r * avoidFactor;
    const avoided = new Map<number, { x: number; y: number }[]>();
    for (const p of avoidGrid) {
      const k = key(Math.floor(p.x / cell), Math.floor(p.y / cell));
      const list = avoided.get(k);
      if (list) list.push(p);
      else avoided.set(k, [p]);
    }
    const nearAvoid = (x: number, y: number) => {
      const cx = Math.floor(x / cell),
        cy = Math.floor(y / cell);
      for (let j = -1; j <= 1; j++)
        for (let i = -1; i <= 1; i++) {
          const list = avoided.get(key(cx + i, cy + j));
          if (list) for (const p of list) if ((p.x - x) ** 2 + (p.y - y) ** 2 < avoidR * avoidR) return true;
        }
      return false;
    };
    for (let i = 0; i < order.length; i++) {
      if (taken[i]) continue;
      const c = order[i];
      if (near(c.x, c.y, r) || (avoid.length && nearAvoid(c.x, c.y))) continue;
      taken[i] = 1;
      chosen.push({ c, tier: t });
      add(c);
    }
  }
  return chosen;
}

export async function buildDetails(): Promise<void> {
  const W = MAP_W,
    H = MAP_H;
  const regions = JSON.parse(readFileSync(join(OUT_DIR, 'provinces.json'), 'utf8')) as RegionData[];
  const kindOf = (id: number) => regions[id - 1]?.kind;

  console.log('  rasterizing the exported map');
  const geom = decodeMap(gunzipSync(mapFilePayload(readFileSync(join(OUT_DIR, 'map.json'), 'utf8'))));
  const reg = new Uint16Array(W * H);
  for (let r = 1; r <= geom.regionCount; r++) {
    const rings: Float64Array[] = [];
    for (const poly of geom.polygons[r])
      for (const ring of poly) rings.push(Float64Array.from(ringCoordinates(geom, 0, ring)));
    fillRings(rings, W, H, (row, a, b) => reg.fill(r, row * W + a, row * W + b + 1));
  }
  const landKind = new Uint8Array(geom.regionCount + 1);
  for (let r = 1; r <= geom.regionCount; r++) landKind[r] = kindOf(r) === 'land' ? 1 : 0;
  const isLand = (p: number) => landKind[reg[p]] === 1;

  console.log('  distance from the coast');
  const toLand = squaredEDT(W, H, isLand);
  const toSea = squaredEDT(W, H, (p) => !isLand(p));
  const w = W / F,
    h = H / F;
  const coast = Buffer.alloc(w * h);
  for (let Y = 0; Y < h; Y++)
    for (let X = 0; X < w; X++) {
      // The four pixels around the texel's centre.
      let sd = 0;
      for (let j = 1; j <= 2; j++)
        for (let i = 1; i <= 2; i++) {
          const p = (Y * F + j) * W + X * F + i;
          sd += isLand(p) ? -(Math.sqrt(toSea[p]) - 0.5) : Math.sqrt(toLand[p]) - 0.5;
        }
      coast[Y * w + X] = Math.max(0, Math.min(255, Math.round(128 + sd / 4 / 2)));
    }

  console.log('  relief');
  const elev = loadArray('elev.i16', Int16Array);
  // Mean height of each texel's land (the sea counts as sea level, so coasts are not cliffs).
  const e4 = new Float32Array(w * h);
  const land4 = new Float32Array(w * h);
  for (let Y = 0; Y < h; Y++)
    for (let X = 0; X < w; X++) {
      let sum = 0,
        n = 0;
      for (let j = 0; j < F; j++)
        for (let i = 0; i < F; i++) {
          const p = (Y * F + j) * W + X * F + i;
          sum += Math.max(0, elev[p]);
          if (isLand(p)) n++;
        }
      e4[Y * w + X] = sum / (F * F);
      land4[Y * w + X] = n / (F * F);
    }
  const { lat, kx, ky } = rowScales(h);
  const shade = Buffer.alloc(w * h, 128);
  const slope = Buffer.alloc(w * h);
  const az = (315 * Math.PI) / 180,
    alt = (40 * Math.PI) / 180;
  const lx = Math.cos(alt) * Math.sin(az),
    ly = -Math.cos(alt) * Math.cos(az),
    lz = Math.sin(alt);
  const EXAG = 9;
  const at = (X: number, Y: number) => e4[Math.max(0, Math.min(h - 1, Y)) * w + (((X % w) + w) % w)];
  // The steepness is read from the heights smoothed over a few texels: the raster's own noise would
  // otherwise hachure the plains.
  const smoothE = new Float32Array(w * h);
  {
    const tmp = new Float32Array(w * h);
    const R = 2;
    for (let Y = 0; Y < h; Y++)
      for (let X = 0; X < w; X++) {
        let sum = 0;
        for (let k = -R; k <= R; k++) sum += at(X + k, Y);
        tmp[Y * w + X] = sum / (2 * R + 1);
      }
    for (let Y = 0; Y < h; Y++)
      for (let X = 0; X < w; X++) {
        let sum = 0;
        for (let k = -R; k <= R; k++) sum += tmp[Math.max(0, Math.min(h - 1, Y + k)) * w + X];
        smoothE[Y * w + X] = sum / (2 * R + 1);
      }
  }
  const sm = (X: number, Y: number) => smoothE[Math.max(0, Math.min(h - 1, Y)) * w + (((X % w) + w) % w)];
  for (let Y = 0; Y < h; Y++) {
    const kxm = kx[Y] * 1000,
      kym = ky[Y] * 1000;
    for (let X = 0; X < w; X++) {
      const i = Y * w + X;
      if (land4[i] === 0) continue;
      const gx =
        (at(X + 1, Y - 1) +
          2 * at(X + 1, Y) +
          at(X + 1, Y + 1) -
          at(X - 1, Y - 1) -
          2 * at(X - 1, Y) -
          at(X - 1, Y + 1)) /
        (8 * kxm);
      const gy =
        (at(X - 1, Y + 1) +
          2 * at(X, Y + 1) +
          at(X + 1, Y + 1) -
          at(X - 1, Y - 1) -
          2 * at(X, Y - 1) -
          at(X + 1, Y - 1)) /
        (8 * kym);
      const nx = -gx * EXAG,
        ny = -gy * EXAG;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const lambert = Math.max(0, (nx * lx + ny * ly + lz) * inv);
      shade[i] = Math.max(0, Math.min(255, Math.round(128 + ((lambert - lz) / lz) * 120)));
      const sx = (sm(X + 1, Y) - sm(X - 1, Y)) / (2 * kxm),
        sy = (sm(X, Y + 1) - sm(X, Y - 1)) / (2 * kym);
      const s = Math.max(0, Math.sqrt(sx * sx + sy * sy) - 0.008) / 0.1;
      slope[i] = Math.round(255 * Math.pow(Math.min(1, s), 0.75));
    }
  }

  console.log('  encoding');
  const dir = join(OUT_DIR, 'terrain');
  const gray = (buf: Buffer) => sharp(buf, { raw: { width: w, height: h, channels: 1 } });
  await gray(shade).webp({ quality: 82, effort: 6 }).toFile(join(dir, 'shade.webp'));
  await gray(slope).webp({ quality: 82, effort: 6 }).toFile(join(dir, 'slope.webp'));
  await gray(coast).webp({ lossless: true, effort: 6 }).toFile(join(dir, 'coast.webp'));

  console.log('  symbols');
  const bm = await loadBlueMarble();
  const rgb = new Float64Array(3);
  const relief: Candidate[] = [];
  const forest: Candidate[] = [];
  const K = SYMBOL_KINDS.indexOf.bind(SYMBOL_KINDS);
  // The boreal forest begins further north in Europe, where the Gulf Stream warms it (as attributes.ts).
  const borealLat = (lon: number) => (lon > -12 && lon < 45 ? 59 : 53);
  for (let Y = 2; Y < h - 2; Y++) {
    const la = lat[Y];
    const alat = Math.abs(la);
    for (let X = 0; X < w; X++) {
      const i = Y * w + X;
      if (land4[i] < 1) continue;
      const cr = reg[(Y * F + 2) * W + X * F + 2];
      if (kindOf(cr) !== 'land') continue;
      // Local relief over ±2 texels (about ±20 km).
      let lo = Infinity,
        hi = -Infinity;
      for (let j = -2; j <= 2; j++)
        for (let k = -2; k <= 2; k++) {
          const v = at(X + k, Y + j);
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      const rel = hi - lo;
      const e = e4[i];
      const jx = X * F + F * hash(X, Y, 1),
        jy = Y * F + F * hash(X, Y, 2);
      const noise = hash(X, Y, 3);
      if (rel > 1100 || (e > 2800 && rel > 500)) {
        relief.push({
          x: jx,
          y: jy,
          kind: K('mountain'),
          score: rel + e * 0.15 + noise * 400,
          size: Math.min(1, (rel - 500) / 2500),
        });
        continue;
      }
      if (rel > 420) {
        relief.push({ x: jx, y: jy, kind: K('hill'), score: rel + noise * 250, size: Math.min(1, (rel - 420) / 700) });
        continue;
      }
      if (alat > 72) continue;
      sampleEquirect(bm, xToLon(X * F + 2), la, rgb);
      const [r, g, b] = rgb;
      const ndvi = (g - r) / (g + r + 1);
      const bright = (r + g + b) / 3;
      const boreal = alat > borealLat(xToLon(X * F + 2));
      const wooded =
        ndvi > 0.09 ||
        (bright < 32 && ndvi > 0) ||
        (boreal && ndvi > 0.035) ||
        (alat > 60 && bright > 140 && alat < 68);
      if (!wooded) continue;
      const kind = alat < 15 ? K('palm') : boreal ? K('conifer') : K('broadleaf');
      forest.push({ x: jx, y: jy, kind, score: ndvi + noise * 0.08, size: noise });
    }
  }
  const reliefChosen = placeInTiers(relief, RELIEF_TIERS);
  const forestChosen = placeInTiers(
    forest,
    FOREST_TIERS,
    reliefChosen.map((s) => s.c),
    0.5,
  );
  const all = [...reliefChosen, ...forestChosen];
  const data = new Uint16Array(all.length * 4);
  all.forEach(({ c, tier }, n) => {
    data[n * 4] = Math.round(c.x) % W;
    data[n * 4 + 1] = Math.round(c.y);
    data[n * 4 + 2] = (c.kind << 8) | (tier << 4) | Math.floor(hash(Math.round(c.x), Math.round(c.y), 7) * 4);
    data[n * 4 + 3] = Math.round(Math.max(0, Math.min(1, c.size)) * 255);
  });
  const counts = SYMBOL_KINDS.map((k, i) => `${k} ${all.filter((s) => s.c.kind === i).length}`).join(', ');
  console.log(`  ${all.length} symbols: ${counts}`);

  console.log('  towns');
  // The town of each province: the chief city of 1066 within it, else its largest place.
  const towns = new Uint16Array((geom.regionCount + 1) * 2);
  const best = new Float64Array(geom.regionCount + 1);
  const regionAt = (x: number, y: number) => {
    const px = ((Math.floor(x) % W) + W) % W,
      py = Math.floor(y);
    return py >= 0 && py < H ? reg[py * W + px] : 0;
  };
  const offer = (x: number, y: number, score: number) => {
    const r = regionAt(x, y);
    if (!r || kindOf(r) !== 'land' || score <= best[r]) return;
    best[r] = score;
    towns[r * 2] = Math.round(x) % W;
    towns[r * 2 + 1] = Math.round(y);
  };
  for (const pl of loadPlaces()) {
    const r = regionAt(pl.x, pl.y);
    const named = r && regions[r - 1]?.name === pl.name ? 1e9 : 0;
    offer(pl.x, pl.y, 1 + named + Math.log10(1 + pl.pop) * 10 + (pl.capital ? 20 : 0) - pl.rank);
  }
  for (const c of HISTORICAL_CITIES) offer(lonToX(c.lon), latToY(c.lat), 2e9 + c.dev);
  const placed = towns.filter((_, i) => i % 2 === 0 && i > 0).filter(Boolean).length;
  console.log(`  ${placed} towns`);

  const b64 = (a: Uint16Array) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
  writeFileSync(
    join(OUT_DIR, 'symbols.json'),
    JSON.stringify({
      version: 1,
      kinds: SYMBOL_KINDS,
      tiers: { relief: RELIEF_TIERS, forest: FOREST_TIERS },
      count: all.length,
      symbols: b64(data),
      towns: b64(towns),
    }),
  );
}
