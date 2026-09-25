/**
 * Step 3: rasterize historical borders (aourednik/historical-basemaps, world_1100) so provinces can
 * be assigned to 1066 realms, and so admin-1 merges never cross a realm border.
 *
 * Outputs: hist.u16 (feature id + 1 per pixel, 0 = none), histMeta.json
 */
import { join } from 'node:path';
import { loadFeatures, projectPolygons } from '../lib/geo.ts';
import { CACHE_DIR } from '../lib/paths.ts';
import { MAP_H, MAP_W } from '../lib/projection.ts';
import { fillRings } from '../lib/rasterize.ts';
import { debugImage, labelColor, loadArray, saveArray, saveJSON } from '../lib/raster.ts';

export interface HistMeta {
  id: number;
  name: string;
  subjectOf: string;
  partOf: string;
  /** Cultural areas (hunter-gatherers, peoples…) are drawn first so states win overlaps. */
  cultural: boolean;
}

const CULTURAL =
  /hunter|gatherer|peoples|farmers|culture|foraging|fishing|tribes|fichers|shellfish|marine mammal|aborigin|Polynesians|Khoisan|Bantu|Arawak|Taino|Thule|Dorset|Innu|Athabaskan|Boethuk|Sámi|Guanahatabeyes/i;

export async function buildHistory(): Promise<void> {
  const W = MAP_W,
    H = MAP_H;
  const features = loadFeatures<Record<string, string | null>>(join(CACHE_DIR, 'hb', 'world_1100.geojson'));
  const meta: HistMeta[] = [];
  const named = features
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => f.properties.NAME)
    .map(({ f }, k) => {
      const name = String(f.properties.NAME);
      const m: HistMeta = {
        id: k + 1,
        name,
        subjectOf: String(f.properties.SUBJECTO ?? ''),
        partOf: String(f.properties.PARTOF ?? ''),
        cultural: CULTURAL.test(name),
      };
      meta.push(m);
      return { f, m };
    });
  const hist = new Uint16Array(W * H);
  const ordered = [...named].sort((a, b) => Number(b.m.cultural) - Number(a.m.cultural));
  for (const { f, m } of ordered)
    fillRings(projectPolygons(f.geometry), W, H, (row, x0, x1) => hist.fill(m.id, row * W + x0, row * W + x1 + 1));
  saveArray('hist.u16', hist);
  saveJSON('histMeta.json', meta);

  const adm = loadArray('adm.u16', Uint16Array);
  await debugImage(
    '03-hist.png',
    W,
    H,
    (i) => (adm[i] ? (hist[i] ? labelColor(hist[i] * 7919) : [200, 200, 200]) : [20, 30, 60]),
    { step: 8 },
  );
}
