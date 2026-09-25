/**
 * Downloads every raw source the map pipeline needs into .cache/mapgen/.
 * Safe to re-run: files that already exist are skipped.
 *
 * Sources:
 *  - Natural Earth 10m vectors (public domain), via the nvkelso/natural-earth-vector GitHub mirror
 *  - aourednik/historical-basemaps world borders (GPL-3.0)
 *  - AWS Terrain Tiles, Terrarium encoding (elevation + bathymetry; attribution in README)
 *  - NASA Blue Marble (public domain), shipped inside the three-globe npm package
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { CACHE_DIR } from './lib/paths.ts';

const NE_BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
const NE_FILES = [
  'ne_10m_admin_1_states_provinces_lakes',
  'ne_10m_land',
  'ne_10m_lakes',
  'ne_10m_populated_places_simple',
  'ne_10m_rivers_lake_centerlines',
  'ne_10m_rivers_europe',
  'ne_10m_geography_marine_polys',
  'ne_10m_geography_regions_polys',
  'ne_10m_glaciated_areas',
];
const HB_BASE = 'https://raw.githubusercontent.com/aourednik/historical-basemaps/master/geojson';
const HB_FILES = ['world_1000', 'world_1100'];
const TERRARIUM_ZOOM = 6;
const TERRARIUM_URL = (z: number, x: number, y: number) =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

async function fetchToFile(url: string, file: string, attempts = 4): Promise<void> {
  if (existsSync(file) && statSync(file).size > 0) return;
  mkdirSync(dirname(file), { recursive: true });
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      return;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** i));
    }
  }
  throw lastError;
}

async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  let done = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
      done++;
      if (done % 256 === 0) console.log(`  ${done}/${items.length}`);
    }
  });
  await Promise.all(workers);
}

async function main() {
  console.log('Natural Earth vectors…');
  await pool(NE_FILES, 4, (name) =>
    fetchToFile(`${NE_BASE}/${name}.geojson`, join(CACHE_DIR, 'ne', `${name}.geojson`)),
  );

  console.log('Historical basemaps…');
  await pool(HB_FILES, 2, (name) =>
    fetchToFile(`${HB_BASE}/${name}.geojson`, join(CACHE_DIR, 'hb', `${name}.geojson`)),
  );

  console.log('Blue Marble (from the three-globe npm package)…');
  const marble = join(CACHE_DIR, 'bluemarble.jpg');
  if (!existsSync(marble)) {
    const meta = (await (await fetch('https://registry.npmjs.org/three-globe/2.45.2')).json()) as {
      dist: { tarball: string };
    };
    const tgz = join(CACHE_DIR, 'three-globe.tgz');
    await fetchToFile(meta.dist.tarball, tgz);
    const jpg = execFileSync('tar', ['-xzOf', tgz, 'package/example/img/earth-blue-marble.jpg'], {
      maxBuffer: 64 * 1024 * 1024,
    });
    writeFileSync(marble, jpg);
  }

  console.log(`Terrarium elevation tiles, zoom ${TERRARIUM_ZOOM}…`);
  const n = 2 ** TERRARIUM_ZOOM;
  const tiles: [number, number][] = [];
  for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) tiles.push([x, y]);
  await pool(tiles, 24, ([x, y]) =>
    fetchToFile(
      TERRARIUM_URL(TERRARIUM_ZOOM, x, y),
      join(CACHE_DIR, 'terrarium', String(TERRARIUM_ZOOM), String(x), `${y}.png`),
    ),
  );
  console.log('All sources downloaded.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
