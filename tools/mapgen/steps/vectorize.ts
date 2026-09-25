/**
 * Step 6: vectorize the region raster into a shared-arc topology.
 *
 * Boundaries run along pixel edges. Corners touched by 3+ boundary edges are nodes; arcs are the
 * edge chains between nodes, each with the region on its left and right. Each arc is smoothed and
 * simplified exactly once, so neighbouring regions share identical borders (no gaps/overlaps).
 * Region polygons are rings of arc references (arc index, or ~index when reversed).
 * Label 0 ("OUT") is the map frame: the seam at ±180° and the top/bottom edges.
 *
 * Output: topology.bin (see writeTopology)
 */
import { writeFileSync } from 'node:fs';
import { MAP_H, MAP_W } from '../lib/projection.ts';
import { loadArray, loadJSON, workPath } from '../lib/raster.ts';
import type { RegionMeta } from './seas.ts';

export const LOD_TOLERANCES = [0.4, 2.0, 7.0];

export interface Arc {
  left: number;
  right: number;
  /** Raw turning points (pixel corners), flat [x0,y0,x1,y1,...]. */
  raw: Int32Array;
  closed: boolean;
  startKey: number;
  endKey: number;
  startDir: number;
  endDir: number;
}

export interface Topology {
  arcs: Arc[];
  lods: Float32Array[][]; // lods[lod][arc] = flat points
  /** polygons[regionId] = list of polygons; polygon = list of rings; ring = arc refs */
  polygons: number[][][][];
}

const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

