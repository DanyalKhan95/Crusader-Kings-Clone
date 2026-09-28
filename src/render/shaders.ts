/**
 * GLSL ES 3.00 shaders for the map. Most take `u_style`, the weights of the three map styles
 * (manuscript, engraved, modern; see styles.ts), and blend what each would draw, so that a change
 * of style can fade. Patterns meant to look drawn by hand (hachures, stipple, grain) are laid out in
 * CSS pixels, so they keep their size on screen at any zoom.
 */

import { PX_PER_RAD, Y_TOP } from '../shared/projection';
import { MAX_SPRITES } from './sprites';

const HEAD = `#version 300 es
precision highp float;
precision highp int;
`;

const TRANSFORM = `
uniform vec2 u_center;
uniform float u_zoom;
uniform vec2 u_viewport;
uniform float u_shift;
vec4 toClip(vec2 p) {
  vec2 s = (p + vec2(u_shift, 0.0) - u_center) * u_zoom;
  return vec4(s.x * 2.0 / u_viewport.x, -s.y * 2.0 / u_viewport.y, 0.0, 1.0);
}
`;

// Region data textures are 64 wide.
const FETCH = `
ivec2 texel(int i) { return ivec2(i & 63, i >> 6); }
`;

/** The noise texture: r, g smooth noise; b, a white noise, one value per texel (256×256, repeating). */
const NOISE = `
uniform sampler2D u_noise;
float lum(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }
/** Ink of parallel lines \`spacing\` CSS px apart and \`width\` wide, across direction \`dir\`. */
float hatch(vec2 p, vec2 dir, float spacing, float width) {
  float d = abs(fract(dot(p, dir) / spacing) - 0.5) * spacing;
  return 1.0 - smoothstep(width * 0.5 - 0.4, width * 0.5 + 0.4, d);
}
/** Dots scattered on a grid of \`cell\` CSS px, each present with chance \`p\`. */
float stipple(vec2 p, float cell, float p_, float radius) {
  vec2 k = floor(p / cell);
  vec4 r = texelFetch(u_noise, ivec2(mod(k, 256.0)), 0);
  vec2 centre = (k + 0.2 + 0.6 * r.ba) * cell;
  float dot_ = 1.0 - smoothstep(radius - 0.35, radius + 0.35, length(p - centre));
  return dot_ * step(fract(r.b * 13.7 + r.a * 7.3), p_);
}
`;

export const TERRAIN_VS = `${HEAD}${TRANSFORM}
in vec2 a_pos;
in vec2 a_uv;
out vec2 v_uv;
out vec2 v_map;
void main() {
  v_uv = a_uv;
  v_map = a_pos;
  gl_Position = toClip(a_pos);
}`;

/** Latitude (degrees) of a map point's y, for the graticule. */
const LATITUDE = `
const float Y_TOP = ${Y_TOP.toFixed(6)};
const float PX_PER_RAD = ${PX_PER_RAD.toFixed(6)};
float latitude(float y) {
  return (2.5 * atan(exp(0.8 * (Y_TOP - y / PX_PER_RAD))) - 0.625 * 3.14159265) * 57.2957795;
}
`;

/** Stains of old paper at three scales, turned against each other so that they never fall in a grid. */
const BLOT = `
float blotAt(vec2 m) {
  float a = texture(u_noise, m / 5300.0 + vec2(0.31, 0.17)).r;
  float b = texture(u_noise, mat2(0.8, -0.6, 0.6, 0.8) * m / 1700.0).g;
  float c = texture(u_noise, mat2(0.28, 0.96, -0.96, 0.28) * m / 610.0).r;
  return clamp((a * 0.5 + b * 0.3 + c * 0.2 - 0.5) * 2.4 + 0.5, 0.0, 1.0);
}
`;

