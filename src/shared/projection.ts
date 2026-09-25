/**
 * Miller cylindrical projection onto the game's map grid, shared by the map pipeline and the game.
 *
 * The map is MAP_W x MAP_H "map units" (one unit = one pixel of the 16384-wide working raster).
 * Longitude -180..180 spans the width; latitude runs from 84°N at the top to ~57.8°S at the bottom,
 * chosen so the map is exactly 2:1. y grows southwards (image convention).
 */
export const MAP_W = 16384;
export const MAP_H = 8192;
export const LAT_TOP = 84;

const D2R = Math.PI / 180;

export function millerY(latDeg: number): number {
  return 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * latDeg * D2R));
}

export function millerLat(y: number): number {
  return (2.5 * Math.atan(Math.exp(0.8 * y)) - 0.625 * Math.PI) / D2R;
}

export const PX_PER_RAD = MAP_W / (2 * Math.PI);
export const Y_TOP = millerY(LAT_TOP);
export const Y_BOT = Y_TOP - MAP_H / PX_PER_RAD;
export const LAT_BOT = millerLat(Y_BOT);
export const EARTH_R_KM = 6371.0088;
/** Ground distance of one map unit along the equator. */
export const KM_PER_PX_EQ = EARTH_R_KM / PX_PER_RAD;

export const lonToX = (lon: number) => ((lon + 180) / 360) * MAP_W;
export const latToY = (lat: number) => (Y_TOP - millerY(lat)) * PX_PER_RAD;
export const xToLon = (x: number) => (x / MAP_W) * 360 - 180;
export const yToLat = (y: number) => millerLat(Y_TOP - y / PX_PER_RAD);

/** Ground size of one map unit at a latitude (Miller: k_x = sec φ, k_y = sec 0.8φ). */
export const kmPerPxX = (lat: number) => KM_PER_PX_EQ * Math.cos(lat * D2R);
export const kmPerPxY = (lat: number) => KM_PER_PX_EQ * Math.cos(0.8 * lat * D2R);
