/**
 * Scanline polygon fill (even-odd) for projected rings, with horizontal wrap-around.
 * A pixel is inside when its center is inside the polygon.
 */
export type SpanFn = (row: number, x0: number, x1: number) => void;

export function fillRings(rings: Float64Array[], w: number, h: number, span: SpanFn): void {
  let minX = Infinity,
    maxX = -Infinity;
  for (const r of rings)
    for (let i = 0; i < r.length; i += 2) {
      if (r[i] < minX) minX = r[i];
      if (r[i] > maxX) maxX = r[i];
    }
  if (!isFinite(minX)) return;
  const shifts = [0];
  if (minX < 0) shifts.push(w);
  if (maxX > w) shifts.push(-w);
  for (const s of shifts) fillOnce(rings, s, w, h, span);
}

function fillOnce(rings: Float64Array[], shift: number, w: number, h: number, span: SpanFn) {
  // Edge list: rowStart, rowEnd (inclusive), x at rowStart center, dx per row.
  let count = 0;
  for (const r of rings) count += r.length / 2;
  const rs = new Int32Array(count);
  const re = new Int32Array(count);
  const x0s = new Float64Array(count);
  const dxs = new Float64Array(count);
  let n = 0;
  for (const r of rings) {
    const m = r.length / 2;
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      let xa = r[i * 2] + shift,
        ya = r[i * 2 + 1],
        xb = r[j * 2] + shift,
        yb = r[j * 2 + 1];
      if (ya === yb) continue;
      if (ya > yb) {
        [xa, xb] = [xb, xa];
        [ya, yb] = [yb, ya];
      }
      let r0 = Math.ceil(ya - 0.5);
      let r1 = Math.ceil(yb - 0.5) - 1;
      if (r1 < r0) continue;
      const dxdy = (xb - xa) / (yb - ya);
      if (r0 < 0) r0 = 0;
      if (r1 > h - 1) r1 = h - 1;
      if (r1 < r0) continue;
      rs[n] = r0;
      re[n] = r1;
      x0s[n] = xa + (r0 + 0.5 - ya) * dxdy;
      dxs[n] = dxdy;
      n++;
    }
  }
  if (n === 0) return;
  const order = new Int32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  order.sort((a, b) => rs[a] - rs[b]);
  const active: number[] = [];
  let next = 0;
  let xs = new Float64Array(64);
  const firstRow = rs[order[0]];
  for (let row = firstRow; row < h; row++) {
    while (next < n && rs[order[next]] === row) active.push(order[next++]);
    if (active.length === 0) {
      if (next >= n) break;
      row = rs[order[next]] - 1;
      continue;
    }
    if (xs.length < active.length) xs = new Float64Array(active.length * 2);
    let k = 0;
    for (let a = active.length - 1; a >= 0; a--) {
      const e = active[a];
      if (re[e] < row) {
        active[a] = active[active.length - 1];
        active.pop();
        continue;
      }
      xs[k++] = x0s[e] + (row - rs[e]) * dxs[e];
    }
    const sorted = xs.subarray(0, k).sort();
    for (let i = 0; i + 1 < k; i += 2) {
      let c0 = Math.ceil(sorted[i] - 0.5);
      let c1 = Math.ceil(sorted[i + 1] - 0.5) - 1;
      if (c0 < 0) c0 = 0;
      if (c1 > w - 1) c1 = w - 1;
      if (c1 >= c0) span(row, c0, c1);
    }
  }
}

/** Draws a polyline 1px wide (Bresenham-style sampling) with wrap-around. */
export function strokePath(path: Float64Array, w: number, h: number, plot: (x: number, y: number) => void): void {
  for (let i = 0; i + 3 < path.length; i += 2) {
    const x0 = path[i],
      y0 = path[i + 1],
      x1 = path[i + 2],
      y1 = path[i + 3];
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      let x = Math.floor(x0 + (x1 - x0) * t);
      const y = Math.floor(y0 + (y1 - y0) * t);
      if (y < 0 || y >= h) continue;
      x = ((x % w) + w) % w;
      plot(x, y);
    }
  }
}
