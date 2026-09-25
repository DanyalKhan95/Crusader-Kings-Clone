import { join } from 'node:path';
import sharp from 'sharp';
import { loadFeatures } from './geo.ts';
import { CACHE_DIR } from './paths.ts';
import { latToY, lonToX } from './projection.ts';

export interface Place {
  name: string;
  lon: number;
  lat: number;
  x: number;
  y: number;
  pop: number;
  cls: string;
  rank: number;
  adm0: string;
  adm1: string;
  capital: boolean;
}

export function loadPlaces(): Place[] {
  const fs = loadFeatures<Record<string, string | number | null>>(
    join(CACHE_DIR, 'ne', 'ne_10m_populated_places_simple.geojson'),
  );
  const out: Place[] = [];
  for (const f of fs) {
    const p = f.properties;
    const cls = String(p.featurecla ?? '');
    if (/station/i.test(cls)) continue;
    const lon = Number(p.longitude),
      lat = Number(p.latitude);
    out.push({
      name: String(p.name ?? p.nameascii ?? ''),
      lon,
      lat,
      x: lonToX(lon),
      y: latToY(lat),
      pop: Math.max(0, Number(p.pop_max ?? 0)),
      cls,
      rank: Number(p.scalerank ?? 10),
      adm0: String(p.adm0_a3 ?? ''),
      adm1: String(p.adm1name ?? ''),
      capital: Number(p.adm0cap ?? 0) === 1,
    });
  }
  return out;
}

export interface Image {
  data: Uint8Array;
  width: number;
  height: number;
  channels: number;
}

/** NASA Blue Marble, equirectangular 4096x2048 (lon -180..180, lat 90..-90). */
export async function loadBlueMarble(): Promise<Image> {
  const { data, info } = await sharp(join(CACHE_DIR, 'bluemarble.jpg')).raw().toBuffer({ resolveWithObject: true });
  return {
    data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    width: info.width,
    height: info.height,
    channels: info.channels,
  };
}

/** Bilinear sample of an equirectangular image at lon/lat; writes rgb into out. */
export function sampleEquirect(img: Image, lon: number, lat: number, out: Float64Array): void {
  const u = ((lon + 180) / 360) * img.width - 0.5;
  const v = ((90 - lat) / 180) * img.height - 0.5;
  const x0f = Math.floor(u),
    y0 = Math.max(0, Math.min(img.height - 1, Math.floor(v)));
  const y1 = Math.min(img.height - 1, y0 + 1);
  const fx = u - x0f,
    fy = Math.max(0, Math.min(1, v - y0));
  const x0 = ((x0f % img.width) + img.width) % img.width;
  const x1 = (x0 + 1) % img.width;
  const c = img.channels,
    d = img.data,
    w = img.width;
  for (let k = 0; k < 3; k++) {
    const a = d[(y0 * w + x0) * c + k] * (1 - fx) + d[(y0 * w + x1) * c + k] * fx;
    const b = d[(y1 * w + x0) * c + k] * (1 - fx) + d[(y1 * w + x1) * c + k] * fx;
    out[k] = a * (1 - fy) + b * fy;
  }
}
