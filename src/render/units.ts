/**
 * Armies, fleets, battles and sieges drawn on a 2D canvas over the map: a banner per army with the
 * owner's arms and strength, a pennant per fleet with its ships, dashed routes for those on the move,
 * crossed swords where battles rage on land and at sea, and a siege tower with a progress bar where
 * walls are under attack. Far out, each realm's armies and fleets close together share one marker;
 * the player chooses whose are shown, and foreign fleets in port stay out of sight unless at war.
 */
import { ICONS, type IconName } from '../assets/icons';
import type { RegionData } from '../shared/dataTypes';
import { marchFraction } from '../sim/military';
import { fleetSize, shipLook } from '../sim/naval';
import { armySize, atWar, topLiege } from '../sim/queries';
import type { Army, Fleet, GameState } from '../sim/types';
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

export interface UnitHit {
  kind: 'army' | 'fleet';
  id: number;
}

interface Hit extends UnitHit {
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

/** What the map shows of the armies and fleets, and how the player sees them. */
export interface UnitView {
  selectedArmy: number;
  selectedFleet: number;
  /** regions the viewer does not know: nothing of others is drawn there */
  hidden: ((id: number) => boolean) | null;
  /** whether a realm's armies and fleets are on the map (the layers the player shows) */
  shows: (owner: number) => boolean;
  /** foreign fleets lying in port, when they are not at war with the viewer */
  portFleets: boolean;
}

/** Below this zoom a realm's armies, or fleets, close together on screen share one marker. */
export const FAR_ZOOM = 0.22;

/** An army or fleet on screen: one of them, or far out all of a realm's on a patch of the screen. */
export interface Marker<T> {
  /** the largest of them, whose place, look and selection the marker takes */
  lead: T;
  leadSize: number;
  /** whose arms and colour it shows */
  owner: number;
  total: number;
  count: number;
  sx: number;
  sy: number;
}

/** Gathers what is on screen into markers: far out, by realm and patch of the screen. */
export function gather<T extends { id: number; owner: number }>(
  list: { item: T; size: number; realm: number; sx: number; sy: number; alone: boolean }[],
  far: boolean,
  cellW: number,
  cellH: number,
): Marker<T>[] {
  const out = new Map<string, Marker<T>>();
  for (const { item, size, realm, sx, sy, alone } of list) {
    const key = far && !alone ? `${realm}:${Math.round(sx / cellW)}:${Math.round(sy / cellH)}` : `one:${item.id}`;
    const m = out.get(key);
    if (!m)
      out.set(key, {
        lead: item,
        leadSize: size,
        owner: far && !alone ? realm : item.owner,
        total: size,
        count: 1,
        sx,
        sy,
      });
    else {
      m.total += size;
      m.count++;
      if (size > m.leadSize) Object.assign(m, { lead: item, leadSize: size, sx, sy });
    }
  }
  return [...out.values()];
}

export class UnitLayer {
  private ctx: CanvasRenderingContext2D;
  private hits: Hit[] = [];
  /** Size of the banners, with the interface's scale. */
  scale = 1;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private region: (id: number) => RegionData,
    private worldW: number,
  ) {
    this.ctx = canvas.getContext('2d')!;
  }

