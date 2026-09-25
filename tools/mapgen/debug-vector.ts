/**
 * Debug: renders the vector topology (polygons + borders) of a crop to a PNG via SVG.
 *   node --import tsx tools/mapgen/debug-vector.ts <x0> <y0> <x1> <y1> <lod> <out.png>
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { DEBUG_DIR } from './lib/paths.ts';
import { labelColor, loadJSON } from './lib/raster.ts';
import { readTopology, ringCoords } from './lib/topology.ts';
import type { RegionMeta } from './steps/seas.ts';

const [x0, y0, x1, y1, lodArg, outName] = process.argv.slice(2);
const X0 = Number(x0),
  Y0 = Number(y0),
  X1 = Number(x1),
  Y1 = Number(y1),
  LOD = Number(lodArg ?? 0);
const t = readTopology();
const metas = loadJSON<RegionMeta[]>('regionsMeta.json');
const scale = Math.min(1, 2400 / (X1 - X0));
const f = (v: number) => v.toFixed(2);
let body = '';
for (let r = 1; r < t.polygons.length; r++) {
  const kind = metas[r - 1].kind;
  const [cr, cg, cb] = labelColor(r);
  const fill =
    kind === 'land'
      ? `rgb(${cr},${cg},${cb})`
      : kind === 'lake'
        ? '#3aa0c8'
        : `rgb(${cr >> 2},${cg >> 2},${(cb >> 2) + 80})`;
  let d = '';
  for (const poly of t.polygons[r])
    for (const ring of poly) {
      const c = ringCoords(t, LOD, ring);
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      for (let i = 0; i < c.length; i += 2) {
        minX = Math.min(minX, c[i]);
        maxX = Math.max(maxX, c[i]);
        minY = Math.min(minY, c[i + 1]);
        maxY = Math.max(maxY, c[i + 1]);
      }
      if (maxX < X0 || minX > X1 || maxY < Y0 || minY > Y1) continue;
      d += 'M';
      for (let i = 0; i < c.length; i += 2) d += `${f(c[i] - X0)},${f(c[i + 1] - Y0)} `;
      d += 'Z';
    }
  if (d)
    body += `<path d="${d}" fill="${fill}" fill-rule="evenodd" stroke="#000" stroke-opacity="0.55" stroke-width="${(0.6 / scale).toFixed(2)}"/>`;
}
const w = X1 - X0,
  h = Y1 - Y0;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w * scale)}" height="${Math.round(h * scale)}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#101828"/>${body}</svg>`;
mkdirSync(DEBUG_DIR, { recursive: true });
await sharp(Buffer.from(svg))
  .png()
  .toFile(join(DEBUG_DIR, outName ?? 'vector.png'));
console.log('wrote', outName);
