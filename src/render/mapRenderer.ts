/**
 * The WebGL map: terrain, region fills (coloured by a per-region data texture), rivers, the map's
 * symbols, borders styled in the vertex shader from per-region owner/liege data, and selection
 * highlights, all in the map style of the moment (styles.ts): the land is marked in the stencil
 * buffer so that land and sea are drawn each in their own way, and the unknown lies under a fog
 * with a soft edge.
 */
import type { SymbolFile } from '../shared/dataTypes';
import type { Camera } from './camera';
import { createMesh, createProgram, DataTexture, type Mesh, type Program } from './gl';
import type { LineMesh, MeshBundle } from './meshBuilder';
import { BLUR_FS, FILL_FS, FILL_VS, FOG_FS, LINE_FS, LINE_VS, SCREEN_VS } from './shaders';
import type { StyleWeights } from './styles';
import { SymbolLayer } from './symbols';
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
/** The fog's mask is drawn and blurred at this fraction of the screen's resolution. */
const FOG_SCALE = 0.25;

export interface RendererOptions {
  worldW: number;
  worldH: number;
  terrainUrl: string;
  tileSize: number;
  /** where the map's symbols stand (null: none) */
  symbols: SymbolFile | null;
}

/** 256×256 of noise, repeating: smooth in red and green, one random value per texel in blue and alpha. */
function noiseTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const N = 256;
  let seed = 0x2f6b4a1d;
  const rand = () => {
    seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    return ((seed ^ (seed >>> 13)) >>> 0) / 4294967296;
  };
  const lattice = (n: number) => Array.from({ length: n * n }, rand);
  /** Smooth value noise of `cells` cells across, repeating, summed over a few octaves. */
  const smooth = (cells: number) => {
    const out = new Float32Array(N * N);
    let amp = 1,
      total = 0;
    for (let c = cells; c <= 64; c *= 2) {
      const g = lattice(c);
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const fx = (x / N) * c,
            fy = (y / N) * c;
          const x0 = Math.floor(fx),
            y0 = Math.floor(fy);
          const tx = fx - x0,
            ty = fy - y0;
          const sx = tx * tx * (3 - 2 * tx),
            sy = ty * ty * (3 - 2 * ty);
          const at = (i: number, j: number) => g[(j % c) * c + (i % c)];
          const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
          const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
          out[y * N + x] += (top + (bottom - top) * sy) * amp;
        }
      total += amp;
      amp *= 0.5;
    }
    for (let i = 0; i < out.length; i++) out[i] /= total;
    return out;
  };
  const r = smooth(4),
    g = smooth(8);
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    data[i * 4] = Math.round(r[i] * 255);
    data[i * 4 + 1] = Math.round(g[i] * 255);
    data[i * 4 + 2] = Math.floor(rand() * 256);
    data[i * 4 + 3] = Math.floor(rand() * 256);
  }
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  return tex;
}

/** A texture to draw into, with its framebuffer. */
interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
  w: number;
  h: number;
}

export class MapRenderer {
  readonly gl: WebGL2RenderingContext;
  readonly terrain: TerrainLayer;
  readonly symbols: SymbolLayer;
  private fillProg: Program;
  private lineProg: Program;
  private blurProg: Program;
  private fogProg: Program;
  private fills: { mesh: Mesh; land: [number, number]; water: [number, number] }[] = [];
  private borders: Mesh[] = [];
  private rivers: Mesh;
  private screen: WebGLVertexArrayObject;
  private fillTex: DataTexture;
  private infoTex: DataTexture;
  private countryTex: DataTexture;
  private noise: WebGLTexture;
  private fogTargets: [Target, Target] | null = null;
  readonly fillData = new Uint8Array(TEX * TEX * 4);
  readonly infoData = new Uint16Array(TEX * TEX * 4);
  readonly countryData = new Uint8Array(TEX * TEX * 4);
  private dirty = { fill: true, info: true, country: true };
  drawWaterFills = false;
  /** Some regions are unknown to the viewer: they lie under the fog. */
  hasUnknown = false;
  /** 0 … 1: how far fills lean towards opaque when zoomed in, for map modes whose colours carry meaning */
  fillBoost = 0;
  /** The map mode shows the realms' colours (not a map of data). */
  political = true;
  /** The weights of the three map styles (see styles.ts). */
  style: StyleWeights = [0, 0, 1];
  /** How strongly mountains and forests show: fainter over maps of data. */
  symbolAlpha = 1;
  frame = 0;

