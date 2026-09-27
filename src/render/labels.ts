/**
 * Map text drawn on a 2D canvas above the WebGL map: curved realm names sized to their territory,
 * province names when zoomed in, and sea names.
 */
import type { RegionData } from '../shared/dataTypes';
import { kmPerPxX, kmPerPxY } from '../shared/projection';
import type { Camera } from './camera';

/** Approximate on-map area (map units²) of a region from its km² area. */
export function mapArea(r: RegionData): number {
  return r.area / Math.max(0.05, kmPerPxX(r.lat) * kmPerPxY(r.lat));
}

export interface LabelLayout {
  text: string;
  /** anchor (label centre on the axis) in map units */
  cx: number;
  cy: number;
  ux: number;
  uy: number;
  /** quadratic baseline s(t) = b*t + c*t² (perpendicular offset along v = (-uy, ux)) */
  b: number;
  c: number;
  /** font size in map units */
  size: number;
}

/**
 * Lays a name along the principal axis of the largest connected block of provinces, bending it
 * to follow the territory.
 */
export function layoutLabel(
  text: string,
  ids: number[],
  region: (id: number) => RegionData,
  worldW: number,
  /** a region whose block is preferred (the capital), unless it is small beside the largest */
  prefer = 0,
): LabelLayout | null {
  if (!ids.length) return null;
  const set = new Set(ids);
  // largest connected component (land links and straits)
  const seen = new Set<number>();
  let best: number[] = [];
  let bestArea = 0;
  let preferred: { comp: number[]; area: number } | null = null;
  for (const start of ids) {
    if (seen.has(start)) continue;
    const comp: number[] = [];
    const stack = [start];
    seen.add(start);
    let area = 0;
    while (stack.length) {
      const id = stack.pop()!;
      comp.push(id);
      area += mapArea(region(id));
      for (const [n] of region(id).adj)
        if (set.has(n) && !seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
    }
    if (area > bestArea) {
      bestArea = area;
      best = comp;
    }
    if (prefer && comp.includes(prefer)) preferred = { comp, area };
  }
  if (preferred && preferred.area >= bestArea * 0.2) best = preferred.comp;
  const refX = region(best[0]).label[0];
  const pts = best.map((id) => {
    const r = region(id);
    let x = r.label[0];
    if (x - refX > worldW / 2) x -= worldW;
    else if (refX - x > worldW / 2) x += worldW;
    const a = mapArea(r);
    return { x, y: r.label[1], w: a, rad: Math.sqrt(a / Math.PI) };
  });
  let W = 0,
    cx = 0,
    cy = 0;
  for (const p of pts) {
    W += p.w;
    cx += p.x * p.w;
    cy += p.y * p.w;
  }
  cx /= W;
  cy /= W;
  let sxx = 0,
    syy = 0,
    sxy = 0;
  for (const p of pts) {
    const dx = p.x - cx,
      dy = p.y - cy;
    sxx += p.w * (dx * dx + p.rad * p.rad * 0.25);
    syy += p.w * (dy * dy + p.rad * p.rad * 0.25);
    sxy += p.w * dx * dy;
  }
  let theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  if (Math.abs(theta) > (62 * Math.PI) / 180) theta = 0; // tall shapes: write across
  theta = Math.max((-42 * Math.PI) / 180, Math.min((42 * Math.PI) / 180, theta));
  // Elongation decides whether the axis matters at all.
  const elong = Math.sqrt(Math.max(sxx, syy) / Math.max(1e-6, Math.min(sxx, syy)));
  if (elong < 1.25) theta *= (elong - 1) / 0.25;
  const ux = Math.cos(theta),
    uy = Math.sin(theta);
  const vx = -uy,
    vy = ux;
  // Along-axis extent and quadratic baseline fit.
  let tmin = Infinity,
    tmax = -Infinity;
  const T: number[] = [],
    S: number[] = [];
  for (const p of pts) {
    const t = (p.x - cx) * ux + (p.y - cy) * uy;
    const s = (p.x - cx) * vx + (p.y - cy) * vy;
    T.push(t);
    S.push(s);
    tmin = Math.min(tmin, t - 0.75 * p.rad);
    tmax = Math.max(tmax, t + 0.75 * p.rad);
  }
  const tmid = (tmin + tmax) / 2;
  const len = tmax - tmin;
  // weighted least squares for s = a + b t' + c t'^2 with t' = t - tmid
  let m00 = 0,
    m01 = 0,
    m02 = 0,
    m11 = 0,
    m12 = 0,
    m22 = 0,
    r0 = 0,
    r1 = 0,
    r2 = 0;
  pts.forEach((p, i) => {
    const t = T[i] - tmid,
      s = S[i],
      w = p.w;
    m00 += w;
    m01 += w * t;
    m02 += w * t * t;
    m11 += w * t * t;
    m12 += w * t * t * t;
    m22 += w * t * t * t * t;
    r0 += w * s;
    r1 += w * s * t;
    r2 += w * s * t * t;
  });
  const sol = solve3([m00, m01, m02, m01, m11, m12, m02, m12, m22], [r0, r1, r2]);
  const [a, b0, c0] = sol ?? [0, 0, 0];
  const maxC = 1.2 / Math.max(1, len);
  const c = Math.max(-maxC, Math.min(maxC, c0));
  const b = Math.max(-0.35, Math.min(0.35, b0));
  // local thickness: spread of residuals + typical province radius
  let res = 0,
    radAvg = 0;
  pts.forEach((p, i) => {
    const t = T[i] - tmid;
    const d = S[i] - (a + b * t + c * t * t);
    res += p.w * d * d;
    radAvg += p.w * p.rad;
  });
  const thickness = 2 * Math.sqrt(res / W) + (radAvg / W) * 1.4;
  const n = Math.max(3, text.length);
  const size = Math.min((len * 0.8) / (n * 0.82), thickness * 0.62);
  if (!(size > 0)) return null;
  const ax = cx + ux * tmid + vx * a,
    ay = cy + uy * tmid + vy * a;
  return { text, cx: ax, cy: ay, ux, uy, b, c, size };
}

function solve3(m: number[], r: number[]): [number, number, number] | null {
  const det = (a: number[]) =>
    a[0] * (a[4] * a[8] - a[5] * a[7]) - a[1] * (a[3] * a[8] - a[5] * a[6]) + a[2] * (a[3] * a[7] - a[4] * a[6]);
  const d = det(m);
  if (Math.abs(d) < 1e-9) return null;
  const col = (k: number) => m.map((v, i) => (i % 3 === k ? r[Math.floor(i / 3)] : v));
  return [det(col(0)) / d, det(col(1)) / d, det(col(2)) / d];
}

const FONT = '"Alegreya SC", "Iowan Old Style", Georgia, serif';
const glyphCache = new Map<string, number[]>();

function glyphWidths(ctx: CanvasRenderingContext2D, text: string): number[] {
  let w = glyphCache.get(text);
  if (!w) {
    ctx.font = `700 100px ${FONT}`;
    w = [...text].map((ch) => ctx.measureText(ch).width / 100);
    glyphCache.set(text, w);
  }
  return w;
}

export interface TextLabel {
  layout: LabelLayout;
  kind: 'realm' | 'vassal' | 'unknown';
}

/** Screen-space rectangles already taken by text, bucketed in a coarse grid. */
class Occupancy {
  private cells = new Map<number, number[]>();
  private rects: number[] = [];
  private static readonly CELL = 96;

  clear() {
    this.cells.clear();
    this.rects.length = 0;
  }

  /** Claims the rectangle if it overlaps nothing placed so far. */
  place(x0: number, y0: number, x1: number, y1: number): boolean {
    const S = Occupancy.CELL;
    const cx0 = Math.floor(x0 / S),
      cx1 = Math.floor(x1 / S),
      cy0 = Math.floor(y0 / S),
      cy1 = Math.floor(y1 / S);
    const r = this.rects;
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++) {
        const list = this.cells.get(cy * 65536 + cx);
        if (list) for (const i of list) if (x0 < r[i + 2] && x1 > r[i] && y0 < r[i + 3] && y1 > r[i + 1]) return false;
      }
    const i = r.length;
    r.push(x0, y0, x1, y1);
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++) {
        const key = cy * 65536 + cx;
        const list = this.cells.get(key);
        if (list) list.push(i);
        else this.cells.set(key, [i]);
      }
    return true;
  }
}

