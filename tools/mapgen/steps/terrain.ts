/**
 * Step: terrain texture (the painted-relief look under the political map).
 *
 * Land colour comes from NASA Blue Marble, graded towards a warmer painterly palette; relief comes
 * from hillshading the elevation raster (lit from the north-west); mountains get rock and snow;
 * seas are shaded by depth. Output: WebP tiles + a low-res full map for fast startup.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { OUT_DIR } from '../lib/paths.ts';
import { MAP_H, MAP_W, rowScales, xToLon } from '../lib/projection.ts';
import { loadArray } from '../lib/raster.ts';
import { loadBlueMarble, sampleEquirect } from '../lib/sources.ts';

export const TERRAIN_TILE = 2048;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// Depth palette (metres below sea level → colour).
const SEA_STOPS: [number, [number, number, number]][] = [
  [0, [76, 128, 146]],
  [60, [60, 110, 136]],
  [250, [44, 88, 120]],
  [1500, [32, 66, 100]],
  [4000, [22, 47, 78]],
  [7000, [15, 34, 60]],
];

function seaColor(depth: number, out: number[]) {
  let i = 0;
  while (i < SEA_STOPS.length - 2 && depth > SEA_STOPS[i + 1][0]) i++;
  const [d0, c0] = SEA_STOPS[i],
    [d1, c1] = SEA_STOPS[i + 1];
  const t = clamp01((depth - d0) / (d1 - d0));
  out[0] = lerp(c0[0], c1[0], t);
  out[1] = lerp(c0[1], c1[1], t);
  out[2] = lerp(c0[2], c1[2], t);
}

/** Permanent snowline (m) by latitude: high and dry in the subtropics (Tibet stays bare), low near the poles. */
const SNOWLINE: [number, number][] = [
  [0, 5700],
  [25, 5700],
  [30, 5500],
  [36, 5100],
  [40, 4200],
  [46, 3100],
  [52, 2300],
  [60, 1400],
  [66, 900],
  [72, 400],
  [90, 100],
];

function snowlineAt(absLat: number): number {
  for (let i = 1; i < SNOWLINE.length; i++) {
    const [l1, e1] = SNOWLINE[i];
    if (absLat <= l1) {
      const [l0, e0] = SNOWLINE[i - 1];
      return e0 + ((e1 - e0) * (absLat - l0)) / (l1 - l0);
    }
  }
  return SNOWLINE[SNOWLINE.length - 1][1];
}

