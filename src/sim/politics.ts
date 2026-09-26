/**
 * Internal politics: laws, legitimacy, the estates, council tasks and elections. Every figure comes
 * as a breakdown, for the UI and for the AI alike. Revolts and vassal factions live in `revolts.ts`.
 */
import { STRIFE, TOLERANCE_CLERGY } from '../data/faiths';
import {
  CONSCRIPTION_COMMONS,
  CROWN_NOBLES,
  DEFAULT_TASKS,
  ESTATE_INFO,
  ESTATE_WEIGHT,
  LAW_COOLDOWN_YEARS,
  LEVEL_LAWS,
  SEAT_TASKS,
  TAXATION_BURGHERS,
  TAXATION_COMMONS,
  termYears,
} from '../data/politics';
import type { Government } from '../shared/dataTypes';
import { years } from './calendar';
import { age, alive, candidateScore, character, electionCandidates, seatSkill } from './characters';
import type { Breakdown, Part } from './economy';
import { diversity, holySiteLegitimacy } from './faith';
import { log } from './log';
import { provincesOf } from './queries';
import { nationalist, techEffect } from './tech';
import {
  ESTATES,
  type Country,
  type CouncilSeat,
  type EstateId,
  type EstateState,
  type GameState,
  type LawId,
  type Laws,
  type Succession,
  type TaskId,
} from './types';

type Check = { ok: true } | { ok: false; reason: string };
const yes: Check = { ok: true };
const no = (reason: string): Check => ({ ok: false, reason });