export class LabelLayer {
  private ctx: CanvasRenderingContext2D;
  private occupancy = new Occupancy();
  /** Name widths at 1px font size, per region and font style. */
  private widths = new Map<string, number>();
  realms: TextLabel[] = [];
  /** Regions whose names are not shown (unknown to the viewer). */
  hidden: ((id: number) => boolean) | null = null;
  /** Size of the lettering, with the interface's scale. */
  scale = 1;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private regions: RegionData[],
    private worldW: number,
  ) {
    this.ctx = canvas.getContext('2d')!;
  }

  private nameWidth(ctx: CanvasRenderingContext2D, r: RegionData, style: string): number {
    const key = `${style}|${r.id}`;
    let w = this.widths.get(key);
    if (w === undefined) {
      const font = ctx.font;
      ctx.font = `${style} 100px ${FONT}`;
      w = ctx.measureText(r.name).width / 100;
      ctx.font = font;
      this.widths.set(key, w);
    }
    return w;
  }

  /** Regions of a kind whose on-screen size passes a threshold, largest first. */
  private candidates(
    cam: Camera,
    kind: RegionData['kind'],
    minSize: number,
    toScreen: (x: number, y: number) => [number, number],
    onScreen: (sx: number, sy: number, pad: number) => boolean,
  ) {
    const out: { r: RegionData; sx: number; sy: number; size: number }[] = [];
    for (const r of this.regions) {
      if (r.kind !== kind || this.hidden?.(r.id)) continue;
      const size = Math.sqrt(mapArea(r)) * cam.zoom;
      if (size < minSize) continue;
      const [sx, sy] = toScreen(r.label[0], r.label[1]);
      if (!onScreen(sx, sy, 80)) continue;
      out.push({ r, sx, sy, size });
    }
    return out.sort((a, b) => b.size - a.size);
  }

  /** Forget cached text measurements (after web fonts finish loading). */
  resetMetrics() {
    this.widths.clear();
    glyphCache.clear();
  }

  render(cam: Camera, showProvinceNames: boolean) {
    const ctx = this.ctx;
    if (this.canvas.width !== cam.width || this.canvas.height !== cam.height) {
      this.canvas.width = cam.width;
      this.canvas.height = cam.height;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cam.width, cam.height);
    // Sizes in device pixels: a CSS pixel, grown with the interface.
    const dpr = cam.dpr * this.scale;
    const toScreen = (x: number, y: number): [number, number] => {
      let dx = x - cam.x;
      if (dx > this.worldW / 2) dx -= this.worldW;
      else if (dx < -this.worldW / 2) dx += this.worldW;
      return [dx * cam.zoom + cam.width / 2, (y - cam.y) * cam.zoom + cam.height / 2];
    };
    const onScreen = (sx: number, sy: number, pad: number) =>
      sx > -pad && sy > -pad && sx < cam.width + pad && sy < cam.height + pad;

    // Names never overlap: realm names claim their space first, then seas, then provinces
    // (larger regions before smaller ones).
    const occ = this.occupancy;
    occ.clear();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    // Realm names along their territory: lay out every glyph now, draw them last (on top).
    const glyphs: {
      ch: string;
      sx: number;
      sy: number;
      ang: number;
      px: number;
      alpha: number;
      kind: TextLabel['kind'];
    }[] = [];
    for (const lab of this.realms) {
      const L = lab.layout;
      const px = L.size * cam.zoom;
      const minPx = 10 * dpr,
        maxPx = 150 * dpr;
      if (px < minPx * 0.8 || px > maxPx * 1.3) continue;
      const fadeIn = Math.min(1, (px - minPx * 0.8) / (minPx * 0.5));
      const fadeOut = Math.min(1, (maxPx * 1.3 - px) / (maxPx * 0.3));
      const alpha = Math.min(fadeIn, fadeOut) * (showProvinceNames && cam.zoom > 0.5 ? 0.55 : 0.85);
      if (alpha <= 0.02) continue;
      const [ax, ay] = toScreen(L.cx, L.cy);
      const text = L.text.toUpperCase();
      const widths = glyphWidths(ctx, text);
      const spacing = 0.16; // em
      const total = widths.reduce((sum, w) => sum + w + spacing, -spacing) * L.size; // map units
      const half = total / 2;
      if (!onScreen(ax, ay, half * cam.zoom + 50)) continue;
      const vx = -L.uy,
        vy = L.ux;
      let t = -half;
      for (let i = 0; i < text.length; i++) {
        const gw = widths[i] * L.size;
        const tc = t + gw / 2;
        const sOff = L.b * tc + L.c * tc * tc;
        const slope = L.b + 2 * L.c * tc;
        const [sx, sy] = toScreen(L.cx + L.ux * tc + vx * sOff, L.cy + L.uy * tc + vy * sOff);
        const ang = Math.atan2(L.uy + vy * slope, L.ux + vx * slope);
        glyphs.push({ ch: text[i], sx, sy, ang, px, alpha, kind: lab.kind });
        // Reserve the glyph's box (half the em square is enough: the letters are pale and big).
        if (text[i] !== ' ') {
          const r = px * 0.36;
          occ.place(sx - r, sy - r, sx + r, sy + r);
        }
        t += gw + spacing * L.size;
      }
    }

    // Sea names
    if (cam.zoom > 0.16) {
      const fs = 12 * dpr;
      ctx.font = `italic 700 ${fs}px ${FONT}`;
      ctx.fillStyle = 'rgba(214, 228, 238, 0.62)';
      for (const { r, sx, sy } of this.candidates(cam, 'sea', 150 * dpr, toScreen, onScreen)) {
        const w = this.nameWidth(ctx, r, 'italic 700') * fs;
        if (!occ.place(sx - w / 2, sy - fs * 0.6, sx + w / 2, sy + fs * 0.6)) continue;
        ctx.fillText(r.name, sx, sy);
      }
    }

    // Province names, a little larger for larger provinces
    if (showProvinceNames && cam.zoom > 0.42) {
      let drawn = 0;
      for (const { r, sx, sy, size } of this.candidates(cam, 'land', 60 * dpr, toScreen, onScreen)) {
        const fs = Math.min(15, Math.max(10.5, size / dpr / 9)) * dpr;
        const w = this.nameWidth(ctx, r, '500') * fs;
        if (!occ.place(sx - w / 2 - 2 * dpr, sy - fs * 0.62, sx + w / 2 + 2 * dpr, sy + fs * 0.62)) continue;
        ctx.font = `500 ${fs}px ${FONT}`;
        ctx.lineWidth = 3 * dpr;
        ctx.strokeStyle = 'rgba(240, 230, 205, 0.55)';
        ctx.strokeText(r.name, sx, sy);
        ctx.fillStyle = 'rgba(38, 26, 14, 0.92)';
        ctx.fillText(r.name, sx, sy);
        if (++drawn > 600) break;
      }
    }

    for (const g of glyphs) {
      ctx.font = `700 ${g.px}px ${FONT}`;
      ctx.lineWidth = Math.max(1, g.px * 0.08);
      ctx.save();
      ctx.translate(g.sx, g.sy);
      ctx.rotate(g.ang);
      ctx.globalAlpha = g.alpha;
      ctx.strokeStyle = 'rgba(245, 236, 214, 0.35)';
      ctx.strokeText(g.ch, 0, 0);
      ctx.fillStyle =
        g.kind === 'realm' ? 'rgb(30, 22, 14)' : g.kind === 'unknown' ? 'rgb(112, 84, 52)' : 'rgb(52, 38, 24)';
      ctx.fillText(g.ch, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}
