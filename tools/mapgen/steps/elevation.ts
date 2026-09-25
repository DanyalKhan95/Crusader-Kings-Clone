/**
 * Step 2: elevation + bathymetry raster from AWS Terrain Tiles (Terrarium encoding, zoom 6),
 * reprojected from Web Mercator to the game's Miller grid.
 *
 * Output: elev.i16 (metres, MAP_W x MAP_H)
 */
import { join } from 'node:path';
import sharp from 'sharp';
import { CACHE_DIR } from '../lib/paths.ts';
import { MAP_H, MAP_W, xToLon, yToLat } from '../lib/projection.ts';
import { debugImage, saveArray } from '../lib/raster.ts';

const ZOOM = 6;
const TILE = 256;

export async function buildElevation(): Promise<void> {
  const tiles = 1 << ZOOM;
  const M = tiles * TILE;
  const merc = new Int16Array(M * M);
  console.log(`  decoding ${tiles * tiles} tiles`);
  const jobs: [number, number][] = [];
  for (let tx = 0; tx < tiles; tx++) for (let ty = 0; ty < tiles; ty++) jobs.push([tx, ty]);
  let next = 0;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (next < jobs.length) {
        const [tx, ty] = jobs[next++];
        const file = join(CACHE_DIR, 'terrarium', String(ZOOM), String(tx), `${ty}.png`);
        const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
        const ch = info.channels;
        for (let y = 0; y < TILE; y++) {
          const row = (ty * TILE + y) * M + tx * TILE;
          for (let x = 0; x < TILE; x++) {
            const o = (y * TILE + x) * ch;
            const e = data[o] * 256 + data[o + 1] + data[o + 2] / 256 - 32768;
            merc[row + x] = Math.max(-11000, Math.min(9000, Math.round(e)));
          }
        }
      }
    }),
  );

  console.log('  reprojecting to Miller');
  const W = MAP_W,
    H = MAP_H;
  const elev = new Int16Array(W * H);
  const mx = new Float64Array(W);
  for (let x = 0; x < W; x++) mx[x] = ((xToLon(x + 0.5) + 180) / 360) * M - 0.5;
  for (let y = 0; y < H; y++) {
    const lat = (yToLat(y + 0.5) * Math.PI) / 180;
    const my = ((1 - Math.log(Math.tan(Math.PI / 4 + lat / 2)) / Math.PI) / 2) * M - 0.5;
    const y0 = Math.max(0, Math.min(M - 1, Math.floor(my)));
    const y1 = Math.min(M - 1, y0 + 1);
    const fy = Math.max(0, Math.min(1, my - y0));
    const r0 = y0 * M,
      r1 = y1 * M;
    for (let x = 0; x < W; x++) {
      const fxRaw = mx[x];
      const x0 = ((Math.floor(fxRaw) % M) + M) % M;
      const x1 = (x0 + 1) % M;
      const fx = fxRaw - Math.floor(fxRaw);
      const a = merc[r0 + x0] * (1 - fx) + merc[r0 + x1] * fx;
      const b = merc[r1 + x0] * (1 - fx) + merc[r1 + x1] * fx;
      elev[y * W + x] = Math.round(a * (1 - fy) + b * fy);
    }
  }
  saveArray('elev.i16', elev);

  await debugImage(
    '02-elevation.png',
    W,
    H,
    (i) => {
      const e = elev[i];
      if (e <= 0) {
        const t = Math.min(1, -e / 6000);
        return [Math.round(60 - 45 * t), Math.round(110 - 80 * t), Math.round(160 - 90 * t)];
      }
      const t = Math.min(1, e / 4500);
      return [Math.round(90 + 150 * t), Math.round(140 + 90 * t), Math.round(80 + 150 * t)];
    },
    { step: 8 },
  );
}
