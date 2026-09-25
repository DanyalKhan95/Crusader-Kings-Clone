/**
 * Exact squared Euclidean distance transform (Felzenszwalb & Huttenlocher), in pixel units.
 * `isSource(idx)` marks distance-0 pixels. Returns squared distances.
 * Horizontal distance wraps around (the map is a cylinder) when `wrapX` is set.
 */
export function squaredEDT(w: number, h: number, isSource: (idx: number) => boolean, wrapX = true): Float32Array {
  const INF = 1e20;
  const d = new Float32Array(w * h);
  // Pass 1: along rows (with wrap handled by tripling the row).
  const rowLen = wrapX ? w * 3 : w;
  const f = new Float64Array(rowLen);
  const out = new Float64Array(rowLen);
  const v = new Int32Array(rowLen);
  const z = new Float64Array(rowLen + 1);
  for (let y = 0; y < h; y++) {
    const base = y * w;
    let any = false;
    for (let x = 0; x < w; x++) {
      const s = isSource(base + x);
      if (s) any = true;
      const val = s ? 0 : INF;
      if (wrapX) {
        f[x] = val;
        f[x + w] = val;
        f[x + 2 * w] = val;
      } else f[x] = val;
    }
    if (!any) {
      for (let x = 0; x < w; x++) d[base + x] = INF;
      continue;
    }
    dt1d(f, rowLen, out, v, z);
    const off = wrapX ? w : 0;
    for (let x = 0; x < w; x++) d[base + x] = out[x + off];
  }
  // Pass 2: along columns.
  const fc = new Float64Array(h);
  const oc = new Float64Array(h);
  const vc = new Int32Array(h);
  const zc = new Float64Array(h + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) fc[y] = d[y * w + x];
    dt1d(fc, h, oc, vc, zc);
    for (let y = 0; y < h; y++) d[y * w + x] = oc[y];
  }
  return d;
}

function dt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dq = q - v[k];
    d[q] = dq * dq + f[v[k]];
  }
}
