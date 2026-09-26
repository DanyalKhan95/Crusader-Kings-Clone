/**
 * Army movement: a travel-time graph over land provinces, straits and sea zones (armies embark and
 * land automatically), and A* on it.
 */
import { ADJ_RIVER, ADJ_STRAIT, type RegionData, type Terrain } from '../shared/dataTypes';
import { distanceKm, type SimWorld } from './world';

/** Marching speed in km per day, by the terrain being entered. */
export const MARCH_SPEED: Record<Terrain, number> = {
  plains: 25,
  farmland: 25,
  steppe: 28,
  drylands: 22,
  desert: 18,
  hills: 18,
  forest: 18,
  taiga: 16,
  jungle: 12,
  wetlands: 12,
  mountains: 10,
  tundra: 16,
  ice: 8,
};
export const SAIL_SPEED = 80;
const EMBARK_DAYS = 3;
const LAND_DAYS = 2;
const RIVER_DAYS = 1;
const STRAIT_DAYS = 2;

export interface Edge {
  to: number;
  days: number;
}

interface Graph {
  edges: Edge[][];
}

const graphs = new WeakMap<SimWorld, Graph>();

export function isPassable(r: RegionData | undefined): boolean {
  return !!r && (r.kind !== 'land' || !r.impassable);
}

function buildGraph(world: SimWorld): Graph {
  const edges: Edge[][] = [];
  for (const r of world.regions) {
    const list: Edge[] = [];
    edges[r.id] = list;
    if (!isPassable(r)) continue;
    for (const [n, , flags] of r.adj) {
      const o = world.region(n);
      if (!isPassable(o)) continue;
      const km = distanceKm(r, o);
      let days: number;
      if (r.kind === 'land' && o.kind === 'land') {
        days = km / MARCH_SPEED[o.terrain ?? 'plains'];
        if (flags & ADJ_RIVER) days += RIVER_DAYS;
        if (flags & ADJ_STRAIT) days += STRAIT_DAYS;
      } else if (r.kind === 'land') days = EMBARK_DAYS + km / SAIL_SPEED;
      else if (o.kind === 'land') days = LAND_DAYS + km / SAIL_SPEED;
      else days = km / SAIL_SPEED;
      list.push({ to: n, days: Math.max(1, Math.round(days)) });
    }
  }
  return { edges };
}

export function graph(world: SimWorld): Graph {
  let g = graphs.get(world);
  if (!g) graphs.set(world, (g = buildGraph(world)));
  return g;
}

export function stepDays(world: SimWorld, from: number, to: number): number {
  return graph(world).edges[from]?.find((e) => e.to === to)?.days ?? 1;
}

/** Tiny binary heap keyed by priority. */
class Heap {
  private p: number[] = [];
  private v: number[] = [];
  get size() {
    return this.v.length;
  }
  push(priority: number, value: number) {
    const p = this.p,
      v = this.v;
    let i = v.length;
    p.push(priority);
    v.push(value);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (p[parent] <= priority) break;
      p[i] = p[parent];
      v[i] = v[parent];
      i = parent;
    }
    p[i] = priority;
    v[i] = value;
  }
  pop(): number {
    const p = this.p,
      v = this.v;
    const top = v[0];
    const lp = p.pop()!,
      lv = v.pop()!;
    const n = v.length;
    if (n) {
      let i = 0;
      for (;;) {
        const l = i * 2 + 1,
          r = l + 1;
        let m = -1,
          mp = lp;
        if (l < n && p[l] < mp) {
          m = l;
          mp = p[l];
        }
        if (r < n && p[r] < mp) m = r;
        if (m < 0) break;
        p[i] = p[m];
        v[i] = v[m];
        i = m;
      }
      p[i] = lp;
      v[i] = lv;
    }
    return top;
  }
}

/** Scratch arrays for searches, reused from one search to the next (searches never nest). */
let scratch: { dist: Float64Array; prev: Int32Array; seen: Uint32Array; closed: Uint32Array; stamp: number } | null =
  null;

function buffers(n: number) {
  if (!scratch || scratch.dist.length < n || scratch.stamp > 0xfffffff0)
    scratch = {
      dist: new Float64Array(n),
      prev: new Int32Array(n),
      seen: new Uint32Array(n),
      closed: new Uint32Array(n),
      stamp: 0,
    };
  scratch.stamp++;
  return scratch;
}

export interface PathOptions {
  /** extra days to enter a region (e.g. to avoid enemies); Infinity forbids it */
  penalty?: (region: number) => number;
  /** allow crossing the sea */
  sea?: boolean;
  /** give up beyond this many days */
  maxDays?: number;
}

/**
 * Fastest route, as the list of regions to pass through after `from` (ending with `to`), or null.
 * Travel times are integer days per step.
 */
export function findPath(world: SimWorld, from: number, to: number, opts: PathOptions = {}): number[] | null {
  if (from === to) return [];
  const target = world.region(to);
  if (!isPassable(target) || !isPassable(world.region(from))) return null;
  const { edges } = graph(world);
  const sea = opts.sea ?? true;
  const maxDays = opts.maxDays ?? Infinity;
  const { dist, prev, seen, closed, stamp } = buffers(edges.length);
  seen[from] = stamp;
  dist[from] = 0;
  const heap = new Heap();
  const h = (id: number) => distanceKm(world.region(id), target) / SAIL_SPEED;
  heap.push(h(from), from);
  let found = false;
  while (heap.size) {
    const id = heap.pop();
    if (id === to) {
      found = true;
      break;
    }
    if (closed[id] === stamp) continue;
    closed[id] = stamp;
    const d = dist[id];
    for (const e of edges[id]) {
      if (!sea && world.region(e.to).kind !== 'land') continue;
      const extra = opts.penalty ? opts.penalty(e.to) : 0;
      if (extra === Infinity) continue;
      const nd = d + e.days + extra;
      if (nd > maxDays) continue;
      if (seen[e.to] !== stamp || nd < dist[e.to]) {
        seen[e.to] = stamp;
        dist[e.to] = nd;
        prev[e.to] = id;
        heap.push(nd + h(e.to), e.to);
      }
    }
  }
  if (!found) return null;
  const path: number[] = [];
  for (let c = to; c !== from; c = prev[c]) path.push(c);
  return path.reverse();
}

/**
 * Labels the regions an army could march between, given which it may enter: two enterable regions
 * with the same label are joined by a route. Regions it may not enter are labelled -1.
 */
export function components(world: SimWorld, enterable: (region: number) => boolean): Int32Array {
  const { edges } = graph(world);
  const label = new Int32Array(edges.length).fill(-1);
  const ok = new Uint8Array(edges.length);
  for (let id = 0; id < edges.length; id++) if (edges[id] && isPassable(world.region(id)) && enterable(id)) ok[id] = 1;
  const stack: number[] = [];
  let next = 0;
  for (let id = 0; id < edges.length; id++) {
    if (!ok[id] || label[id] >= 0) continue;
    label[id] = next;
    stack.push(id);
    while (stack.length) {
      const u = stack.pop()!;
      for (const e of edges[u])
        if (ok[e.to] && label[e.to] < 0) {
          label[e.to] = next;
          stack.push(e.to);
        }
    }
    next++;
  }
  return label;
}

/** Total days along a path starting at `from`. */
export function pathDays(world: SimWorld, from: number, path: number[]): number {
  let d = 0,
    at = from;
  for (const p of path) {
    d += stepDays(world, at, p);
    at = p;
  }
  return d;
}
