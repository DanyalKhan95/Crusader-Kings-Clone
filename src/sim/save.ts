/** Saving and loading: the state is plain JSON. Older saves are brought up to date on load. */
import { defaultEstates, defaultTasks, initialLaws } from './politics';
import type { CasusBelli, GameState } from './types';

export const SAVE_VERSION = 3;

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
  if (!file.version || file.version > SAVE_VERSION)
    throw new Error(`Saves of version ${file.version} cannot be loaded by this build.`);
  const s = file.state;
  s.scheduled ??= [];
  s.offers ??= [];
  if (file.version < 2) migrateToDiplomacy(s);
  if (file.version < 3) migrateToPolitics(s);
  return s;
}

/** Version 2 (milestone 2) had no laws, estates or council tasks. */
function migrateToPolitics(s: GameState) {
  (s as unknown as { version: number }).version = 3;
  s.factions ??= [];
  for (const c of s.countries) {
    if (!c) continue;
    c.laws ??= initialLaws(c.gov, c.tag, undefined);
    c.lawChanged ??= s.day - 5 * 365;
    c.legitimacy ??= 60;
    c.estates ??= defaultEstates();
    c.tasks ??= defaultTasks();
    c.termEnds ??= c.laws.succession === 'republic' ? s.day + 365 : 0;
  }
}

/** Version 1 (milestone 1) had no diplomacy: border wars become claim wars, and treaties start empty. */
function migrateToDiplomacy(s: GameState) {
  s.pacts ??= [];
  s.coalitions ??= [];
  s.diploVersion ??= 1;
  s.proposalCooldown ??= 0;
  for (const c of s.countries) {
    if (!c) continue;
    c.overlord ??= 0;
    c.fabricating ??= null;
    c.integrating ??= null;
    c.memories ??= {};
    c.rulerSince ??= s.day - 5 * 365;
    c.ai.nextDiplo ??= s.day + (c.index % 100);
  }
  for (const w of s.wars) {
    if ((w.cb as string) === 'border') {
      w.cb = 'claim' as CasusBelli;
      const a = s.countries[w.attacker];
      if (a && !a.claims.includes(w.goal)) a.claims.push(w.goal);
    }
  }
  s.offers = s.offers.map((o) => ({ ...o, kind: 'peace' }) as GameState['offers'][number]);
}
