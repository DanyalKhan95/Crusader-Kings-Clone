/**
 * Turns decoded map geometry into GPU-ready buffers. Pure functions (no DOM), so they run in the
 * mesh worker and in unit tests.
 */
import earcut from 'earcut';
import { ringCoordinates, type MapGeometry } from '../shared/mapFormat';

export interface FillMesh {
  /** x, y per vertex (map units) */
  positions: Float32Array;
  /** region id per vertex */
  regions: Uint16Array;
  indices: Uint32Array;
  /** index ranges [start, count] by region kind */
  landRange: [number, number];
  waterRange: [number, number];
}

export interface LineMesh {
  positions: Float32Array;
  /** miter offset per vertex (unit-ish vector; scaled by half width in the shader) */
  offsets: Float32Array;
  /** region ids on each side of the line (0 for rivers) */
  sideA: Uint16Array;
  sideB: Uint16Array;
  /** line class (rivers: width class) */
  widths: Float32Array;
  /** distance along the line from its start, in map units (for dashes) */
  lengths: Float32Array;
  indices: Uint32Array;
}

export interface PickingData {
  /** all LOD0 ring coordinates concatenated */
  coords: Float32Array;
  /** ring k spans coords[ringStart[k] .. ringStart[k+1]) */
  ringStart: Uint32Array;
  /** region r owns rings regionRings[r] .. regionRings[r+1] */
  regionRings: Uint32Array;
  /** bbox per region: x0,y0,x1,y1 */
  bboxes: Float32Array;
}

export interface MeshBundle {
  fills: FillMesh[];
  borders: LineMesh[];
  rivers: LineMesh;
  picking: PickingData;
}

/** kinds[r] = 0 land, 1 water, for r in 1..regionCount */
export function buildFillMesh(g: MapGeometry, lod: number, kinds: Uint8Array): FillMesh {
  const pos: number[] = [];
  const reg: number[] = [];
  const idx: number[] = [];
  let landEnd = 0;
  for (const pass of [0, 1]) {
    for (let r = 1; r <= g.regionCount; r++) {
      if (kinds[r] !== pass) continue;
      for (const poly of g.polygons[r]) {
        const coords: number[] = [];
        const holes: number[] = [];
        poly.forEach((ring, k) => {
          if (k > 0) holes.push(coords.length / 2);
          const rc = ringCoordinates(g, lod, ring);
          for (let i = 0; i < rc.length; i++) coords.push(rc[i]);
        });
        if (coords.length < 6) continue;
        const tris = earcut(coords, holes.length ? holes : undefined);
        const base = pos.length / 2;
        for (let i = 0; i < coords.length; i++) pos.push(coords[i]);
        for (let i = 0; i < coords.length / 2; i++) reg.push(r);
        for (let i = 0; i < tris.length; i++) idx.push(base + tris[i]);
      }
    }
    if (pass === 0) landEnd = idx.length;
  }
  return {
    positions: Float32Array.from(pos),
    regions: Uint16Array.from(reg),
    indices: Uint32Array.from(idx),
    landRange: [0, landEnd],
    waterRange: [landEnd, idx.length - landEnd],
  };
}

class LineBuilder {
  pos: number[] = [];
  off: number[] = [];
  a: number[] = [];
  b: number[] = [];
  w: number[] = [];
  len: number[] = [];
  idx: number[] = [];

