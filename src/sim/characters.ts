/**
 * Rulers, heirs, councillors and commanders. No dynasties: a ruler is succeeded by the heir, and a
 * new heir is found at court.
 */
import { nameList } from '../data/names';
import { EDUCATION_BY_SKILL, OPPOSITES, PERSONALITY, TRAITS } from '../data/traits';
import { years, yearsBetween } from './calendar';
import { log } from './log';
import { provincesOf } from './queries';
import { chance, pick, random, randInt } from './rng';
import {
  COUNCIL_SEATS,
  SKILLS,
  type Character,
  type Country,
  type CouncilSeat,
  type GameState,
  type Skill,
} from './types';
import type { SimWorld } from './world';

export const SEAT_SKILL: Record<CouncilSeat, Skill> = {
  chancellor: 'dip',
  marshal: 'mar',
  steward: 'stw',
  spymaster: 'int',
  chaplain: 'lrn',
};

export const SEAT_INFO: Record<CouncilSeat, { name: string; effect: string }> = {
  chancellor: { name: 'Chancellor', effect: 'Better peace terms and slower war weariness' },
  marshal: { name: 'Marshal', effect: 'Larger levies' },
  steward: { name: 'Steward', effect: 'Higher taxes' },
  spymaster: { name: 'Spymaster', effect: 'Faster sieges' },
  chaplain: { name: 'Court chaplain', effect: 'Quicker recovery of stability' },
};

export const SKILL_NAMES: Record<Skill, string> = {
  dip: 'Diplomacy',
  mar: 'Martial',
  stw: 'Stewardship',
  int: 'Intrigue',
  lrn: 'Learning',
};

const COURT_SIZE = 4;

export function character(state: GameState, id: number): Character | undefined {
  return id ? state.characters[id] : undefined;
}

export function alive(state: GameState, id: number): boolean {
  const c = character(state, id);
  return !!c && c.died === undefined;
}

export function age(state: GameState, c: Character): number {
  return yearsBetween(c.born, state.day);
}

/** Skill including traits, never below 0. */
export function skill(c: Character | undefined, s: Skill): number {
  if (!c) return 0;
  let v = c.skills[s];
  for (const t of c.traits) v += TRAITS[t]?.skills?.[s] ?? 0;
  return Math.max(0, v);
}

export function seatSkill(state: GameState, country: Country, seat: CouncilSeat): number {
  const id = country.council[seat];
  return alive(state, id) ? skill(character(state, id), SEAT_SKILL[seat]) : 0;
}

export function rulerSkill(state: GameState, country: Country, s: Skill): number {
  return alive(state, country.ruler) ? skill(character(state, country.ruler), s) : 0;
}

export interface NewCharacter {
  name?: string;
  age?: number;
  female?: boolean;
  /** raises skills a little: rulers and councillors come from the elite */
  talent?: number;
  place?: boolean;
}

/** Creates a character of the country's culture and adds it to the state. */
export function makeCharacter(state: GameState, world: SimWorld, country: Country, opts: NewCharacter = {}): Character {
  const culture = world.world.cultures[country.culture];
  const names = nameList(country.culture, culture?.group);
  const female = opts.female ?? false;
  let name = opts.name ?? pick(state, female ? names.female : names.male);
  if (!opts.name && opts.place) {
    const own = provincesOf(state, country.index);
    if (own.length && !name.includes(' ')) name += ` of ${world.region(pick(state, own)).name}`;
  }
  const talent = opts.talent ?? 0;
  const skills = {} as Record<Skill, number>;
  for (const s of SKILLS) skills[s] = Math.max(0, Math.round(2 + random(state) * 6 + random(state) * 4 + talent));
  const best = SKILLS.reduce((a, b) => (skills[b] > skills[a] ? b : a));
  const traits = [EDUCATION_BY_SKILL[best]];
  const addTrait = (t: string) => {
    if (traits.includes(t)) return;
    if (OPPOSITES.some(([a, b]) => (a === t && traits.includes(b)) || (b === t && traits.includes(a)))) return;
    traits.push(t);
  };
  addTrait(pick(state, PERSONALITY));
  if (chance(state, 0.6)) addTrait(pick(state, PERSONALITY));
  const r = random(state);
  if (r < 0.03) addTrait('genius');
  else if (r < 0.12) addTrait('quick');
  else if (r < 0.18) addTrait('slow');
  if (chance(state, 0.1)) addTrait('strong');
  else if (chance(state, 0.07)) addTrait('frail');
  const years_ = opts.age ?? randInt(state, 18, 50);
  const c: Character = {
    id: state.nextId++,
    name,
    female,
    born: state.day - years(years_) - randInt(state, 0, 364),
    country: country.index,
    skills,
    traits,
  };
  state.characters[c.id] = c;
  return c;
}

// ── Titles and names ──────────────────────────────────────────────

const ROMAN: [number, string][] = [
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];
function roman(n: number): string {
  let s = '';
  for (const [v, r] of ROMAN)
    while (n >= v) {
      s += r;
      n -= v;
    }
  return s;
}

/** Name for a new ruler: "Harold" becomes "Harold III" if two Harolds reigned before. */
export function regnalName(state: GameState, country: Country, given: string): string {
  const base = given.replace(/ of .*$/, '');
  let count = 0;
  for (const c of Object.values(state.characters)) {
    if (c.country !== country.index || !c.traits.includes('_reigned')) continue;
    const m = /^(.*?)(?: ([IVX]+))?$/.exec(c.name.replace(/ the .*$/, ''));
    if (m && m[1] === base) count = Math.max(count + 1, m[2] ? romanValue(m[2]) : 1);
  }
  return count ? `${base} ${roman(count + 1)}` : base;
}

