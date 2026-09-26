/** GLSL ES 3.00 shaders for the map. */

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

export const TERRAIN_VS = `${HEAD}${TRANSFORM}
in vec2 a_pos;
in vec2 a_uv;
out vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = toClip(a_pos);
}`;

export const TERRAIN_FS = `${HEAD}
in vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_paper;
out vec4 o;
void main() {
  vec3 c = texture(u_tex, v_uv).rgb;
  // Far away the map turns into a flatter, warmer, paper-toned chart.
  float l = dot(c, vec3(0.3, 0.59, 0.11));
  vec3 flat_ = mix(vec3(l), c, 0.5) * vec3(1.04, 1.0, 0.9);
  c = mix(c, flat_, u_paper);
  o = vec4(c, 1.0);
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

export const FILL_FS = `${HEAD}
in vec4 v_color;
in vec4 v_stripe;
in vec2 v_map;
flat in uint v_flags;
uniform float u_zoom;
uniform float u_time;
uniform float u_alpha;
uniform int u_parchment; // 1: draw only the unknown, as old parchment
out vec4 o;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
void main() {
  bool unknown = (v_flags & 4u) != 0u;
  if (u_parchment == 1) {
    if (!unknown) discard;
    // Terra incognita: stained, grainy parchment, the same over land and sea so no coast shows through.
    float stain = noise(v_map / 90.0) * 0.6 + noise(v_map / 23.0) * 0.3 + noise(v_map / 5.0) * 0.1;
    vec3 paper = mix(vec3(0.80, 0.71, 0.54), vec3(0.90, 0.84, 0.69), stain);
    float grain = hash(floor(v_map * u_zoom * 1.5)) * 0.04;
    o = vec4(paper - grain, 1.0);
    return;
  }
  if (unknown) discard;
  vec4 c = v_color;
  if (v_stripe.a > 0.0) {
    float s = fract((v_map.x + v_map.y) * u_zoom / 16.0);
    if (s < 0.42) c = vec4(v_stripe.rgb, max(c.a, 0.75));
  }
  if ((v_flags & 2u) != 0u) c.rgb = mix(c.rgb, vec3(1.0), 0.16);
  if ((v_flags & 1u) != 0u) {
    c.rgb = mix(c.rgb, vec3(1.0, 0.93, 0.75), 0.26 + 0.07 * sin(u_time * 3.0));
    c.a = max(c.a, 0.45);
  }
  o = vec4(c.rgb, c.a * u_alpha);
}`;

export const LINE_VS = `${HEAD}${TRANSFORM}${FETCH}
in vec2 a_pos;
in vec2 a_off;
in float a_a;
in float a_b;
in float a_w;
uniform highp usampler2D u_info;
uniform int u_mode;        // 0 borders, 1 highlight, 2 rivers
uniform float u_px;        // device pixels per CSS pixel
uniform float u_provAlpha; // province borders fade out when zoomed out
uniform float u_riverAlpha;
out vec4 v_color;
out float v_side;
out float v_width;
const uint WATER = 16u;
void main() {
  float w = 0.0;
  vec4 col = vec4(0.0);
  if (u_mode == 2) {
    w = (a_w >= 3.0 ? 2.4 : a_w >= 2.0 ? 1.6 : 1.0) * u_px;
    col = vec4(0.23, 0.42, 0.58, u_riverAlpha * (a_w >= 2.0 ? 1.0 : 0.8));
  } else {
    int A = int(a_a + 0.5), B = int(a_b + 0.5);
    uvec4 ia = texelFetch(u_info, texel(A), 0);
    uvec4 ib = texelFetch(u_info, texel(B), 0);
    bool landA = (ia.a & WATER) == 0u, landB = (ib.a & WATER) == 0u;
    bool unkA = (ia.a & 4u) != 0u, unkB = (ib.a & 4u) != 0u;
    if (unkA && unkB) {
      w = 0.0;
    } else if (unkA != unkB) {
      // The edge of the known world.
      if (u_mode == 0) { w = 1.4 * u_px; col = vec4(0.36, 0.25, 0.14, 0.75); }
    } else if (u_mode == 0) {
      if (landA && landB) {
        if (ia.r != ib.r && (ia.r != 0u || ib.r != 0u)) {
          if (ia.g != ib.g) { w = 2.4 * u_px; col = vec4(0.07, 0.05, 0.04, 0.9); }
          else { w = 1.3 * u_px; col = vec4(0.12, 0.09, 0.07, 0.75); }
        } else { w = 0.9 * u_px; col = vec4(0.1, 0.08, 0.06, u_provAlpha); }
      } else if (landA != landB) {
        w = 1.1 * u_px; col = vec4(0.14, 0.18, 0.2, 0.55);
      } else {
        w = 0.8 * u_px; col = vec4(0.75, 0.85, 0.95, u_provAlpha * 0.35);
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
  vec2 p = a_pos + a_off * (w * 0.5 / u_zoom);
  gl_Position = w > 0.0 ? toClip(p) : vec4(2.0, 2.0, 2.0, 1.0);
}`;

export const LINE_FS = `${HEAD}
in vec4 v_color;
in float v_side;
in float v_width;
out vec4 o;
void main() {
  // soften the outer ~0.8px of each line
  float edge = clamp((1.0 - abs(v_side)) * v_width / 1.6, 0.0, 1.0);
  float a = v_color.a * mix(0.35, 1.0, edge);
  if (v_width < 1.0) a *= v_width;
  o = vec4(v_color.rgb, a);
}`;
