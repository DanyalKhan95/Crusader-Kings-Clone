/**
 * Technology and eras. Each realm researches three tracks at once; its scholars' monthly points go
 * to the next level of each. A level costs about what an ordinary realm of its day would gather
 * between it and the level before, more if the realm is ahead of its time, less if it lags or its
 * neighbours already know it. The era of a realm follows its average level.
 */
import { ERAS, eraOfLevel, MAX_TECH } from '../data/eras';
import { BUILDINGS, FREE_LEVELS, MAX_LEVEL } from '../data/buildings';
import {
  CUMULATIVE,
  TECH_TRACKS,
  TECHS,
  techAt,
  type TechDef,
  type TechEffectKey,
  type TechTrack,
} from '../data/techs';
import type { Government } from '../shared/dataTypes';
import { toDate, years } from './calendar';
import { rulerSkill, seatSkill } from './characters';
import type { Breakdown, Part } from './economy';
import { log } from './log';
import { termYears } from '../data/politics';
import { modifierParts } from './modifiers';
import { estateEffect, invalidatePolitics, successionOptions } from './politics';
import { provincesOf, realmNeighbours } from './queries';
import type { BuildingType, Country, CouncilSeat, GameState, Skill } from './types';
import type { SimWorld } from './world';

type Check = { ok: true } | { ok: false; reason: string };
const yes: Check = { ok: true };
const no = (reason: string): Check => ({ ok: false, reason });

// ── Levels and effects ────────────────────────────────────────────

/** The summed effect of everything a realm knows. */
export function techEffect(c: Country, key: TechEffectKey): number {
  const t = c.tech;
  return (
    (CUMULATIVE.economy[t.economy]?.[key] ?? 0) +
    (CUMULATIVE.military[t.military]?.[key] ?? 0) +
    (CUMULATIVE.society[t.society]?.[key] ?? 0)
  );
}

/** The realm's era, as an index into ERAS: that of its average level. */
export function eraOf(c: Country): number {
  return eraOfLevel(Math.round((c.tech.economy + c.tech.military + c.tech.society) / 3));
}

/** The era of the realm's arms, which sets how its units are armed. */
export function militaryEra(c: Country | undefined): number {
  return c ? eraOfLevel(c.tech.military) : 0;
}

export function knows(c: Country, t: TechDef): boolean {
  return c.tech[t.track] >= t.level;
}

const byId = new Map<string, TechDef>();
for (const track of TECH_TRACKS) for (const t of TECHS[track]) byId.set(t.id, t);

export function techById(id: string): TechDef | undefined {
  return byId.get(id);
}

export function knowsId(c: Country, id: string): boolean {
  const t = byId.get(id);
  return !!t && knows(c, t);
}

/** Does the realm think of itself as a nation, with all that follows for peoples who do not belong? */
export function nationalist(c: Country): boolean {
  return TECHS.society.some((t) => t.nationalism && knows(c, t));
}

// ── Buildings ─────────────────────────────────────────────────────

const unlocks: Partial<Record<BuildingType, Record<number, TechDef>>> = {};
for (const track of TECH_TRACKS)
  for (const t of TECHS[track])
    if (t.building) {
      const [type, level] = t.building;
      (unlocks[type] ??= {})[level] = t;
    }

/** The technology a building level needs, if any. */
export function buildingTech(type: BuildingType, level: number): TechDef | undefined {
  return unlocks[type]?.[level];
}

/** The highest level of a building the realm knows how to build. */
export function maxBuildingLevel(c: Country, type: BuildingType): number {
  let max = 0;
  for (let level = 1; level <= Math.min(MAX_LEVEL, BUILDINGS[type].levels.length); level++) {
    const t = buildingTech(type, level);
    if (t ? !knows(c, t) : level > FREE_LEVELS) break;
    max = level;
  }
  return max;
}

// ── Research ──────────────────────────────────────────────────────

const TRACK_SKILL: Record<TechTrack, Skill> = { economy: 'stw', military: 'mar', society: 'lrn' };
const TRACK_SEAT: Record<TechTrack, CouncilSeat> = { economy: 'steward', military: 'marshal', society: 'chaplain' };
const TRACK_ESTATE = { economy: 'burghers', military: 'nobles', society: 'clergy' } as const;
const TRACK_SEAT_NAME: Record<TechTrack, string> = {
  economy: 'Steward',
  military: 'Marshal',
  society: 'Court chaplain',
};
export const FOCUS_BONUS = 0.25;

function breakdown(parts: Part[]): Breakdown {
  const kept = parts.filter((p) => Math.abs(p.value) >= 0.005);
  return { total: kept.reduce((s, p) => s + p.value, 0), parts: kept };
}

