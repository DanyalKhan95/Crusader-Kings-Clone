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
      if (p[parent] <= p[i]) break;
      [p[parent], p[i]] = [p[i], p[parent]];
      [v[parent], v[i]] = [v[i], v[parent]];
      i = parent;
    }
  }
  pop(): number {
    const p = this.p,
      v = this.v;
    const top = v[0];
    const lp = p.pop()!,
      lv = v.pop()!;
    if (v.length) {
      p[0] = lp;
      v[0] = lv;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1,
          r = l + 1;
        let m = i;
        if (l < v.length && p[l] < p[m]) m = l;
        if (r < v.length && p[r] < p[m]) m = r;
        if (m === i) break;
        [p[m], p[i]] = [p[i], p[m]];
        [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
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
  const dist = new Map<number, number>([[from, 0]]);
  const prev = new Map<number, number>();
  const heap = new Heap();
  const h = (id: number) => distanceKm(world.region(id), target) / SAIL_SPEED;
  heap.push(h(from), from);
  const closed = new Set<number>();
  while (heap.size) {
    const id = heap.pop();
    if (id === to) break;
    if (closed.has(id)) continue;
    closed.add(id);
    const d = dist.get(id)!;
    for (const e of edges[id]) {
      const r = world.region(e.to);
      if (!sea && r.kind !== 'land') continue;
      const extra = opts.penalty ? opts.penalty(e.to) : 0;
      if (extra === Infinity) continue;
      const nd = d + e.days + extra;
      if (nd > maxDays) continue;
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        prev.set(e.to, id);
        heap.push(nd + h(e.to), e.to);
      }
    }
  }
  if (!prev.has(to)) return null;
  const path: number[] = [];
  for (let c = to; c !== from; c = prev.get(c)!) path.push(c);
  return path.reverse();
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
