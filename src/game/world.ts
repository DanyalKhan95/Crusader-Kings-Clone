/**
 * Loads the static world (regions, cultures, religions), the 1066 scenario and the map meshes.
 * The game state itself is built by the simulation (src/sim/setup.ts).
 */
import type { RegionData, ScenarioData, WorldData } from '../shared/dataTypes';
import type { MeshBundle } from '../render/meshBuilder';
import { registerBeliefs } from '../sim/beliefs';

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
  registerBeliefs(world, regions);
  onProgress({ stage: 'Surveying the realms', fraction: 0.15 });
  const bytes = await fetchBytes(`${base}/map.json`, (f) =>
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
