import { readFileSync } from 'node:fs';
import { latToY, lonToX } from './projection.ts';

export type Position = number[];
export interface Geometry {
  type: string;
  coordinates: unknown;
}
export interface Feature<P = Record<string, unknown>> {
  type: 'Feature';
  properties: P;
  geometry: Geometry | null;
}

export function loadFeatures<P = Record<string, unknown>>(path: string): Feature<P>[] {
  const json = JSON.parse(readFileSync(path, 'utf8')) as { features: Feature<P>[] };
  return json.features;
}

/** Returns polygons as arrays of rings of [lon, lat] positions (Polygon and MultiPolygon only). */
export function polygonsOf(geometry: Geometry | null): Position[][][] {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates as Position[][]];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates as Position[][][];
  return [];
}

export function linesOf(geometry: Geometry | null): Position[][] {
  if (!geometry) return [];
  if (geometry.type === 'LineString') return [geometry.coordinates as Position[]];
  if (geometry.type === 'MultiLineString') return geometry.coordinates as Position[][];
  return [];
}

/**
 * Projects a ring or line into map units. Longitudes are unwrapped so a ring crossing the
 * antimeridian stays continuous (x may leave 0..MAP_W; the rasterizer wraps it).
 */
export function projectPath(path: Position[]): Float64Array {
  const out = new Float64Array(path.length * 2);
  let prevLon = path.length ? path[0][0] : 0;
  let shift = 0;
  for (let i = 0; i < path.length; i++) {
    const lon = path[i][0];
    if (i > 0) {
      const d = lon + shift - prevLon;
      if (d > 180) shift -= 360;
      else if (d < -180) shift += 360;
    }
    const ul = lon + shift;
    prevLon = ul;
    out[i * 2] = lonToX(ul);
    out[i * 2 + 1] = latToY(Math.max(-89.9, Math.min(89.9, path[i][1])));
  }
  return out;
}

export function projectPolygons(geometry: Geometry | null): Float64Array[] {
  const rings: Float64Array[] = [];
  for (const poly of polygonsOf(geometry)) for (const ring of poly) rings.push(projectPath(ring));
  return rings;
}

/** Even-odd point in polygon for projected rings. */
export function pointInRings(rings: Float64Array[], x: number, y: number): boolean {
  let inside = false;
  for (const r of rings) {
    const n = r.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = r[i * 2],
        yi = r[i * 2 + 1],
        xj = r[j * 2],
        yj = r[j * 2 + 1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}
