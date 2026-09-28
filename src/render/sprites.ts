/**
 * The map's symbols as small pictures, drawn in code for each style into one texture atlas: the
 * manuscript's painted mountains, trees, walled towns and compass rose; the engraver's inked ones;
 * the modern map's town dots. No image files: everything here is paths on a canvas.
 */
import type { MapStyle } from './styles';

export type SpriteName =
  | 'mountain0'
  | 'mountain1'
  | 'mountain2'
  | 'hill0'
  | 'hill1'
  | 'conifer0'
  | 'conifer1'
  | 'broadleaf0'
  | 'broadleaf1'
  | 'palm0'
  | 'palm1'
  | 'town0'
  | 'town1'
  | 'town2'
  | 'capital'
  | 'holy_cross'
  | 'holy_crescent'
  | 'holy_star'
  | 'holy_sun'
  | 'rose';

/** Sprites of a style drawn on a 64 px cell (the rose on a 256 px one). */
type Painter = (ctx: CanvasRenderingContext2D) => void;

const CELL = 64;
const ROSE_CELL = 256;
export const ATLAS_SIZE = 1024;
/** Sprites the atlas can hold (the shader's table of rectangles has this many rows). */
export const MAX_SPRITES = 64;

type Ctx = CanvasRenderingContext2D;

// ── Shared shapes ─────────────────────────────────────────────────

/** The two flanks of a peak rising from (x0, base) to (px, py) and down to (x1, base), bowed a little. */
function flanks(ctx: Ctx, x0: number, x1: number, px: number, py: number, base: number, close: boolean) {
  ctx.beginPath();
  ctx.moveTo(x0, base);
  ctx.quadraticCurveTo((x0 + px) / 2 - 1.5, (base + py) / 2 - 2.5, px, py);
  ctx.quadraticCurveTo((x1 + px) / 2 + 1.5, (base + py) / 2 - 2.5, x1, base);
  if (close) ctx.closePath();
}

/** The shadowed face of a peak: right of a line from the summit to a little right of the middle of its base. */
function shadowFace(ctx: Ctx, x1: number, px: number, py: number, base: number) {
  ctx.beginPath();
  ctx.moveTo(px, py - 1);
  ctx.quadraticCurveTo(px + (x1 - px) * 0.12, (py + base) / 2, px + (x1 - px) * 0.3, base + 1);
  ctx.lineTo(x1 + 4, base + 1);
  ctx.lineTo(x1 + 4, py - 4);
  ctx.closePath();
}

function dome(ctx: Ctx, x0: number, x1: number, top: number, base: number, close: boolean) {
  ctx.beginPath();
  ctx.moveTo(x0, base);
  ctx.bezierCurveTo(x0 + (x1 - x0) * 0.18, top, x0 + (x1 - x0) * 0.82, top, x1, base);
  if (close) ctx.closePath();
}

