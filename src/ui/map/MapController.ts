/**
 * Owns the map: camera, WebGL renderer, text labels, picking, pointer/keyboard input and the render
 * loop. React drives it through a handful of methods and hears about hovers and clicks through
 * callbacks, so pointer movement never has to re-render components.
 */
import { applyMapMode, type MapMode } from '../../game/mapModes';
import type { StaticWorld } from '../../game/world';
import { knows } from '../../sim/exploration';
import { realmHead } from '../../sim/queries';
import type { GameState } from '../../sim/types';
import { Camera } from '../../render/camera';
import { LabelLayer, layoutLabel, type TextLabel } from '../../render/labels';
import { FLAG_HOVERED, FLAG_SELECTED, MapRenderer } from '../../render/mapRenderer';
import type { MeshBundle } from '../../render/meshBuilder';
import { Picker } from '../../render/picking';
import { UnitLayer, type UnitStyle } from '../../render/units';

export interface MapCallbacks {
  /** Region under the pointer changed (0 = none); client coordinates for tooltips. */
  hover(region: number, clientX: number, clientY: number): void;
  /** Pointer moved while over the same region. */
  hoverMove(clientX: number, clientY: number): void;
  click(region: number): void;
  /** An army banner was clicked. */
  clickArmy(id: number): void;
  /** A fleet banner was clicked. */
  clickFleet(id: number): void;
  /** Right-click (or long order tap) on a region. */
  order(region: number): void;
}