export const TERRAIN_FS = `${HEAD}${NOISE}${LATITUDE}${BLOT}
in vec2 v_uv;
in vec2 v_map;
uniform sampler2D u_tex;
uniform sampler2D u_shade;  // hillshade of the land: 0.5 flat, darker in shadow
uniform sampler2D u_slope;  // steepness of the land
uniform sampler2D u_coast;  // signed distance from the coast: 0.5 + d / 510 map units, out to sea
uniform vec2 u_world;
uniform float u_paper;
uniform float u_zoom;
uniform float u_px;
uniform vec3 u_style;
uniform int u_land; // 1: the land, drawn where the land mask is; 0: the waters
uniform vec4 u_roses[8]; // compass roses: x, y, reach (map units)
uniform int u_roseCount;
out vec4 o;

/** Ink of a line \`w\` device px wide at a distance \`d\` device px, with a pixel of soft edge. */
float ink(float d, float w) {
  return 1.0 - smoothstep(w * 0.5 - 0.5, w * 0.5 + 0.5, d);
}

/** The rhumb lines of the roses over the sea: how much ink, and which wind (0 main, 1 half, 2 quarter). */
float rhumbs(vec2 m, out float wind) {
  float best = 0.0;
  wind = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= u_roseCount) break;
    vec4 r = u_roses[i];
    vec2 d = m - r.xy;
    d.x -= floor(d.x / u_world.x + 0.5) * u_world.x;
    float len = length(d);
    if (len > r.z || len < 1.0) continue;
    float k = atan(d.y, d.x) / (3.14159265 / 16.0);
    float kr = floor(k + 0.5);
    float dist = len * abs(sin((k - kr) * 3.14159265 / 16.0)) * u_zoom; // device px from the ray
    int idx = int(mod(kr + 32.0, 32.0));
    float w = (idx % 4 == 0 ? 1.1 : 0.8) * u_px;
    float a = ink(dist, w) * (1.0 - smoothstep(r.z * 0.55, r.z, len)) * smoothstep(0.0, 26.0 * u_px, len * u_zoom);
    if (a > best) {
      best = a;
      wind = idx % 4 == 0 ? 0.0 : idx % 2 == 0 ? 1.0 : 2.0;
    }
  }
  return best;
}

void main() {
  vec3 c = texture(u_tex, v_uv).rgb;
  float l = lum(c);
  vec2 mv = v_map / u_world;
  vec2 q = v_map * u_zoom / u_px; // CSS px, fixed to the map
  float blot = blotAt(v_map);
  float grain = texture(u_noise, q / 48.0).g;
  float sd = (texture(u_coast, mv).r * 255.0 - 128.0) * 2.0; // map units from the coast, out to sea
  float fromCoast = abs(sd) * u_zoom / u_px;                  // the same in CSS px
  // The graticule, every ten degrees.
  float gLat = latitude(v_map.y) / 10.0;
  float gLon = v_map.x / (u_world.x / 36.0);
  float grid = max(ink(abs(gLat - floor(gLat + 0.5)) / max(1e-5, fwidth(gLat)), u_px * 0.9),
                   ink(abs(gLon - floor(gLon + 0.5)) / max(1e-5, fwidth(gLon)), u_px * 0.9));
  grid *= smoothstep(0.02, 0.05, u_zoom);
  vec3 man, eng, mdn;
  if (u_land == 1) {
    vec3 hue = clamp(c / max(0.03, l), 0.55, 1.5);
    float sh = (texture(u_shade, mv).r * 255.0 - 128.0) / 120.0; // -1 in deep shadow, up to +0.55 in the sun
    float sl = texture(u_slope, mv).r;
    float coastBand = 1.0 - smoothstep(0.0, 4.0, fromCoast);
    // Manuscript: parchment, a thin wash of the land's colour, the hills brushed in sepia.
    man = mix(vec3(0.83, 0.74, 0.56), vec3(0.94, 0.88, 0.7), blot) * mix(vec3(1.0), hue, 0.22);
    man *= 1.0 + clamp(sh * 0.5, -0.42, 0.14);
    man = mix(man, vec3(0.56, 0.44, 0.3), sl * 0.2);
    man *= (1.0 - 0.1 * coastBand) * (0.95 + 0.07 * grain);
    // Engraved: white paper lightly tinted, the slopes hachured, cross-hatched in shadow.
    eng = mix(vec3(0.925, 0.9, 0.81), vec3(0.975, 0.955, 0.89), blot) * mix(vec3(1.0), hue, 0.12);
    float shadow = clamp(-sh * 1.8, 0.0, 1.0);
    float steep = smoothstep(0.02, 0.6, sl);
    float lines = hatch(q, vec2(0.7071, 0.7071), 3.1, 0.4 + 1.4 * steep * (0.5 + 0.7 * shadow)) * smoothstep(0.03, 0.12, steep);
    lines = max(lines, hatch(q, vec2(0.7071, -0.7071), 3.1, 1.2 * shadow) * smoothstep(0.25, 0.45, shadow * steep * 1.6));
    eng = mix(eng, vec3(0.22, 0.18, 0.13), lines * 0.78);
    eng *= (1.0 - 0.07 * coastBand) * (0.97 + 0.04 * grain);
    eng = mix(eng, vec3(0.45, 0.33, 0.24), grid * 0.35);
    // Modern: the painted relief as it is, a little cleaner.
    mdn = mix(c, vec3(l), 0.1) * 1.03;
  } else {
    // The terrain's own shading tells shallows from the deep.
    float deep = clamp((0.43 - l) * 3.2, 0.0, 1.0);
    float wind;
    float rh = rhumbs(v_map, wind) * smoothstep(0.035, 0.08, u_zoom);
    // Manuscript: a blue-green wash, deeper along the coast where the brush went round it, and
    // the rhumb lines of the portolans: black for the eight winds, green and red for the rest.
    man = mix(vec3(0.66, 0.76, 0.69), vec3(0.5, 0.63, 0.6), deep * 0.8) * (0.95 + 0.08 * blot);
    man = mix(man, vec3(0.4, 0.55, 0.53), 0.5 * (1.0 - smoothstep(0.0, 10.0, fromCoast)));
    man *= 0.97 + 0.04 * grain;
    vec3 windInk = wind < 0.5 ? vec3(0.2, 0.15, 0.1) : wind < 1.5 ? vec3(0.18, 0.42, 0.24) : vec3(0.62, 0.2, 0.14);
    man = mix(man, windInk, rh * 0.55);
    // Engraved: pale water, the coast echoed out to sea in fading lines, then a stipple.
    eng = mix(vec3(0.85, 0.89, 0.89), vec3(0.9, 0.925, 0.915), blot);
    float px = fromCoast * u_px; // device px
    float wl = 0.0;
    float aa = max(1.0, fwidth(px));
    float gaps[4] = float[](2.4, 5.4, 9.0, 13.6);
    for (int i = 0; i < 4; i++) {
      float d = abs(px - gaps[i] * u_px);
      wl = max(wl, (1.0 - smoothstep(0.3 * u_px, 0.3 * u_px + aa, d)) * (0.62 - float(i) * 0.13));
    }
    float band = smoothstep(15.0, 18.0, fromCoast) * (1.0 - smoothstep(20.0, 44.0, fromCoast));
    float dots = stipple(q, 3.2, 0.45 * band, 0.5);
    eng = mix(eng, vec3(0.22, 0.28, 0.32), max(wl, dots * 0.5));
    eng = mix(eng, vec3(0.3, 0.33, 0.35), max(rh * 0.32, grid * 0.3));
    // Modern: the terrain's sea, and a faint graticule.
    mdn = mix(c, vec3(0.8, 0.88, 0.95), grid * 0.18);
  }
  // Far away the modern map turns into a flatter, warmer, paper-toned chart.
  vec3 flat_ = mix(vec3(l), mdn, 0.5) * vec3(1.04, 1.0, 0.9);
  mdn = mix(mdn, flat_, u_paper);
  o = vec4(man * u_style.x + eng * u_style.y + mdn * u_style.z, 1.0);
}`;

