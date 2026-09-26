/** Saving and loading: the state is plain JSON; only the format version is checked. */
import type { GameState } from './types';

export const SAVE_VERSION = 1;

export interface SaveFile {
  format: 'crowns-and-centuries';
  version: number;
  saved: string;
  state: GameState;
}

export function serialize(state: GameState): string {
  const file: SaveFile = {
    format: 'crowns-and-centuries',
    version: SAVE_VERSION,
    saved: new Date().toISOString(),
    state,
  };
  return JSON.stringify(file);
}

export function deserialize(json: string): GameState {
  const file = JSON.parse(json) as Partial<SaveFile>;
  if (file.format !== 'crowns-and-centuries' || !file.state) throw new Error('This is not a Crowns & Centuries save.');
  if (file.version !== SAVE_VERSION)
    throw new Error(`Saves of version ${file.version} cannot be loaded by this build.`);
  const s = file.state;
  s.scheduled ??= [];
  s.offers ??= [];
  return s;
}