export async function buildTerrain(): Promise<void> {
  const W = MAP_W,
    H = MAP_H;
  const adm = loadArray('adm.u16', Uint16Array);
  const lakes = loadArray('lakes.u8', Uint8Array);
  const elev = loadArray('elev.i16', Int16Array);
  const bm = await loadBlueMarble();
  const { lat, kx, ky } = rowScales(H);
  const img = Buffer.alloc(W * H * 3);
  const rgb = new Float64Array(3);
  const sea = [0, 0, 0];
  // Light from the north-west, 40° above the horizon.
  const az = (315 * Math.PI) / 180,
    alt = (40 * Math.PI) / 180;
  const lx = Math.cos(alt) * Math.sin(az),
    ly = -Math.cos(alt) * Math.cos(az),
    lz = Math.sin(alt);
  const EXAG = 7; // vertical exaggeration for readable relief at map scale
  console.log('  shading');
  for (let y = 0; y < H; y++) {
    const la = lat[y];
    const kxm = kx[y] * 1000,
      kym = ky[y] * 1000;
    const ym = y > 0 ? y - 1 : y,
      yp = y < H - 1 ? y + 1 : y;
    const snowline = snowlineAt(Math.abs(la));
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      const xm = x > 0 ? x - 1 : W - 1,
        xp = x < W - 1 ? x + 1 : 0;
      const e = elev[p];
      const water = adm[p] === 0 || lakes[p] === 1;
      // Sobel gradient (metres per metre)
      const e00 = elev[ym * W + xm],
        e01 = elev[ym * W + x],
        e02 = elev[ym * W + xp];
      const e10 = elev[y * W + xm],
        e12 = elev[y * W + xp];
      const e20 = elev[yp * W + xm],
        e21 = elev[yp * W + x],
        e22 = elev[yp * W + xp];
      const gx = (e02 + 2 * e12 + e22 - e00 - 2 * e10 - e20) / (8 * kxm);
      const gy = (e20 + 2 * e21 + e22 - e00 - 2 * e01 - e02) / (8 * kym);
      const ex = water ? 1.2 : EXAG;
      const nx = -gx * ex,
        ny = -gy * ex;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const lambert = Math.max(0, (nx * lx + ny * ly + lz) * inv);
      const flat = lz; // shade of a flat surface
      const o = p * 3;
      if (water) {
        if (lakes[p] && adm[p] !== 0) {
          sea[0] = 78;
          sea[1] = 130;
          sea[2] = 150;
        } else seaColor(Math.max(0, -e), sea);
        const s = 1 + 0.35 * (lambert - flat);
        img[o] = Math.min(255, sea[0] * s);
        img[o + 1] = Math.min(255, sea[1] * s);
        img[o + 2] = Math.min(255, sea[2] * s);
        continue;
      }
      sampleEquirect(bm, xToLon(x + 0.5), la, rgb);
      let r = rgb[0],
        g = rgb[1],
        b = rgb[2];
      // Grade: lift shadows, warm the greens, gently raise saturation.
      const lum = 0.3 * r + 0.59 * g + 0.11 * b;
      const lift = 1.18 + 0.35 * (1 - clamp01(lum / 140));
      r = r * lift + 6;
      g = g * lift + 4;
      b = b * lift * 0.92;
      const l2 = 0.3 * r + 0.59 * g + 0.11 * b;
      r = l2 + (r - l2) * 1.12;
      g = l2 + (g - l2) * 1.12;
      b = l2 + (b - l2) * 1.12;
      // Rock above ~2000 m, snow above the snowline (steep slopes shed snow).
      const slope = Math.sqrt(gx * gx + gy * gy);
      const rock = smooth(1800, 3600, e) * 0.55;
      r = lerp(r, 150, rock);
      g = lerp(g, 138, rock);
      b = lerp(b, 122, rock);
      const snow = smooth(snowline - 300, snowline + 700, e) * (1 - smooth(0.5, 1.2, slope) * 0.5);
      r = lerp(r, 238, snow);
      g = lerp(g, 240, snow);
      b = lerp(b, 244, snow);
      // Hillshade: darken shadows, brighten sun-facing slopes.
      const s = 0.62 + 0.52 * (lambert / flat) * 0.75 + 0.1;
      img[o] = Math.max(0, Math.min(255, r * s));
      img[o + 1] = Math.max(0, Math.min(255, g * s));
      img[o + 2] = Math.max(0, Math.min(255, b * s));
    }
  }

  console.log('  encoding tiles');
  const dir = join(OUT_DIR, 'terrain');
  mkdirSync(dir, { recursive: true });
  const full = sharp(img, { raw: { width: W, height: H, channels: 3 }, limitInputPixels: false });
  for (let ty = 0; ty < H / TERRAIN_TILE; ty++)
    for (let tx = 0; tx < W / TERRAIN_TILE; tx++) {
      await full
        .clone()
        .extract({ left: tx * TERRAIN_TILE, top: ty * TERRAIN_TILE, width: TERRAIN_TILE, height: TERRAIN_TILE })
        .webp({ quality: 80, effort: 5 })
        .toFile(join(dir, `hi-${tx}-${ty}.webp`));
    }
  await full
    .clone()
    .resize(4096, 2048, { kernel: 'lanczos3' })
    .webp({ quality: 82, effort: 5 })
    .toFile(join(dir, 'lo.webp'));
  await full
    .clone()
    .extract({ left: 7400, top: 1800, width: 2400, height: 1600 })
    .png()
    .toFile(join(process.cwd(), 'tools/mapgen/debug/07-terrain-europe.png'));
}