/** Screen edges (CSS px) covered by panels; framing centres targets in what is left. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface Flight {
  x0: number;
  y0: number;
  z0: number;
  dx: number;
  dy: number;
  z1: number;
  zMid: number;
  t0: number;
  dur: number;
}

const CLICK_SLOP = 6; // CSS px a press may travel and still count as a click
const PAN_KEYS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class MapController {
  readonly camera: Camera;
  readonly renderer: MapRenderer;
  private labels: LabelLayer;
  private units: UnitLayer;
  private unitsDirty = true;
  private selectedArmy = 0;
  private selectedFleet = 0;
  private picker: Picker;
  private raf = 0;
  private lastT = 0;
  private glDirty = true;
  private labelsDirty = true;
  private camKey = '';
  private hovered = 0;
  private selected = 0;
  private mode: MapMode = 'realms';
  private player = 0;
  /** the country whose knowledge of the world the map shows (0 = all of it) */
  private fog = 0;
  private labelStyle: 'realms' | 'countries' | '' = '';
  private flight: Flight | null = null;
  private zoomTarget = 0;
  private zoomAnchor: [number, number] = [0, 0];
  private keys = new Set<string>();
  private pointers = new Map<number, { x: number; y: number }>();
  private press: { x: number; y: number; moved: boolean } | null = null;
  private pinch = 0;
  private ro: ResizeObserver;
  private disposed = false;
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  /** Slow eastward drift for the title screen, in map units per second. */
  drift = 0;
  showProvinceNames = true;
  /** Called at the start of every frame with the seconds since the last one (drives game time). */
  onFrame: ((dt: number) => void) | null = null;
  unitStyle: UnitStyle | null = null;

  constructor(
    private host: HTMLElement,
    glCanvas: HTMLCanvasElement,
    labelCanvas: HTMLCanvasElement,
    unitCanvas: HTMLCanvasElement,
    private world: StaticWorld,
    private state: GameState,
    bundle: MeshBundle,
    private cb: MapCallbacks,
  ) {
    const { width, height, terrainTiles } = world.world;
    this.camera = new Camera(width, height);
    this.renderer = new MapRenderer(glCanvas, bundle, {
      worldW: width,
      worldH: height,
      terrainUrl: `${world.base}/terrain`,
      tileSize: terrainTiles.size,
    });
    this.renderer.terrain.onTileLoaded = () => (this.glDirty = true);
    this.labels = new LabelLayer(labelCanvas, world.regions, width);
    this.units = new UnitLayer(unitCanvas, world.region, width);
    this.picker = new Picker(bundle.picking, world.regions.length, width, height);
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    host.addEventListener('pointerdown', this.onPointerDown);
    host.addEventListener('pointermove', this.onPointerMove);
    host.addEventListener('pointerup', this.onPointerUp);
    host.addEventListener('pointercancel', this.onPointerUp);
    host.addEventListener('pointerleave', this.onPointerLeave);
    host.addEventListener('wheel', this.onWheel, { passive: false });
    host.addEventListener('dblclick', this.onDblClick);
    host.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    this.setMode('realms', 0);
  }

  /** Swaps in another game state (after loading a save). */
  setState(state: GameState) {
    this.state = state;
    this.refresh();
    this.invalidateUnits();
  }

  /** Armies moved or changed: redraw them on the next frame. */
  invalidateUnits() {
    this.unitsDirty = true;
  }

  setSelectedArmy(id: number) {
    if (id === this.selectedArmy) return;
    this.selectedArmy = id;
    this.unitsDirty = true;
  }

  setSelectedFleet(id: number) {
    if (id === this.selectedFleet) return;
    this.selectedFleet = id;
    this.unitsDirty = true;
  }

  /** Recolours for changed owners or controllers without re-laying out the labels. */
  recolor() {
    applyMapMode(this.renderer, this.world, this.state, this.mode, this.player, this.fog);
    this.glDirty = true;
  }

  /** Shows the world as a country knows it (0 = all of it). */
  setFog(country: number) {
    if (country === this.fog) return;
    this.fog = country;
    this.refresh();
    this.invalidate();
  }

  /** True if the viewer does not know this region. */
  isUnknown = (id: number): boolean => {
    const c = this.fog ? this.state.countries[this.fog] : undefined;
    return !!c && !knows(this.world, c, id);
  };

  /** Loads the always-resident terrain texture; call before the first frame is shown. */
  async load(): Promise<void> {
    await this.renderer.terrain.loadBase();
    this.glDirty = true;
  }

  start() {
    if (!this.raf && !this.disposed) this.raf = requestAnimationFrame(this.tick);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    const h = this.host;
    h.removeEventListener('pointerdown', this.onPointerDown);
    h.removeEventListener('pointermove', this.onPointerMove);
    h.removeEventListener('pointerup', this.onPointerUp);
    h.removeEventListener('pointercancel', this.onPointerUp);
    h.removeEventListener('pointerleave', this.onPointerLeave);
    h.removeEventListener('wheel', this.onWheel);
    h.removeEventListener('dblclick', this.onDblClick);
    h.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }

  // ── State from the UI ───────────────────────────────────────────

  /** Recolours the map for a mode; `player` gets the gilt realm outline (0 = none). */
  setMode(mode: MapMode, player: number) {
    this.mode = mode;
    this.player = player;
    applyMapMode(this.renderer, this.world, this.state, mode, player, this.fog);
    const style = mode === 'countries' ? 'countries' : 'realms';
    if (style !== this.labelStyle) {
      this.labelStyle = style;
      this.labels.realms = this.buildLabels(style);
      this.labelsDirty = true;
    }
    this.glDirty = true;
  }

  /** Re-applies colours after the game state changed (ownership, lieges…). */
  refresh() {
    this.labelStyle = '';
    this.setMode(this.mode, this.player);
  }

  setSelected(region: number) {
    if (region === this.selected) return;
    if (this.selected) this.renderer.setFlag(this.selected, FLAG_SELECTED, false);
    this.selected = region;
    if (region) this.renderer.setFlag(region, FLAG_SELECTED, true);
    this.glDirty = true;
  }

  private setHovered(region: number) {
    if (region === this.hovered) return;
    if (this.hovered) this.renderer.setFlag(this.hovered, FLAG_HOVERED, false);
    this.hovered = region;
    if (region) this.renderer.setFlag(region, FLAG_HOVERED, true);
    this.glDirty = true;
  }

  // ── Camera ──────────────────────────────────────────────────────

  /** Glides to a map point; zooms out mid-flight when the hop is long. */
  flyTo(x: number, y: number, zoom: number, dur = 1100) {
    const c = this.camera;
    let dx = x - c.x;
    const W = c.worldW;
    dx -= Math.round(dx / W) * W;
    const dy = y - c.y;
    const z1 = Math.min(c.maxZoom, Math.max(c.minZoom, zoom));
    const dist = Math.hypot(dx, dy);
    const span = Math.max(c.width, c.height);
    const zMid = Math.max(c.minZoom, Math.min(c.zoom, z1, span / (dist * 1.25 + 1)));
    this.flight = { x0: c.x, y0: c.y, z0: c.zoom, dx, dy, z1, zMid, t0: performance.now(), dur };
    this.zoomTarget = 0;
  }

  setInsets(insets: Insets) {
    this.insets = insets;
  }

  /** Camera position and zoom that frame a set of provinces in the uncovered part of the screen. */
  frame(ids: number[], fill = 0.62, minZoom = 0, maxZoom = 0.9): { x: number; y: number; zoom: number } | null {
    if (!ids.length) return null;
    const W = this.camera.worldW;
    const ref = this.world.region(ids[0]).label[0];
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const id of ids) {
      const b = this.world.region(id).bbox;
      const shift = Math.round((ref - (b[0] + b[2]) / 2) / W) * W;
      x0 = Math.min(x0, b[0] + shift);
      x1 = Math.max(x1, b[2] + shift);
      y0 = Math.min(y0, b[1]);
      y1 = Math.max(y1, b[3]);
    }
    const c = this.camera;
    const ins = this.insets;
    const dpr = c.dpr;
    // Visible area in device px; never let panels squeeze it below a third of the screen.
    const vw = Math.max(c.width / 3, c.width - (ins.left + ins.right) * dpr);
    const vh = Math.max(c.height / 3, c.height - (ins.top + ins.bottom) * dpr);
    let zoom = Math.min((vw * fill) / Math.max(40, x1 - x0), (vh * fill) / Math.max(40, y1 - y0));
    zoom = Math.min(maxZoom, Math.max(minZoom, zoom));
    // Shift the camera so the target sits in the middle of the visible area.
    const sx = ((ins.left - ins.right) / 2) * dpr,
      sy = ((ins.top - ins.bottom) / 2) * dpr;
    const x = (x0 + x1) / 2 - sx / zoom;
    return { x: ((x % W) + W) % W, y: (y0 + y1) / 2 - sy / zoom, zoom };
  }

  /** Centres a single map point in the uncovered part of the screen. */
  flyToPoint(x: number, y: number, zoom: number) {
    const c = this.camera;
    const z = Math.min(c.maxZoom, Math.max(c.minZoom, zoom));
    const ins = this.insets;
    this.flyTo(x - ((ins.left - ins.right) / 2) * (c.dpr / z), y - ((ins.top - ins.bottom) / 2) * (c.dpr / z), z);
  }

  zoomBy(factor: number) {
    const c = this.camera;
    this.zoomAnchor = [c.width / c.dpr / 2, c.height / c.dpr / 2];
    this.zoomTarget = Math.min(c.maxZoom, Math.max(c.minZoom, (this.zoomTarget || c.zoom) * factor));
    this.flight = null;
  }

  // ── Labels ──────────────────────────────────────────────────────

  private buildLabels(style: 'realms' | 'countries'): TextLabel[] {
    const s = this.state;
    const groups = new Map<number, number[]>();
    const unknown = this.isUnknown;
    this.labels.hidden = this.fog ? unknown : null;
    s.provinces.forEach((p, id) => {
      if (!p?.owner || unknown(id)) return;
      const key = style === 'realms' ? realmHead(s, p.owner) : p.owner;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = []));
      g.push(id);
    });
    const out: TextLabel[] = [];
    for (const [index, ids] of groups) {
      const c = s.countries[index];
      const layout = layoutLabel(c.short, ids, this.world.region, this.world.world.width, c.capital);
      if (layout) out.push({ layout, kind: style === 'countries' && c.liege ? 'vassal' : 'realm' });
    }
    // The great unknown lands.
    if (this.fog)
      for (const ids of this.unknownLands()) {
        const layout = layoutLabel('Terra Incognita', ids, this.world.region, this.world.world.width);
        if (layout) out.push({ layout: { ...layout, size: layout.size * 0.6 }, kind: 'unknown' });
      }
    // Big names first so small ones draw on top where they overlap.
    out.sort((a, b) => b.layout.size - a.layout.size);
    return out;
  }

  /** Large stretches of land the viewer does not know, as lists of regions. */
  private unknownLands(): number[][] {
    const seen = new Set<number>();
    const out: number[][] = [];
    for (const r of this.world.regions) {
      if (r.kind !== 'land' || seen.has(r.id) || !this.isUnknown(r.id)) continue;
      const comp: number[] = [];
      const stack = [r.id];
      seen.add(r.id);
      let area = 0;
      while (stack.length) {
        const id = stack.pop()!;
        comp.push(id);
        area += this.world.region(id).area;
        for (const [n] of this.world.region(id).adj) {
          const o = this.world.region(n);
          if (o.kind === 'land' && !seen.has(n) && this.isUnknown(n)) {
            seen.add(n);
            stack.push(n);
          }
        }
      }
      if (area > 1.5e6) out.push(comp);
    }
    return out;
  }

  /** All realm-label texts, so the label font can be loaded for every glyph before drawing. */
  labelText(): string {
    return this.state.countries
      .filter(Boolean)
      .map((c) => c.short.toUpperCase())
      .join('');
  }

  // ── Frame loop ──────────────────────────────────────────────────

  private tick = (tMs: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.tick);
    const t = tMs / 1000;
    const dt = this.lastT ? Math.min(0.1, t - this.lastT) : 0;
    this.lastT = t;
    this.onFrame?.(dt);
    this.stepCamera(dt);
    const c = this.camera;
    const key = `${c.x.toFixed(2)} ${c.y.toFixed(2)} ${c.zoom.toFixed(5)} ${c.width} ${c.height}`;
    const moved = key !== this.camKey;
    this.camKey = key;
    if (moved || this.glDirty || this.selected) {
      this.glDirty = false;
      this.renderer.render(c, t);
    }
    if (moved || this.labelsDirty) {
      this.labelsDirty = false;
      this.labels.render(c, this.showProvinceNames);
    }
    if ((moved || this.unitsDirty) && this.unitStyle) {
      this.unitsDirty = false;
      this.units.render(
        c,
        this.state,
        this.selectedArmy,
        this.unitStyle,
        this.selectedFleet,
        this.fog ? this.isUnknown : null,
      );
    }
  };

  /** Forces a full redraw on the next frame. */
  invalidate() {
    this.glDirty = true;
    this.labelsDirty = true;
    this.unitsDirty = true;
  }

  /** Web fonts arrived: text must be re-measured before it is drawn again. */
  fontsChanged() {
    this.labels.resetMetrics();
    this.invalidate();
  }

  private stepCamera(dt: number) {
    const c = this.camera;
    if (this.flight) {
      const f = this.flight;
      const u = Math.min(1, (performance.now() - f.t0) / f.dur);
      const e = ease(u);
      c.x = f.x0 + f.dx * e;
      c.y = f.y0 + f.dy * e;
      const lz0 = Math.log(f.z0),
        lzm = Math.log(f.zMid),
        lz1 = Math.log(f.z1);
      c.zoom = Math.exp(u < 0.5 ? lz0 + (lzm - lz0) * ease(u * 2) : lzm + (lz1 - lzm) * ease(u * 2 - 1));
      c.clamp();
      if (u >= 1) this.flight = null;
    }
    if (this.zoomTarget) {
      const k = 1 - Math.exp(-dt * 16);
      const factor = Math.pow(this.zoomTarget / c.zoom, k || 0.25);
      c.zoomAt(this.zoomAnchor[0], this.zoomAnchor[1], factor);
      if (Math.abs(Math.log(this.zoomTarget / c.zoom)) < 0.002) this.zoomTarget = 0;
    }
    if (this.keys.size) {
      let kx = 0,
        ky = 0;
      for (const k of this.keys) {
        const d = PAN_KEYS[k];
        if (d) {
          kx += d[0];
          ky += d[1];
        }
      }
      const speed = 900 * dt; // CSS px per second
      if (kx || ky) {
        this.flight = null;
        c.panBy(-kx * speed, -ky * speed);
      }
    }
    if (this.drift && !this.flight) {
      c.x += this.drift * dt;
      c.clamp();
    }
  }

  private resize() {
    const r = this.host.getBoundingClientRect();
    this.camera.resize(r.width, r.height, Math.min(2, window.devicePixelRatio || 1));
    this.invalidate();
  }

  // ── Input ───────────────────────────────────────────────────────

  private local(e: { clientX: number; clientY: number }): [number, number] {
    const r = this.host.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private pickAt(sx: number, sy: number): number {
    const [mx, my] = this.camera.screenToMap(sx, sy);
    return this.picker.pick(mx, my);
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (e.pointerType === 'mouse' && e.ctrlKey) return; // macOS secondary click
    this.host.setPointerCapture(e.pointerId);
    const [x, y] = this.local(e);
    this.pointers.set(e.pointerId, { x, y });
    if (this.pointers.size === 1) this.press = { x, y, moved: false };
    else {
      this.press = null;
      this.pinch = this.pinchSpan();
    }
    this.flight = null;
    this.zoomTarget = 0;
  };

  private pinchSpan(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  private onPointerMove = (e: PointerEvent) => {
    const [x, y] = this.local(e);
    const p = this.pointers.get(e.pointerId);
    if (!p) {
      // plain hover
      if (e.pointerType === 'mouse') this.hoverAt(x, y, e.clientX, e.clientY);
      return;
    }
    const dx = x - p.x,
      dy = y - p.y;
    p.x = x;
    p.y = y;
    if (this.pointers.size >= 2) {
      const span = this.pinchSpan();
      if (this.pinch > 0 && span > 0) {
        const [a, b] = [...this.pointers.values()];
        this.camera.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, span / this.pinch);
        this.camera.panBy(dx / 2, dy / 2);
      }
      this.pinch = span;
      return;
    }
    if (this.press) {
      if (!this.press.moved && Math.hypot(x - this.press.x, y - this.press.y) > CLICK_SLOP) this.press.moved = true;
      if (this.press.moved) {
        this.camera.panBy(dx, dy);
        this.host.classList.add('dragging');
      }
    }
  };

  private hoverAt(x: number, y: number, clientX: number, clientY: number) {
    const id = this.pickAt(x, y);
    if (id !== this.hovered) {
      this.setHovered(id);
      this.cb.hover(id, clientX, clientY);
    } else if (id) this.cb.hoverMove(clientX, clientY);
  }

  private onPointerUp = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    if (this.host.hasPointerCapture(e.pointerId)) this.host.releasePointerCapture(e.pointerId);
    this.host.classList.remove('dragging');
    const press = this.press;
    this.press = null;
    if (this.pointers.size) {
      // one finger left after a pinch: keep panning from here without a jump
      const [rest] = [...this.pointers.values()];
      this.press = { x: rest.x, y: rest.y, moved: true };
      return;
    }
    if (press && !press.moved && e.type === 'pointerup') {
      const [x, y] = this.local(e);
      const unit = this.units.hit(x, y, this.camera.dpr);
      if (unit?.kind === 'army') this.cb.clickArmy(unit.id);
      else if (unit?.kind === 'fleet') this.cb.clickFleet(unit.id);
      else this.cb.click(this.pickAt(x, y));
    }
  };

  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    const [x, y] = this.local(e);
    this.cb.order(this.pickAt(x, y));
  };

  private onPointerLeave = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || this.pointers.size) return;
    this.setHovered(0);
    this.cb.hover(0, e.clientX, e.clientY);
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const [x, y] = this.local(e);
    const unit = e.deltaMode === 1 ? 18 : e.deltaMode === 2 ? 300 : 1;
    const factor = Math.min(2, Math.max(0.5, Math.exp(-e.deltaY * unit * 0.0022)));
    const c = this.camera;
    this.flight = null;
    this.zoomAnchor = [x, y];
    this.zoomTarget = Math.min(c.maxZoom, Math.max(c.minZoom, (this.zoomTarget || c.zoom) * factor));
  };

  private onDblClick = (e: MouseEvent) => {
    const [x, y] = this.local(e);
    const c = this.camera;
    this.flight = null;
    this.zoomAnchor = [x, y];
    this.zoomTarget = Math.min(c.maxZoom, (this.zoomTarget || c.zoom) * 2.2);
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (isTyping(e)) return;
    if (PAN_KEYS[e.key]) {
      this.keys.add(e.key);
      e.preventDefault();
    } else if (e.key === '+' || e.key === '=') this.zoomBy(1.6);
    else if (e.key === '-' || e.key === '_') this.zoomBy(1 / 1.6);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key);
  };

  private onBlur = () => this.keys.clear();
}

export function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}