  /** Army or fleet under a screen point (CSS px), topmost first. */
  hit(x: number, y: number, dpr: number): UnitHit | null {
    const px = x * dpr,
      py = y * dpr;
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      if (px >= h.x0 && px <= h.x1 && py >= h.y0 && py <= h.y1) return { kind: h.kind, id: h.id };
    }
    return null;
  }

  private ports = new Map<number, [number, number]>();

  /** Where a fleet lying in port is drawn: off the coast, between the province and its sea. */
  private portPoint(id: number): [number, number] {
    let p = this.ports.get(id);
    if (!p) {
      const r = this.region(id);
      let sea: RegionData | null = null,
        best = -1;
      for (const [n, km] of r.adj) {
        const o = this.region(n);
        if (o.kind !== 'land' && km > best) {
          best = km;
          sea = o;
        }
      }
      if (!sea) p = r.label;
      else {
        let dx = sea.label[0] - r.label[0];
        dx -= Math.round(dx / this.worldW) * this.worldW;
        const d = Math.hypot(dx, sea.label[1] - r.label[1]) || 1;
        const k = Math.min(0.45, 60 / d);
        p = [r.label[0] + dx * k, r.label[1] + (sea.label[1] - r.label[1]) * k];
      }
      this.ports.set(id, p);
    }
    return p;
  }

  render(cam: Camera, state: GameState, style: UnitStyle, view: UnitView) {
    const ctx = this.ctx;
    const { selectedArmy: selected, hidden } = view;
    if (this.canvas.width !== cam.width || this.canvas.height !== cam.height) {
      this.canvas.width = cam.width;
      this.canvas.height = cam.height;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cam.width, cam.height);
    this.hits = [];
    // Sizes in device pixels: a CSS pixel, grown with the interface.
    const dpr = cam.dpr * this.scale;
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
        if (!p?.siege || p.siege.progress <= 0 || hidden?.(id)) return;
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
      if (hidden?.(b.province)) continue;
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

    // Army banners: one for each army close in; far out, one for each realm on each patch of the
    // screen, with the men of all its armies there. Banners side by side stack.
    const far = cam.zoom < FAR_ZOOM;
    const onMap: { item: Army; size: number; realm: number; sx: number; sy: number; alone: boolean }[] = [];
    for (const a of armies) {
      const mine = a.owner === state.player;
      const isSel = a.id === selected;
      if (!isSel && !view.shows(a.owner)) continue;
      if (!mine && hidden?.(a.location)) continue;
      const pos = a.path.length ? lerpPoint(at(a.location), at(a.path[0]), marchFraction(a)) : at(a.location);
      const [sx, sy] = toScreen(pos[0], pos[1]);
      if (!onScreen(sx, sy)) continue;
      // The player's own armies gather under the player's arms, even in a liege's realm.
      const realm = mine ? a.owner : topLiege(state, a.owner);
      onMap.push({ item: a, size: armySize(a), realm, sx, sy, alone: isSel });
    }
    const banners = gather(onMap, far, 110 * dpr, 44 * dpr)
      .filter(
        (m) =>
          m.lead.owner === state.player || m.lead.id === selected || (cam.zoom >= 0.1 && (!far || m.total >= 3000)),
      )
      .sort((a, b) => (a.lead.id === selected ? 1 : 0) - (b.lead.id === selected ? 1 : 0));
    const stack = new Map<string, number>();
    ctx.font = `700 ${12 * dpr}px ${FONT}`;
    for (const m of banners) {
      const a = m.lead;
      const mine = a.owner === state.player;
      const { sx } = m;
      const key = `${Math.round(sx / (30 * dpr))}:${Math.round(m.sy / (18 * dpr))}`;
      const n = stack.get(key) ?? 0;
      stack.set(key, n + 1);
      const sy = m.sy + n * 22 * dpr;
      const text = formatMen(m.total);
      const tw = ctx.measureText(text).width;
      const h = 20 * dpr,
        armsW = 15 * dpr,
        pad = 5 * dpr;
      const w = armsW + tw + pad * 3;
      const x0 = sx - w / 2,
        y0 = sy - h / 2;
      const isSel = a.id === selected;
      const hostile = !mine && atWar(state, a.owner, state.player);
      const edge = isSel ? '#f3cc6a' : mine ? '#cfa65c' : hostile ? '#c0493f' : 'rgba(205, 164, 90, 0.45)';
      // Several armies under one banner: another shows behind it.
      if (m.count > 1) {
        ctx.fillStyle = 'rgba(24, 18, 12, 0.8)';
        ctx.strokeStyle = edge;
        ctx.lineWidth = 1 * dpr;
        ctx.beginPath();
        ctx.roundRect(x0 + 3 * dpr, y0 - 3 * dpr, w, h, 3 * dpr);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = a.retreating ? 'rgba(40, 30, 24, 0.75)' : 'rgba(24, 18, 12, 0.92)';
      ctx.strokeStyle = edge;
      ctx.lineWidth = (isSel ? 2.4 : 1.2) * dpr;
      ctx.beginPath();
      ctx.roundRect(x0, y0, w, h, 3 * dpr);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = style.color(m.owner);
      ctx.fillRect(x0 + 1.5 * dpr, y0 + 1.5 * dpr, 3 * dpr, h - 3 * dpr);
      const img = style.arms(m.owner);
      if (img) ctx.drawImage(img, x0 + pad + 1 * dpr, y0 + 2 * dpr, armsW - 2 * dpr, (armsW - 2 * dpr) * 1.2);
      ctx.fillStyle = a.retreating ? '#ad9b7c' : '#ecdfc5';
      ctx.textAlign = 'left';
      ctx.fillText(text, x0 + pad * 2 + armsW - 2 * dpr, sy + 1 * dpr);
      ctx.textAlign = 'center';
      // morale pip
      ctx.fillStyle = a.morale > 0.66 ? '#7fa34a' : a.morale > 0.33 ? '#d8b35c' : '#c0493f';
      ctx.fillRect(x0 + 5 * dpr, y0 + h - 3 * dpr, (w - 10 * dpr) * a.morale, 2 * dpr);
      this.hits.push({ kind: 'army', id: a.id, x0, y0, x1: x0 + w, y1: y0 + h });
    }

    this.renderFleets(ctx, cam, state, style, view, toScreen, lerpPoint, onScreen);
  }

  private renderFleets(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    state: GameState,
    style: UnitStyle,
    view: UnitView,
    toScreen: (x: number, y: number) => [number, number],
    lerpPoint: (a: [number, number], b: [number, number], f: number) => [number, number],
    onScreen: (sx: number, sy: number, pad?: number) => boolean,
  ) {
    const dpr = cam.dpr * this.scale;
    const { selectedFleet: selected, hidden } = view;
    const point = (id: number) => (this.region(id).kind === 'land' ? this.portPoint(id) : this.region(id).label);
    const fraction = (f: Fleet) => (f.path.length && f.stepDays > 0 ? Math.min(1, f.progress / f.stepDays) : 0);
    // Routes of our fleets and of the selected one
    for (const f of state.fleets) {
      if (!f.path.length || (f.owner !== state.player && f.id !== selected)) continue;
      const pts: [number, number][] = [lerpPoint(point(f.location), point(f.path[0]), fraction(f))];
      let prev = point(f.location);
      for (const id of f.path) {
        const p = lerpPoint(prev, point(id), 1);
        pts.push(p);
        prev = p;
      }
      ctx.setLineDash([3 * dpr, 5 * dpr]);
      ctx.lineWidth = (f.id === selected ? 2.4 : 1.6) * dpr;
      ctx.strokeStyle = f.id === selected ? 'rgba(170, 214, 255, 0.95)' : 'rgba(170, 214, 255, 0.55)';
      ctx.beginPath();
      pts.forEach((p, i) => {
        const [sx, sy] = toScreen(p[0], p[1]);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Battles at sea
    for (const b of state.navalBattles) {
      if (hidden?.(b.zone)) continue;
      const [sx, sy] = toScreen(...this.region(b.zone).label);
      if (!onScreen(sx, sy)) continue;
      const r = 14 * dpr;
      ctx.fillStyle = 'rgba(26, 52, 92, 0.95)';
      ctx.strokeStyle = '#ecd18c';
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      ctx.arc(sx, sy - 30 * dpr, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      drawIcon(ctx, 'crossed-swords', sx, sy - 30 * dpr, 18 * dpr, '#fbeccc');
    }
    // Pennants: one for each fleet close in; far out, one for each realm on each patch of the screen.
    // Foreign fleets lying in port stay out of sight unless they are at war with the player.
    const far = cam.zoom < FAR_ZOOM;
    const onMap: { item: Fleet; size: number; realm: number; sx: number; sy: number; alone: boolean }[] = [];
    for (const f of state.fleets) {
      const mine = f.owner === state.player;
      const isSel = f.id === selected;
      const n = fleetSize(f);
      if (n < 0.5) continue;
      if (!isSel && !view.shows(f.owner)) continue;
      if (!mine && hidden?.(f.location)) continue;
      const docked = !f.path.length && this.region(f.location).kind === 'land';
      if (docked && !mine && !isSel && !view.portFleets && !atWar(state, f.owner, state.player)) continue;
      const pos = f.path.length ? lerpPoint(point(f.location), point(f.path[0]), fraction(f)) : point(f.location);
      const [sx, sy] = toScreen(pos[0], pos[1]);
      if (!onScreen(sx, sy)) continue;
      onMap.push({ item: f, size: n, realm: mine ? f.owner : topLiege(state, f.owner), sx, sy, alone: isSel });
    }
    const pennants = gather(onMap, far, 100 * dpr, 40 * dpr)
      .filter(
        (m) => m.lead.owner === state.player || m.lead.id === selected || (cam.zoom >= 0.1 && (!far || m.total >= 10)),
      )
      .sort((a, b) => (a.lead.id === selected ? 1 : 0) - (b.lead.id === selected ? 1 : 0));
    ctx.font = `700 ${11 * dpr}px ${FONT}`;
    const stack = new Map<string, number>();
    for (const m of pennants) {
      const f = m.lead;
      const mine = f.owner === state.player;
      const { sx } = m;
      let sy = m.sy;
      const key = `${Math.round(sx / (30 * dpr))}:${Math.round(sy / (18 * dpr))}`;
      const k = stack.get(key) ?? 0;
      stack.set(key, k + 1);
      sy += k * 20 * dpr + 22 * dpr;
      const text = String(Math.round(m.total));
      const tw = ctx.measureText(text).width;
      const h = 18 * dpr,
        icon = 15 * dpr,
        pad = 4 * dpr;
      const w = icon + tw + pad * 3 + 4 * dpr;
      const x0 = sx - w / 2,
        y0 = sy - h / 2;
      const isSel = f.id === selected;
      const hostile = !mine && atWar(state, f.owner, state.player);
      const edge = isSel ? '#aad6ff' : mine ? '#7fa8cf' : hostile ? '#c0493f' : 'rgba(127, 168, 207, 0.4)';
      if (m.count > 1) {
        ctx.fillStyle = 'rgba(14, 24, 38, 0.8)';
        ctx.strokeStyle = edge;
        ctx.lineWidth = 1 * dpr;
        ctx.beginPath();
        ctx.roundRect(x0 + 3 * dpr, y0 - 3 * dpr, w, h, 9 * dpr);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = f.retreating ? 'rgba(22, 30, 42, 0.75)' : 'rgba(14, 24, 38, 0.92)';
      ctx.strokeStyle = edge;
      ctx.lineWidth = (isSel ? 2.4 : 1.2) * dpr;
      ctx.beginPath();
      ctx.roundRect(x0, y0, w, h, 9 * dpr);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = style.color(m.owner);
      ctx.beginPath();
      ctx.arc(x0 + 5 * dpr, sy, 2.6 * dpr, 0, Math.PI * 2);
      ctx.fill();
      drawIcon(
        ctx,
        shipLook(state.countries[m.owner], 'heavy').icon,
        x0 + pad + 4 * dpr + icon / 2,
        sy,
        icon,
        '#dbe8f4',
      );
      ctx.fillStyle = f.retreating ? '#8aa0b4' : '#e4eef8';
      ctx.textAlign = 'left';
      ctx.fillText(text, x0 + pad * 2 + 4 * dpr + icon, sy + 1 * dpr);
      ctx.textAlign = 'center';
      this.hits.push({ kind: 'fleet', id: f.id, x0, y0, x1: x0 + w, y1: y0 + h });
    }
  }
}
