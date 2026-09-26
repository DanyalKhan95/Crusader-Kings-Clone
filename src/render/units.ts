/**
 * Armies, battles and sieges drawn on a 2D canvas over the map: a banner per army with the owner's
 * arms and strength, dashed routes for marching armies, crossed swords where battles rage and a
 * siege tower with a progress bar where walls are under attack.
 */
import { ICONS, type IconName } from '../assets/icons';
import type { RegionData } from '../shared/dataTypes';
import { marchFraction } from '../sim/military';
import { armySize, atWar } from '../sim/queries';
import type { Army, GameState } from '../sim/types';
import type { Camera } from './camera';

const FONT = '"Alegreya SC", "Iowan Old Style", Georgia, serif';

const iconPaths = new Map<IconName, Path2D[]>();
function iconPath(name: IconName): Path2D[] {
  let p = iconPaths.get(name);
  if (!p) {
    p = [...ICONS[name].matchAll(/ d="([^"]+)"/g)].map((m) => new Path2D(m[1]));
    iconPaths.set(name, p);
  }
  return p;
}

function drawIcon(ctx: CanvasRenderingContext2D, name: IconName, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(size / 512, size / 512);
  ctx.fillStyle = color;
  for (const p of iconPath(name)) ctx.fill(p);
  ctx.restore();
}

