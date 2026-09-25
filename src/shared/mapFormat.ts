/**
 * Binary map geometry ("CCMP"), shared by the map pipeline (encode) and the game (decode).
 *
 * Everything is a zigzag/LEB128 varint. Coordinates are map units quantized to 1/4, delta-encoded
 * within each polyline. Layout:
 *   "CCMP" version width height regionCount arcCount lodCount riverCount
 *   arcCount × (left right)                       region ids either side (0 = map frame)
 *   lodCount × arcCount × (n, points…)            arc polylines per level of detail
 *   regionCount × (polys × (rings × (refs…)))     arc refs: i = forward, ~i = reversed
 *   riverCount × (width, n, points…)
 */
export const MAP_MAGIC = 'CCMP';
export const MAP_VERSION = 1;
const Q = 4;

export interface MapGeometry {
  width: number;
  height: number;
  regionCount: number;
  arcLeft: Uint16Array;
  arcRight: Uint16Array;
  /** lods[lod][arc] = flat [x0, y0, x1, y1, …] in map units */
  lods: Float32Array[][];
  /** polygons[regionId] = polygons → rings → arc refs (index 0 unused) */
  polygons: Int32Array[][][];
  rivers: { width: number; points: Float32Array }[];
}

class Writer {
  private buf = new Uint8Array(1 << 20);
  length = 0;
  private grow(n: number) {
    if (this.length + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.length + n) size *= 2;
    const b = new Uint8Array(size);
    b.set(this.buf.subarray(0, this.length));
    this.buf = b;
  }
  byte(v: number) {
    this.grow(1);
    this.buf[this.length++] = v;
  }
  uint(v: number) {
    if (v < 0 || !Number.isInteger(v)) throw new Error(`uint expects a non-negative integer, got ${v}`);
    while (v >= 0x80) {
      this.byte((v & 0x7f) | 0x80);
      v = Math.floor(v / 128);
    }
    this.byte(v);
  }
  int(v: number) {
    this.uint(v >= 0 ? v * 2 : -v * 2 - 1);
  }
  points(pts: ArrayLike<number>) {
    const n = pts.length / 2;
    this.uint(n);
    let px = 0,
      py = 0;
    for (let i = 0; i < n; i++) {
      const qx = Math.round(pts[i * 2] * Q),
        qy = Math.round(pts[i * 2 + 1] * Q);
      if (i === 0) {
        this.int(qx);
        this.int(qy);
      } else {
        this.int(qx - px);
        this.int(qy - py);
      }
      px = qx;
      py = qy;
    }
  }
  bytes(): Uint8Array {
    return this.buf.slice(0, this.length);
  }
}

class Reader {
  pos = 0;
  constructor(private buf: Uint8Array) {}
  uint(): number {
    let v = 0,
      mul = 1,
      b: number;
    do {
      b = this.buf[this.pos++];
      v += (b & 0x7f) * mul;
      mul *= 128;
    } while (b & 0x80);
    return v;
  }
  int(): number {
    const u = this.uint();
    return u % 2 === 0 ? u / 2 : -(u + 1) / 2;
  }
  points(): Float32Array {
    const n = this.uint();
    const out = new Float32Array(n * 2);
    let qx = 0,
      qy = 0;
    for (let i = 0; i < n; i++) {
      if (i === 0) {
        qx = this.int();
        qy = this.int();
      } else {
        qx += this.int();
        qy += this.int();
      }
      out[i * 2] = qx / Q;
      out[i * 2 + 1] = qy / Q;
    }
    return out;
  }
}

export function encodeMap(g: MapGeometry): Uint8Array {
  const w = new Writer();
  for (const c of MAP_MAGIC) w.byte(c.charCodeAt(0));
  w.uint(MAP_VERSION);
  w.uint(g.width);
  w.uint(g.height);
  w.uint(g.regionCount);
  w.uint(g.arcLeft.length);
  w.uint(g.lods.length);
  w.uint(g.rivers.length);
  for (let i = 0; i < g.arcLeft.length; i++) {
    w.uint(g.arcLeft[i]);
    w.uint(g.arcRight[i]);
  }
  for (const lod of g.lods) for (const arc of lod) w.points(arc);
  for (let r = 1; r <= g.regionCount; r++) {
    const polys = g.polygons[r] ?? [];
    w.uint(polys.length);
    for (const poly of polys) {
      w.uint(poly.length);
      for (const ring of poly) {
        w.uint(ring.length);
        for (const ref of ring) w.int(ref);
      }
    }
  }
  for (const r of g.rivers) {
    w.uint(r.width);
    w.points(r.points);
  }
  return w.bytes();
}

export function decodeMap(bytes: Uint8Array): MapGeometry {
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== MAP_MAGIC) throw new Error('Not a map file');
  const r = new Reader(bytes);
  r.pos = 4;
  const version = r.uint();
  if (version !== MAP_VERSION) throw new Error(`Unsupported map version ${version}`);
  const width = r.uint(),
    height = r.uint(),
    regionCount = r.uint(),
    arcCount = r.uint(),
    lodCount = r.uint(),
    riverCount = r.uint();
  const arcLeft = new Uint16Array(arcCount),
    arcRight = new Uint16Array(arcCount);
  for (let i = 0; i < arcCount; i++) {
    arcLeft[i] = r.uint();
    arcRight[i] = r.uint();
  }
  const lods: Float32Array[][] = [];
  for (let l = 0; l < lodCount; l++) {
    const arcs: Float32Array[] = [];
    for (let i = 0; i < arcCount; i++) arcs.push(r.points());
    lods.push(arcs);
  }
  const polygons: Int32Array[][][] = [[]];
  for (let reg = 1; reg <= regionCount; reg++) {
    const polys: Int32Array[][] = [];
    const pc = r.uint();
    for (let p = 0; p < pc; p++) {
      const rings: Int32Array[] = [];
      const rc = r.uint();
      for (let k = 0; k < rc; k++) {
        const n = r.uint();
        const ring = new Int32Array(n);
        for (let i = 0; i < n; i++) ring[i] = r.int();
        rings.push(ring);
      }
      polys.push(rings);
    }
    polygons.push(polys);
  }
  const rivers: MapGeometry['rivers'] = [];
  for (let i = 0; i < riverCount; i++) {
    const width = r.uint();
    rivers.push({ width, points: r.points() });
  }
  return { width, height, regionCount, arcLeft, arcRight, lods, polygons, rivers };
}

/** Flat ring coordinates (closing point omitted) for a ring of arc refs at a LOD. */
export function ringCoordinates(g: MapGeometry, lod: number, ring: ArrayLike<number>): number[] {
  const out: number[] = [];
  const arcs = g.lods[lod];
  for (let k = 0; k < ring.length; k++) {
    const ref = ring[k];
    const pts = arcs[ref < 0 ? ~ref : ref];
    const n = pts.length / 2;
    if (ref >= 0) for (let i = 0; i < n - 1; i++) out.push(pts[i * 2], pts[i * 2 + 1]);
    else for (let i = n - 1; i > 0; i--) out.push(pts[i * 2], pts[i * 2 + 1]);
  }
  return out;
}
