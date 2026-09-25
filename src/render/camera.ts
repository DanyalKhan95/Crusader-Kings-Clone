/**
 * 2D map camera. Positions are map units (0..worldW horizontally, wrapping; 0..worldH vertically).
 * `zoom` is device pixels per map unit.
 */
export class Camera {
  x: number;
  y: number;
  zoom: number;
  /** viewport size in device pixels */
  width = 1;
  height = 1;
  dpr = 1;
  minZoom = 0.05;
  maxZoom = 5;

  constructor(
    readonly worldW: number,
    readonly worldH: number,
  ) {
    this.x = worldW * 0.53;
    this.y = worldH * 0.3;
    this.zoom = 0.2;
  }

  resize(cssW: number, cssH: number, dpr: number) {
    this.dpr = dpr;
    this.width = Math.max(1, Math.round(cssW * dpr));
    this.height = Math.max(1, Math.round(cssH * dpr));
    // Never zoom out further than the map's height fills the screen.
    this.minZoom = Math.max(this.height / this.worldH, 0.02);
    this.clamp();
  }

  clamp() {
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom));
    this.x = ((this.x % this.worldW) + this.worldW) % this.worldW;
    const halfH = this.height / 2 / this.zoom;
    if (halfH * 2 >= this.worldH) this.y = this.worldH / 2;
    else this.y = Math.min(this.worldH - halfH, Math.max(halfH, this.y));
  }

  /** Screen (CSS px) → map units, x wrapped into [0, worldW). */
  screenToMap(sx: number, sy: number): [number, number] {
    const mx = this.x + (sx * this.dpr - this.width / 2) / this.zoom;
    const my = this.y + (sy * this.dpr - this.height / 2) / this.zoom;
    return [((mx % this.worldW) + this.worldW) % this.worldW, my];
  }

  /** Map units → screen (CSS px), choosing the wrapped copy nearest the view centre. */
  mapToScreen(mx: number, my: number): [number, number] {
    let dx = mx - this.x;
    if (dx > this.worldW / 2) dx -= this.worldW;
    else if (dx < -this.worldW / 2) dx += this.worldW;
    return [(dx * this.zoom + this.width / 2) / this.dpr, ((my - this.y) * this.zoom + this.height / 2) / this.dpr];
  }

  panBy(dxCss: number, dyCss: number) {
    this.x -= (dxCss * this.dpr) / this.zoom;
    this.y -= (dyCss * this.dpr) / this.zoom;
    this.clamp();
  }

  /** Zoom by factor keeping the map point under (sx, sy) fixed. */
  zoomAt(sx: number, sy: number, factor: number) {
    const px = sx * this.dpr - this.width / 2,
      py = sy * this.dpr - this.height / 2;
    const before = this.zoom;
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor));
    const k = 1 / before - 1 / this.zoom;
    this.x += px * k;
    this.y += py * k;
    this.clamp();
  }

  /** Visible map rectangle (x may extend beyond the world bounds). */
  viewRect(): [number, number, number, number] {
    const hw = this.width / 2 / this.zoom,
      hh = this.height / 2 / this.zoom;
    return [this.x - hw, this.y - hh, this.x + hw, this.y + hh];
  }

  /** World copy offsets (multiples of worldW) that intersect the view. */
  worldCopies(): number[] {
    const [x0, , x1] = this.viewRect();
    const out: number[] = [];
    for (let k = Math.floor(x0 / this.worldW); k <= Math.floor(x1 / this.worldW); k++) out.push(k * this.worldW);
    return out;
  }
}
