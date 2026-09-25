/// <reference lib="webworker" />
/** Decompresses and decodes the map file and builds all meshes off the main thread. */
import { decodeMap } from '../shared/mapFormat';
import { buildMeshBundle, bundleTransferables } from './meshBuilder';

export interface MeshRequest {
  bytes: ArrayBuffer;
  kinds: Uint8Array;
}

async function gunzip(buf: ArrayBuffer): Promise<Uint8Array> {
  const head = new Uint8Array(buf, 0, 2);
  if (head[0] !== 0x1f || head[1] !== 0x8b) return new Uint8Array(buf);
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

self.onmessage = async (e: MessageEvent<MeshRequest>) => {
  try {
    const geometry = decodeMap(await gunzip(e.data.bytes));
    const bundle = buildMeshBundle(geometry, e.data.kinds);
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({ ok: true, bundle }, bundleTransferables(bundle));
  } catch (err) {
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({ ok: false, error: String(err) });
  }
};
