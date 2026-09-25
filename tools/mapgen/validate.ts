/** Checks the generated game data in public/data and prints a summary. Exits 1 on errors. */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { decodeMap } from '../../src/shared/mapFormat.ts';
import type { RegionData, ScenarioData, WorldData } from '../../src/shared/dataTypes.ts';
import { checkData } from './lib/checks.ts';
import { OUT_DIR } from './lib/paths.ts';

const read = <T>(file: string): T => JSON.parse(readFileSync(join(OUT_DIR, file), 'utf8')) as T;
const world = read<WorldData>('world.json');
const regions = read<RegionData[]>('provinces.json');
const scenario = read<ScenarioData>('scenario-1066.json');

const result = checkData(world, regions, scenario);

const map = decodeMap(gunzipSync(readFileSync(join(OUT_DIR, 'map.ccmp'))));
if (map.regionCount !== regions.length)
  result.errors.push(`map.ccmp has ${map.regionCount} regions, provinces.json has ${regions.length}`);
for (let r = 1; r <= map.regionCount; r++)
  if (!map.polygons[r]?.length) result.errors.push(`region ${r} has no polygon in map.ccmp`);

const { cols, rows } = world.terrainTiles;
const missing: string[] = [];
for (let ty = 0; ty < rows; ty++)
  for (let tx = 0; tx < cols; tx++)
    if (!existsSync(join(OUT_DIR, 'terrain', `hi-${tx}-${ty}.webp`))) missing.push(`hi-${tx}-${ty}`);
if (!existsSync(join(OUT_DIR, 'terrain', 'lo.webp'))) missing.push('lo');
if (missing.length) result.errors.push(`missing terrain tiles: ${missing.join(', ')}`);

console.log(
  Object.entries(result.stats)
    .map(([k, v]) => `${k}: ${v}`)
    .join('  '),
);
console.log(`arcs: ${map.arcLeft.length}  rivers: ${map.rivers.length}`);
for (const w of result.warnings) console.log(`warning: ${w}`);
for (const e of result.errors) console.log(`ERROR: ${e}`);
if (result.errors.length) {
  console.log(`${result.errors.length} errors`);
  process.exit(1);
}
console.log('public/data is valid');
