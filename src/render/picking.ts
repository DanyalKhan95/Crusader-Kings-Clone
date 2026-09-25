/** Point → region lookup: a uniform grid of candidate regions + even-odd point-in-polygon. */
import type { PickingData } from './meshBuilder';

const CELL = 128;

export class Picker {
  private cols: number;
  private rows: number;
  private cells: number[][];

  constructor(
    private data: PickingData,
    regionCount: number,
    private worldW: number,
    worldH: number,
  ) {
    this.cols = Math.ceil(worldW / CELL);
    this.rows = Math.ceil(worldH / CELL);
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
    const b = data.bboxes;
    for (let r = 1; r <= regionCount; r++) {
      const x0 = b[r * 4],
        y0 = b[r * 4 + 1],
        x1 = b[r * 4 + 2],
        y1 = b[r * 4 + 3];
      if (!(x1 >= x0)) continue;
      const cx0 = Math.max(0, Math.floor(x0 / CELL)),
        cx1 = Math.min(this.cols - 1, Math.floor(x1 / CELL));
      const cy0 = Math.max(0, Math.floor(y0 / CELL)),
        cy1 = Math.min(this.rows - 1, Math.floor(y1 / CELL));
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) this.cells[cy * this.cols + cx].push(r);
    }
  }

  /** Region id at map point (x wrapped), or 0. */
  pick(x: number, y: number): number {
    x = ((x % this.worldW) + this.worldW) % this.worldW;
    const cx = Math.floor(x / CELL),
      cy = Math.floor(y / CELL);
    if (cy < 0 || cy >= this.rows) return 0;
    const cands = this.cells[cy * this.cols + cx];
    for (const r of cands) if (this.contains(r, x, y)) return r;
    return 0;
  }

  contains(r: number, x: number, y: number): boolean {
    const { coords, ringStart, regionRings, bboxes } = this.data;
    if (x < bboxes[r * 4] || x > bboxes[r * 4 + 2] || y < bboxes[r * 4 + 1] || y > bboxes[r * 4 + 3]) return false;
    let inside = false;
    for (let k = regionRings[r]; k < regionRings[r + 1]; k++) {
      const s = ringStart[k],
        e = ringStart[k + 1];
      const n = (e - s) / 2;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = coords[s + i * 2],
          yi = coords[s + i * 2 + 1],
          xj = coords[s + j * 2],
          yj = coords[s + j * 2 + 1];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
    return inside;
  }
}
