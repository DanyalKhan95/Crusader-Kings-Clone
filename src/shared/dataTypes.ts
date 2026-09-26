/** Shapes of the generated data files in public/data (written by tools/mapgen, read by the game). */

export const TERRAINS = [
  'plains',
  'farmland',
  'hills',
  'mountains',
  'forest',
  'taiga',
  'jungle',
  'steppe',
  'drylands',
  'desert',
  'wetlands',
  'tundra',
  'ice',
] as const;
export type Terrain = (typeof TERRAINS)[number];
export type RegionKind = 'land' | 'sea' | 'lake';

/** Neighbour flags */
export const ADJ_RIVER = 1;
export const ADJ_STRAIT = 2;

/** provinces.json — one entry per region; index = id - 1. */
export interface RegionData {
  id: number;
  kind: RegionKind;
  name: string;
  /** Label / unit anchor in map units */
  label: [number, number];
  bbox: [number, number, number, number];
  /** km² */
  area: number;
  lon: number;
  lat: number;
  /** [neighbour id, shared border km, flags] */
  adj: [number, number, number][];
  terrain?: Terrain;
  dev?: number;
  elev?: number;
  coastal?: boolean;
  impassable?: boolean;
  /** Modern country code and admin-1 region, for flavour text */
  modern?: [string, string];
}

export interface CultureDef {
  name: string;
  group: string;
  religion: string;
  color: string;
}

export interface ReligionDef {
  name: string;
  family: string;
  color: string;
}

/** world.json */
export interface WorldData {
  width: number;
  height: number;
  terrainTiles: { size: number; cols: number; rows: number };
  cultures: Record<string, CultureDef>;
  religions: Record<string, ReligionDef>;
}

export type Government =
  | 'feudal'
  | 'imperial'
  | 'clan'
  | 'tribal'
  | 'nomadic'
  | 'republic'
  | 'theocracy'
  // Reached through technology and reform (milestone 5).
  | 'absolute'
  | 'constitutional'
  | 'democracy'
  | 'dictatorship'
  | 'communist';
export type Rank = 'county' | 'duchy' | 'kingdom' | 'empire';

export interface CountryData {
  tag: string;
  name: string;
  short: string;
  adj: string;
  gov: Government;
  rank: Rank;
  color: string;
  liege?: string;
  capital: number;
  culture: string;
  religion: string;
  ruler?: { name: string; age: number; female?: boolean };
}

/** scenario-1066.json */
export interface ScenarioData {
  id: string;
  name: string;
  start: string;
  countries: CountryData[];
  /** land province id → [owner tag | null, culture | null, religion | null] */
  provinces: Record<string, [string | null, string | null, string | null]>;
}