  add(pts: ArrayLike<number>, sideA: number, sideB: number, width: number) {
    const n = pts.length / 2;
    if (n < 2) return;
    const closed = n > 2 && pts[0] === pts[(n - 1) * 2] && pts[1] === pts[(n - 1) * 2 + 1];
    const base = this.pos.length / 2;
    let dist = 0;
    for (let i = 0; i < n; i++) {
      const x = pts[i * 2],
        y = pts[i * 2 + 1];
      if (i > 0) dist += Math.hypot(x - pts[i * 2 - 2], y - pts[i * 2 - 1]);
      let pi = i - 1,
        ni = i + 1;
      if (closed) {
        if (pi < 0) pi = n - 2;
        if (ni > n - 1) ni = 1;
      }
      let nx = 0,
        ny = 0,
        count = 0;
      let n0x = 0,
        n0y = 0,
        n1x = 0,
        n1y = 0;
      if (pi >= 0) {
        const dx = x - pts[pi * 2],
          dy = y - pts[pi * 2 + 1];
        const l = Math.hypot(dx, dy) || 1;
        n0x = -dy / l;
        n0y = dx / l;
        nx += n0x;
        ny += n0y;
        count++;
      }
      if (ni < n) {
        const dx = pts[ni * 2] - x,
          dy = pts[ni * 2 + 1] - y;
        const l = Math.hypot(dx, dy) || 1;
        n1x = -dy / l;
        n1y = dx / l;
        nx += n1x;
        ny += n1y;
        count++;
      }
      let l = Math.hypot(nx, ny);
      if (l < 1e-6) {
        nx = count && pi >= 0 ? n0x : n1x;
        ny = count && pi >= 0 ? n0y : n1y;
        l = 1;
      }
      nx /= l;
      ny /= l;
      let miter = 1;
      if (count === 2) {
        const d = nx * n1x + ny * n1y;
        miter = Math.min(2, 1 / Math.max(0.5, d));
      }
      this.pos.push(x, y, x, y);
      this.off.push(nx * miter, ny * miter, -nx * miter, -ny * miter);
      this.a.push(sideA, sideA);
      this.b.push(sideB, sideB);
      this.w.push(width, width);
      this.len.push(dist, dist);
    }
    for (let i = 0; i < n - 1; i++) {
      const v = base + i * 2;
      this.idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
  }

  build(): LineMesh {
    return {
      positions: Float32Array.from(this.pos),
      offsets: Float32Array.from(this.off),
      sideA: Uint16Array.from(this.a),
      sideB: Uint16Array.from(this.b),
      widths: Float32Array.from(this.w),
      lengths: Float32Array.from(this.len),
      indices: Uint32Array.from(this.idx),
    };
  }
}

export function buildBorderMesh(g: MapGeometry, lod: number): LineMesh {
  const lb = new LineBuilder();
  const arcs = g.lods[lod];
  for (let i = 0; i < arcs.length; i++) {
    const a = g.arcLeft[i],
      b = g.arcRight[i];
    if (a === 0 || b === 0) continue; // map frame
    lb.add(arcs[i], a, b, 1);
  }
  return lb.build();
}

export function buildRiverMesh(g: MapGeometry): LineMesh {
  const lb = new LineBuilder();
  for (const r of g.rivers) lb.add(r.points, 0, 0, r.width);
  return lb.build();
}

export function buildPicking(g: MapGeometry, lod = 0): PickingData {
  const coords: number[] = [];
  const ringStart: number[] = [];
  const regionRings: number[] = [0, 0];
  const bboxes = new Float32Array((g.regionCount + 1) * 4);
  for (let r = 1; r <= g.regionCount; r++) {
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const poly of g.polygons[r])
      for (const ring of poly) {
        ringStart.push(coords.length);
        const rc = ringCoordinates(g, lod, ring);
        for (let i = 0; i < rc.length; i += 2) {
          const x = rc[i],
            y = rc[i + 1];
          coords.push(x, y);
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    regionRings.push(ringStart.length);
    bboxes.set([x0, y0, x1, y1], r * 4);
  }
  ringStart.push(coords.length);
  return {
    coords: Float32Array.from(coords),
    ringStart: Uint32Array.from(ringStart),
    regionRings: Uint32Array.from(regionRings),
    bboxes,
  };
}

export function buildMeshBundle(g: MapGeometry, kinds: Uint8Array): MeshBundle {
  const fills: FillMesh[] = [];
  const borders: LineMesh[] = [];
  for (let lod = 0; lod < g.lods.length; lod++) {
    fills.push(buildFillMesh(g, lod, kinds));
    borders.push(buildBorderMesh(g, lod));
  }
  return { fills, borders, rivers: buildRiverMesh(g), picking: buildPicking(g, 0) };
}

/** Transferable buffers of a bundle (for postMessage). */
export function bundleTransferables(b: MeshBundle): ArrayBuffer[] {
  const out: ArrayBuffer[] = [];
  const add = (arr: { buffer: ArrayBufferLike }) => out.push(arr.buffer as ArrayBuffer);
  for (const f of b.fills) [f.positions, f.regions, f.indices].forEach(add);
  for (const l of [...b.borders, b.rivers])
    [l.positions, l.offsets, l.sideA, l.sideB, l.widths, l.lengths, l.indices].forEach(add);
  [b.picking.coords, b.picking.ringStart, b.picking.regionRings, b.picking.bboxes].forEach(add);
  return out;
}
