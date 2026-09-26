/**
 * The standing of nations. On the first day of every year each independent realm scores for its
 * place in the world: its share of the world's people (development, its tributaries' at half), its
 * learning against the most learned, its share of the world's armies, its holy places and its good
 * order. The sum over the centuries ranks the realms when the age ends on 1 January 2066. Every ten
 * years the ledger notes the great realms, for the chart of the centuries.
 */
import { toDate, toDay } from './calendar';
import { agree, chronicle, TheName } from './chronicle';
import { realmDev } from './diplomacy';
import type { Breakdown, Part } from './economy';
import { heldHolySites } from './faith';
import { log } from './log';
import { strengthOf, tributariesOf } from './queries';
import type { Country, GameState } from './types';

/** The end of the age: the game goes on, but the ranking is final. */
export const END_YEAR = 2066;
export const END_DAY = toDay(END_YEAR, 1, 1);

/** Realms noted in each ledger snapshot, besides the player's. */
const LEDGER_REALMS = 12;

/** Realms that score: independent, alive and not rebels. */
export function scoring(state: GameState): Country[] {
  return state.countries.filter((c): c is Country => !!c?.alive && !c.liege && !c.rebel);
}

interface World {
  day: number;
  dev: number;
  strength: number;
  learning: number;
}
const worldCache = new WeakMap<GameState, World>();

function avgTech(c: Country): number {
  return (c.tech.economy + c.tech.military + c.tech.society) / 3;
}

/** The world's totals, once a day. */
function totals(state: GameState): World {
  let w = worldCache.get(state);
  if (w && w.day === state.day) return w;
  let dev = 0,
    strength = 0,
    learning = 1;
  for (const p of state.provinces) if (p?.owner) dev += p.dev;
  for (const c of scoring(state)) {
    strength += strengthOf(state, c.index);
    learning = Math.max(learning, avgTech(c));
  }
  w = { day: state.day, dev: Math.max(1, dev), strength: Math.max(1, strength), learning };
  worldCache.set(state, w);
  return w;
}

/** What a realm scores this year, and for what. */
export function standing(state: GameState, c: Country): Breakdown {
  const w = totals(state);
  const parts: Part[] = [{ label: 'Lands and peoples', value: (1000 * realmDev(state, c.index)) / w.dev }];
  let tribute = 0;
  for (const t of tributariesOf(state, c.index)) tribute += realmDev(state, t.index);
  if (tribute) parts.push({ label: 'Tributaries', value: (500 * tribute) / w.dev });
  parts.push({ label: 'Learning', value: (20 * avgTech(c)) / w.learning });
  parts.push({ label: 'Might', value: (200 * strengthOf(state, c.index)) / w.strength });
  const sites = heldHolySites(state, c).length;
  if (sites) parts.push({ label: 'Holy places', value: 2 * sites });
  parts.push({ label: 'Good order', value: c.stability + (c.legitimacy - 50) / 25 });
  const kept = parts.filter((p) => Math.abs(p.value) >= 0.05);
  return {
    total: Math.max(
      0,
      kept.reduce((s, p) => s + p.value, 0),
    ),
    parts: kept,
  };
}

const rankCache = new WeakMap<GameState, { day: number; list: Country[] }>();

/** Independent realms by score, then by their standing this year; worked out once a day. */
export function ranking(state: GameState): Country[] {
  const hit = rankCache.get(state);
  if (hit && hit.day === state.day) return hit.list;
  const now = new Map<number, number>();
  const list = scoring(state);
  for (const c of list) now.set(c.index, standing(state, c).total);
  list.sort((a, b) => b.score - a.score || now.get(b.index)! - now.get(a.index)!);
  rankCache.set(state, { day: state.day, list });
  return list;
}

/** A realm's place in the ranking (1 = first), or 0 if it does not score. */
export function rankOf(state: GameState, index: number): number {
  return ranking(state).findIndex((c) => c.index === index) + 1;
}

/** Notes the great realms of the year in the ledger. */
export function snapshot(state: GameState) {
  const year = toDate(state.day).y;
  if (state.ledger.at(-1)?.year === year) return;
  const byDev = scoring(state)
    .map((c) => ({ c, dev: realmDev(state, c.index) }))
    .sort((a, b) => b.dev - a.dev);
  const rows = byDev.slice(0, LEDGER_REALMS);
  const player = byDev.find((x) => x.c.index === state.player);
  if (player && !rows.includes(player)) rows.push(player);
  state.ledger.push({ year, rows: rows.map(({ c, dev }) => [c.index, dev, Math.round(c.score)]) });
}

/** New Year: every realm scores for its standing; each decade the ledger notes the great realms. */
export function yearlyScore(state: GameState) {
  const year = toDate(state.day).y;
  for (const c of scoring(state)) c.score += standing(state, c).total;
  if (year % 10 === 0 || !state.ledger.length) snapshot(state);
  if (state.day >= END_DAY && state.happened.end === undefined) endOfTheAge(state);
}

/** 1 January 2066: the ranking is final. The game goes on for whoever wants it. */
function endOfTheAge(state: GameState) {
  state.happened.end = state.day;
  snapshot(state);
  const first = ranking(state)[0];
  const verdict = first
    ? ` ${TheName(first.name)} ${agree(first.name, 'stands', 'stand')} first among the nations.`
    : '';
  chronicle(state, `The age ends.${verdict}`, {
    realm: first?.index,
  });
  log(state, 'all', 'event', 'The year 2066 has dawned: a thousand years have passed, and the age is ended.', {
    important: true,
  });
}
