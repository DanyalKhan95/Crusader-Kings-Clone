/** Deterministic randomness: mulberry32 with its state kept in the game state, so saves replay. */
import type { GameState } from './types';

export function random(s: { rng: number }): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randInt(s: GameState, lo: number, hi: number): number {
  return lo + Math.floor(random(s) * (hi - lo + 1));
}

export function chance(s: GameState, p: number): boolean {
  return random(s) < p;
}

export function pick<T>(s: GameState, list: readonly T[]): T {
  return list[Math.floor(random(s) * list.length)];
}

/** Roughly normal (sum of three uniforms), mean 0, spread ±1. */
export function jitter(s: GameState): number {
  return (random(s) + random(s) + random(s)) / 1.5 - 1;
}

/** Stable hash of a string, for seeding. */
export function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
