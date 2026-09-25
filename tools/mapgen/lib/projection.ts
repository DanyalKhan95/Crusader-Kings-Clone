/** Miller projection (shared with the game) plus raster helpers used only by the pipeline. */
import { MAP_H, kmPerPxX, kmPerPxY, yToLat } from '../../../src/shared/projection.ts';

export * from '../../../src/shared/projection.ts';

/** Per-row lookup tables for a raster of the given height covering the full map. */
export function rowScales(h: number) {
  const scale = MAP_H / h;
  const lat = new Float64Array(h);
  const kx = new Float64Array(h);
  const ky = new Float64Array(h);
  const area = new Float64Array(h);
  for (let r = 0; r < h; r++) {
    lat[r] = yToLat((r + 0.5) * scale);
    kx[r] = kmPerPxX(lat[r]) * scale;
    ky[r] = kmPerPxY(lat[r]) * scale;
    area[r] = kx[r] * ky[r];
  }
  return { lat, kx, ky, area };
}