  constructor(
    readonly canvas: HTMLCanvasElement,
    bundle: MeshBundle,
    opts: RendererOptions,
  ) {
    const gl = canvas.getContext('webgl2', {
      antialias: true,
      alpha: false,
      premultipliedAlpha: false,
      stencil: true,
    });
    if (!gl) throw new Error('WebGL 2 is not available in this browser.');
    this.gl = gl;
    this.fillProg = createProgram(gl, FILL_VS, FILL_FS, ['a_pos', 'a_region']);
    this.lineProg = createProgram(gl, LINE_VS, LINE_FS, ['a_pos', 'a_off', 'a_a', 'a_b', 'a_w', 'a_len']);
    this.blurProg = createProgram(gl, SCREEN_VS, BLUR_FS, ['a_pos']);
    this.fogProg = createProgram(gl, SCREEN_VS, FOG_FS, ['a_pos']);
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
    this.screen = createMesh(
      gl,
      [{ data: new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), size: 2, type: gl.FLOAT }],
      new Uint32Array([0, 1, 2, 1, 3, 2]),
    ).vao;
    this.fillTex = new DataTexture(gl, TEX, TEX, false);
    this.infoTex = new DataTexture(gl, TEX, TEX, true);
    this.countryTex = new DataTexture(gl, TEX, TEX, false);
    this.noise = noiseTexture(gl);
    this.terrain = new TerrainLayer(gl, opts.terrainUrl, opts.worldW, opts.worldH, opts.tileSize);
    this.symbols = new SymbolLayer(gl, opts.symbols);
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
        { data: l.lengths, size: 1, type: gl.FLOAT },
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
    gl.clearStencil(0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);

    const lod = cam.zoom < 0.075 ? 2 : cam.zoom < 0.4 ? 1 : 0;
    const fill = this.fills[lod];
    const smooth = (a: number, b: number, x: number) => {
      const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    const farness = 1 - smooth(0.07, 0.45, cam.zoom); // 1 = zoomed far out
    const px = cam.dpr * (0.85 + 0.35 * smooth(0.3, 2.0, cam.zoom));
    const [man, eng] = this.style;
    const fp = this.fillProg;
    const drawFills = (land: boolean, water: boolean) => {
      gl.bindVertexArray(fill.mesh.vao);
      for (const shift of cam.worldCopies()) {
        gl.uniform1f(fp.u.u_shift, shift);
        if (land) gl.drawElements(gl.TRIANGLES, fill.land[1], gl.UNSIGNED_INT, fill.land[0] * 4);
        if (water) gl.drawElements(gl.TRIANGLES, fill.water[1], gl.UNSIGNED_INT, fill.water[0] * 4);
      }
    };
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.noise);

    // The land, marked in the stencil buffer so that land and sea take their own looks.
    gl.useProgram(fp.prog);
    this.bindCommon(fp, cam);
    this.bindTextures(fp);
    gl.uniform1i(fp.u.u_parchment, 2);
    gl.enable(gl.STENCIL_TEST);
    gl.colorMask(false, false, false, false);
    gl.stencilFunc(gl.ALWAYS, 1, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
    drawFills(true, false);
    gl.colorMask(true, true, true, true);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    gl.stencilFunc(gl.EQUAL, 1, 0xff);
    this.terrain.render(cam, this.frame, { land: true, style: this.style, px, noiseUnit: 3 });
    gl.stencilFunc(gl.NOTEQUAL, 1, 0xff);
    this.terrain.render(cam, this.frame, { land: false, style: this.style, px, noiseUnit: 3 });
    gl.disable(gl.STENCIL_TEST);

    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    // Region fills. On parchment the realms' colours are a wash multiplied into the paper.
    gl.useProgram(fp.prog);
    this.bindCommon(fp, cam);
    this.bindTextures(fp);
    gl.uniform1f(fp.u.u_time, timeSec);
    gl.uniform1i(fp.u.u_parchment, 0);
    gl.uniform3f(fp.u.u_style, this.style[0], this.style[1], this.style[2]);
    gl.uniform1i(fp.u.u_political, this.political ? 1 : 0);
    const alpha = 0.4 + 0.53 * farness;
    const base = alpha + (0.93 - alpha) * this.fillBoost;
    const multiply = this.political ? man : 0;
    if (multiply < 1) {
      gl.uniform1i(fp.u.u_multiply, 0);
      gl.uniform1f(fp.u.u_alpha, base * (1 - multiply));
      drawFills(true, this.drawWaterFills);
    }
    if (multiply > 0) {
      gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform1i(fp.u.u_multiply, 1);
      gl.uniform1f(fp.u.u_alpha, base * multiply);
      drawFills(true, this.drawWaterFills);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }

    // Lines: rivers, borders, highlights
    const lp = this.lineProg;
    const bindLines = () => {
      gl.useProgram(lp.prog);
      this.bindCommon(lp, cam);
      this.bindTextures(lp);
      gl.uniform1f(lp.u.u_px, px);
      gl.uniform1f(lp.u.u_provAlpha, 0.55 * smooth(0.1, 0.35, cam.zoom));
      gl.uniform1f(lp.u.u_riverAlpha, 0.85 * smooth(0.14, 0.4, cam.zoom));
      gl.uniform3f(lp.u.u_style, this.style[0], this.style[1], this.style[2]);
    };
    const drawLines = (mesh: Mesh, mode: number) => {
      gl.uniform1i(lp.u.u_mode, mode);
      gl.bindVertexArray(mesh.vao);
      for (const shift of cam.worldCopies()) {
        gl.uniform1f(lp.u.u_shift, shift);
        gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
      }
    };
    bindLines();
    if (cam.zoom > 0.14) drawLines(this.rivers, 2);
    // Mountains, forests, towns and roses, under the fog and the borders.
    this.symbols.render(cam, px, this.style, this.symbolAlpha);
    bindLines();
    // Terra incognita covers land, sea and rivers alike under a fog with a soft edge.
    if (this.hasUnknown) {
      this.drawFog(cam, drawFills, px);
      bindLines();
    }
    // The engraver's colourist: bands of each realm's colour along its borders.
    if (eng > 0 && this.political) {
      gl.uniform1f(lp.u.u_bandAlpha, eng * (0.55 + 0.45 * farness));
      drawLines(this.borders[lod], 3);
    }
    drawLines(this.borders[lod], 0);
    drawLines(this.borders[lod], 1);
    gl.bindVertexArray(null);
  }