/** Research points a month for one track, and where they come from. */
export function researchPoints(state: GameState, c: Country, track: TechTrack): Breakdown {
  let dev = 0,
    schools = 0;
  for (const id of provincesOf(state, c.index)) {
    const p = state.provinces[id];
    dev += p.dev;
    if (p.controller === c.index) schools += p.buildings.university ?? 0;
  }
  const parts: Part[] = [
    { label: 'Scholars of the realm', value: 1 },
    { label: 'Development', value: 0.35 * Math.sqrt(dev / 10) },
    { label: 'The ruler', value: rulerSkill(state, c, TRACK_SKILL[track]) * 0.06 },
    { label: TRACK_SEAT_NAME[track], value: seatSkill(state, c, TRACK_SEAT[track]) * 0.04 },
    // A few great universities count for more than many small ones.
    { label: 'Universities', value: (BUILDINGS.university.effects.research ?? 0) * Math.sqrt(schools) * 2 },
    { label: `The ${TRACK_ESTATE[track]}`, value: estateEffect(state, c, TRACK_ESTATE[track]) * 0.3 },
  ];
  const base = parts.reduce((s, p) => s + p.value, 0);
  const mult: Part[] = [
    { label: 'Learning', value: techEffect(c, 'research') },
    { label: 'Stability', value: c.stability * 0.03 },
  ];
  if (c.focus === track) mult.push({ label: 'The realm’s focus', value: FOCUS_BONUS });
  if (c.gov === 'democracy') mult.push({ label: 'Free enquiry', value: 0.1 });
  mult.push(...modifierParts(c, 'research'));
  for (const m of mult) parts.push({ label: m.label, value: base * m.value });
  const b = breakdown(parts);
  b.total = Math.max(0.2, b.total);
  return b;
}

/** Points a month per year of history between two levels, for an ordinary realm. */
const POINTS_PER_YEAR = 110;
/** How much dearer a level is for each year it is ahead of its time. */
const AHEAD = 1.05;
/** Years ahead beyond which a level costs no more. */
const MAX_AHEAD = 80;

/** What the next level of a track costs the realm, and why; `year` looks ahead to a later day. */
export function techCost(
  state: GameState,
  world: SimWorld,
  c: Country,
  track: TechTrack,
  year = toDate(state.day).y,
): Breakdown {
  const level = c.tech[track] + 1;
  const t = techAt(track, level);
  if (!t) return { total: Infinity, parts: [] };
  const prev = techAt(track, level - 1)?.year ?? t.year - 100;
  const base = Math.max(300, POINTS_PER_YEAR * (t.year - prev));
  const parts: Part[] = [{ label: `${t.name} (${t.year})`, value: base }];
  // Every year ahead of its time makes a discovery harder still, up to a point.
  const ahead = Math.min(MAX_AHEAD, t.year - year);
  if (ahead > 0)
    parts.push({ label: `Ahead of its time by ${t.year - year} years`, value: base * (AHEAD ** ahead - 1) });
  else if (year > t.year)
    parts.push({ label: `Known for ${year - t.year} years`, value: -base * Math.min(0.5, 0.015 * (year - t.year)) });
  const known = knowersNear(state, world, c, track, level);
  if (known)
    parts.push({
      label: `Known to ${known} neighbour${known === 1 ? '' : 's'}`,
      value: -base * Math.min(0.4, 0.1 * known),
    });
  const b = breakdown(parts);
  b.total = Math.max(base * 0.3, b.total);
  return b;
}

/** Neighbouring realms (the liege counting twice) who already know a level. */
function knowersNear(state: GameState, world: SimWorld, c: Country, track: TechTrack, level: number): number {
  let n = 0;
  for (const i of realmNeighbours(state, world, c.index)) if ((state.countries[i]?.tech[track] ?? 0) >= level) n++;
  const liege = state.countries[c.liege];
  if (liege && liege.tech[track] >= level) n += 2;
  return n;
}

/**
 * Months until the next level at today's pace, as its cost falls with the years: Infinity past a
 * century.
 */
export function monthsToNext(state: GameState, world: SimWorld, c: Country, track: TechTrack): number {
  if (c.tech[track] >= MAX_TECH) return Infinity;
  const points = researchPoints(state, c, track).total;
  const year = toDate(state.day).y;
  let have = c.research[track];
  for (let m = 0; m <= 1200; m += 3) {
    if (have >= techCost(state, world, c, track, year + Math.floor(m / 12)).total) return m;
    have += points * 3;
  }
  return Infinity;
}

