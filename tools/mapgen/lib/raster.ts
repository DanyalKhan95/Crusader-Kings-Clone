import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { DEBUG_DIR, WORK_DIR } from './paths.ts';

type TypedArray = Uint8Array | Uint16Array | Int16Array | Int32Array | Uint32Array | Float32Array | Float64Array;
type TypedCtor<T extends TypedArray> = { new (buffer: ArrayBufferLike): T; BYTES_PER_ELEMENT: number };

export function workPath(name: string): string {
  mkdirSync(WORK_DIR, { recursive: true });
  return join(WORK_DIR, name);
}

export function hasWork(name: string): boolean {
  return existsSync(join(WORK_DIR, name));
}

export function saveArray(name: string, arr: TypedArray): void {
  writeFileSync(workPath(name), new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
}

export function loadArray<T extends TypedArray>(name: string, ctor: TypedCtor<T>): T {
  const buf = readFileSync(workPath(name));
  const copy = new ArrayBuffer(buf.byteLength);
  new Uint8Array(copy).set(buf);
  return new ctor(copy);
}

export function saveJSON(name: string, data: unknown): void {
  writeFileSync(workPath(name), JSON.stringify(data));
}

export function loadJSON<T>(name: string): T {
  return JSON.parse(readFileSync(workPath(name), 'utf8')) as T;
}

/** Stable pseudo-random color for a label (0 → black). */
export function labelColor(label: number): [number, number, number] {
  if (label === 0) return [0, 0, 0];
  let h = Math.imul(label ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return [64 + (h & 0x7f) + 32, 64 + ((h >>> 8) & 0x7f) + 32, 64 + ((h >>> 16) & 0x7f) + 32];
}

/**
 * Writes a debug PNG of a (possibly cropped and downsampled) region of a W x H raster,
 * using a pixel -> rgb function evaluated on the sampled source pixels.
 */
export async function debugImage(
  file: string,
  w: number,
  h: number,
  pixel: (idx: number) => [number, number, number],
  opts: { x0?: number; y0?: number; x1?: number; y1?: number; step?: number } = {},
): Promise<void> {
  const x0 = opts.x0 ?? 0,
    y0 = opts.y0 ?? 0,
    x1 = opts.x1 ?? w,
    y1 = opts.y1 ?? h;
  const step = opts.step ?? 4;
  const ow = Math.floor((x1 - x0) / step),
    oh = Math.floor((y1 - y0) / step);
  const out = Buffer.alloc(ow * oh * 3);
  for (let y = 0; y < oh; y++)
    for (let x = 0; x < ow; x++) {
      const sx = x0 + x * step,
        sy = y0 + y * step;
      const c = pixel(sy * w + sx);
      const o = (y * ow + x) * 3;
      out[o] = c[0];
      out[o + 1] = c[1];
      out[o + 2] = c[2];
    }
  mkdirSync(DEBUG_DIR, { recursive: true });
  await sharp(out, { raw: { width: ow, height: oh, channels: 3 } })
    .png()
    .toFile(join(DEBUG_DIR, file));
}
