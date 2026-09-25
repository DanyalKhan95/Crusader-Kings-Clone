/**
 * Loads the static world (regions, cultures, religions), the 1066 scenario, and the map mesh bundle,
 * and builds the initial game state.
 */
import type { CountryData, RegionData, ScenarioData, WorldData } from '../shared/dataTypes';
import type { MeshBundle } from '../render/meshBuilder';

export interface Country {
  /** 1-based index used by the renderer; 0 = none */
  index: number;
  tag: string;
  name: string;
  short: string;
  adj: string;
  gov: CountryData['gov'];
  rank: CountryData['rank'];
  color: [number, number, number];
  colorHex: string;
  liege: number;
  capital: number;
  culture: string;
  religion: string;
  ruler?: CountryData['ruler'];
}

export interface ProvinceState {
  owner: number;
  controller: number;
  culture: string | null;
  religion: string | null;
}

export interface GameState {
  scenario: string;
  date: { y: number; m: number; d: number };
  countries: Country[]; // index 0 is a placeholder
  byTag: Map<string, Country>;
  /** indexed by region id (water regions have owner 0) */
  provinces: ProvinceState[];
}

export interface StaticWorld {
  base: string;
  world: WorldData;
  regions: RegionData[];
  /** region id → RegionData (index = id) */
  region: (id: number) => RegionData;
}

export interface LoadProgress {
  stage: string;
  fraction: number;
}

export function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (HTTP ${res.status}).`);
  return (await res.json()) as T;
}

async function fetchBytes(url: string, onProgress: (f: number) => void): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Could not load ${url} (HTTP ${res.status}).`);
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    if (total) onProgress(Math.min(1, got / total));
  }
  const out = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out.buffer;
}

export async function loadWorld(
  base: string,
  onProgress: (p: LoadProgress) => void,
): Promise<{ world: StaticWorld; scenario: ScenarioData; bundle: MeshBundle }> {
  onProgress({ stage: 'Reading the chronicles', fraction: 0.02 });
  const [world, regions, scenario] = await Promise.all([
    fetchJSON<WorldData>(`${base}/world.json`),
    fetchJSON<RegionData[]>(`${base}/provinces.json`),
    fetchJSON<ScenarioData>(`${base}/scenario-1066.json`),
  ]);
  onProgress({ stage: 'Surveying the realms', fraction: 0.15 });
  const bytes = await fetchBytes(`${base}/map.ccmp`, (f) =>
    onProgress({ stage: 'Surveying the realms', fraction: 0.15 + f * 0.35 }),
  );
  onProgress({ stage: 'Drawing the borders', fraction: 0.55 });
  const kinds = new Uint8Array(regions.length + 1);
  for (const r of regions) kinds[r.id] = r.kind === 'land' ? 0 : 1;
  const bundle = await new Promise<MeshBundle>((resolve, reject) => {
    const worker = new Worker(new URL('../render/mesh.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ ok: boolean; bundle?: MeshBundle; error?: string }>) => {
      worker.terminate();
      if (e.data.ok && e.data.bundle) resolve(e.data.bundle);
      else reject(new Error(e.data.error ?? 'Map build failed'));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || 'Map worker failed'));
    };
    worker.postMessage({ bytes, kinds }, [bytes]);
  });
  onProgress({ stage: 'Unrolling the map', fraction: 0.85 });
  const byId: RegionData[] = [];
  for (const r of regions) byId[r.id] = r;
  return {
    world: { base, world, regions, region: (id) => byId[id] },
    scenario,
    bundle,
  };
}

export function createGameState(world: StaticWorld, scenario: ScenarioData): GameState {
  const countries: Country[] = [null as unknown as Country];
  const byTag = new Map<string, Country>();
  scenario.countries.forEach((c, i) => {
    const country: Country = {
      index: i + 1,
      tag: c.tag,
      name: c.name,
      short: c.short,
      adj: c.adj,
      gov: c.gov,
      rank: c.rank,
      color: hexToRgb(c.color),
      colorHex: c.color,
      liege: 0,
      capital: c.capital,
      culture: c.culture,
      religion: c.religion,
      ruler: c.ruler,
    };
    countries.push(country);
    byTag.set(c.tag, country);
  });
  scenario.countries.forEach((c) => {
    if (c.liege && byTag.has(c.liege)) byTag.get(c.tag)!.liege = byTag.get(c.liege)!.index;
  });
  const [y, m, d] = scenario.start.split('-').map(Number);
  const provinces: ProvinceState[] = [];
  for (const r of world.regions) {
    const entry = scenario.provinces[r.id];
    const owner = entry?.[0] ? (byTag.get(entry[0])?.index ?? 0) : 0;
    provinces[r.id] = { owner, controller: owner, culture: entry?.[1] ?? null, religion: entry?.[2] ?? null };
  }
  return { scenario: scenario.id, date: { y, m, d }, countries, byTag, provinces };
}

/** Top liege of a country (itself if independent). */
export function topLiege(state: GameState, index: number): number {
  let c = index;
  for (let guard = 0; guard < 16 && state.countries[c]?.liege; guard++) c = state.countries[c].liege;
  return c;
}

export function provincesOf(state: GameState, index: number): number[] {
  const out: number[] = [];
  state.provinces.forEach((p, id) => {
    if (p && p.owner === index) out.push(id);
  });
  return out;
}

/** True if `index` is `owner` or one of its lieges. */
export function isInRealm(state: GameState, owner: number, index: number): boolean {
  for (let c = owner, guard = 0; c && guard < 16; c = state.countries[c]?.liege ?? 0, guard++)
    if (c === index) return true;
  return false;
}

/** Provinces held by a country and by its vassals (at any depth). */
export function realmProvinces(state: GameState, index: number): number[] {
  const out: number[] = [];
  state.provinces.forEach((p, id) => {
    if (p?.owner && isInRealm(state, p.owner, index)) out.push(id);
  });
  return out;
}