export const FILL_VS = `${HEAD}${TRANSFORM}${FETCH}
in vec2 a_pos;
in float a_region;
uniform sampler2D u_fill;
uniform highp usampler2D u_info;
uniform sampler2D u_countryColor;
out vec4 v_color;
out vec4 v_stripe;
out vec2 v_map;
flat out uint v_flags;
void main() {
  int r = int(a_region + 0.5);
  v_color = texelFetch(u_fill, texel(r), 0);
  uvec4 info = texelFetch(u_info, texel(r), 0);
  v_flags = info.a;
  v_stripe = vec4(0.0);
  if (info.b != 0u && info.b != info.r) v_stripe = texelFetch(u_countryColor, texel(int(info.b)), 0);
  v_map = a_pos;
  gl_Position = toClip(a_pos);
}`;

export const FILL_FS = `${HEAD}${NOISE}${BLOT}
in vec4 v_color;
in vec4 v_stripe;
in vec2 v_map;
flat in uint v_flags;
uniform float u_zoom;
uniform float u_time;
uniform float u_alpha;
uniform vec3 u_style;
uniform int u_political; // the political map modes: fills are the realms' colours
uniform int u_parchment; // 1: only the unknown, for the fog's mask; 2: every region, for the land mask
uniform int u_multiply;  // the colour will be multiplied into what lies below: premultiply it
out vec4 o;
void main() {
  bool unknown = (v_flags & 4u) != 0u;
  if (u_parchment == 2) {
    o = vec4(1.0);
    return;
  }
  if (u_parchment == 1) {
    if (!unknown) discard;
    o = vec4(1.0);
    return;
  }
  if (unknown) discard;
  vec4 c = v_color;
  if (v_stripe.a > 0.0) {
    float s = fract((v_map.x + v_map.y) * u_zoom / 16.0);
    if (s < 0.42) c = vec4(v_stripe.rgb, max(c.a, 0.75));
  }
  if ((v_flags & 128u) != 0u) {
    // Pestilence: the land darkens under a cross-hatch of sickly ink, the same size at any zoom.
    vec2 q = v_map * u_zoom / 11.0;
    float h = min(abs(fract(q.x + q.y) - 0.5), abs(fract(q.x - q.y) - 0.5));
    float ink = 1.0 - smoothstep(0.07, 0.13, h);
    c.rgb = mix(c.rgb, vec3(0.2, 0.22, 0.13), 0.4);
    c.rgb = mix(c.rgb, vec3(0.05, 0.06, 0.03), ink * 0.8);
    c.a = max(c.a, 0.72);
  }
  if ((v_flags & 2u) != 0u) c.rgb = mix(c.rgb, vec3(1.0), 0.16);
  if ((v_flags & 1u) != 0u) {
    c.rgb = mix(c.rgb, vec3(1.0, 0.93, 0.75), 0.26 + 0.07 * sin(u_time * 3.0));
    c.a = max(c.a, 0.45);
  }
  // The styles' washes: a mottled watercolour on parchment; a faint tint on an engraved plate,
  // whose colour lies in bands along the borders; flat colour on a modern map.
  float wash = u_style.z;
  float blot = blotAt(v_map);
  if (u_political == 1) wash += u_style.x * (0.82 + 0.3 * blot) + u_style.y * 0.3;
  else wash += u_style.x * (0.9 + 0.15 * blot) + u_style.y * 0.9;
  float a = clamp(c.a * u_alpha * wash, 0.0, 1.0);
  o = u_multiply == 1 ? vec4(c.rgb * a, a) : vec4(c.rgb, a);
}`;