  /** A texture and framebuffer at the fog's resolution. */
  private target(w: number, h: number, old?: Target): Target {
    const gl = this.gl;
    if (old) {
      gl.deleteTexture(old.tex);
      gl.deleteFramebuffer(old.fbo);
    }
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fbo, w, h };
  }

  /**
   * The unknown: its regions drawn as a mask at a quarter of the screen's resolution, blurred, then
   * laid over the map as parchment, paper or mist, so the edge of the known world is soft.
   */
  private drawFog(cam: Camera, drawFills: (land: boolean, water: boolean) => void, px: number) {
    const gl = this.gl;
    const w = Math.max(1, Math.round(cam.width * FOG_SCALE)),
      h = Math.max(1, Math.round(cam.height * FOG_SCALE));
    if (!this.fogTargets || this.fogTargets[0].w !== w || this.fogTargets[0].h !== h)
      this.fogTargets = [this.target(w, h, this.fogTargets?.[0]), this.target(w, h, this.fogTargets?.[1])];
    const [a, b] = this.fogTargets;
    gl.disable(gl.BLEND);
    // The mask.
    gl.bindFramebuffer(gl.FRAMEBUFFER, a.fbo);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const fp = this.fillProg;
    gl.useProgram(fp.prog);
    this.bindCommon(fp, cam);
    this.bindTextures(fp);
    gl.uniform1i(fp.u.u_parchment, 1);
    drawFills(true, true);
    gl.uniform1i(fp.u.u_parchment, 0);
    // The blur, across and then down: about a dozen CSS pixels of soft edge.
    const bp = this.blurProg;
    gl.useProgram(bp.prog);
    gl.uniform1i(bp.u.u_src, 4);
    gl.bindVertexArray(this.screen);
    const reach = px * FOG_SCALE * 2.2;
    gl.activeTexture(gl.TEXTURE4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, b.fbo);
    gl.bindTexture(gl.TEXTURE_2D, a.tex);
    gl.uniform2f(bp.u.u_step, reach / w, 0);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_INT, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, a.fbo);
    gl.bindTexture(gl.TEXTURE_2D, b.tex);
    gl.uniform2f(bp.u.u_step, 0, reach / h);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_INT, 0);
    // The fog over the map.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, cam.width, cam.height);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const fg = this.fogProg;
    gl.useProgram(fg.prog);
    gl.bindTexture(gl.TEXTURE_2D, a.tex);
    gl.uniform1i(fg.u.u_mask, 4);
    gl.uniform1i(fg.u.u_noise, 3);
    gl.uniform2f(fg.u.u_center, cam.x, cam.y);
    gl.uniform1f(fg.u.u_zoom, cam.zoom);
    gl.uniform2f(fg.u.u_viewport, cam.width, cam.height);
    gl.uniform1f(fg.u.u_px, px);
    gl.uniform3f(fg.u.u_style, this.style[0], this.style[1], this.style[2]);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_INT, 0);
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
    if (p.u.u_noise) gl.uniform1i(p.u.u_noise, 3);
  }
}