export async function buildVectorize(): Promise<void> {
  const W = MAP_W,
    H = MAP_H;
  const lab = loadArray('regions.u16', Uint16Array);
  const metas = loadJSON<RegionMeta[]>('regionsMeta.json');
  const R = metas.length;
  const L = (x: number, y: number) => (x < 0 || x >= W || y < 0 || y >= H ? 0 : lab[y * W + x]);
  const hasV = (cx: number, cy: number) => L(cx - 1, cy) !== L(cx, cy); // edge (cx,cy)-(cx,cy+1)
  const hasH = (cx: number, cy: number) => L(cx, cy - 1) !== L(cx, cy); // edge (cx,cy)-(cx+1,cy)
  const vVis = new Uint8Array((W + 1) * H);
  const hVis = new Uint8Array(W * (H + 1));
  const CW = W + 1;

  // Edge in direction d from corner (cx, cy): exists? / visited flag access.
  const edgeExists = (cx: number, cy: number, d: number) => {
    switch (d) {
      case 0:
        return cx < W && hasH(cx, cy);
      case 1:
        return cy < H && hasV(cx, cy);
      case 2:
        return cx > 0 && hasH(cx - 1, cy);
      default:
        return cy > 0 && hasV(cx, cy - 1);
    }
  };
  const visIndex = (cx: number, cy: number, d: number): [Uint8Array, number] => {
    switch (d) {
      case 0:
        return [hVis, cy * W + cx];
      case 1:
        return [vVis, cy * CW + cx];
      case 2:
        return [hVis, cy * W + cx - 1];
      default:
        return [vVis, (cy - 1) * CW + cx];
    }
  };
  const degree = (cx: number, cy: number) =>
    (edgeExists(cx, cy, 0) ? 1 : 0) +
    (edgeExists(cx, cy, 1) ? 1 : 0) +
    (edgeExists(cx, cy, 2) ? 1 : 0) +
    (edgeExists(cx, cy, 3) ? 1 : 0);
  // Left/right labels of the edge leaving (cx,cy) in direction d.
  const sides = (cx: number, cy: number, d: number): [number, number] => {
    switch (d) {
      case 0:
        return [L(cx, cy - 1), L(cx, cy)];
      case 1:
        return [L(cx, cy), L(cx - 1, cy)];
      case 2:
        return [L(cx - 1, cy), L(cx - 1, cy - 1)];
      default:
        return [L(cx - 1, cy - 1), L(cx, cy - 1)];
    }
  };

  const arcs: Arc[] = [];
  const pts: number[] = [];
  const trace = (sx: number, sy: number, d0: number, stopAtStart: boolean) => {
    const [left, right] = sides(sx, sy, d0);
    pts.length = 0;
    pts.push(sx, sy);
    let cx = sx,
      cy = sy,
      d = d0,
      prevD = d0;
    for (;;) {
      const [arr, i] = visIndex(cx, cy, d);
      arr[i] = 1;
      cx += DX[d];
      cy += DY[d];
      if (d !== prevD) {
        // record the corner where we turned (the previous corner)
        pts.push(cx - DX[d], cy - DY[d]);
      }
      prevD = d;
      if (stopAtStart ? cx === sx && cy === sy : degree(cx, cy) >= 3) break;
      // continue along the only other edge
      const back = (d + 2) % 4;
      let nd = -1;
      for (const cand of [(d + 3) % 4, d, (d + 1) % 4]) {
        if (cand !== back && edgeExists(cx, cy, cand)) {
          nd = cand;
          break;
        }
      }
      if (nd < 0) throw new Error(`dead end at ${cx},${cy}`);
      d = nd;
    }
    pts.push(cx, cy);
    arcs.push({
      left,
      right,
      raw: Int32Array.from(pts),
      closed: stopAtStart,
      startKey: sy * CW + sx,
      endKey: cy * CW + cx,
      startDir: d0,
      endDir: d,
    });
  };

  console.log('  tracing arcs from nodes');
  for (let cy = 0; cy <= H; cy++)
    for (let cx = 0; cx <= W; cx++) {
      if (degree(cx, cy) < 3) continue;
      for (let d = 0; d < 4; d++) {
        if (!edgeExists(cx, cy, d)) continue;
        const [arr, i] = visIndex(cx, cy, d);
        if (!arr[i]) trace(cx, cy, d, false);
      }
    }
  console.log('  tracing closed loops');
  for (let cy = 0; cy <= H; cy++)
    for (let cx = 0; cx < W; cx++) {
      if (!hVis[cy * W + cx] && hasH(cx, cy)) trace(cx, cy, 0, true);
    }
  console.log(`  ${arcs.length} arcs`);

  console.log('  assembling rings');
  const byRegion: number[][] = Array.from({ length: R + 1 }, () => []);
  arcs.forEach((a, i) => {
    if (a.left) byRegion[a.left].push(i);
    if (a.right) byRegion[a.right].push(~i);
  });
  const polygons: number[][][][] = Array.from({ length: R + 1 }, () => []);
  let broken = 0;
  for (let r = 1; r <= R; r++) {
    const refs = byRegion[r];
    const info = refs.map((ref) => orient(arcs, ref));
    const byStart = new Map<number, number[]>();
    info.forEach((o, k) => {
      if (o.closed) return;
      const list = byStart.get(o.start);
      if (list) list.push(k);
      else byStart.set(o.start, [k]);
    });
    const used = new Uint8Array(refs.length);
    const rings: number[][] = [];
    for (let k0 = 0; k0 < refs.length; k0++) {
      if (used[k0]) continue;
      used[k0] = 1;
      if (info[k0].closed) {
        rings.push([refs[k0]]);
        continue;
      }
      const ring = [refs[k0]];
      let cur = k0;
      for (let guard = 0; guard < 1e6; guard++) {
        const end = info[cur].end;
        const cands = (byStart.get(end) ?? []).filter((k) => !used[k]);
        if (end === info[k0].start) cands.push(k0);
        if (!cands.length) {
          broken++;
          break;
        }
        let best = cands[0],
          bp = 9;
        for (const k of cands) {
          const turn = (info[k].startDir - info[cur].endDir + 4) % 4;
          const p = turn === 3 ? 0 : turn === 0 ? 1 : turn === 1 ? 2 : 3;
          if (p < bp) {
            bp = p;
            best = k;
          }
        }
        if (best === k0) break;
        used[best] = 1;
        ring.push(refs[best]);
        cur = best;
      }
      rings.push(ring);
    }
    // Classify outer rings (negative screen-space area) and holes.
    const ringArea = rings.map((ring) => signedArea(ringPoints(arcs, ring)));
    const outers = rings.map((_, i) => i).filter((i) => ringArea[i] < 0);
    const polys: number[][][] = outers.map((i) => [rings[i]]);
    for (let i = 0; i < rings.length; i++) {
      if (ringArea[i] <= 0) continue;
      const pts2 = ringPoints(arcs, rings[i]);
      const tx = pts2[0] + 0.1,
        ty = pts2[1] + 0.1;
      let best = -1,
        bestA = Infinity;
      outers.forEach((oi, j) => {
        const a = -ringArea[oi];
        if (a < bestA && pointInRing(ringPoints(arcs, rings[oi]), tx, ty)) {
          bestA = a;
          best = j;
        }
      });
      if (best >= 0) polys[best].push(rings[i]);
      else broken++;
    }
    polygons[r] = polys;
  }
  if (broken) console.warn(`  WARNING: ${broken} broken rings/holes`);

  console.log('  smoothing and simplifying arcs');
  const lods = LOD_TOLERANCES.map((tol) => arcs.map((a) => smoothArc(a, tol)));
  const sizes = lods.map((l) => l.reduce((s, a) => s + a.length / 2, 0));
  console.log(`  points per LOD: ${sizes.join(' / ')}`);
  writeTopology({ arcs, lods, polygons });
}

