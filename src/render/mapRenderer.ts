/**
 * The WebGL map: terrain, region fills (coloured by a per-region data texture), rivers, borders
 * styled in the vertex shader from per-region owner/liege data, and selection highlights.
 */
import type { Camera } from './camera';
import { createMesh, createProgram, DataTexture, type Mesh, type Program } from './gl';
import type { LineMesh, MeshBundle } from './meshBuilder';
import { FILL_FS, FILL_VS, LINE_FS, LINE_VS } from './shaders';
import { TerrainLayer } from './terrainLayer';

export const FLAG_SELECTED = 1;
export const FLAG_HOVERED = 2;
export const FLAG_UNKNOWN = 4;
export const FLAG_IMPASSABLE = 8;
export const FLAG_WATER = 16;
export const FLAG_LAKE = 32;
export const FLAG_PLAYER = 64;
export const FLAG_PLAGUE = 128;

const TEX = 64; // data textures are 64×64 → up to 4095 regions / countries

export interface RendererOptions {
  worldW: number;
  worldH: number;
  terrainUrl: string;
  tileSize: number;
}

export class MapRenderer {
  readonly gl: WebGL2RenderingContext;
  readonly terrain: TerrainLayer;
  private fillProg: Program;
  private lineProg: Program;
  private fills: { mesh: Mesh; land: [number, number]; water: [number, number] }[] = [];
  private borders: Mesh[] = [];
  private rivers: Mesh;
  private fillTex: DataTexture;
  private infoTex: DataTexture;
  private countryTex: DataTexture;
  readonly fillData = new Uint8Array(TEX * TEX * 4);
  readonly infoData = new Uint16Array(TEX * TEX * 4);
  readonly countryData = new Uint8Array(TEX * TEX * 4);
  private dirty = { fill: true, info: true, country: true };
  drawWaterFills = false;
  /** Some regions are unknown to the viewer: they are drawn over as parchment. */
  hasUnknown = false;
  /** 0 … 1: how far fills lean towards opaque when zoomed in, for map modes whose colours carry meaning */
  fillBoost = 0;
  frame = 0;

