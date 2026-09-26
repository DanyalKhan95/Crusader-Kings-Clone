/**
 * Timed modifiers on realms (see data/modifiers.ts): adding, removing and summing them. Each is
 * named in the breakdowns it touches, so the player can see what a famine or a boom is costing.
 */
import { MODIFIERS, type ModifierEffectKey } from '../data/modifiers';
import type { Part } from './economy';
import { invalidateRealm } from './politics';
import type { Country, GameState } from './types';

/**
 * Gives a realm a modifier for `years` (the modifier's own span if not given; 0 for good). A realm
 * that already has it keeps it until the later of the two ends.
 */
export function addModifier(state: GameState, c: Country, id: string, years?: number) {
  const def = MODIFIERS[id];
  if (!def || !c) return;
  const span = years ?? def.years;
  const until = span > 0 ? state.day + Math.round(span * 365) : undefined;
  const had = c.modifiers.find((m) => m.id === id);
  if (had) {
    if (had.until !== undefined) had.until = until === undefined ? undefined : Math.max(had.until, until);
  } else c.modifiers.push(until === undefined ? { id } : { id, until });
  const next = expiry.get(state);
  if (next !== undefined && until !== undefined && until < next) expiry.set(state, until);
  invalidateRealm(state, c.index);
}

export function removeModifier(state: GameState, c: Country, id: string): boolean {
  const before = c.modifiers.length;
  c.modifiers = c.modifiers.filter((m) => m.id !== id);
  if (c.modifiers.length === before) return false;
  invalidateRealm(state, c.index);
  return true;
}

export function hasModifier(c: Country | undefined, id: string): boolean {
  return !!c?.modifiers.some((m) => m.id === id);
}

/** The summed effect of the realm's modifiers. */
export function modifierEffect(c: Country | undefined, key: ModifierEffectKey): number {
  if (!c?.modifiers?.length) return 0;
  let v = 0;
  for (const m of c.modifiers) v += MODIFIERS[m.id]?.effects[key] ?? 0;
  return v;
}

const NONE: Part[] = [];

/** One breakdown part per modifier with this effect, scaled. Do not change the list it returns. */
export function modifierParts(c: Country, key: ModifierEffectKey, scale = 1): Part[] {
  if (!c.modifiers?.length) return NONE;
  const out: Part[] = [];
  for (const m of c.modifiers) {
    const def = MODIFIERS[m.id];
    const v = def?.effects[key];
    if (v) out.push({ label: def.name, value: v * scale });
  }
  return out;
}

/** The first day a modifier of any realm runs out, so the daily check is nearly free. */
const expiry = new WeakMap<GameState, number>();

/** Modifiers whose time is up fall away. */
export function dailyModifiers(state: GameState) {
  const next = expiry.get(state);
  if (next !== undefined && next > state.day) return;
  let soonest = Infinity;
  for (const c of state.countries) {
    if (!c?.modifiers.length) continue;
    if (c.modifiers.some((m) => m.until !== undefined && m.until <= state.day)) {
      c.modifiers = c.modifiers.filter((m) => m.until === undefined || m.until > state.day);
      invalidateRealm(state, c.index);
    }
    for (const m of c.modifiers) if (m.until !== undefined && m.until < soonest) soonest = m.until;
  }
  expiry.set(state, soonest);
}