function orient(arcs: Arc[], ref: number) {
  const a = arcs[ref < 0 ? ~ref : ref];
  if (ref >= 0) return { start: a.startKey, end: a.endKey, startDir: a.startDir, endDir: a.endDir, closed: a.closed };
  return {
    start: a.endKey,
    end: a.startKey,
    startDir: (a.endDir + 2) % 4,
    endDir: (a.startDir + 2) % 4,
    closed: a.closed,
  };
}

/** Raw ring points (turning points) following arc refs. */
export function ringPoints(arcs: Arc[], ring: number[]): number[] {
  const out: number[] = [];
  for (const ref of ring) {
    const r = arcs[ref < 0 ? ~ref : ref].raw;
    const n = r.length / 2;
    if (ref >= 0) for (let i = 0; i < n - 1; i++) out.push(r[i * 2], r[i * 2 + 1]);
    else for (let i = n - 1; i > 0; i--) out.push(r[i * 2], r[i * 2 + 1]);
  }
  return out;
}

export function signedArea(p: number[]): number {
  let s = 0;
  const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) s += p[j * 2] * p[i * 2 + 1] - p[i * 2] * p[j * 2 + 1];
  return s / 2;
}

function pointInRing(p: number[], x: number, y: number): boolean {
  let inside = false;
  const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = p[i * 2],
      yi = p[i * 2 + 1],
      xj = p[j * 2],
      yj = p[j * 2 + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Staircase → smooth line: midpoints of straight runs, one Chaikin pass, then Douglas-Peucker.
 * Open arcs keep their end nodes fixed so neighbouring arcs still meet exactly.
 */
function smoothArc(a: Arc, tol: number): Float32Array {
  const r = a.raw;
  const n = r.length / 2;
  let xs: number[] = [],
    ys: number[] = [];
  const frame = a.left === 0 || a.right === 0;
  if (frame || n <= 2) {
    for (let i = 0; i < n; i++) {
      xs.push(r[i * 2]);
      ys.push(r[i * 2 + 1]);
    }
  } else if (a.closed) {
    // cyclic: points = midpoints of all segments
    const m = n - 1; // last point equals first
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      xs.push((r[i * 2] + r[j * 2]) / 2);
      ys.push((r[i * 2 + 1] + r[j * 2 + 1]) / 2);
    }
    [xs, ys] = chaikin(xs, ys, true);
    xs.push(xs[0]);
    ys.push(ys[0]);
  } else {
    xs.push(r[0]);
    ys.push(r[1]);
    for (let i = 0; i < n - 1; i++) {
      xs.push((r[i * 2] + r[i * 2 + 2]) / 2);
      ys.push((r[i * 2 + 1] + r[i * 2 + 3]) / 2);
    }
    xs.push(r[(n - 1) * 2]);
    ys.push(r[(n - 1) * 2 + 1]);
    [xs, ys] = chaikin(xs, ys, false);
  }
  const keep = douglasPeucker(xs, ys, tol, a.closed && !frame);
  const out = new Float32Array(keep.length * 2);
  keep.forEach((k, i) => {
    out[i * 2] = xs[k];
    out[i * 2 + 1] = ys[k];
  });
  return out;
}

function chaikin(xs: number[], ys: number[], closed: boolean): [number[], number[]] {
  const n = xs.length;
  if (n < 3) return [xs, ys];
  const ox: number[] = [],
    oy: number[] = [];
  if (!closed) {
    ox.push(xs[0]);
    oy.push(ys[0]);
  }
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n;
    ox.push(0.75 * xs[i] + 0.25 * xs[j], 0.25 * xs[i] + 0.75 * xs[j]);
    oy.push(0.75 * ys[i] + 0.25 * ys[j], 0.25 * ys[i] + 0.75 * ys[j]);
  }
  if (!closed) {
    ox.push(xs[n - 1]);
    oy.push(ys[n - 1]);
  }
  return [ox, oy];
}