  constructor(
    readonly canvas: HTMLCanvasElement,
    bundle: MeshBundle,
    opts: RendererOptions,
  ) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, premultipliedAlpha: false });
    if (!gl) throw new Error('WebGL 2 is not available in this browser.');
    this.gl = gl;
    this.fillProg = createProgram(gl, FILL_VS, FILL_FS, ['a_pos', 'a_region']);
    this.lineProg = createProgram(gl, LINE_VS, LINE_FS, ['a_pos', 'a_off', 'a_a', 'a_b', 'a_w']);
    for (const f of bundle.fills) {
      this.fills.push({
        mesh: createMesh(
          gl,
          [
            { data: f.positions, size: 2, type: gl.FLOAT },
            { data: new Float32Array(f.regions), size: 1, type: gl.FLOAT },
          ],
          f.indices,
        ),
        land: f.landRange,
        water: f.waterRange,
      });
    }
    this.borders = bundle.borders.map((b) => this.lineMesh(b));
    this.rivers = this.lineMesh(bundle.rivers);
    this.fillTex = new DataTexture(gl, TEX, TEX, false);
    this.infoTex = new DataTexture(gl, TEX, TEX, true);
    this.countryTex = new DataTexture(gl, TEX, TEX, false);
    this.terrain = new TerrainLayer(gl, opts.terrainUrl, opts.worldW, opts.worldH, opts.tileSize);
  }

  private lineMesh(l: LineMesh): Mesh {
    const gl = this.gl;
    return createMesh(
      gl,
      [
        { data: l.positions, size: 2, type: gl.FLOAT },
        { data: l.offsets, size: 2, type: gl.FLOAT },
        { data: new Float32Array(l.sideA), size: 1, type: gl.FLOAT },
        { data: new Float32Array(l.sideB), size: 1, type: gl.FLOAT },
        { data: l.widths, size: 1, type: gl.FLOAT },
      ],
      l.indices,
    );
  }

  setFill(region: number, r: number, g: number, b: number, a: number) {
    const o = region * 4;
    this.fillData[o] = r;
    this.fillData[o + 1] = g;
    this.fillData[o + 2] = b;
    this.fillData[o + 3] = a;
    this.dirty.fill = true;
  }

  setInfo(region: number, owner: number, liege: number, controller: number, flags: number) {
    const o = region * 4;
    this.infoData[o] = owner;
    this.infoData[o + 1] = liege;
    this.infoData[o + 2] = controller;
    this.infoData[o + 3] = flags;
    this.dirty.info = true;
  }

  setFlag(region: number, flag: number, on: boolean) {
    const o = region * 4 + 3;
    const v = on ? this.infoData[o] | flag : this.infoData[o] & ~flag;
    if (v !== this.infoData[o]) {
      this.infoData[o] = v;
      this.dirty.info = true;
    }
  }

  setCountryColor(index: number, r: number, g: number, b: number) {
    const o = index * 4;
    this.countryData[o] = r;
    this.countryData[o + 1] = g;
    this.countryData[o + 2] = b;
    this.countryData[o + 3] = 255;
    this.dirty.country = true;
  }

  markFillDirty() {
    this.dirty.fill = true;
  }

  resize(cam: Camera) {
    if (this.canvas.width !== cam.width || this.canvas.height !== cam.height) {
      this.canvas.width = cam.width;
      this.canvas.height = cam.height;
    }
  }

  private flush() {
    if (this.dirty.fill) this.fillTex.upload(this.fillData);
    if (this.dirty.info) this.infoTex.upload(this.infoData);
    if (this.dirty.country) this.countryTex.upload(this.countryData);
    this.dirty = { fill: false, info: false, country: false };
  }

  render(cam: Camera, timeSec: number) {
    const gl = this.gl;
    this.frame++;
    this.resize(cam);
    this.flush();
    gl.viewport(0, 0, cam.width, cam.height);
    gl.clearColor(0.09, 0.19, 0.3, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.terrain.render(cam, this.frame);

    const lod = cam.zoom < 0.075 ? 2 : cam.zoom < 0.4 ? 1 : 0;
    const smooth = (a: number, b: number, x: number) => {
      const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    const farness = 1 - smooth(0.07, 0.45, cam.zoom); // 1 = zoomed far out
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    // Region fills
    const fp = this.fillProg;
    gl.useProgram(fp.prog);
    this.bindCommon(fp, cam);
    gl.uniform1f(fp.u.u_time, timeSec);
    gl.uniform1i(fp.u.u_parchment, 0);
    const alpha = 0.4 + 0.53 * farness;
    gl.uniform1f(fp.u.u_alpha, alpha + (0.93 - alpha) * this.fillBoost);
    this.bindTextures(fp);
    const fill = this.fills[lod];
    gl.bindVertexArray(fill.mesh.vao);
    for (const shift of cam.worldCopies()) {
      gl.uniform1f(fp.u.u_shift, shift);
      gl.drawElements(gl.TRIANGLES, fill.land[1], gl.UNSIGNED_INT, fill.land[0] * 4);
      if (this.drawWaterFills) gl.drawElements(gl.TRIANGLES, fill.water[1], gl.UNSIGNED_INT, fill.water[0] * 4);
    }

    // Lines: rivers, borders, highlights
    const lp = this.lineProg;
    gl.useProgram(lp.prog);
    this.bindCommon(lp, cam);
    this.bindTextures(lp);
    gl.uniform1f(lp.u.u_px, cam.dpr * (0.85 + 0.35 * smooth(0.3, 2.0, cam.zoom)));
    gl.uniform1f(lp.u.u_provAlpha, 0.55 * smooth(0.1, 0.35, cam.zoom));
    gl.uniform1f(lp.u.u_riverAlpha, 0.85 * smooth(0.14, 0.4, cam.zoom));
    const drawLines = (mesh: Mesh, mode: number) => {
      gl.uniform1i(lp.u.u_mode, mode);
      gl.bindVertexArray(mesh.vao);
      for (const shift of cam.worldCopies()) {
        gl.uniform1f(lp.u.u_shift, shift);
        gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
      }
    };
    if (cam.zoom > 0.14) drawLines(this.rivers, 2);
    // Terra incognita covers land, sea and rivers alike; the known world's borders are drawn on top.
    if (this.hasUnknown) {
      gl.useProgram(fp.prog);
      this.bindCommon(fp, cam);
      this.bindTextures(fp);
      gl.uniform1i(fp.u.u_parchment, 1);
      gl.bindVertexArray(fill.mesh.vao);
      for (const shift of cam.worldCopies()) {
        gl.uniform1f(fp.u.u_shift, shift);
        gl.drawElements(gl.TRIANGLES, fill.land[1], gl.UNSIGNED_INT, fill.land[0] * 4);
        gl.drawElements(gl.TRIANGLES, fill.water[1], gl.UNSIGNED_INT, fill.water[0] * 4);
      }
      gl.uniform1i(fp.u.u_parchment, 0);
      gl.useProgram(lp.prog);
    }
    drawLines(this.borders[lod], 0);
    drawLines(this.borders[lod], 1);
    gl.bindVertexArray(null);
  }

  private bindCommon(p: Program, cam: Camera) {
    const gl = this.gl;
    gl.uniform2f(p.u.u_center, cam.x, cam.y);
    gl.uniform1f(p.u.u_zoom, cam.zoom);
    gl.uniform2f(p.u.u_viewport, cam.width, cam.height);
  }

  private bindTextures(p: Program) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fillTex.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.infoTex.tex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.countryTex.tex);
    if (p.u.u_fill) gl.uniform1i(p.u.u_fill, 0);
    if (p.u.u_info) gl.uniform1i(p.u.u_info, 1);
    if (p.u.u_countryColor) gl.uniform1i(p.u.u_countryColor, 2);
  }
}