function star(ctx: Ctx, cx: number, cy: number, points: number, outer: number, inner: number, turn = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = turn + (i * Math.PI) / points;
    const x = cx + Math.cos(a) * r,
      y = cy + Math.sin(a) * r;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

/** Lines across a shape already set as the clip, `gap` apart, at an angle. */
function hatchIn(ctx: Ctx, gap: number, angle: number, width: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  const c = Math.cos(angle),
    s = Math.sin(angle);
  for (let d = -CELL * 1.5; d < CELL * 1.5; d += gap) {
    ctx.beginPath();
    ctx.moveTo(32 + c * -CELL - s * d, 32 + s * -CELL + c * d);
    ctx.lineTo(32 + c * CELL - s * d, 32 + s * CELL + c * d);
    ctx.stroke();
  }
}

// ── Manuscript: painted and inked ─────────────────────────────────

const M_INK = '#3a2a1a';

function mPeak(ctx: Ctx, x0: number, x1: number, px: number, py: number, base: number) {
  flanks(ctx, x0, x1, px, py, base, true);
  const g = ctx.createLinearGradient(x0, py, x1, base);
  g.addColorStop(0, '#eadbb2');
  g.addColorStop(1, '#cdb487');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  shadowFace(ctx, x1, px, py, base);
  ctx.fillStyle = '#a0845c';
  ctx.fill();
  // Brush strokes down the shadowed face.
  ctx.strokeStyle = 'rgba(74, 52, 30, 0.6)';
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'round';
  for (let k = 1; k <= 3; k++) {
    const t = k / 4;
    ctx.beginPath();
    ctx.moveTo(px + (x1 - px) * t * 0.55, py + (base - py) * t * 0.9);
    ctx.lineTo(px + (x1 - px) * (t * 0.55 + 0.18), py + (base - py) * Math.min(1, t * 0.9 + 0.3));
    ctx.stroke();
  }
  ctx.restore();
  flanks(ctx, x0, x1, px, py, base, false);
  ctx.strokeStyle = M_INK;
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

function mHill(ctx: Ctx, x0: number, x1: number, top: number, base: number) {
  dome(ctx, x0, x1, top, base, true);
  const g = ctx.createLinearGradient(x0, top, x1, base);
  g.addColorStop(0, '#e2d9a2');
  g.addColorStop(1, '#c2b27a');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  const mid = (x0 + x1) / 2 + 3;
  ctx.moveTo(mid, top);
  ctx.quadraticCurveTo(mid + 2, (top + base) / 2, mid + 7, base + 2);
  ctx.lineTo(x1 + 3, base + 2);
  ctx.lineTo(x1 + 3, top - 3);
  ctx.closePath();
  ctx.fillStyle = '#a79866';
  ctx.fill();
  ctx.restore();
  dome(ctx, x0, x1, top, base, false);
  ctx.strokeStyle = M_INK;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.stroke();
}

/** A crown of overlapping circles, outlined, shaded on its lower right. */
function crown(
  ctx: Ctx,
  circles: [number, number, number][],
  light: string,
  dark: string,
  ink: string,
  outline: number,
) {
  ctx.fillStyle = ink;
  for (const [x, y, r] of circles) {
    ctx.beginPath();
    ctx.arc(x, y, r + outline, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = light;
  for (const [x, y, r] of circles) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.save();
  ctx.beginPath();
  for (const [x, y, r] of circles) {
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  ctx.clip();
  ctx.fillStyle = dark;
  for (const [x, y, r] of circles) {
    ctx.beginPath();
    ctx.arc(x + r * 0.45, y + r * 0.4, r * 0.85, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function mBroadleaf(ctx: Ctx, v: number) {
  ctx.fillStyle = '#6b4a2b';
  ctx.strokeStyle = M_INK;
  ctx.lineWidth = 1.5;
  ctx.fillRect(29.5, 38, 5, 18);
  ctx.strokeRect(29.5, 38, 5, 18);
  const c: [number, number, number][] = v
    ? [
        [32, 25, 12],
        [22, 33, 8],
        [42, 33, 8],
      ]
    : [
        [32, 27, 13],
        [24, 22, 7],
      ];
  crown(ctx, c, '#78934b', '#546f34', M_INK, 1.8);
}

function mConifer(ctx: Ctx, v: number) {
  ctx.fillStyle = '#6b4a2b';
  ctx.fillRect(30, 48, 4, 9);
  const tiers = v ? 3 : 2;
  for (let i = 0; i < tiers; i++) {
    const top = 8 + i * (v ? 12 : 15),
      base = top + (v ? 22 : 26),
      half = 9 + i * 4;
    ctx.beginPath();
    ctx.moveTo(32, top);
    ctx.lineTo(32 + half, base);
    ctx.lineTo(32 - half, base);
    ctx.closePath();
    ctx.fillStyle = '#5b7540';
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#3e5630';
    ctx.fillRect(33, top, half + 2, base - top + 2);
    ctx.restore();
    ctx.strokeStyle = M_INK;
    ctx.lineWidth = 1.7;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

function palm(ctx: Ctx, v: number, trunk: string, frond: string, ink: string) {
  const top: [number, number] = v ? [36, 20] : [30, 18];
  ctx.lineCap = 'round';
  ctx.strokeStyle = ink;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(v ? 28 : 34, 58);
  ctx.quadraticCurveTo(v ? 26 : 38, 38, top[0], top[1]);
  ctx.stroke();
  ctx.strokeStyle = trunk;
  ctx.lineWidth = 3;
  ctx.stroke();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI + (i / 5) * Math.PI;
    const ex = top[0] + Math.cos(a) * 17,
      ey = top[1] + Math.sin(a) * 9 + 9;
    ctx.beginPath();
    ctx.moveTo(top[0], top[1]);
    ctx.quadraticCurveTo(top[0] + Math.cos(a) * 10, top[1] + Math.sin(a) * 12, ex, ey);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 4.5;
    ctx.stroke();
    ctx.strokeStyle = frond;
    ctx.lineWidth = 2.6;
    ctx.stroke();
  }
}

function mTower(ctx: Ctx, x: number, top: number, w: number, base: number, roof: string) {
  ctx.fillStyle = '#efe5cb';
  ctx.strokeStyle = M_INK;
  ctx.lineWidth = 1.6;
  ctx.fillRect(x, top, w, base - top);
  ctx.fillStyle = '#cdbd98';
  ctx.fillRect(x + w * 0.6, top, w * 0.4, base - top);
  ctx.strokeRect(x, top, w, base - top);
  ctx.beginPath();
  ctx.moveTo(x - 2, top);
  ctx.lineTo(x + w / 2, top - w * 1.1);
  ctx.lineTo(x + w + 2, top);
  ctx.closePath();
  ctx.fillStyle = roof;
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = M_INK;
  ctx.fillRect(x + w / 2 - 1.2, top + (base - top) * 0.35, 2.4, 3.5);
}

function mWall(ctx: Ctx, x0: number, x1: number, top: number, base: number) {
  ctx.fillStyle = '#e8dcc0';
  ctx.strokeStyle = M_INK;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x0, base);
  ctx.lineTo(x0, top);
  const n = Math.round((x1 - x0) / 5);
  for (let i = 0; i < n; i++) {
    const a = x0 + ((x1 - x0) * i) / n,
      b = x0 + ((x1 - x0) * (i + 0.5)) / n,
      c = x0 + ((x1 - x0) * (i + 1)) / n;
    ctx.lineTo(a, top - 3);
    ctx.lineTo(b, top - 3);
    ctx.lineTo(b, top);
    ctx.lineTo(c, top);
  }
  ctx.lineTo(x1, base);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = M_INK;
  ctx.beginPath();
  ctx.arc((x0 + x1) / 2, base, 3.2, Math.PI, 0);
  ctx.fill();
}

const ROOF = '#b3472f';

function mTown(ctx: Ctx, size: number, capital: boolean) {
  if (size === 0) {
    mTower(ctx, 20, 28, 11, 52, ROOF);
    ctx.fillStyle = '#efe5cb';
    ctx.strokeStyle = M_INK;
    ctx.lineWidth = 1.6;
    ctx.fillRect(31, 38, 13, 14);
    ctx.strokeRect(31, 38, 13, 14);
    ctx.beginPath();
    ctx.moveTo(29.5, 38);
    ctx.lineTo(37.5, 30);
    ctx.lineTo(45.5, 38);
    ctx.closePath();
    ctx.fillStyle = ROOF;
    ctx.fill();
    ctx.stroke();
    return;
  }
  mWall(ctx, 9, 55, 40, 54);
  if (size === 1) {
    mTower(ctx, 12, 26, 10, 54, ROOF);
    mTower(ctx, 42, 26, 10, 54, ROOF);
    mTower(ctx, 26, 32, 12, 42, ROOF);
    return;
  }
  mTower(ctx, 8, 28, 10, 54, ROOF);
  mTower(ctx, 46, 28, 10, 54, ROOF);
  mTower(ctx, 26.5, 20, 11, 50, capital ? '#c9a13b' : ROOF);
  if (capital) {
    // A gilt crown over the chief city.
    ctx.fillStyle = '#d9b44a';
    ctx.strokeStyle = M_INK;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(24, 10);
    ctx.lineTo(26, 3);
    ctx.lineTo(29, 7);
    ctx.lineTo(32, 1);
    ctx.lineTo(35, 7);
    ctx.lineTo(38, 3);
    ctx.lineTo(40, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

/** A roundel with a faith's sign in it. */
function holy(ctx: Ctx, sign: string, fill: string, rim: string, ink: string, signColor: string) {
  ctx.beginPath();
  ctx.arc(32, 32, 15, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = rim;
  ctx.stroke();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = ink;
  ctx.beginPath();
  ctx.arc(32, 32, 16.8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = signColor;
  ctx.strokeStyle = signColor;
  if (sign === 'cross') {
    ctx.fillRect(29.8, 21, 4.4, 22);
    ctx.fillRect(24, 26.5, 16, 4.4);
  } else if (sign === 'crescent') {
    ctx.beginPath();
    ctx.arc(31, 32, 9.5, 0, Math.PI * 2);
    ctx.arc(35, 30, 8, 0, Math.PI * 2, true);
    ctx.fill('evenodd');
  } else if (sign === 'star') {
    ctx.lineWidth = 2;
    for (const turn of [-Math.PI / 2, Math.PI / 2]) {
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = turn + (i * 2 * Math.PI) / 3;
        const x = 32 + Math.cos(a) * 10,
          y = 32 + Math.sin(a) * 10;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
  } else {
    ctx.beginPath();
    ctx.arc(32, 32, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(32 + Math.cos(a) * 7, 32 + Math.sin(a) * 7);
      ctx.lineTo(32 + Math.cos(a) * 11, 32 + Math.sin(a) * 11);
      ctx.stroke();
    }
  }
}

/** A point of a compass rose: a kite from the centre, its left half light and its right half dark. */
function rosePoint(ctx: Ctx, angle: number, len: number, half: number, light: string, dark: string, ink: string) {
  const c = ROSE_CELL / 2;
  const tip: [number, number] = [c + Math.cos(angle) * len, c + Math.sin(angle) * len];
  const l: [number, number] = [c + Math.cos(angle - Math.PI / 2) * half, c + Math.sin(angle - Math.PI / 2) * half];
  const r: [number, number] = [c + Math.cos(angle + Math.PI / 2) * half, c + Math.sin(angle + Math.PI / 2) * half];
  ctx.beginPath();
  ctx.moveTo(c, c);
  ctx.lineTo(...l);
  ctx.lineTo(...tip);
  ctx.closePath();
  ctx.fillStyle = light;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(c, c);
  ctx.lineTo(...r);
  ctx.lineTo(...tip);
  ctx.closePath();
  ctx.fillStyle = dark;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(...l);
  ctx.lineTo(...tip);
  ctx.lineTo(...r);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.4;
  ctx.lineJoin = 'miter';
  ctx.stroke();
}

function fleur(ctx: Ctx, x: number, y: number, s: number, fill: string, ink: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.bezierCurveTo(5, -7, 4, -1, 0, 3);
  ctx.bezierCurveTo(-4, -1, -5, -7, 0, -12);
  ctx.moveTo(-1, 0);
  ctx.bezierCurveTo(-7, -6, -12, -2, -9, 3);
  ctx.bezierCurveTo(-7, 0, -4, 1, -1, 3);
  ctx.moveTo(1, 0);
  ctx.bezierCurveTo(7, -6, 12, -2, 9, 3);
  ctx.bezierCurveTo(7, 0, 4, 1, 1, 3);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1 / s;
  ctx.stroke();
  ctx.fillRect(-6, 3, 12, 2.5);
  ctx.restore();
}

function mRose(ctx: Ctx) {
  const c = ROSE_CELL / 2;
  ctx.strokeStyle = 'rgba(58, 42, 26, 0.9)';
  ctx.lineWidth = 1.4;
  for (const r of [74, 80]) {
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(232, 220, 190, 0.55)';
  ctx.beginPath();
  ctx.arc(c, c, 77, 0, Math.PI * 2);
  ctx.fill();
  // Quarter winds, half winds, then the eight winds in the portolans' colours.
  for (let i = 0; i < 16; i++)
    rosePoint(ctx, ((i + 0.5) * Math.PI) / 8 - Math.PI / 2, 56, 7, '#9fbf86', '#4f7a3a', M_INK);
  for (let i = 0; i < 8; i++)
    rosePoint(ctx, ((i + 0.5) * Math.PI) / 4 - Math.PI / 2, 78, 12, '#7aa0c8', '#2f5d8a', M_INK);
  for (let i = 0; i < 4; i++)
    rosePoint(
      ctx,
      (i * Math.PI) / 2 - Math.PI / 2,
      112,
      18,
      i === 0 ? '#d65a44' : '#e6c46a',
      i === 0 ? '#9c2f22' : '#b58a2a',
      M_INK,
    );
  ctx.beginPath();
  ctx.arc(c, c, 9, 0, Math.PI * 2);
  ctx.fillStyle = '#d9b44a';
  ctx.fill();
  ctx.strokeStyle = M_INK;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  fleur(ctx, c, c - 118, 1.6, '#b53a2c', M_INK);
  // The east is marked with a cross, towards Jerusalem.
  ctx.fillStyle = '#9c2f22';
  ctx.fillRect(c + 112, c - 9, 4, 18);
  ctx.fillRect(c + 106, c - 2, 16, 4);
}

// ── Engraved: ink on paper ────────────────────────────────────────

const E_INK = '#231c15';
const PAPER = '#f4efdf';

function ePeak(ctx: Ctx, x0: number, x1: number, px: number, py: number, base: number) {
  flanks(ctx, x0, x1, px, py, base, true);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.save();
  ctx.clip();
  shadowFace(ctx, x1, px, py, base);
  ctx.clip();
  hatchIn(ctx, 3.2, Math.PI * 0.36, 1.1, E_INK);
  ctx.restore();
  // Short strokes down the lit flank.
  ctx.strokeStyle = E_INK;
  ctx.lineWidth = 0.9;
  for (let k = 1; k <= 2; k++) {
    const t = k / 3;
    const x = px - (px - x0) * t * 0.7,
      y = py + (base - py) * t * 0.7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 3, y + 7);
    ctx.stroke();
  }
  flanks(ctx, x0, x1, px, py, base, false);
  ctx.strokeStyle = E_INK;
  ctx.lineWidth = 1.8;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function eHill(ctx: Ctx, x0: number, x1: number, top: number, base: number) {
  dome(ctx, x0, x1, top, base, true);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  ctx.rect((x0 + x1) / 2 + 2, top - 2, x1, base);
  ctx.clip();
  hatchIn(ctx, 3.2, Math.PI * 0.36, 1, E_INK);
  ctx.restore();
  dome(ctx, x0, x1, top, base, false);
  ctx.strokeStyle = E_INK;
  ctx.lineWidth = 1.6;
  ctx.stroke();
}

function eBroadleaf(ctx: Ctx, v: number) {
  ctx.strokeStyle = E_INK;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(32, 56);
  ctx.lineTo(32, 36);
  ctx.stroke();
  const r = v ? 12 : 10.5;
  ctx.beginPath();
  ctx.arc(32, 28, r, 0, Math.PI * 2);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  ctx.arc(38, 33, r, 0, Math.PI * 2);
  ctx.clip();
  hatchIn(ctx, 2.8, Math.PI / 2, 1, E_INK);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(32, 28, r, 0, Math.PI * 2);
  ctx.lineWidth = 1.7;
  ctx.stroke();
}

function eConifer(ctx: Ctx, v: number) {
  ctx.strokeStyle = E_INK;
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.moveTo(32, 57);
  ctx.lineTo(32, 46);
  ctx.stroke();
  const top = v ? 8 : 12;
  ctx.beginPath();
  ctx.moveTo(32, top);
  ctx.lineTo(44, 47);
  ctx.lineTo(20, 47);
  ctx.closePath();
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  ctx.rect(32, 0, 20, 64);
  ctx.clip();
  hatchIn(ctx, 2.8, Math.PI / 2, 1, E_INK);
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(32, top);
  ctx.lineTo(44, 47);
  ctx.lineTo(20, 47);
  ctx.closePath();
  ctx.stroke();
}

function eTown(ctx: Ctx, size: number, capital: boolean) {
  ctx.save();
  // Drawn small and scaled up: the marks of an engraved map are bold for their size.
  ctx.translate(32, 36);
  ctx.scale(1.45, 1.45);
  ctx.translate(-32, -36);
  ctx.strokeStyle = E_INK;
  ctx.fillStyle = E_INK;
  const r = [6, 7.5, 9, 10][capital ? 3 : size];
  const cy = size === 0 && !capital ? 34 : 38;
  if (size > 0 || capital) {
    // A church tower over the town's circle.
    ctx.lineWidth = 1.4;
    ctx.strokeRect(29.5, cy - r - 13, 5, 13);
    ctx.beginPath();
    ctx.moveTo(28.5, cy - r - 13);
    ctx.lineTo(32, cy - r - 21);
    ctx.lineTo(35.5, cy - r - 13);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(32, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.lineWidth = 2.2;
  ctx.stroke();
  ctx.fillStyle = E_INK;
  if (capital) {
    ctx.beginPath();
    ctx.arc(32, cy, r + 3.5, 0, Math.PI * 2);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    star(ctx, 32, cy, 5, 7, 3);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(32, cy, size === 2 ? 4 : 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function eRose(ctx: Ctx) {
  const c = ROSE_CELL / 2;
  ctx.strokeStyle = E_INK;
  for (const [r, w] of [
    [70, 1.2],
    [76, 2],
    [84, 1],
  ]) {
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Degrees ticked round the ring.
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 72; i++) {
    const a = (i * Math.PI) / 36;
    const k = i % 2 ? 80 : 78;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * k, c + Math.sin(a) * k);
    ctx.lineTo(c + Math.cos(a) * 84, c + Math.sin(a) * 84);
    ctx.stroke();
  }
  for (let i = 0; i < 16; i++) rosePoint(ctx, ((i + 0.5) * Math.PI) / 8 - Math.PI / 2, 60, 6, PAPER, E_INK, E_INK);
  for (let i = 0; i < 4; i++)
    rosePoint(ctx, (i * Math.PI) / 2 + Math.PI / 4 - Math.PI / 2, 84, 11, PAPER, E_INK, E_INK);
  for (let i = 0; i < 4; i++) rosePoint(ctx, (i * Math.PI) / 2 - Math.PI / 2, 116, 15, PAPER, E_INK, E_INK);
  ctx.beginPath();
  ctx.arc(c, c, 6, 0, Math.PI * 2);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.stroke();
  fleur(ctx, c, c - 120, 1.5, E_INK, E_INK);
}

// ── Modern: clean marks ───────────────────────────────────────────

function nTown(ctx: Ctx, size: number, capital: boolean) {
  const r = [11, 13, 15][size] ?? 16;
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#2a2a2a';
  if (capital) {
    ctx.beginPath();
    ctx.arc(32, 32, 14, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.stroke();
    star(ctx, 32, 33, 5, 10.5, 4.5);
    ctx.fillStyle = '#b3261e';
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.arc(32, 32, r, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.stroke();
  if (size === 2) {
    ctx.beginPath();
    ctx.arc(32, 32, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#2a2a2a';
    ctx.fill();
  }
}

function nHoly(ctx: Ctx) {
  star(ctx, 32, 33, 5, 11, 4.6);
  ctx.fillStyle = '#e0b43a';
  ctx.fill();
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = '#3a2a10';
  ctx.stroke();
}

// ── The atlas ─────────────────────────────────────────────────────

const HOLY_SIGNS = { holy_cross: 'cross', holy_crescent: 'crescent', holy_star: 'star', holy_sun: 'sun' } as const;

/** What each style draws for each sprite (a style may leave some out). */
const PAINTERS: Record<MapStyle, Partial<Record<SpriteName, Painter>>> = {
  manuscript: {
    mountain0: (c) => mPeak(c, 5, 59, 32, 7, 58),
    mountain1: (c) => {
      mPeak(c, 22, 62, 43, 12, 56);
      mPeak(c, 2, 46, 23, 9, 58);
    },
    mountain2: (c) => {
      mPeak(c, 1, 33, 16, 20, 56);
      mPeak(c, 31, 63, 48, 17, 56);
      mPeak(c, 12, 52, 32, 6, 58);
    },
    hill0: (c) => mHill(c, 6, 58, 30, 56),
    hill1: (c) => {
      mHill(c, 26, 62, 36, 54);
      mHill(c, 2, 42, 32, 56);
    },
    conifer0: (c) => mConifer(c, 0),
    conifer1: (c) => mConifer(c, 1),
    broadleaf0: (c) => mBroadleaf(c, 0),
    broadleaf1: (c) => mBroadleaf(c, 1),
    palm0: (c) => palm(c, 0, '#7a5a35', '#6a9444', M_INK),
    palm1: (c) => palm(c, 1, '#7a5a35', '#6a9444', M_INK),
    town0: (c) => mTown(c, 0, false),
    town1: (c) => mTown(c, 1, false),
    town2: (c) => mTown(c, 2, false),
    capital: (c) => mTown(c, 2, true),
    ...(Object.fromEntries(
      Object.entries(HOLY_SIGNS).map(([name, sign]) => [
        name,
        (c: Ctx) => holy(c, sign, '#efe3c2', '#c9a13b', M_INK, sign === 'star' ? '#2f5d8a' : '#9c2f22'),
      ]),
    ) as Record<keyof typeof HOLY_SIGNS, Painter>),
    rose: mRose,
  },
  engraved: {
    mountain0: (c) => ePeak(c, 5, 59, 32, 8, 58),
    mountain1: (c) => {
      ePeak(c, 22, 62, 43, 13, 56);
      ePeak(c, 2, 46, 23, 10, 58);
    },
    mountain2: (c) => {
      ePeak(c, 1, 33, 16, 21, 56);
      ePeak(c, 31, 63, 48, 18, 56);
      ePeak(c, 12, 52, 32, 7, 58);
    },
    hill0: (c) => eHill(c, 8, 56, 32, 56),
    hill1: (c) => {
      eHill(c, 26, 62, 38, 54);
      eHill(c, 2, 42, 34, 56);
    },
    conifer0: (c) => eConifer(c, 0),
    conifer1: (c) => eConifer(c, 1),
    broadleaf0: (c) => eBroadleaf(c, 0),
    broadleaf1: (c) => eBroadleaf(c, 1),
    palm0: (c) => palm(c, 0, PAPER, PAPER, E_INK),
    palm1: (c) => palm(c, 1, PAPER, PAPER, E_INK),
    town0: (c) => eTown(c, 0, false),
    town1: (c) => eTown(c, 1, false),
    town2: (c) => eTown(c, 2, false),
    capital: (c) => eTown(c, 2, true),
    ...(Object.fromEntries(
      Object.entries(HOLY_SIGNS).map(([name, sign]) => [name, (c: Ctx) => holy(c, sign, PAPER, E_INK, E_INK, E_INK)]),
    ) as Record<keyof typeof HOLY_SIGNS, Painter>),
    rose: eRose,
  },
  modern: {
    town0: (c) => nTown(c, 0, false),
    town1: (c) => nTown(c, 1, false),
    town2: (c) => nTown(c, 2, false),
    capital: (c) => nTown(c, 2, true),
    holy_cross: nHoly,
    holy_crescent: nHoly,
    holy_star: nHoly,
    holy_sun: nHoly,
  },
};

export interface Atlas {
  canvas: HTMLCanvasElement;
  /** u0, v0, u1, v1 of each sprite */
  rects: Float32Array;
  /** sprite of a style and name, or -1 if the style has none */
  index(style: MapStyle, name: SpriteName): number;
}

/** Paints every sprite of every style into one canvas. */
export function paintAtlas(): Atlas {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext('2d')!;
  const rects: number[] = [];
  const table = new Map<string, number>();
  let cell = 0;
  let roseX = 0;
  const pad = 1;
  for (const [style, painters] of Object.entries(PAINTERS) as [MapStyle, Partial<Record<SpriteName, Painter>>][]) {
    for (const [name, paint] of Object.entries(painters) as [SpriteName, Painter][]) {
      let x: number, y: number, size: number;
      if (name === 'rose') {
        size = ROSE_CELL;
        x = roseX;
        y = ATLAS_SIZE - ROSE_CELL;
        roseX += ROSE_CELL;
      } else {
        size = CELL;
        x = (cell % 16) * CELL;
        y = Math.floor(cell / 16) * CELL;
        cell++;
      }
      ctx.save();
      ctx.translate(x, y);
      ctx.beginPath();
      ctx.rect(0, 0, size, size);
      ctx.clip();
      paint(ctx);
      ctx.restore();
      table.set(`${style}:${name}`, rects.length / 4);
      rects.push(
        (x + pad) / ATLAS_SIZE,
        (y + pad) / ATLAS_SIZE,
        (x + size - pad) / ATLAS_SIZE,
        (y + size - pad) / ATLAS_SIZE,
      );
    }
  }
  if (rects.length / 4 > MAX_SPRITES) throw new Error('Too many map sprites for the atlas');
  return {
    canvas,
    rects: new Float32Array(rects),
    index: (style, name) => table.get(`${style}:${name}`) ?? -1,
  };
}