export const LINE_VS = `${HEAD}${TRANSFORM}${FETCH}
in vec2 a_pos;
in vec2 a_off;
in float a_a;
in float a_b;
in float a_w;
in float a_len;
uniform highp usampler2D u_info;
uniform sampler2D u_countryColor;
uniform int u_mode;        // 0 borders, 1 highlight, 2 rivers, 3 hand-coloured bands along realm borders
uniform float u_px;        // device pixels per CSS pixel
uniform float u_provAlpha; // province borders fade out when zoomed out
uniform float u_riverAlpha;
uniform vec3 u_style;
out vec4 v_color;
out vec4 v_colorA;
out vec4 v_colorB;
out float v_side;
out float v_width;
out float v_dash;
out float v_len;
const uint WATER = 16u;
/** The styles' take on a line: width in CSS px and colour, blended by the style weights. */
float sw(float m, float e, float n) { return (m * u_style.x + e * u_style.y + n * u_style.z) * u_px; }
vec4 sc(vec4 m, vec4 e, vec4 n) { return m * u_style.x + e * u_style.y + n * u_style.z; }
/** A dash length for the style that dominates (0: solid). */
float sd(float m, float e, float n) { return u_style.x >= 0.5 ? m : u_style.y >= 0.5 ? e : n; }
void main() {
  float w = 0.0;
  float dash = 0.0;
  vec4 col = vec4(0.0);
  v_colorA = vec4(0.0);
  v_colorB = vec4(0.0);
  if (u_mode == 2) {
    float k = a_w >= 3.0 ? 2.4 : a_w >= 2.0 ? 1.6 : 1.0;
    w = sw(k * 0.9, k * 0.8, k);
    col = sc(vec4(0.27, 0.43, 0.47, 0.85), vec4(0.2, 0.25, 0.3, 0.85), vec4(0.23, 0.42, 0.58, 1.0));
    col.a *= u_riverAlpha * (a_w >= 2.0 ? 1.0 : 0.8);
  } else {
    int A = int(a_a + 0.5), B = int(a_b + 0.5);
    uvec4 ia = texelFetch(u_info, texel(A), 0);
    uvec4 ib = texelFetch(u_info, texel(B), 0);
    bool landA = (ia.a & WATER) == 0u, landB = (ib.a & WATER) == 0u;
    bool unkA = (ia.a & 4u) != 0u, unkB = (ib.a & 4u) != 0u;
    if (unkA || unkB) {
      // The unknown has no borders; the fog's soft edge is the edge of the known world.
      w = 0.0;
    } else if (u_mode == 3) {
      // An engraver's colourist laid each realm's colour in a band along the inside of its border.
      if (landA && landB && ia.g != ib.g) {
        w = 11.0 * u_px;
        if (ia.g != 0u) v_colorA = vec4(texelFetch(u_countryColor, texel(int(ia.g)), 0).rgb, 0.62);
        if (ib.g != 0u) v_colorB = vec4(texelFetch(u_countryColor, texel(int(ib.g)), 0).rgb, 0.62);
        col = vec4(1.0);
      }
    } else if (u_mode == 0) {
      if (landA && landB) {
        if (ia.r != ib.r && (ia.r != 0u || ib.r != 0u)) {
          if (ia.g != ib.g) {
            // Realm borders: gilt on parchment, a dashed line on the plate, dark and crisp today.
            w = sw(2.1, 1.3, 2.4);
            col = sc(vec4(0.58, 0.36, 0.1, 0.9), vec4(0.13, 0.1, 0.08, 0.9), vec4(0.07, 0.05, 0.04, 0.9));
            dash = sd(0.0, 7.0, 0.0);
          } else {
            w = sw(1.1, 1.0, 1.3);
            col = sc(vec4(0.5, 0.25, 0.14, 0.7), vec4(0.15, 0.12, 0.1, 0.75), vec4(0.12, 0.09, 0.07, 0.75));
            dash = sd(3.2, 3.0, 0.0);
          }
        } else {
          w = sw(0.8, 0.7, 0.9);
          col = sc(vec4(0.36, 0.26, 0.16, 0.8), vec4(0.2, 0.17, 0.14, 0.8), vec4(0.1, 0.08, 0.06, 1.0));
          col.a *= u_provAlpha;
          dash = sd(0.0, 2.6, 0.0);
        }
      } else if (landA != landB) {
        // Coasts: inked on parchment and on the plate; soft today.
        w = sw(1.8, 1.2, 1.1);
        col = sc(vec4(0.3, 0.2, 0.12, 0.92), vec4(0.18, 0.16, 0.14, 0.9), vec4(0.14, 0.18, 0.2, 0.55));
      } else {
        w = sw(0.7, 0.7, 0.8);
        col = sc(vec4(0.3, 0.3, 0.26, 0.5), vec4(0.25, 0.28, 0.3, 0.55), vec4(0.75, 0.85, 0.95, 1.0));
        col.a *= u_provAlpha * 0.35;
        dash = sd(0.0, 2.4, 0.0);
      }
    } else {
      bool selA = (ia.a & 1u) != 0u, selB = (ib.a & 1u) != 0u;
      bool hovA = (ia.a & 2u) != 0u, hovB = (ib.a & 2u) != 0u;
      bool plA = (ia.a & 64u) != 0u, plB = (ib.a & 64u) != 0u;
      if (selA != selB) { w = 3.2 * u_px; col = vec4(1.0, 0.86, 0.45, 1.0); }
      else if (hovA != hovB) { w = 1.8 * u_px; col = vec4(1.0, 0.98, 0.9, 0.85); }
      else if (plA != plB) { w = 2.6 * u_px; col = vec4(0.95, 0.78, 0.35, 0.8); }
    }
  }
  v_color = col;
  v_side = gl_VertexID % 2 == 0 ? 1.0 : -1.0;
  v_width = w;
  v_dash = dash;
  v_len = a_len * u_zoom / u_px;
  vec2 p = a_pos + a_off * (w * 0.5 / u_zoom);
  gl_Position = w > 0.0 ? toClip(p) : vec4(2.0, 2.0, 2.0, 1.0);
}`;

