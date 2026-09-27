/** The message log: what happened, for the notifications feed. */
import type { GameState, MessageKind } from './types';

const MAX_MESSAGES = 120;

/**
 * A whole number as the messages write it, "12,345". Written out rather than with Intl, whose first
 * use in a session costs more than a whole day of the world.
 */
export function grouped(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
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
