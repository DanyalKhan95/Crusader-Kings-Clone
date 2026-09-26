/**
 * The chronicle of the world: the great happenings of the thousand years, for the ledger. Kept
 * short on purpose (crusades, plagues, new nations, the fall of kingdoms, the first of each new
 * age and form of government, world wars), so it reads as a history, not a log.
 */
import type { GameState } from './types';

/** Entries kept at most; the oldest go first, should a very long game ever reach it. */
export const CHRONICLE_MAX = 1500;

export function chronicle(state: GameState, text: string, opts: { province?: number; realm?: number } = {}) {
  state.chronicle.push({ day: state.day, text, ...opts });
  if (state.chronicle.length > CHRONICLE_MAX) state.chronicle.splice(0, state.chronicle.length - CHRONICLE_MAX);
}

/** Records the first time something happens anywhere in the world; true if this was the first. */
export function firstTime(state: GameState, key: string): boolean {
  if (state.happened[key] !== undefined) return false;
  state.happened[key] = state.day;
  return true;
}

const TITLED = new RegExp(
  [
    // "Kingdom of Aragon", "Great Seljuk Empire", "Tomaras of Dhillika"
    '^(Kingdom|Empire|Duchy|County|Principality|Grand|Republic|Taifa|Emirate|Sultanate|Caliphate|March|Great|Holy|Papal|Tsardom|Khanate|Confederation)\\b',
    '^\\w+s of ',
    // "Khmer Empire", "Almoravid Emirate", "Mixtec City-States"
    '(Empire|Caliphate|Sultanate|Emirate|Chiefdoms|Tribes|Confederation|Horde|City-States|States|Republic|Khanate|Khaganate|Kingdom|Dynasty|Shogunate|Union|League|Principality|Duchy)$',
  ].join('|'),
);

/** Whether a realm's name is plural: "the Jurchen Tribes", "the Papal States", but "the County of Flanders". */
export function isPlural(name: string): boolean {
  return name.endsWith('s') && !name.includes(' of ');
}

/** The verb as the realm's name asks for it: agree('Jurchen Tribes', 'falls', 'fall') is "fall". */
export function agree(name: string, singular: string, plural: string): string {
  return isPlural(name) ? plural : singular;
}

/** A realm's name as it reads within a sentence: "the Kingdom of Aragon", but "Srivijaya". */
export function theName(name: string): string {
  return TITLED.test(name) || isPlural(name) ? `the ${name}` : name;
}

/** The same at the start of a sentence. */
export function TheName(name: string): string {
  const n = theName(name);
  return n[0].toUpperCase() + n.slice(1);
}
