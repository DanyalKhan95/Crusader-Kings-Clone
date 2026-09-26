/** The static world the simulation runs on: regions, cultures, faiths and derived lookups. */
import type { RegionData, WorldData } from '../shared/dataTypes';
import { registerBeliefs } from './beliefs';

export interface SimWorld {
  world: WorldData;
  regions: RegionData[];
  /** region id → RegionData (index = id) */
  region: (id: number) => RegionData;
}

export function makeSimWorld(world: WorldData, regions: RegionData[]): SimWorld {
  registerBeliefs(world, regions);
  const byId: RegionData[] = [];
  for (const r of regions) byId[r.id] = r;
  return { world, regions, region: (id) => byId[id] };
}

const D2R = Math.PI / 180;

/** Great-circle distance in km between two regions' centres. */
export function distanceKm(a: RegionData, b: RegionData): number {
  const dLat = (b.lat - a.lat) * D2R,
    dLon = (b.lon - a.lon) * D2R;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * D2R) * Math.cos(b.lat * D2R) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}
