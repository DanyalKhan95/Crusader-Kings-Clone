/**
 * The map's symbols: mountains, hills and forests where mapgen's `details` step placed them, the
 * towns of the provinces (their size by development), holy places and the compass roses of the old
 * charts. Each is a sprite of the atlas (sprites.ts) in every style that draws it, blended by the
 * style weights, a fixed size on screen and thinned out as the map zooms out.
 */
import type { SymbolFile } from '../shared/dataTypes';
import type { Camera } from './camera';
import { createProgram, type Program } from './gl';
import { SYMBOL_FS, SYMBOL_VS } from './shaders';
import { paintAtlas, type Atlas, type SpriteName } from './sprites';
import { MAP_STYLES, ROSES, type StyleWeights } from './styles';

/**
 * Floats per instance: x, y, size (CSS px), scale at which it shows; three sprites and the anchor
 * (0 centred, 1 standing on its place, 2 beside it up and to the right, 3 centred, shrinking far out
 * but never growing).
 */
const STRIDE = 8;

/** How far apart (CSS px) symbols of each family stand at least, which sets when a tier shows. */
const RELIEF_GAP = 24;
const FOREST_GAP = 15;

/** A town on the map: where, how big, and whether it is a holy place (and of which sign). */
export interface TownMark {
  x: number;
  y: number;
  /** 0 small, 1 middling, 2 great, 3 a realm's capital */
  size: number;
  /** the scale (CSS px per map unit) from which it shows */
  from: number;
  holy?: 'cross' | 'crescent' | 'star' | 'sun';
}

/** The scale (CSS px per map unit) from which towns of each size show: small, middling, great, capitals. */
export const TOWN_FROM = [0.95, 0.5, 0.22, 0.1];

/** Towns of each region id, as mapgen placed them (0, 0 where a province has none). */
export function decodeTowns(file: SymbolFile | null): Uint16Array {
  return file ? base64U16(file.towns) : new Uint16Array(0);
}

function base64U16(s: string): Uint16Array {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Uint16Array(bytes.buffer);
}

interface Batch {
  vao: WebGLVertexArrayObject;
  buf: WebGLBuffer;
  count: number;
}

export class SymbolLayer {
  private prog: Program;
  private atlas: Atlas;
  private tex: WebGLTexture;
  private quad: WebGLBuffer;
  private terrain: Batch;
  private marks: Batch;
  private roses: Batch;

