/// <reference lib="webworker" />
/** Decompresses and decodes the map file and builds all meshes off the main thread. */
import { decodeMap, mapFilePayload } from '../shared/mapFormat';
import { buildMeshBundle, bundleTransferables } from './meshBuilder';

export interface MeshRequest {
  bytes: ArrayBuffer;
  kinds: Uint8Array;
}

/** Raw CCMP bytes from map.json, a gzipped .ccmp or a plain .ccmp. */
async function mapBytes(buf: ArrayBuffer): Promise<Uint8Array> {
  let bytes = new Uint8Array(buf);
  if (bytes[0] === 0x7b /* { */) bytes = mapFilePayload(new TextDecoder().decode(bytes));
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

self.onmessage = async (e: MessageEvent<MeshRequest>) => {
  try {
    const geometry = decodeMap(await mapBytes(e.data.bytes));
    const bundle = buildMeshBundle(geometry, e.data.kinds);
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({ ok: true, bundle }, bundleTransferables(bundle));
  } catch (err) {
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({ ok: false, error: String(err) });
  }
};
