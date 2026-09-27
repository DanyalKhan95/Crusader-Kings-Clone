/** The message log: what happened, for the notifications feed. */
import type { GameState, MessageKind } from './types';

const MAX_MESSAGES = 1000;

/**
 * A whole number as the messages write it, "12,345". Written out rather than with Intl, whose first
 * use in a session costs more than a whole day of the world.
 */
export function grouped(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];

/** First … Tenth, then 11th, 21st, 22nd, 23rd … (n from 1). */
export function ordinal(n: number): string {
  if (ORDINALS[n - 1]) return ORDINALS[n - 1];
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
}

/** The first name of a numbered series ("First Army of …") that nothing in `taken` bears. */
export function firstFree(taken: Iterable<string>, name: (ordinal: string) => string): string {
  const used = new Set(taken);
  for (let n = 1; ; n++) if (!used.has(name(ordinal(n)))) return name(ordinal(n));
}

export interface LogOptions {
  province?: number;
  important?: boolean;
}

/** Records a message if it concerns the player (or everyone, for world events). */
export function log(
  state: GameState,
  concerns: number[] | 'all',
  kind: MessageKind,
  text: string,
  opts: LogOptions = {},
): void {
  if (concerns !== 'all' && !concerns.includes(state.player)) return;
  state.messages.push({ id: state.nextId++, day: state.day, kind, text, ...opts });
  if (state.messages.length > MAX_MESSAGES) state.messages.splice(0, state.messages.length - MAX_MESSAGES);
}
