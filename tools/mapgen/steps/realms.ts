/**
 * Step: pixel-level 1066 realm map = historical basemap (mapped to our countries) + curated
 * overrides. Provinces use it so admin-1 merges never cross a realm border; the scenario step uses
 * it to assign owners.
 *
 * Outputs: realm.u16 (index into realmTags.json + 1; 0 = native/unclaimed), realmTags.json
 */
import { join } from 'node:path';
import { UNINHABITED } from '../curated/cultures.ts';
import { OVERRIDES, REALMS, resolveHistFeature } from '../curated/realms1066.ts';
import { loadFeatures, projectPath, projectPolygons } from '../lib/geo.ts';
import { CACHE_DIR } from '../lib/paths.ts';
import { MAP_H, MAP_W, xToLon, yToLat } from '../lib/projection.ts';
import { fillRings } from '../lib/rasterize.ts';
import { debugImage, labelColor, loadArray, saveArray, saveJSON } from '../lib/raster.ts';

const CULTURAL =
  /hunter|gatherer|peoples|farmers|culture|foraging|fishing|tribes|fichers|shellfish|marine mammal|aborigin|Khoisan|Bantu|Arawak|Thule|Dorset|Innu|Athabaskan|Boethuk|Guanahatabeyes/i;

export async function buildRealms(): Promise<void> {
  const W = MAP_W,
    H = MAP_H;
  const tags = REALMS.map((r) => r.tag);
  const index = new Map(tags.map((t, i) => [t, i + 1]));
  const realm = new Uint16Array(W * H);
  const features = loadFeatures<Record<string, string | null>>(join(CACHE_DIR, 'hb', 'world_1100.geojson'));
  const unknown = new Set<string>();
  // States after cultural areas so states win overlaps.
  const ordered = features
    .filter((f) => f.properties.NAME)
    .sort(
      (a, b) => Number(CULTURAL.test(String(b.properties.NAME))) - Number(CULTURAL.test(String(a.properties.NAME))),
    );
  for (const f of ordered) {
    const name = String(f.properties.NAME);
    const rings = projectPolygons(f.geometry);
    let cx = 0,
      cy = 0,
      n = 0;
    for (const r of rings)
      for (let i = 0; i < r.length; i += 2) {
        cx += r[i];
        cy += r[i + 1];
        n++;
      }
    const lon = xToLon((((cx / n) % W) + W) % W);
    const lat = yToLat(cy / n);
    const tag = resolveHistFeature(name, lon, lat);
    if (tag === undefined) {
      if (!CULTURAL.test(name)) unknown.add(name);
      continue;
    }
    const id = tag ? index.get(tag) : 0;
    if (id === undefined) throw new Error(`HIST_MAP → unknown tag ${tag}`);
    fillRings(rings, W, H, (row, a, b) => realm.fill(id, row * W + a, row * W + b + 1));
  }
  if (unknown.size) console.log(`  basemap states left native: ${[...unknown].join(', ')}`);
  for (const o of OVERRIDES) {
    const id = o.tag ? index.get(o.tag) : 0;
    if (id === undefined) throw new Error(`override → unknown tag ${o.tag}`);
    for (const ring of o.rings)
      fillRings([projectPath(ring)], W, H, (row, a, b) => realm.fill(id, row * W + a, row * W + b + 1));
  }
  for (const ring of UNINHABITED)
    fillRings([projectPath(ring)], W, H, (row, a, b) => realm.fill(0, row * W + a, row * W + b + 1));
  saveArray('realm.u16', realm);
  saveJSON('realmTags.json', tags);

  const adm = loadArray('adm.u16', Uint16Array);
  const col = (i: number): [number, number, number] =>
    adm[i] ? (realm[i] ? labelColor(realm[i] * 7919) : [190, 185, 170]) : [25, 35, 60];
  await debugImage('09-realms.png', W, H, col, { step: 8 });
  await debugImage('09-realms-europe.png', W, H, col, { x0: 7400, y0: 1700, x1: 10400, y1: 3600, step: 3 });
}
