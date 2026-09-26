/** Loads the committed game data from public/data for tests. */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createGameState, type StaticWorld } from '../src/game/world';
import type { RegionData, ScenarioData, WorldData } from '../src/shared/dataTypes';
import { decodeMap, mapFilePayload, type MapGeometry } from '../src/shared/mapFormat';

const dataPath = (file: string) => new URL(`../public/data/${file}`, import.meta.url);

export function readJSON<T>(file: string): T {
  return JSON.parse(readFileSync(dataPath(file), 'utf8')) as T;
}

let cache: { world: WorldData; regions: RegionData[]; scenario: ScenarioData } | null = null;

export function loadData() {
  cache ??= {
    world: readJSON<WorldData>('world.json'),
    regions: readJSON<RegionData[]>('provinces.json'),
    scenario: readJSON<ScenarioData>('scenario-1066.json'),
  };
  return cache;
}

/** The raw CCMP bytes of the shipped map. */
export function mapBytes(): Uint8Array {
  return gunzipSync(mapFilePayload(readFileSync(dataPath('map.json'), 'utf8')));
}

let geometry: MapGeometry | null = null;
export function loadGeometry(): MapGeometry {
  geometry ??= decodeMap(mapBytes());
  return geometry;
}

export function staticWorld(): StaticWorld {
  const { world, regions } = loadData();
  const byId: RegionData[] = [];
  for (const r of regions) byId[r.id] = r;
  return { base: '', world, regions, region: (id) => byId[id] };
}

export function gameState() {
  return createGameState(staticWorld(), loadData().scenario);
}

/** Region kinds as the mesh builder wants them: 0 = land, 1 = water. */
export function regionKinds(): Uint8Array {
  const { regions } = loadData();
  const kinds = new Uint8Array(regions.length + 1);
  for (const r of regions) kinds[r.id] = r.kind === 'land' ? 0 : 1;
  return kinds;
}