export function formatMen(n: number): string {
  if (n >= 9950) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 10) * 10}`;
}

interface Hit {
  id: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface UnitStyle {
  /** coat-of-arms image for a country, or null while it loads */
  arms(country: number): HTMLImageElement | null;
  color(country: number): string;
}

export class UnitLayer {
  private ctx: CanvasRenderingContext2D;
  private hits: Hit[] = [];

  constructor(
    readonly canvas: HTMLCanvasElement,
    private region: (id: number) => RegionData,
    private worldW: number,
  ) {
    this.ctx = canvas.getContext('2d')!;
  }

  /** Army under a screen point (CSS px), topmost first. */
  hit(x: number, y: number, dpr: number): number {
    const px = x * dpr,
      py = y * dpr;
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      if (px >= h.x0 && px <= h.x1 && py >= h.y0 && py <= h.y1) return h.id;
    }
    return 0;
  }

  render(cam: Camera, state: GameState, selected: number, style: UnitStyle) {
    const ctx = this.ctx;
    if (this.canvas.width !== cam.width || this.canvas.height !== cam.height) {
      this.canvas.width = cam.width;
      this.canvas.height = cam.height;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cam.width, cam.height);
    this.hits = [];
    const dpr = cam.dpr;
    const W = this.worldW;
    const toScreen = (x: number, y: number): [number, number] => {
      let dx = x - cam.x;
      dx -= Math.round(dx / W) * W;
      return [dx * cam.zoom + cam.width / 2, (y - cam.y) * cam.zoom + cam.height / 2];
    };
    const at = (id: number) => this.region(id).label;
    const lerpPoint = (a: [number, number], b: [number, number], f: number): [number, number] => {
      let dx = b[0] - a[0];
      dx -= Math.round(dx / W) * W;
      return [a[0] + dx * f, a[1] + (b[1] - a[1]) * f];
    };
    const onScreen = (sx: number, sy: number, pad = 60 * dpr) =>
      sx > -pad && sy > -pad && sx < cam.width + pad && sy < cam.height + pad;

    // Sieges
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (cam.zoom > 0.14)
      state.provinces.forEach((p, id) => {
        if (!p?.siege || p.siege.progress <= 0) return;
        const [sx, sy] = toScreen(...at(id));
        if (!onScreen(sx, sy)) return;
        const r = 11 * dpr;
        ctx.fillStyle = 'rgba(20, 14, 9, 0.85)';
        ctx.beginPath();
        ctx.arc(sx, sy - 26 * dpr, r, 0, Math.PI * 2);
        ctx.fill();
        drawIcon(ctx, 'siege-tower', sx, sy - 26 * dpr, 15 * dpr, '#ecd18c');
        ctx.strokeStyle = style.color(p.siege.by);
        ctx.lineWidth = 3 * dpr;
        ctx.beginPath();
        ctx.arc(
          sx,
          sy - 26 * dpr,
          r + 2 * dpr,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * Math.min(1, p.siege.progress),
        );
        ctx.stroke();
      });

    // Routes of our armies and of the selected one
    const armies = state.armies;
    for (const a of armies) {
      if (!a.path.length || (a.owner !== state.player && a.id !== selected)) continue;
      const hostile = a.owner !== state.player && atWar(state, a.owner, state.player);
      const pts: [number, number][] = [lerpPoint(at(a.location), at(a.path[0]), marchFraction(a))];
      let prev = at(a.location);
      for (const id of a.path) {
        const p = lerpPoint(prev, at(id), 1);
        pts.push(p);
        prev = p;
      }
      ctx.setLineDash([6 * dpr, 5 * dpr]);
      ctx.lineWidth = (a.id === selected ? 2.4 : 1.6) * dpr;
      ctx.strokeStyle = hostile
        ? 'rgba(220, 80, 60, 0.9)'
        : a.id === selected
          ? 'rgba(243, 204, 106, 0.95)'
          : 'rgba(236, 209, 140, 0.6)';
      ctx.beginPath();
      pts.forEach((p, i) => {
        const [sx, sy] = toScreen(p[0], p[1]);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.stroke();
      ctx.setLineDash([]);
      const [ex, ey] = toScreen(...pts[pts.length - 1]);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.arc(ex, ey, 4 * dpr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Battles
    for (const b of state.battles) {
      const [sx, sy] = toScreen(...at(b.province));
      if (!onScreen(sx, sy)) continue;
      const r = 14 * dpr;
      ctx.fillStyle = 'rgba(125, 35, 29, 0.95)';
      ctx.strokeStyle = '#ecd18c';
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      ctx.arc(sx, sy - 30 * dpr, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      drawIcon(ctx, 'crossed-swords', sx, sy - 30 * dpr, 18 * dpr, '#fbeccc');
      // Strength bar: attacker vs defender
      const men = (ids: number[]) =>
        ids.reduce((s, id) => s + armySize(armies.find((a) => a.id === id) ?? ({ units: {} } as Army)), 0);
      const ma = men(b.attacker.armies),
        md = men(b.defender.armies);
      const w = 44 * dpr,
        h = 5 * dpr,
        x0 = sx - w / 2,
        y0 = sy - 30 * dpr + r + 4 * dpr;
      const f = ma + md > 0 ? ma / (ma + md) : 0.5;
      ctx.fillStyle = style.color(b.attacker.country);
      ctx.fillRect(x0, y0, w * f, h);
      ctx.fillStyle = style.color(b.defender.country);
      ctx.fillRect(x0 + w * f, y0, w * (1 - f), h);
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1 * dpr;
      ctx.strokeRect(x0, y0, w, h);
    }

    // Army banners, stacked where several stand together
    const stack = new Map<string, number>();
    const small = cam.zoom < 0.22;
    const order = [...armies].sort((a, b) => (a.id === selected ? 1 : 0) - (b.id === selected ? 1 : 0));
    ctx.font = `700 ${12 * dpr}px ${FONT}`;
    for (const a of order) {
      const mine = a.owner === state.player;
      const size = armySize(a);
      if (!mine && a.id !== selected && (cam.zoom < 0.1 || (small && size < 3000))) continue;
      const pos = a.path.length ? lerpPoint(at(a.location), at(a.path[0]), marchFraction(a)) : at(a.location);
      let [sx, sy] = toScreen(pos[0], pos[1]);
      if (!onScreen(sx, sy)) continue;
      const key = `${Math.round(sx / (30 * dpr))}:${Math.round(sy / (18 * dpr))}`;
      const n = stack.get(key) ?? 0;
      stack.set(key, n + 1);
      sy += n * 22 * dpr;
      sx += 0;
      const text = formatMen(size);
      const tw = ctx.measureText(text).width;
      const h = 20 * dpr,
        armsW = 15 * dpr,
        pad = 5 * dpr;
      const w = armsW + tw + pad * 3;
      const x0 = sx - w / 2,
        y0 = sy - h / 2;
      const isSel = a.id === selected;
      const hostile = !mine && atWar(state, a.owner, state.player);
      ctx.fillStyle = a.retreating ? 'rgba(40, 30, 24, 0.75)' : 'rgba(24, 18, 12, 0.92)';
      ctx.strokeStyle = isSel ? '#f3cc6a' : mine ? '#cfa65c' : hostile ? '#c0493f' : 'rgba(205, 164, 90, 0.45)';
      ctx.lineWidth = (isSel ? 2.4 : 1.2) * dpr;
      ctx.beginPath();
      ctx.roundRect(x0, y0, w, h, 3 * dpr);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = style.color(a.owner);
      ctx.fillRect(x0 + 1.5 * dpr, y0 + 1.5 * dpr, 3 * dpr, h - 3 * dpr);
      const img = style.arms(a.owner);
      if (img) ctx.drawImage(img, x0 + pad + 1 * dpr, y0 + 2 * dpr, armsW - 2 * dpr, (armsW - 2 * dpr) * 1.2);
      ctx.fillStyle = a.retreating ? '#ad9b7c' : '#ecdfc5';
      ctx.textAlign = 'left';
      ctx.fillText(text, x0 + pad * 2 + armsW - 2 * dpr, sy + 1 * dpr);
      ctx.textAlign = 'center';
      // morale pip
      ctx.fillStyle = a.morale > 0.66 ? '#7fa34a' : a.morale > 0.33 ? '#d8b35c' : '#c0493f';
      ctx.fillRect(x0 + 5 * dpr, y0 + h - 3 * dpr, (w - 10 * dpr) * a.morale, 2 * dpr);
      this.hits.push({ id: a.id, x0, y0, x1: x0 + w, y1: y0 + h });
    }
  }
}