function douglasPeucker(xs: number[], ys: number[], tol: number, closed: boolean): number[] {
  const n = xs.length;
  if (n <= 2) return Array.from({ length: n }, (_, i) => i);
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: [number, number][] = [];
  if (closed) {
    // split the loop at the farthest point from the start
    let far = 0,
      fd = -1;
    for (let i = 1; i < n - 1; i++) {
      const d = (xs[i] - xs[0]) ** 2 + (ys[i] - ys[0]) ** 2;
      if (d > fd) {
        fd = d;
        far = i;
      }
    }
    keep[far] = 1;
    stack.push([0, far], [far, n - 1]);
  } else stack.push([0, n - 1]);
  const t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const ax = xs[a],
      ay = ys[a],
      bx = xs[b],
      by = ys[b];
    const dx = bx - ax,
      dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let far = -1,
      fd = t2;
    for (let i = a + 1; i < b; i++) {
      let d: number;
      if (len2 === 0) d = (xs[i] - ax) ** 2 + (ys[i] - ay) ** 2;
      else {
        const t = Math.max(0, Math.min(1, ((xs[i] - ax) * dx + (ys[i] - ay) * dy) / len2));
        d = (xs[i] - ax - t * dx) ** 2 + (ys[i] - ay - t * dy) ** 2;
      }
      if (d > fd) {
        fd = d;
        far = i;
      }
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(i);
  return out;
}

/**
 * topology.bin layout (little endian):
 *   u32 arcCount, u32 regionCount, u32 lodCount
 *   per arc: u16 left, u16 right, u8 closed
 *   per lod, per arc: u32 pointCount, f32[2*pointCount]
 *   per region (1..R): u32 polyCount; per poly: u32 ringCount; per ring: u32 refCount, i32[refCount]
 */
function writeTopology(t: Topology) {
  const chunks: Buffer[] = [];
  const u32 = (v: number) => {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(v >>> 0);
    chunks.push(b);
  };
  const R = t.polygons.length - 1;
  u32(t.arcs.length);
  u32(R);
  u32(t.lods.length);
  const meta = Buffer.alloc(t.arcs.length * 5);
  t.arcs.forEach((a, i) => {
    meta.writeUInt16LE(a.left, i * 5);
    meta.writeUInt16LE(a.right, i * 5 + 2);
    meta.writeUInt8(a.closed ? 1 : 0, i * 5 + 4);
  });
  chunks.push(meta);
  for (const lod of t.lods)
    for (const pts of lod) {
      u32(pts.length / 2);
      chunks.push(Buffer.from(pts.buffer, pts.byteOffset, pts.byteLength));
    }
  for (let r = 1; r <= R; r++) {
    const polys = t.polygons[r];
    u32(polys.length);
    for (const poly of polys) {
      u32(poly.length);
      for (const ring of poly) {
        u32(ring.length);
        const b = Buffer.alloc(ring.length * 4);
        ring.forEach((ref, i) => b.writeInt32LE(ref, i * 4));
        chunks.push(b);
      }
    }
  }
  writeFileSync(workPath('topology.bin'), Buffer.concat(chunks));
}