function romanValue(s: string): number {
  const v: Record<string, number> = { I: 1, V: 5, X: 10 };
  let n = 0;
  for (let i = 0; i < s.length; i++) n += v[s[i]] < (v[s[i + 1]] ?? 0) ? -v[s[i]] : v[s[i]];
  return n;
}

// ── Court upkeep ──────────────────────────────────────────────────

/** Keeps a country's court staffed: an heir, a few courtiers, and (for the AI) a full council. */
export function staffCourt(state: GameState, world: SimWorld, country: Country, fillCouncil: boolean) {
  if (!alive(state, country.heir)) {
    const ruler = character(state, country.ruler);
    const rulerAge = ruler ? age(state, ruler) : 40;
    const heirAge = rulerAge > 36 ? randInt(state, Math.max(2, rulerAge - 34), rulerAge - 18) : randInt(state, 4, 30);
    country.heir = makeCharacter(state, world, country, { age: heirAge, female: chance(state, 0.08) }).id;
  }
  const topUp = () => {
    country.courtiers = country.courtiers.filter(
      (id) => alive(state, id) && character(state, id)!.country === country.index,
    );
    while (country.courtiers.length < COURT_SIZE)
      country.courtiers.push(makeCharacter(state, world, country, { place: true, female: chance(state, 0.12) }).id);
  };
  topUp();
  if (fillCouncil) {
    for (const seat of COUNCIL_SEATS) {
      if (alive(state, country.council[seat])) continue;
      if (!country.courtiers.length) topUp();
      appointBest(state, country, seat);
    }
    topUp();
  }
}

/** Appoints the best candidate at court to an empty or dead seat. */
export function appointBest(state: GameState, country: Country, seat: CouncilSeat) {
  const s = SEAT_SKILL[seat];
  let best = 0,
    bestV = -1;
  for (const id of country.courtiers) {
    const v = skill(character(state, id), s);
    if (v > bestV) {
      bestV = v;
      best = id;
    }
  }
  if (!best) return;
  appoint(state, country, seat, best);
}

/** Moves a courtier onto the council; whoever held the seat returns to court. */
export function appoint(state: GameState, country: Country, seat: CouncilSeat, id: number) {
  const prev = country.council[seat];
  country.courtiers = country.courtiers.filter((c) => c !== id);
  // A councillor moving seats leaves the old one empty.
  for (const s of COUNCIL_SEATS) if (country.council[s] === id) country.council[s] = 0;
  country.council[seat] = id;
  if (alive(state, prev)) country.courtiers.push(prev);
}

// ── Mortality and succession ──────────────────────────────────────

/** Chance of dying within a year at a given age. */
export function yearlyMortality(ageYears: number): number {
  if (ageYears < 16) return 0.006;
  if (ageYears < 40) return 0.012;
  if (ageYears < 50) return 0.022;
  if (ageYears < 60) return 0.045;
  if (ageYears < 70) return 0.09;
  if (ageYears < 80) return 0.16;
  return 0.3;
}

/** Monthly: rulers, heirs, councillors and courtiers may die. */
export function monthlyMortality(state: GameState, world: SimWorld) {
  for (const country of state.countries) {
    if (!country?.alive) continue;
    const people = [country.ruler, country.heir, ...Object.values(country.council), ...country.courtiers];
    for (const id of people) {
      const c = character(state, id);
      if (!c || c.died !== undefined) continue;
      let p = yearlyMortality(age(state, c)) / 12;
      for (const t of c.traits) p *= TRAITS[t]?.mortality ?? 1;
      if (chance(state, p)) die(state, world, c);
    }
  }
}

export function die(state: GameState, world: SimWorld, c: Character) {
  if (c.died !== undefined) return;
  c.died = state.day;
  const country = state.countries[c.country];
  if (!country) return;
  for (const seat of COUNCIL_SEATS) if (country.council[seat] === c.id) country.council[seat] = 0;
  for (const a of state.armies) if (a.commander === c.id) a.commander = 0;
  if (country.ruler === c.id) succeed(state, world, country);
  else if (country.heir === c.id) {
    country.heir = 0;
    log(state, [country.index], 'death', `${c.name}, heir of ${country.name}, has died.`);
  }
}

/** The heir takes the throne. */
export function succeed(state: GameState, world: SimWorld, country: Country) {
  const old = character(state, country.ruler);
  staffCourt(state, world, country, false);
  const heir = character(state, country.heir)!;
  heir.name = regnalName(state, country, heir.name);
  heir.traits = [...heir.traits.filter((t) => t !== '_reigned'), '_reigned'];
  country.ruler = heir.id;
  country.heir = 0;
  for (const seat of COUNCIL_SEATS) if (country.council[seat] === heir.id) country.council[seat] = 0;
  country.courtiers = country.courtiers.filter((id) => id !== heir.id);
  country.stability = Math.max(-3, country.stability - 1);
  staffCourt(state, world, country, country.index !== state.player);
  log(
    state,
    [country.index],
    'death',
    `${old ? old.name : 'The ruler'} of ${country.name} is dead. Long live ${heir.name}!`,
    { important: country.index === state.player, province: country.capital },
  );
}

export function displayName(c: Character | undefined): string {
  return c ? c.name : 'Nobody';
}

export function visibleTraits(c: Character): string[] {
  return c.traits.filter((t) => !t.startsWith('_'));
}