  constructor(
    private gl: WebGL2RenderingContext,
    file: SymbolFile | null,
  ) {
    this.prog = createProgram(gl, SYMBOL_VS, SYMBOL_FS, ['a_quad', 'a_inst', 'a_sprite']);
    this.atlas = paintAtlas();
    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, this.atlas.canvas);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    this.terrain = this.batch(file ? this.terrainInstances(file) : new Float32Array(0));
    this.marks = this.batch(new Float32Array(0));
    this.roses = this.batch(this.roseInstances());
  }

  private batch(data: Float32Array): Batch {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, STRIDE * 4, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, STRIDE * 4, 16);
    gl.vertexAttribDivisor(2, 1);
    gl.bindVertexArray(null);
    return { vao, buf, count: data.length / STRIDE };
  }

  /** The three styles' sprites of a name, as the shader takes them. */
  private sprites(name: SpriteName): [number, number, number] {
    const [a, b, c] = MAP_STYLES.map((s) => this.atlas.index(s, name));
    return [a, b, c];
  }

  private terrainInstances(file: SymbolFile): Float32Array {
    const raw = base64U16(file.symbols);
    const n = raw.length / 4;
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => raw[a * 4 + 1] - raw[b * 4 + 1]);
    const out = new Float32Array(n * STRIDE);
    const names: SpriteName[][] = [
      ['mountain0', 'mountain1', 'mountain2', 'mountain0'],
      ['hill0', 'hill1', 'hill0', 'hill1'],
      ['conifer0', 'conifer1', 'conifer0', 'conifer1'],
      ['broadleaf0', 'broadleaf1', 'broadleaf0', 'broadleaf1'],
      ['palm0', 'palm1', 'palm0', 'palm1'],
    ];
    const cache = new Map<SpriteName, [number, number, number]>();
    order.forEach((i, k) => {
      const x = raw[i * 4],
        y = raw[i * 4 + 1],
        code = raw[i * 4 + 2],
        size = raw[i * 4 + 3] / 255;
      const kind = code >> 8,
        tier = (code >> 4) & 15,
        variant = code & 15;
      const relief = kind <= 1;
      const spacing = (relief ? file.tiers.relief : file.tiers.forest)[tier] ?? 1;
      const name = names[kind]?.[variant] ?? 'hill0';
      let s = cache.get(name);
      if (!s) cache.set(name, (s = this.sprites(name)));
      const px = kind === 0 ? 20 + 16 * size : kind === 1 ? 15 + 7 * size : 11 + (variant & 1) * 2;
      out.set([x, y, px, (relief ? RELIEF_GAP : FOREST_GAP) / spacing, s[0], s[1], s[2], 1], k * STRIDE);
    });
    return out;
  }

  private roseInstances(): Float32Array {
    const s = this.sprites('rose');
    const out = new Float32Array(ROSES.length * STRIDE);
    ROSES.forEach((r, i) => out.set([r.x, r.y, 116, 0.05, s[0], s[1], s[2], 3], i * STRIDE));
    return out;
  }

  /** The towns and holy places to draw (after the world changed: owners, development, capitals). */
  setTowns(towns: TownMark[]) {
    const gl = this.gl;
    const holyNames = {
      cross: 'holy_cross',
      crescent: 'holy_crescent',
      star: 'holy_star',
      sun: 'holy_sun',
    } as const satisfies Record<NonNullable<TownMark['holy']>, SpriteName>;
    const sorted = towns.slice().sort((a, b) => a.y - b.y);
    const out: number[] = [];
    for (const t of sorted) {
      const s = this.sprites(t.size === 3 ? 'capital' : (`town${t.size}` as SpriteName));
      out.push(t.x, t.y, [15, 19, 23, 27][t.size], t.from, s[0], s[1], s[2], 0);
    }
    // Holy places: a roundel beside the town, drawn over it.
    for (const t of sorted) {
      if (!t.holy) continue;
      const s = this.sprites(holyNames[t.holy]);
      out.push(t.x, t.y, 15, Math.max(t.from, 0.22), s[0], s[1], s[2], 2);
    }
    const data = new Float32Array(out);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.marks.buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    this.marks.count = data.length / STRIDE;
  }

  /**
   * Draws the symbols for the camera: `terrainAlpha` for mountains and forests (fainter over maps of
   * data), towns and roses at full strength.
   */
  render(cam: Camera, px: number, style: StyleWeights, terrainAlpha: number) {
    const gl = this.gl;
    const p = this.prog;
    gl.useProgram(p.prog);
    gl.uniform2f(p.u.u_center, cam.x, cam.y);
    gl.uniform1f(p.u.u_zoom, cam.zoom);
    gl.uniform2f(p.u.u_viewport, cam.width, cam.height);
    gl.uniform1f(p.u.u_px, px);
    gl.uniform1f(p.u.u_scale, cam.zoom / px);
    gl.uniform3f(p.u.u_style, style[0], style[1], style[2]);
    gl.uniform4fv(p.u.u_rects, this.atlas.rects);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(p.u.u_atlas, 4);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const draw = (b: Batch, alpha: number) => {
      if (!b.count || alpha <= 0) return;
      gl.uniform1f(p.u.u_alpha, alpha);
      gl.bindVertexArray(b.vao);
      for (const shift of cam.worldCopies()) {
        gl.uniform1f(p.u.u_shift, shift);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, b.count);
      }
    };
    draw(this.roses, 1);
    draw(this.terrain, terrainAlpha);
    draw(this.marks, 1);
    gl.bindVertexArray(null);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
}