function breakdown(parts: Part[]): Breakdown {
  const kept = parts.filter((p) => Math.abs(p.value) >= 0.05);
  return { total: kept.reduce((s, p) => s + p.value, 0), parts: kept };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ── Council tasks ─────────────────────────────────────────────────

/** The skill a councillor brings to a task, or 0 when the seat is busy with something else. */
export function taskSkill(state: GameState, c: Country, seat: CouncilSeat, task: TaskId): number {
  return c.tasks[seat] === task ? seatSkill(state, c, seat) : 0;
}

export function setTask(state: GameState, c: Country, seat: CouncilSeat, task: TaskId): boolean {
  if (!SEAT_TASKS[seat].includes(task)) return false;
  c.tasks[seat] = task;
  invalidatePolitics(state);
  return true;
}

export function defaultTasks(): Record<CouncilSeat, TaskId> {
  return { ...DEFAULT_TASKS };
}

// ── Laws ──────────────────────────────────────────────────────────

export function successionOptions(gov: Government): Succession[] {
  if (gov === 'republic' || gov === 'democracy') return ['republic'];
  if (gov === 'theocracy') return ['theocratic'];
  if (gov === 'absolute' || gov === 'constitutional') return ['hereditary'];
  // The party or the junta chooses the ablest of its own.
  if (gov === 'dictatorship' || gov === 'communist') return ['elective'];
  return ['hereditary', 'elective'];
}

/** The laws of 1066: the Empire elects, Celts and steppe peoples choose the ablest kinsman. */
export function initialLaws(gov: Government, tag: string, cultureGroup: string | undefined): Laws {
  let succession = successionOptions(gov)[0];
  if (
    succession === 'hereditary' &&
    (tag === 'HRE' || gov === 'tribal' || gov === 'nomadic' || cultureGroup === 'celtic')
  )
    succession = 'elective';
  const crown = gov === 'imperial' ? 2 : gov === 'feudal' || gov === 'clan' || gov === 'theocracy' ? 1 : 0;
  const conscription = gov === 'tribal' || gov === 'nomadic' ? 2 : 1;
  return { succession, crown, conscription, taxation: 1, tolerance: 1 };
}

export function defaultEstates(): Record<EstateId, EstateState> {
  const out = {} as Record<EstateId, EstateState>;
  for (const e of ESTATES) out[e] = { privileged: false, mood: 0 };
  return out;
}

/** Days until the laws may change again. */
export function lawCooldown(state: GameState, c: Country): number {
  return Math.max(0, c.lawChanged + years(LAW_COOLDOWN_YEARS) - state.day);
}

/** A harsher law shakes the realm: higher crown authority, conscription or taxes, or persecution. */
export function lawCost(c: Country, law: LawId, value: Laws[LawId]): { legitimacy: number; stability: number } {
  if (law === 'succession') return { legitimacy: 15, stability: 1 };
  const harsher = law === 'tolerance' ? (value as number) < c.laws[law] : (value as number) > c.laws[law];
  return { legitimacy: 5, stability: harsher ? 1 : 0 };
}

export function canChangeLaw(state: GameState, c: Country, law: LawId, value: Laws[LawId]): Check {
  if (!c?.alive) return no('No such country');
  if (c.rebel) return no('Rebels make no laws');
  if (law === 'succession') {
    if (!successionOptions(c.gov).includes(value as Succession)) return no('Not possible for this government');
  } else {
    const v = value as number;
    if (!Number.isInteger(v) || v < 0 || v >= LEVEL_LAWS[law].levels.length) return no('No such law');
    if (Math.abs(v - c.laws[law]) > 1) return no('Laws change one step at a time');
  }
  if (value === c.laws[law]) return no('That is already the law');
  const wait = lawCooldown(state, c);
  if (wait > 0) return no(`The realm needs time before another change: ${Math.ceil(wait / 30)} months`);
  const cost = lawCost(c, law, value);
  if (c.legitimacy < cost.legitimacy) return no(`It needs ${cost.legitimacy} legitimacy`);
  return yes;
}

export function changeLaw(state: GameState, c: Country, law: LawId, value: Laws[LawId]): boolean {
  if (!canChangeLaw(state, c, law, value).ok) return false;
  const cost = lawCost(c, law, value);
  if (law === 'succession') c.laws.succession = value as Succession;
  else c.laws[law] = value as number;
  c.legitimacy = Math.max(0, c.legitimacy - cost.legitimacy);
  c.stability = Math.max(-3, c.stability - cost.stability);
  c.lawChanged = state.day;
  if (law === 'succession' && value === 'republic') c.termEnds = state.day + years(termYears(c.gov));
  invalidatePolitics(state);
  return true;
}

// ── Legitimacy ────────────────────────────────────────────────────

/** Where legitimacy is heading; it moves a point or two a month towards this. */
export function legitimacyTarget(state: GameState, c: Country): Breakdown {
  const parts: Part[] = [{ label: 'The right to rule', value: 50 }];
  parts.push({ label: 'Years on the throne', value: Math.min(20, Math.floor((state.day - c.rulerSince) / 365)) });
  parts.push({ label: 'Stability', value: c.stability * 4 });
  if (c.gov === 'theocracy') parts.push({ label: 'Rule in God’s name', value: 10 });
  parts.push({ label: 'The clergy', value: Math.round(estateEffect(state, c, 'clergy') * 10) });
  parts.push({ label: 'Court chaplain', value: taskSkill(state, c, 'chaplain', 'legitimacy') });
  parts.push({ label: 'Holy sites held', value: holySiteLegitimacy(state, c) });
  parts.push({ label: 'Learning and law', value: techEffect(c, 'legitimacy') });
  const ruler = character(state, c.ruler);
  if (ruler && age(state, ruler) < 16) parts.push({ label: 'A child on the throne', value: -15 });
  if (ruler?.traits.includes('pious')) parts.push({ label: 'A pious ruler', value: 5 });
  if (c.rebel) parts.push({ label: 'A rebel', value: -30 });
  return breakdown(parts);
}

export function monthlyLegitimacy(state: GameState) {
  for (const c of state.countries) {
    if (!c?.alive) continue;
    const target = clamp(legitimacyTarget(state, c).total, 0, 100);
    const step = Math.abs(target - c.legitimacy) > 20 ? 2 : 1;
    if (c.legitimacy < target) c.legitimacy = Math.min(target, c.legitimacy + step);
    else if (c.legitimacy > target) c.legitimacy = Math.max(target, c.legitimacy - step);
  }
}

// ── Estates ───────────────────────────────────────────────────────

export function estateName(c: Country, e: EstateId): string {
  const tribal = c.gov === 'tribal' || c.gov === 'nomadic' || c.gov === 'clan';
  return (tribal && ESTATE_INFO[e].tribal) || ESTATE_INFO[e].name;
}

export interface Influence {
  share: Record<EstateId, number>;
  parts: Record<EstateId, Part[]>;
}

const influenceCache = new WeakMap<GameState, { day: number; map: Map<number, Influence> }>();

/** How power is shared between the estates: by government, castles and markets, and privileges. */
export function estateInfluence(state: GameState, c: Country): Influence {
  let cache = influenceCache.get(state);
  if (!cache || cache.day !== state.day) influenceCache.set(state, (cache = { day: state.day, map: new Map() }));
  let hit = cache.map.get(c.index);
  if (!hit) cache.map.set(c.index, (hit = computeInfluence(state, c)));
  return hit;
}

function computeInfluence(state: GameState, c: Country): Influence {
  const base = ESTATE_WEIGHT[c.gov];
  const parts = {} as Record<EstateId, Part[]>;
  for (const e of ESTATES) parts[e] = [{ label: 'Government', value: base[e] }];
  let markets = 0,
    castles = 0,
    n = 0;
  for (const id of provincesOf(state, c.index)) {
    const p = state.provinces[id];
    n++;
    markets += p.buildings.market ?? 0;
    castles += p.buildings.castle ?? 0;
  }
  if (n) {
    parts.burghers.push({ label: 'Markets', value: (15 * markets) / n });
    parts.nobles.push({ label: 'Castles', value: (10 * castles) / n });
  }
  parts.nobles.push({ label: 'Crown authority', value: -5 * c.laws.crown });
  for (const e of ESTATES) if (c.estates[e].privileged) parts[e].push({ label: 'Privileges', value: 10 });
  const raw = {} as Record<EstateId, number>;
  let sum = 0;
  for (const e of ESTATES) {
    raw[e] = Math.max(
      1,
      parts[e].reduce((s, p) => s + p.value, 0),
    );
    sum += raw[e];
  }
  const share = {} as Record<EstateId, number>;
  for (const e of ESTATES) share[e] = raw[e] / sum;
  return { share, parts };
}

/** How loyal an estate is to the crown, −100 … 100. Below −35 a powerful estate may revolt. */
export function estateLoyalty(state: GameState, c: Country, e: EstateId): Breakdown {
  const parts: Part[] = [{ label: 'Custom and habit', value: 10 }];
  const l = c.laws;
  if (e === 'nobles') parts.push({ label: 'Crown authority', value: CROWN_NOBLES[l.crown] });
  if (e === 'commons') {
    parts.push({ label: 'Taxation', value: TAXATION_COMMONS[l.taxation] });
    parts.push({ label: 'Conscription', value: CONSCRIPTION_COMMONS[l.conscription] });
  }
  if (e === 'burghers') parts.push({ label: 'Taxation', value: TAXATION_BURGHERS[l.taxation] });
  if (e === 'commons') {
    const d = diversity(state, c);
    parts.push({ label: 'Religious strife', value: -(d.heathen * 40 + d.sister * 15) * STRIFE[l.tolerance] });
    parts.push({
      label: nationalist(c) ? 'Foreign nations' : 'Foreign peoples',
      value: -d.foreign * (nationalist(c) ? 45 : 20),
    });
    parts.push({ label: 'Reforms', value: techEffect(c, 'commons') });
  }
  if (e === 'clergy') parts.push({ label: 'Religious policy', value: TOLERANCE_CLERGY[l.tolerance] });
  if (c.estates[e].privileged) parts.push({ label: 'Their privileges', value: 25 });
  if (e === 'nobles' || e === 'clergy')
    parts.push({ label: 'Legitimacy of the crown', value: Math.round((c.legitimacy - 50) * 0.3) });
  parts.push({ label: 'Stability', value: c.stability * 5 });
  const traits = character(state, c.ruler)?.traits ?? [];
  const trait = (t: string, who: EstateId | 'all', v: number, label: string) => {
    if (traits.includes(t) && (who === 'all' || who === e)) parts.push({ label, value: v });
  };
  trait('pious', 'clergy', 10, 'A pious ruler');
  trait('cynical', 'clergy', -10, 'A cynical ruler');
  trait('just', 'commons', 10, 'A just ruler');
  trait('cruel', 'all', -5, 'A cruel ruler');
  trait('gregarious', 'nobles', 5, 'A gregarious ruler');
  trait('ambitious', 'nobles', -5, 'An ambitious ruler');
  if (e === 'commons' && c.warExhaustion >= 1)
    parts.push({ label: 'War weariness', value: -Math.round(c.warExhaustion * 2.5) });
  if (e === 'burghers' && c.warExhaustion >= 1)
    parts.push({ label: 'War weariness', value: -Math.round(c.warExhaustion) });
  if (c.estates[e].mood) parts.push({ label: 'Recent dealings', value: Math.round(c.estates[e].mood) });
  const watch = taskSkill(state, c, 'spymaster', 'watch');
  if (watch) parts.push({ label: 'A watchful spymaster', value: Math.round(watch / 2) });
  const share = estateInfluence(state, c).share[e];
  if (share > 0.4) parts.push({ label: 'Too powerful to obey', value: -Math.round((share - 0.4) * 50) });
  return breakdown(parts);
}

const effectCache = new WeakMap<GameState, { day: number; map: Map<number, number> }>();

/**
 * −1.5 … 1.5: how much an estate helps or hinders the realm, by its loyalty and its power. Taxes and
 * levies ask for it constantly, so it is worked out once a day (or again after a change of policy).
 */
export function estateEffect(state: GameState, c: Country, e: EstateId): number {
  let cache = effectCache.get(state);
  if (!cache || cache.day !== state.day) effectCache.set(state, (cache = { day: state.day, map: new Map() }));
  const key = c.index * 8 + ESTATES.indexOf(e);
  let v = cache.map.get(key);
  if (v === undefined) {
    const loyalty = estateLoyalty(state, c, e).total;
    const share = estateInfluence(state, c).share[e];
    v = clamp(loyalty / 50, -1, 1) * Math.min(1.5, share * 4);
    cache.map.set(key, v);
  }
  return v;
}

/** Forget cached estate figures after a change of law, privilege or task. */
export function invalidatePolitics(state: GameState) {
  effectCache.delete(state);
  influenceCache.delete(state);
}

export function grantPrivilege(state: GameState, c: Country, e: EstateId): boolean {
  if (c.estates[e].privileged) return false;
  c.estates[e].privileged = true;
  invalidatePolitics(state);
  return true;
}

/** Taking privileges back angers the estate and shakes the realm. */
export function revokePrivilege(state: GameState, c: Country, e: EstateId): boolean {
  if (!c.estates[e].privileged) return false;
  c.estates[e].privileged = false;
  c.estates[e].mood = Math.max(-60, c.estates[e].mood - 30);
  c.stability = Math.max(-3, c.stability - 1);
  invalidatePolitics(state);
  return true;
}

/** Old grievances and favours fade. */
export function monthlyEstateMoods(state: GameState) {
  for (const c of state.countries) {
    if (!c?.alive) continue;
    for (const e of ESTATES) {
      const m = c.estates[e].mood;
      c.estates[e].mood = m > 0 ? Math.max(0, m - 1) : Math.min(0, m + 1);
    }
  }
}

// ── Elections ─────────────────────────────────────────────────────

/** Republics elect their ruler for eight years; an incumbent with legitimacy has the edge. */
export function monthlyElections(state: GameState) {
  for (const c of state.countries) {
    if (!c?.alive || c.laws.succession !== 'republic' || c.termEnds > state.day) continue;
    const incumbent = c.ruler;
    let best = incumbent,
      bestScore = alive(state, incumbent)
        ? candidateScore(state, incumbent, 'republic') + (c.legitimacy >= 50 ? 5 : 0)
        : -Infinity;
    for (const id of electionCandidates(state, c)) {
      if (id === incumbent) continue;
      const v = candidateScore(state, id, 'republic');
      if (v > bestScore) {
        bestScore = v;
        best = id;
      }
    }
    c.termEnds = state.day + years(termYears(c.gov));
    if (best === incumbent) {
      c.legitimacy = Math.min(100, c.legitimacy + 10);
      log(state, [c.index], 'event', `${character(state, incumbent)?.name} is re-elected to lead ${c.name}.`, {
        important: c.index === state.player,
      });
      continue;
    }
    const winner = character(state, best)!;
    if (alive(state, incumbent)) c.courtiers.push(incumbent);
    for (const seat of Object.keys(c.council) as CouncilSeat[]) if (c.council[seat] === best) c.council[seat] = 0;
    c.courtiers = c.courtiers.filter((id) => id !== best);
    if (c.heir === best) c.heir = 0;
    c.ruler = best;
    c.rulerSince = state.day;
    c.legitimacy = 70;
    log(state, [c.index], 'event', `${winner.name} is elected to lead ${c.name}.`, {
      important: c.index === state.player,
      province: c.capital,
    });
  }
}
