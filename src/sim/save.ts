/** Saving and loading: the state is plain JSON. Older saves are brought up to date on load. */
import { indexRecords } from './characters';
import { initialKnowledge } from './exploration';
import { defaultEstates, defaultTasks, initialLaws } from './politics';
import { initialTech } from './tech';
import type { CasusBelli, GameState } from './types';
import type { SimWorld } from './world';

export const SAVE_VERSION = 8;

/** What a save keeps about the campaign beside its state: not part of the world, so no migration. */
export interface SaveExtras {
  /** the campaign the save belongs to, the same for every save of one game */
  campaign?: string;
  /** seconds of play so far */
  played?: number;
  /** a campaign whose one save the game keeps itself */
  ironman?: boolean;
}

export interface SaveFile extends SaveExtras {
  format: 'crowns-and-centuries';
  version: number;
  saved: string;
  state: GameState;
}

export function serialize(state: GameState, extras: SaveExtras = {}): string {
  const file: SaveFile = {
    format: 'crowns-and-centuries',
    version: SAVE_VERSION,
    saved: new Date().toISOString(),
    ...extras,
    state,
  };
  return JSON.stringify(file);
}

/**
 * Reads a save. Saves from before terra incognita learn what each realm knows from the world, so pass
 * it; without it they catch up at the next month.
 */
export function deserialize(json: string, world?: SimWorld): GameState {
  return readSave(json, world).state;
}

/** Reads a save with what it keeps about the campaign. */
export function readSave(json: string, world?: SimWorld): SaveExtras & { state: GameState } {
  const file = JSON.parse(json) as Partial<SaveFile>;
  if (file.format !== 'crowns-and-centuries' || !file.state) throw new Error('This is not a Crowns & Centuries save.');
  if (!file.version || file.version > SAVE_VERSION)
    throw new Error(`Saves of version ${file.version} cannot be loaded by this build.`);
  const s = file.state;
  s.scheduled ??= [];
  s.offers ??= [];
  if (file.version < 2) migrateToDiplomacy(s);
  if (file.version < 3) migrateToPolitics(s);
  if (file.version < 4) migrateToFaith(s);
  if (file.version < 5) migrateToTechnology(s);
  if (file.version < 6) migrateToNavies(s, world);
  if (file.version < 7) migrateToEvents(s);
  if (file.version < 8) migrateToLedger(s);
  // While the game loads rather than on the first New Year: the index of thousands of characters.
  indexRecords(s);
  return {
    state: s,
    campaign: typeof file.campaign === 'string' ? file.campaign : undefined,
    played: typeof file.played === 'number' && file.played >= 0 ? file.played : undefined,
    ironman: file.ironman === true || undefined,
  };
}

/**
 * Version 7 (milestone 7) kept no score, ledger or chronicle: every realm starts from nothing, and
 * the chronicle opens with the world events already on record.
 */
function migrateToLedger(s: GameState) {
  (s as unknown as { version: number }).version = 8;
  s.ledger ??= [];
  s.chronicle ??= [];
  for (const c of s.countries) if (c) c.score ??= 0;
  const NAMES: Record<string, string> = {
    black_death: 'The Black Death breaks out.',
    second_pestilence: 'The Second Pestilence breaks out.',
    great_plague: 'The Great Plague breaks out.',
    cholera: 'Cholera spreads from Bengal.',
    spanish_flu: 'The Spanish Flu spreads around the world.',
    horde: 'Genghis Khan unites the peoples of the steppe.',
    crash: 'The great stock exchanges crash.',
  };
  if (!s.chronicle.length)
    for (const [k, day] of Object.entries(s.happened).sort((a, b) => a[1] - b[1]))
      if (NAMES[k]) s.chronicle.push({ day, text: NAMES[k] });
}

/**
 * Version 6 (milestone 6) had no events, modifiers, pestilence or spies: every realm starts with a
 * clean slate, and the world events of the past are taken as not having happened.
 */
function migrateToEvents(s: GameState) {
  (s as unknown as { version: number }).version = 7;
  s.events ??= [];
  s.happened ??= {};
  s.plague ??= null;
  for (const c of s.countries) {
    if (!c) continue;
    c.modifiers ??= [];
    c.history ??= {};
    c.spies ??= {};
    c.spyTarget ??= 0;
  }
}

/**
 * Version 5 (milestone 5) had no navies, colonies or terra incognita: armies sailed without ships.
 * Realms start with no ships (armies already afloat may finish their crossing), and learn the lands
 * around their own.
 */
function migrateToNavies(s: GameState, world: SimWorld | undefined) {
  (s as unknown as { version: number }).version = 6;
  s.fleets ??= [];
  s.navalBattles ??= [];
  for (const c of s.countries) {
    if (!c) continue;
    c.transports ??= 0;
    c.colonies ??= [];
    c.known ??= '';
  }
  if (world) initialKnowledge(s, world);
}

/** Version 4 (milestone 4) had no technology: every realm starts where the realms of 1066 did. */
function migrateToTechnology(s: GameState) {
  (s as unknown as { version: number }).version = 5;
  for (const c of s.countries) {
    if (!c) continue;
    c.tech ??= initialTech(c.gov);
    c.research ??= { economy: 0, military: 0, society: 0 };
    c.focus ??= null;
    c.reformed ??= s.day - 20 * 365;
  }
}

/** Version 3 (milestone 3) had no religious policy, missions, accepted cultures or great holy wars. */
function migrateToFaith(s: GameState) {
  (s as unknown as { version: number }).version = 4;
  s.holyWars ??= {};
  for (const c of s.countries) {
    if (!c) continue;
    c.laws.tolerance ??= 1;
    c.accepted ??= [];
    c.converting ??= null;
    c.assimilating ??= null;
    c.blessed ??= s.day - 3650;
  }
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
