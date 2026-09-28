/**
 * Terrain texture: a low-res image of the whole world (always resident) plus high-res tiles that
 * stream in when zoomed in, kept in a small LRU cache to bound GPU memory. Three textures of detail
 * for the map's styles lie over the whole world beside it: the hillshade, the steepness of the land
 * and the distance from the coast (mapgen's `details` step).
 */
import type { Camera } from './camera';
import { createProgram, type Program } from './gl';
import { TERRAIN_FS, TERRAIN_VS } from './shaders';
import { ROSES, type StyleWeights } from './styles';

/** How a pass of the terrain is drawn: the land or the waters, in the map style of the moment. */
export interface TerrainPass {
  land: boolean;
  style: StyleWeights;
  /** device pixels per CSS pixel, for patterns that keep their size on screen */
  px: number;
  /** the texture unit holding the noise texture */
  noiseUnit: number;
}

interface Tile {
  tex: WebGLTexture | null;
  loading: boolean;
  failed: boolean;
  lastUsed: number;
}

/** The roses as the shader takes them: x, y, reach, 0. */
const ROSE_DATA = new Float32Array(ROSES.flatMap((r) => [r.x, r.y, r.reach, 0]));

const HI_ZOOM = 0.34; // device px per map unit at which low-res texels (4 units) start to blur
const MAX_TILES = 16;

export class TerrainLayer {
  private prog: Program;
  private vao: WebGLVertexArrayObject;
  private buf: WebGLBuffer;
  private lo: WebGLTexture | null = null;
  /** Hillshade, steepness and distance from the coast, on texture units 5, 6 and 7. */
  private details: WebGLTexture[] = [];
  private tiles = new Map<string, Tile>();
  private aniso: number;
  private anisoExt: EXT_texture_filter_anisotropic | null;
  onTileLoaded: () => void = () => {};

  constructor(
    private gl: WebGL2RenderingContext,
    private baseUrl: string,
    private worldW: number,
    private worldH: number,
    private tileSize: number,
  ) {
    this.prog = createProgram(gl, TERRAIN_VS, TERRAIN_FS, ['a_pos', 'a_uv']);
    this.vao = gl.createVertexArray()!;
    this.buf = gl.createBuffer()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
    gl.bindVertexArray(null);
    this.anisoExt = gl.getExtension('EXT_texture_filter_anisotropic');
    this.aniso = this.anisoExt ? Math.min(8, gl.getParameter(this.anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT)) : 0;
  }

  async loadBase(): Promise<void> {
    const [lo, ...details] = await Promise.all([
      this.loadTexture(`${this.baseUrl}/lo.webp`),
      // Without its details the map still draws, in plainer styles.
      ...['shade', 'slope', 'coast'].map((name, i) =>
        this.loadTexture(`${this.baseUrl}/${name}.webp`, true).catch(() => this.flat(i === 1 ? 0 : 128)),
      ),
    ]);
    this.lo = lo;
    this.details = details;
  }

