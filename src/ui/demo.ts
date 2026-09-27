/**
 * The free web demo: the same game, built with `npm run build:demo`, whose history stops a century
 * after it begins and which ships no art, so that it draws its own look throughout. The full game is
 * the desktop app.
 */
import { toDay } from '../sim/calendar';

export const DEMO: boolean = typeof __DEMO__ === 'boolean' && __DEMO__;

/** The day the demo's world stops: a hundred years after it begins. */
export const DEMO_END = toDay(1166, 9, 15);

/** Is the demo's century over? Never in the full game. */
export function demoOver(day: number): boolean {
  return DEMO && day >= DEMO_END;
}
