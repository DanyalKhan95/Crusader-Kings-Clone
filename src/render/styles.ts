/**
 * The map's three styles, after the maps of their ages: a manuscript map to about 1450 (parchment,
 * inked coasts, painted hills, gilt borders, the rhumb lines of the portolan charts), an engraved
 * atlas to about 1800 (hachured relief, water-lined and stippled seas, hand-coloured borders, a
 * graticule) and a modern map after (political colours over shaded relief, crisp borders). The
 * style follows the viewer's era unless a setting pins one; a change of style fades from one to the
 * other.
 */
import { latToY, lonToX } from '../shared/projection';

export type MapStyle = 'manuscript' | 'engraved' | 'modern';
export const MAP_STYLES: MapStyle[] = ['manuscript', 'engraved', 'modern'];

export const MAP_STYLE_INFO: Record<MapStyle, { name: string; blurb: string }> = {
  manuscript: { name: 'Manuscript', blurb: 'Parchment and ink, painted hills and gilt borders, to about 1450.' },
  engraved: {
    name: 'Engraved atlas',
    blurb: 'Hachured relief, stippled seas and hand-coloured borders, to about 1800.',
  },
  modern: { name: 'Modern', blurb: 'Political colours over shaded relief, and crisp borders.' },
};

/** The style of an era (0 = medieval … 5 = contemporary). */
export function styleOfEra(era: number): MapStyle {
  return era <= 0 ? 'manuscript' : era <= 2 ? 'engraved' : 'modern';
}

/** Weights of the three styles, in the order of MAP_STYLES, summing to 1. */
export type StyleWeights = [number, number, number];

const ONE: Record<MapStyle, StyleWeights> = {
  manuscript: [1, 0, 0],
  engraved: [0, 1, 0],
  modern: [0, 0, 1],
};

/** The style on show, fading from one to the next over `FADE_MS`. */
export class StyleMix {
  static FADE_MS = 1600;
  private from: MapStyle = 'manuscript';
  private to: MapStyle = 'manuscript';
  private t0 = 0;

  get style(): MapStyle {
    return this.to;
  }

  /** Changes the style; with `fade`, the old one fades out over the next second and a half. */
  set(style: MapStyle, now: number, fade: boolean) {
    if (style === this.to) return;
    this.from = fade ? this.to : style;
    this.to = style;
    this.t0 = now;
  }

  /** True while a fade is under way (the map must be drawn every frame). */
  fading(now: number): boolean {
    return this.from !== this.to && now - this.t0 < StyleMix.FADE_MS;
  }

  weights(now: number): StyleWeights {
    const a = ONE[this.from],
      b = ONE[this.to];
    const raw = this.from === this.to ? 1 : Math.min(1, Math.max(0, (now - this.t0) / StyleMix.FADE_MS));
    const t = raw * raw * (3 - 2 * raw);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
}

/**
 * Compass roses of the old charts, with their rhumb lines reaching `reach` map units over the sea:
 * where the manuscript's portolan lines and the engraved atlas's roses stand (longitude, latitude).
 */
export const ROSES: { x: number; y: number; reach: number }[] = [
  [-36, 38, 2800],
  [17, 35.5, 1100],
  [70, -8, 2600],
  [-18, -28, 2300],
  [-150, 26, 3000],
  [-118, -24, 2600],
  [152, 14, 2600],
  [2, 64, 1200],
].map(([lon, lat, reach]) => ({ x: lonToX(lon), y: latToY(lat), reach }));