  /** A texture of one grey value, standing in for a detail that did not load. */
  private flat(value: number): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([value]));
    return tex;
  }

  /** A texture from an image: colour, or (`gray`) one channel of data that wraps round the world. */
  private async loadTexture(url: string, gray = false): Promise<WebGLTexture> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
    const bmp = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (gray) gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, bmp);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, gl.RGB, gl.UNSIGNED_BYTE, bmp);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gray ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (this.anisoExt) gl.texParameterf(gl.TEXTURE_2D, this.anisoExt.TEXTURE_MAX_ANISOTROPY_EXT, this.aniso);
    bmp.close();
    return tex;
  }

  private requestTile(tx: number, ty: number, frame: number): Tile {
    const key = `${tx}-${ty}`;
    let t = this.tiles.get(key);
    if (!t) {
      t = { tex: null, loading: true, failed: false, lastUsed: frame };
      this.tiles.set(key, t);
      const tile = t;
      this.loadTexture(`${this.baseUrl}/hi-${key}.webp`)
        .then((tex) => {
          tile.tex = tex;
          tile.loading = false;
          this.evict(frame);
          this.onTileLoaded();
        })
        .catch(() => {
          tile.loading = false;
          tile.failed = true;
        });
    }
    t.lastUsed = frame;
    return t;
  }

  private evict(frame: number) {
    const loaded = [...this.tiles.entries()].filter(([, t]) => t.tex);
    if (loaded.length <= MAX_TILES) return;
    loaded.sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (const [key, t] of loaded.slice(0, loaded.length - MAX_TILES)) {
      if (t.lastUsed === frame) continue;
      this.gl.deleteTexture(t.tex);
      this.tiles.delete(key);
    }
  }

  private quad(x0: number, y0: number, x1: number, y1: number, u0: number, v0: number, u1: number, v1: number) {
    const gl = this.gl;
    const d = new Float32Array([x0, y0, u0, v0, x1, y0, u1, v0, x0, y1, u0, v1, x1, y1, u1, v1]);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, d, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  render(cam: Camera, frame: number, pass: TerrainPass) {
    const gl = this.gl;
    if (!this.lo) return;
    gl.useProgram(this.prog.prog);
    gl.uniform2f(this.prog.u.u_center, cam.x, cam.y);
    gl.uniform1f(this.prog.u.u_zoom, cam.zoom);
    gl.uniform2f(this.prog.u.u_viewport, cam.width, cam.height);
    gl.uniform1i(this.prog.u.u_tex, 0);
    gl.uniform1i(this.prog.u.u_noise, pass.noiseUnit);
    gl.uniform1i(this.prog.u.u_land, pass.land ? 1 : 0);
    gl.uniform1f(this.prog.u.u_px, pass.px);
    gl.uniform3f(this.prog.u.u_style, pass.style[0], pass.style[1], pass.style[2]);
    // Paper tone fades in when zoomed far out.
    const paper = Math.min(0.55, Math.max(0, (0.16 - cam.zoom) / 0.16) * 0.9);
    gl.uniform1f(this.prog.u.u_paper, paper);
    gl.uniform2f(this.prog.u.u_world, this.worldW, this.worldH);
    gl.uniform4fv(this.prog.u.u_roses, ROSE_DATA);
    gl.uniform1i(this.prog.u.u_roseCount, ROSES.length);
    this.details.forEach((tex, i) => {
      gl.activeTexture(gl.TEXTURE5 + i);
      gl.bindTexture(gl.TEXTURE_2D, tex);
    });
    gl.uniform1i(this.prog.u.u_shade, 5);
    gl.uniform1i(this.prog.u.u_slope, 6);
    gl.uniform1i(this.prog.u.u_coast, 7);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(this.vao);
    const [vx0, vy0, vx1, vy1] = cam.viewRect();
    const S = this.tileSize;
    for (const shift of cam.worldCopies()) {
      gl.uniform1f(this.prog.u.u_shift, shift);
      gl.bindTexture(gl.TEXTURE_2D, this.lo);
      this.quad(0, 0, this.worldW, this.worldH, 0, 0, 1, 1);
      if (cam.zoom < HI_ZOOM) continue;
      const lx0 = vx0 - shift,
        lx1 = vx1 - shift;
      for (let ty = Math.max(0, Math.floor(vy0 / S)); ty <= Math.min(this.worldH / S - 1, Math.floor(vy1 / S)); ty++)
        for (
          let tx = Math.max(0, Math.floor(lx0 / S));
          tx <= Math.min(this.worldW / S - 1, Math.floor(lx1 / S));
          tx++
        ) {
          const t = this.requestTile(tx, ty, frame);
          if (!t.tex) continue;
          gl.bindTexture(gl.TEXTURE_2D, t.tex);
          this.quad(tx * S, ty * S, (tx + 1) * S, (ty + 1) * S, 0, 0, 1, 1);
        }
    }
    gl.bindVertexArray(null);
  }
}
