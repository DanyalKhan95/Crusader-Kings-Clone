/**
 * Step 1: land mask + admin-1 label raster.
 *
 * Outputs (work dir):
 *   adm.u16      admin-1 unit id per pixel (0 = water)
 *   lakes.u8     1 where any Natural Earth lake is (for the terrain texture only)
 *   admMeta.json metadata per admin-1 unit (index = id - 1)
 */
import { join } from 'node:path';
import { loadFeatures, projectPolygons } from '../lib/geo.ts';
import { MAP_H, MAP_W, rowScales } from '../lib/projection.ts';
import { fillRings } from '../lib/rasterize.ts';
import { debugImage, labelColor, saveArray, saveJSON } from '../lib/raster.ts';
import { CACHE_DIR } from '../lib/paths.ts';

export interface AdmMeta {
  id: number;
  name: string;
  nameEn: string;
  admin: string;
  adm0: string;
  region: string;
  type: string;
  lat: number;
  lon: number;
}

/** Lakes large enough to split provinces must also be real water (not dry salt pans). */
const MIN_PROVINCE_LAKE_KM2 = 1800;
const DRY_LAKES = new Set([
  'Lake Eyre North',
  'Lake Eyre South',
  'Lake Torrens',
  'Lake Gairdner',
  'Lake Frome',
  'Salar de Uyuni',
  'Salar de Atacama',
  'Great Salt Lake Desert',
  'Lake Mackay',
  'Lake Amadeus',
  'Lake Carnegie',
  'Lake Disappointment',
  'Chott el Djerid',
  'Chott Melrhir',
  'Etosha Pan',
  'Makgadikgadi Pan',
]);
const MIN_SPECK_PX = 6;

export async function buildLand(): Promise<void> {
  const W = MAP_W,
    H = MAP_H,
    N = W * H;
  const ne = (n: string) => join(CACHE_DIR, 'ne', `${n}.geojson`);
  const { area } = rowScales(H);

  console.log('  rasterizing admin-1 units');
  const admFeatures = loadFeatures<Record<string, string | number | null>>(ne('ne_10m_admin_1_states_provinces_lakes'));
  const adm = new Uint16Array(N);
  const meta: AdmMeta[] = [];
  admFeatures.forEach((f, i) => {
    const id = i + 1;
    const p = f.properties;
    meta.push({
      id,
      name: String(p.name ?? p.name_en ?? `Unit ${id}`),
      nameEn: String(p.name_en ?? p.name ?? ''),
      admin: String(p.admin ?? ''),
      adm0: String(p.adm0_a3 ?? ''),
      region: String(p.region ?? ''),
      type: String(p.type_en ?? ''),
      lat: Number(p.latitude ?? 0),
      lon: Number(p.longitude ?? 0),
    });
    fillRings(projectPolygons(f.geometry), W, H, (row, x0, x1) => {
      adm.fill(id, row * W + x0, row * W + x1 + 1);
    });
  });

  console.log('  rasterizing Natural Earth land');
  const land = new Uint8Array(N);
  for (const f of loadFeatures(ne('ne_10m_land')))
    fillRings(projectPolygons(f.geometry), W, H, (row, x0, x1) => land.fill(1, row * W + x0, row * W + x1 + 1));
  for (let i = 0; i < N; i++) if (adm[i]) land[i] = 1;

  console.log('  lakes');
  const lakes = new Uint8Array(N);
  let bigLakes = 0;
  for (const f of loadFeatures<Record<string, string | number | null>>(ne('ne_10m_lakes'))) {
    const name = String(f.properties.name ?? '');
    const rings = projectPolygons(f.geometry);
    let km2 = 0;
    fillRings(rings, W, H, (row, x0, x1) => {
      lakes.fill(1, row * W + x0, row * W + x1 + 1);
      km2 += (x1 - x0 + 1) * area[row];
    });
    const dry = DRY_LAKES.has(name) || f.properties.featurecla === 'Reservoir';
    if (km2 >= MIN_PROVINCE_LAKE_KM2 && !dry) {
      bigLakes++;
      fillRings(rings, W, H, (row, x0, x1) => land.fill(0, row * W + x0, row * W + x1 + 1));
    }
  }
  console.log(`  ${bigLakes} lakes are large enough to be water regions`);

  console.log('  removing specks and filling unlabeled land');
  removeSpecks(land, W, H, MIN_SPECK_PX);
  for (let i = 0; i < N; i++) if (!land[i]) adm[i] = 0;
  fillUnlabeled(adm, land, W, H);

  saveArray('adm.u16', adm);
  saveArray('lakes.u8', lakes);
  saveJSON('admMeta.json', meta);

  await debugImage('01-adm.png', W, H, (i) => (land[i] ? labelColor(adm[i]) : [20, 30, 60]), {
    step: 8,
  });
  await debugImage(
    '01-adm-europe.png',
    W,
    H,
    (i) => (land[i] ? labelColor(adm[i]) : lakes[i] ? [40, 70, 140] : [20, 30, 60]),
    { x0: 7600, y0: 1100, x1: 10400, y1: 2900, step: 2 },
  );
}

/** Removes 4-connected land components smaller than minPx. */
function removeSpecks(land: Uint8Array, w: number, h: number, minPx: number) {
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(1 << 26);
  const comp = new Int32Array(minPx);
  for (let s = 0; s < w * h; s++) {
    if (!land[s] || seen[s]) continue;
    let sp = 0;
    let size = 0;
    stack[sp++] = s;
    seen[s] = 1;
    while (sp > 0) {
      const p = stack[--sp];
      if (size < minPx) comp[size] = p;
      size++;
      const x = p % w;
      const up = p - w,
        down = p + w,
        left = x > 0 ? p - 1 : p + w - 1,
        right = x < w - 1 ? p + 1 : p - w + 1;
      if (up >= 0 && land[up] && !seen[up]) {
        seen[up] = 1;
        stack[sp++] = up;
      }
      if (down < w * h && land[down] && !seen[down]) {
        seen[down] = 1;
        stack[sp++] = down;
      }
      if (land[left] && !seen[left]) {
        seen[left] = 1;
        stack[sp++] = left;
      }
      if (land[right] && !seen[right]) {
        seen[right] = 1;
        stack[sp++] = right;
      }
    }
    if (size < minPx) for (let k = 0; k < size; k++) land[comp[k]] = 0;
  }
}

/** Gives every land pixel without an admin-1 label the label of the nearest labeled pixel. */
function fillUnlabeled(adm: Uint16Array, land: Uint8Array, w: number, h: number) {
  const n = w * h;
  const label = new Uint16Array(adm);
  const queue = new Int32Array(n);
  let head = 0,
    tail = 0;
  for (let i = 0; i < n; i++) if (label[i]) queue[tail++] = i;
  while (head < tail) {
    const p = queue[head++];
    const x = p % w;
    const l = label[p];
    const up = p - w,
      down = p + w,
      left = x > 0 ? p - 1 : p + w - 1,
      right = x < w - 1 ? p + 1 : p - w + 1;
    if (up >= 0 && !label[up]) {
      label[up] = l;
      queue[tail++] = up;
    }
    if (down < n && !label[down]) {
      label[down] = l;
      queue[tail++] = down;
    }
    if (!label[left]) {
      label[left] = l;
      queue[tail++] = left;
    }
    if (!label[right]) {
      label[right] = l;
      queue[tail++] = right;
    }
  }
  let filled = 0;
  for (let i = 0; i < n; i++)
    if (land[i] && !adm[i]) {
      adm[i] = label[i];
      filled++;
    }
  console.log(`  filled ${filled} unlabeled land pixels`);
}