export const LINE_FS = `${HEAD}
in vec4 v_color;
in vec4 v_colorA;
in vec4 v_colorB;
in float v_side;
in float v_width;
in float v_dash;
in float v_len;
uniform int u_mode;
uniform float u_bandAlpha;
out vec4 o;
void main() {
  if (u_mode == 3) {
    // Each half of the band takes its side's colour, strongest at the border.
    vec4 c = v_side > 0.0 ? v_colorA : v_colorB;
    float k = 1.0 - abs(v_side);
    o = vec4(c.rgb, c.a * u_bandAlpha * k * k);
    return;
  }
  if (v_dash > 0.0 && fract(v_len / v_dash) > 0.62) discard;
  // soften the outer ~0.8px of each line
  float edge = clamp((1.0 - abs(v_side)) * v_width / 1.6, 0.0, 1.0);
  float a = v_color.a * mix(0.35, 1.0, edge);
  if (v_width < 1.0) a *= v_width;
  o = vec4(v_color.rgb, a);
}`;

/** A quad over the whole screen, for the fog of the unknown and its blur. */
export const SCREEN_VS = `${HEAD}
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

/** One direction of a Gaussian blur of the fog's mask. */
export const BLUR_FS = `${HEAD}
in vec2 v_uv;
uniform sampler2D u_src;
uniform vec2 u_step;
out vec4 o;
void main() {
  float w[7] = float[](0.1964, 0.1745, 0.1216, 0.0667, 0.0287, 0.0097, 0.0026);
  float s = texture(u_src, v_uv).r * w[0];
  for (int i = 1; i < 7; i++) {
    s += texture(u_src, v_uv + u_step * float(i)).r * w[i];
    s += texture(u_src, v_uv - u_step * float(i)).r * w[i];
  }
  o = vec4(s, 0.0, 0.0, 1.0);
}`;

/** The unknown, drawn over the map from the blurred mask: its edge is soft, as a map maker left it. */
export const FOG_FS = `${HEAD}${NOISE}${BLOT}
in vec2 v_uv;
uniform sampler2D u_mask;
uniform vec2 u_center;
uniform float u_zoom;
uniform vec2 u_viewport;
uniform float u_px;
uniform vec3 u_style;
out vec4 o;
void main() {
  float m = texture(u_mask, v_uv).r;
  float a = smoothstep(0.3, 0.85, m);
  if (a <= 0.0) discard;
  vec2 s = vec2(gl_FragCoord.x - u_viewport.x * 0.5, u_viewport.y * 0.5 - gl_FragCoord.y);
  vec2 map = u_center + s / u_zoom;
  vec2 q = s / u_px;
  float blot = blotAt(map);
  float grain = texture(u_noise, q / 40.0).g;
  // Old parchment, stained and grainy; plain paper on the plate; a pale mist on a modern map.
  vec3 man = mix(vec3(0.77, 0.68, 0.5), vec3(0.9, 0.84, 0.67), blot) * (0.95 + 0.06 * grain);
  vec3 eng = mix(vec3(0.89, 0.86, 0.77), vec3(0.95, 0.93, 0.85), blot) * (0.97 + 0.04 * grain);
  vec3 mdn = mix(vec3(0.62, 0.64, 0.64), vec3(0.72, 0.73, 0.72), blot);
  vec3 c = man * u_style.x + eng * u_style.y + mdn * u_style.z;
  // The rim darkens a little, like the edge of the paper where the known world gives out.
  c *= 1.0 - 0.12 * (1.0 - smoothstep(0.55, 1.0, m));
  o = vec4(c, a);
}`;

/**
 * The map's symbols, instanced: a quad a fixed size on screen at each symbol's place, showing its
 * sprite in each style (sprites.ts) blended by the style weights.
 */
export const SYMBOL_VS = `${HEAD}${TRANSFORM}
in vec2 a_quad;
in vec4 a_inst;   // x, y, size (CSS px), the scale (CSS px per map unit) from which it shows
in vec4 a_sprite; // manuscript, engraved and modern sprites (-1: none), anchor (symbols.ts)
uniform vec4 u_rects[${MAX_SPRITES}];
uniform float u_px;
uniform float u_scale;
uniform vec3 u_style;
out vec2 v_uv0;
out vec2 v_uv1;
out vec2 v_uv2;
out vec3 v_w;
out float v_show;
vec2 rectUV(float s, vec2 q) {
  vec4 r = u_rects[int(max(0.0, s) + 0.5)];
  return mix(r.xy, r.zw, q);
}
void main() {
  v_w = u_style * vec3(a_sprite.x >= 0.0, a_sprite.y >= 0.0, a_sprite.z >= 0.0);
  v_show = smoothstep(a_inst.w * 0.8, a_inst.w, u_scale);
  v_uv0 = rectUV(a_sprite.x, a_quad);
  v_uv1 = rectUV(a_sprite.y, a_quad);
  v_uv2 = rectUV(a_sprite.z, a_quad);
  if (v_show <= 0.0 || v_w.x + v_w.y + v_w.z < 0.002) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float grow = a_sprite.w > 2.5 ? clamp(pow(u_scale / 0.3, 0.5), 0.45, 1.0) : clamp(pow(u_scale / 0.3, 0.35), 0.7, 1.8);
  float size = a_inst.z * grow * u_px;
  vec2 anchor = a_sprite.w > 2.5 ? vec2(0.5) : a_sprite.w > 1.5 ? vec2(-0.1, 1.1) : a_sprite.w > 0.5 ? vec2(0.5, 0.92) : vec2(0.5);
  vec2 corner = (a_quad - anchor) * size;
  gl_Position = toClip(a_inst.xy) + vec4(corner.x * 2.0 / u_viewport.x, -corner.y * 2.0 / u_viewport.y, 0.0, 0.0);
}`;

export const SYMBOL_FS = `${HEAD}
in vec2 v_uv0;
in vec2 v_uv1;
in vec2 v_uv2;
in vec3 v_w;
in float v_show;
uniform sampler2D u_atlas;
uniform float u_alpha;
out vec4 o;
void main() {
  // The atlas is premultiplied; a style without the sprite weighs nothing.
  vec4 c = texture(u_atlas, v_uv0) * v_w.x + texture(u_atlas, v_uv1) * v_w.y + texture(u_atlas, v_uv2) * v_w.z;
  o = c * (u_alpha * v_show);
  if (o.a < 0.004) discard;
}`;