/** Each month every realm's scholars work; a level is learned when its cost is met. */
export function monthlyResearch(state: GameState, world: SimWorld) {
  for (const c of state.countries) {
    if (!c?.alive || c.rebel) continue;
    const eraBefore = eraOf(c);
    for (const track of TECH_TRACKS) {
      if (c.tech[track] >= MAX_TECH) continue;
      c.research[track] += researchPoints(state, c, track).total;
      const cost = techCost(state, world, c, track).total;
      if (c.research[track] < cost) continue;
      c.research[track] = 0;
      c.tech[track]++;
      const t = techAt(track, c.tech[track])!;
      invalidatePolitics(state);
      if (c.index === state.player) {
        const extra = t.building
          ? ` You may now build ${BUILDINGS[t.building[0]].levels[t.building[1] - 1].toLowerCase()}.`
          : t.government
            ? ' A new form of government is open to you.'
            : t.unit
              ? ' A new arm joins the army.'
              : '';
        log(state, [c.index], 'event', `Your scholars have mastered ${t.name}.${extra}`, {
          important: !!(t.building || t.government || t.unit),
        });
      }
    }
    const era = eraOf(c);
    if (era > eraBefore) {
      state.mapVersion++;
      log(state, [c.index], 'event', `${c.name} enters the ${ERAS[era].name.toLowerCase()} era. ${ERAS[era].blurb}`, {
        important: true,
      });
    }
  }
}

export function setFocus(c: Country, track: TechTrack | null) {
  c.focus = track;
}

/** Technology levels of a realm of 1066, by its form of government. */
export function initialTech(gov: Government): Record<TechTrack, number> {
  switch (gov) {
    case 'tribal':
      return { economy: 1, military: 1, society: 1 };
    case 'nomadic':
      return { economy: 1, military: 2, society: 1 };
    case 'clan':
      return { economy: 2, military: 3, society: 2 };
    case 'imperial':
      return { economy: 4, military: 3, society: 3 };
    default:
      return { economy: 3, military: 3, society: 3 };
  }
}

// ── Governments ───────────────────────────────────────────────────

/** Forms of government that the old ways allow, before any technology. */
const OLD_WAYS: Partial<Record<Government, Government[]>> = {
  tribal: ['feudal'],
  nomadic: ['feudal', 'clan'],
  clan: ['feudal'],
};

/** Years between changes of government. */
export const REFORM_YEARS = 20;

/** Governments the realm could reform into. */
export function reformOptions(c: Country): Government[] {
  const out = new Set<Government>(c.tech.society >= 3 ? (OLD_WAYS[c.gov] ?? []) : []);
  for (const t of TECHS.society) if (t.government && knows(c, t)) out.add(t.government);
  out.delete(c.gov);
  // A theocracy or a merchant republic keeps its nature until modern ideas arrive.
  if (c.gov === 'theocracy' || c.gov === 'republic')
    for (const g of ['absolute', 'constitutional'] as Government[]) out.delete(g);
  return [...out];
}

export function reformCost(): { legitimacy: number; stability: number } {
  return { legitimacy: 20, stability: 2 };
}

export function canReform(state: GameState, c: Country, gov: Government): Check {
  if (!c?.alive || c.rebel) return no('No such realm');
  if (c.liege) return no('A vassal keeps the government its liege allows');
  if (!reformOptions(c).includes(gov)) return no('That form of government is not open to you');
  const wait = c.reformed + years(REFORM_YEARS) - state.day;
  if (wait > 0) return no(`The last reform is too recent: ${Math.ceil(wait / 365)} years to wait`);
  if (c.legitimacy < reformCost().legitimacy) return no(`It needs ${reformCost().legitimacy} legitimacy`);
  if (state.wars.some((w) => w.attackers.includes(c.index) || w.defenders.includes(c.index)))
    return no('Not in the middle of a war');
  return yes;
}

/** A new form of government: the estates shift, succession follows the new form. */
export function reform(state: GameState, c: Country, gov: Government): boolean {
  if (!canReform(state, c, gov).ok) return false;
  changeGovernment(state, c, gov, reformCost());
  return true;
}

/** Sets a form of government without asking what the realm knows: for revolutions and their like. */
export function changeGovernment(
  state: GameState,
  c: Country,
  gov: Government,
  cost: { legitimacy: number; stability: number },
) {
  c.gov = gov;
  c.legitimacy = Math.max(0, c.legitimacy - cost.legitimacy);
  c.stability = Math.max(-3, c.stability - cost.stability);
  c.reformed = state.day;
  const options = successionOptions(gov);
  if (!options.includes(c.laws.succession)) c.laws.succession = options[0];
  if (c.laws.succession === 'republic') c.termEnds = state.day + years(termYears(gov));
  invalidatePolitics(state);
  state.mapVersion++;
  log(state, 'all', 'event', `${c.name} is now a ${GOV_NOUN[gov] ?? gov}.`, {
    province: c.capital,
    important: c.index === state.player,
  });
}

const GOV_NOUN: Partial<Record<Government, string>> = {
  feudal: 'feudal monarchy',
  republic: 'republic',
  clan: 'dynastic realm',
  absolute: 'absolute monarchy',
  constitutional: 'constitutional monarchy',
  democracy: 'democracy',
  dictatorship: 'dictatorship',
  communist: 'communist state',
};
