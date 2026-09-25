import { readFileSync } from 'node:fs';
import { workPath } from './raster.ts';

export interface TopoData {
  arcLeft: Uint16Array;
  arcRight: Uint16Array;
  arcClosed: Uint8Array;
  /** lods[lod][arc] = flat Float32 points */
  lods: Float32Array[][];
  /** polygons[region] (1-based) = polygons → rings → arc refs */
  polygons: number[][][][];
}

export function readTopology(): TopoData {
  const buf = readFileSync(workPath('topology.bin'));
  let o = 0;
  const u32 = () => {
    const v = buf.readUInt32LE(o);
    o += 4;
    return v;
  };
  const A = u32(),
    R = u32(),
    LODS = u32();
  const arcLeft = new Uint16Array(A),
    arcRight = new Uint16Array(A),
    arcClosed = new Uint8Array(A);
  for (let i = 0; i < A; i++) {
    arcLeft[i] = buf.readUInt16LE(o);
    arcRight[i] = buf.readUInt16LE(o + 2);
    arcClosed[i] = buf.readUInt8(o + 4);
    o += 5;
  }
  const lods: Float32Array[][] = [];
  for (let l = 0; l < LODS; l++) {
    const arcs: Float32Array[] = [];
    for (let i = 0; i < A; i++) {
      const n = u32();
      const copy = new Float32Array(n * 2);
      for (let k = 0; k < n * 2; k++) copy[k] = buf.readFloatLE(o + k * 4);
      o += n * 8;
      arcs.push(copy);
    }
    lods.push(arcs);
  }
  const polygons: number[][][][] = [[]];
  for (let r = 1; r <= R; r++) {
    const polys: number[][][] = [];
    const pc = u32();
    for (let p = 0; p < pc; p++) {
      const rings: number[][] = [];
      const rc = u32();
      for (let k = 0; k < rc; k++) {
        const n = u32();
        const ring: number[] = [];
        for (let i = 0; i < n; i++) {
          ring.push(buf.readInt32LE(o));
          o += 4;
        }
        rings.push(ring);
      }
      polys.push(rings);
    }
    polygons.push(polys);
  }
  return { arcLeft, arcRight, arcClosed, lods, polygons };
}

/** Flat ring coordinates for a ring of arc refs at a LOD (closing point omitted). */
export function ringCoords(t: TopoData, lod: number, ring: number[]): number[] {
  const out: number[] = [];
  for (const ref of ring) {
    const pts = t.lods[lod][ref < 0 ? ~ref : ref];
    const n = pts.length / 2;
    if (ref >= 0) for (let i = 0; i < n - 1; i++) out.push(pts[i * 2], pts[i * 2 + 1]);
    else for (let i = n - 1; i > 0; i--) out.push(pts[i * 2], pts[i * 2 + 1]);
  }
  return out;
}
