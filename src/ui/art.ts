/**
 * The art and sound the build shipped (public/art/index.json, made by `npm run assets`), loaded once
 * at start. Callers ask for the best fit and draw their own when nothing fits, so a build without art
 * (the web demo) plays the same with the code-drawn look.
 */
import { pickAsset, type AssetEntry, type AssetIndex, type AssetWanted } from '../shared/assets';

const BASE = './art';
let assets: AssetEntry[] = [];

/** Reads the index; without one the game has no art and draws its own. */
export async function loadArt(): Promise<void> {
  try {
    const res = await fetch(`${BASE}/index.json`);
    if (!res.ok) return;
    const index = (await res.json()) as Partial<AssetIndex>;
    assets = Array.isArray(index.assets) ? index.assets : [];
  } catch {
    assets = [];
  }
}

export interface ArtRef extends AssetEntry {
  /** the file's address for an <img>, a texture or a sound */
  src: string;
}

/** The asset that best fits, or null when the game should draw its own. */
export function art(wanted: AssetWanted): ArtRef | null {
  const a = pickAsset(assets, wanted);
  return a ? { ...a, src: `${BASE}/${a.url}` } : null;
}

/** Every asset, for the credits. */
export function allArt(): readonly AssetEntry[] {
  return assets;
}
