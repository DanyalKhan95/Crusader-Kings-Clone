/**
 * Art and sound: what the manifest in art/manifest.json says of each file, what the build writes to
 * public/art/index.json for the game, and how the game picks one. Every asset carries its source, its
 * author, its licence and whether it was generated, for the credits and for store disclosures.
 * Shared by tools/assets (which checks and builds) and the game (which picks and draws).
 */

/** What an asset is for. */
export const ASSET_KINDS = [
  'event', // a picture for an event
  'scene', // battles, declarations of war, peace treaties
  'card', // technology, building and decision cards
  'title', // title and loading screens
  'portrait', // a layer of a portrait
  'unit', // a figure on the map
  'symbol', // a map symbol: mountains, forests, towns
  'frame', // painted frames for full screens
  'music',
  'effect',
  'ambience',
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

/** Kinds that are pictures (the rest are sound). */
export const IMAGE_KINDS: readonly AssetKind[] = [
  'event',
  'scene',
  'card',
  'title',
  'portrait',
  'unit',
  'symbol',
  'frame',
];

/** Kinds packed into atlases by era, since the map draws many of them at once. */
export const ATLAS_KINDS: readonly AssetKind[] = ['unit', 'symbol'];

/** The largest size a picture of each kind is kept at, in pixels (it keeps its proportions). */
export const MAX_SIZE: Record<AssetKind, [number, number]> = {
  event: [1024, 640],
  scene: [1280, 720],
  card: [512, 320],
  title: [1920, 1080],
  portrait: [256, 320],
  unit: [128, 128],
  symbol: [64, 64],
  frame: [1024, 1024],
  music: [0, 0],
  effect: [0, 0],
  ambience: [0, 0],
};

export const ASSET_ERAS = ['medieval', 'renaissance', 'early_modern', 'industrial', 'modern', 'contemporary'] as const;
export type AssetEra = (typeof ASSET_ERAS)[number];

/** Regions for looks that differ across the world. */
export const ASSET_REGIONS = ['europe', 'islamic', 'steppe', 'east_asia', 'south_asia', 'africa', 'americas'] as const;
export type AssetRegion = (typeof ASSET_REGIONS)[number];

/**
 * Licences the game may ship. Nothing "non-commercial" or "no derivatives": the game may be sold,
 * and pictures are cropped and resized.
 */
export const LICENCES = [
  'Public domain',
  'CC0',
  'CC BY 3.0',
  'CC BY 4.0',
  'CC BY-SA 3.0',
  'CC BY-SA 4.0',
  'SIL OFL',
  'Generated',
] as const;
export type Licence = (typeof LICENCES)[number];

/** An asset as the manifest lists it. */
export interface AssetSource {
  /** stable id the game asks for, e.g. "event.tournament" */
  id: string;
  /** the file under art/ */
  file: string;
  kind: AssetKind;
  era?: AssetEra;
  region?: AssetRegion;
  /** e.g. a unit's role ("heavy_cavalry") or a portrait layer ("crown") */
  type?: string;
  /** where it came from: a URL, or a description */
  source: string;
  author: string;
  licence: Licence;
  /** for generated assets: the tool and, if kept, the prompt */
  generated?: { tool: string; prompt?: string; date?: string };
}

/** An asset as the game sees it (public/art/index.json). */
export interface AssetEntry {
  id: string;
  kind: AssetKind;
  era?: AssetEra;
  region?: AssetRegion;
  type?: string;
  /** relative to public/art/ */
  url: string;
  width: number;
  height: number;
  /** where in an atlas the picture lies, when it is packed */
  rect?: [number, number, number, number];
  /** the line for the credits */
  credit: string;
  generated: boolean;
}

export interface AssetIndex {
  version: 1;
  assets: AssetEntry[];
}

/** One line for the credits: "Codex Manesse, c. 1300 (Public domain), from commons.wikimedia.org". */
export function creditLine(a: AssetSource): string {
  const from = /^https?:\/\//.test(a.source) ? `, from ${new URL(a.source).hostname}` : '';
  const how = a.generated ? `, generated with ${a.generated.tool}` : '';
  return `${a.author} (${a.licence})${how}${from}`;
}

/** What is wrong with a manifest, one line each; empty when it is sound. `exists` checks the files. */
export function checkManifest(assets: unknown, exists: (file: string) => boolean): string[] {
  if (!Array.isArray(assets)) return ['The manifest must be a list of assets.'];
  const problems: string[] = [];
  const seen = new Set<string>();
  assets.forEach((raw, i) => {
    const a = raw as Partial<AssetSource>;
    const at = `Asset ${typeof a?.id === 'string' ? `"${a.id}"` : `#${i + 1}`}`;
    if (!a || typeof a !== 'object') return void problems.push(`${at} is not an object.`);
    if (typeof a.id !== 'string' || !/^[a-z0-9_]+(\.[a-z0-9_]+)*$/.test(a.id))
      problems.push(`${at}: the id must be lower-case words joined by dots, like "event.tournament".`);
    else if (seen.has(a.id)) problems.push(`${at} is listed twice.`);
    else seen.add(a.id);
    if (!ASSET_KINDS.includes(a.kind as AssetKind)) problems.push(`${at}: unknown kind "${a.kind}".`);
    if (a.era !== undefined && !ASSET_ERAS.includes(a.era)) problems.push(`${at}: unknown era "${a.era}".`);
    if (a.region !== undefined && !ASSET_REGIONS.includes(a.region))
      problems.push(`${at}: unknown region "${a.region}".`);
    if (!LICENCES.includes(a.licence as Licence))
      problems.push(`${at}: the licence "${a.licence}" is not one the game may ship (${LICENCES.join(', ')}).`);
    if (typeof a.source !== 'string' || !a.source.trim()) problems.push(`${at} does not say where it came from.`);
    if (typeof a.author !== 'string' || !a.author.trim()) problems.push(`${at} does not name its author.`);
    if (a.licence === 'Generated' && !a.generated?.tool)
      problems.push(`${at} is generated but does not name the tool.`);
    if (a.generated && a.licence !== 'Generated' && a.licence !== 'CC0' && a.licence !== 'Public domain')
      problems.push(`${at} is generated, so its licence is "Generated", "CC0" or "Public domain".`);
    if (typeof a.file !== 'string' || !a.file) problems.push(`${at} names no file.`);
    else if (a.file.includes('..') || a.file.startsWith('/')) problems.push(`${at}: the file must lie under art/.`);
    else if (!exists(a.file)) problems.push(`${at}: art/${a.file} is missing.`);
  });
  return problems;
}

export interface AssetWanted {
  kind: AssetKind;
  /** an exact asset, tried first */
  id?: string;
  era?: AssetEra;
  region?: AssetRegion;
  type?: string;
  /** picks among equally fitting assets, so the same request can vary (e.g. by event or character) */
  variety?: number;
}

/**
 * The asset that best fits a request: the exact id, else the most specific match, giving up the
 * region first, then the type, then the era. Null when nothing fits: the caller draws its own.
 */
export function pickAsset(assets: readonly AssetEntry[], w: AssetWanted): AssetEntry | null {
  if (w.id) {
    const exact = assets.find((a) => a.id === w.id);
    if (exact) return exact;
  }
  const ofKind = assets.filter((a) => a.kind === w.kind);
  if (!ofKind.length) return null;
  const tries: [boolean, boolean, boolean][] = [
    [true, true, true],
    [true, false, true],
    [true, true, false],
    [true, false, false],
    [false, false, true],
    [false, false, false],
  ];
  for (const [era, region, type] of tries) {
    const fit = ofKind.filter(
      (a) =>
        (!era || !w.era || a.era === w.era) &&
        (!region || !w.region || a.region === w.region) &&
        (!type || !w.type || a.type === w.type),
    );
    if (fit.length) return fit[Math.abs(Math.floor(w.variety ?? 0)) % fit.length];
  }
  return null;
}

/**
 * Packs rectangles into shelves on a sheet of the given width, tallest first; returns where each
 * goes (in the input order) and the sheet's height. Rectangles keep a gutter around them so
 * filtering never bleeds a neighbour in.
 */
export function packShelves(
  sizes: readonly [number, number][],
  width: number,
  gutter = 2,
): { rects: [number, number, number, number][]; height: number } {
  const order = sizes.map((_, i) => i).sort((a, b) => sizes[b][1] - sizes[a][1] || sizes[b][0] - sizes[a][0]);
  const rects: [number, number, number, number][] = new Array(sizes.length);
  let x = gutter,
    y = gutter,
    shelf = 0;
  for (const i of order) {
    const [w, h] = sizes[i];
    if (w + 2 * gutter > width) throw new Error(`A ${w}×${h} picture is wider than the ${width} px atlas.`);
    if (x + w + gutter > width) {
      x = gutter;
      y += shelf + gutter;
      shelf = 0;
    }
    rects[i] = [x, y, w, h];
    x += w + gutter;
    shelf = Math.max(shelf, h);
  }
  return { rects, height: sizes.length ? y + shelf + gutter : 0 };
}
