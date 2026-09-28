/**
 * The event engine. Each month every realm may meet one event (see data/events.ts): the AI chooses
 * at once, by the weights of the options; the player's events wait in `state.events` until answered.
 * World events and the pestilence fire events of their own through `fireEvent`.
 */
import {
  EVENT_BY_ID,
  EVENTS,
  PLAGUE_BY_ID,
  type EventContext,
  type EventDef,
  type EventEffects,
  type EventOption,
  type SpecialId,
} from '../data/events';
import { HERESIES } from '../data/faiths';
import { MODIFIER_TEXT, MODIFIERS, type ModifierEffectKey } from '../data/modifiers';
import { TECH_TRACKS } from '../data/techs';
import { cultureGroup, faithFamily, faithName } from './beliefs';
import { age, character, die, makeCharacter, rulerSkill } from './characters';
import { opinionOf, remember } from './diplomacy';
import { turnFaith } from './faith';
import { income, maxManpower, MAX_DEV, takeLoan } from './economy';
import { addModifier, hasModifier, removeModifier } from './modifiers';
import { estateInfluence, estateLoyalty, estateName, grantPrivilege, invalidateRealm } from './politics';
import { provincesOf, realmNeighbours, warsOf } from './queries';
import { startRevolt } from './revolts';
import { chance, random } from './rng';
import { changeGovernment, eraOf, knowsId, researchPoints } from './tech';
import { ESTATES, type Country, type EstateId, type GameState, type PendingEvent, type Skill } from './types';
import { borderProvinces } from './war';
import type { SimWorld } from './world';
import { placeName } from './places';

type Check = { ok: true } | { ok: false; reason: string };
const yes: Check = { ok: true };
const no = (reason: string): Check => ({ ok: false, reason });

/** What an event is about, beyond the realm. */
export interface EventScope {
  province?: number;
  other?: number;
}

// ── Asking about a realm ──────────────────────────────────────────

/** What event conditions ask about a realm, worked out as they ask. */
class Context implements EventContext {
  state: GameState;
  c: Country;
  year: number;
  era: number;
  private world: SimWorld;
  private own: number[] | null = null;

  constructor(state: GameState, world: SimWorld, c: Country) {
    this.state = state;
    this.world = world;
    this.c = c;
    this.year = Math.floor(state.day / 365);
    this.era = eraOf(c);
  }

  /** The realm's own provinces that it controls. */
  private provinces(): number[] {
    const s = this.state;
    return (this.own ??= provincesOf(s, this.c.index).filter((id) => s.provinces[id].controller === this.c.index));
  }

  knows(tech: string) {
    return knowsId(this.c, tech);
  }
  atWar() {
    return warsOf(this.state, this.c.index).length > 0;
  }
  loyalty(e: EstateId) {
    return estateLoyalty(this.state, this.c, e).total;
  }
  power(e: EstateId) {
    return estateInfluence(this.state, this.c).share[e];
  }
  rulerAge() {
    const r = character(this.state, this.c.ruler);
    return r ? age(this.state, r) : 40;
  }
  rulerSkill(s: Skill) {
    return rulerSkill(this.state, this.c, s);
  }
  rulerIs(trait: string) {
    return !!character(this.state, this.c.ruler)?.traits.includes(trait);
  }
  faithFamily() {
    return faithFamily(this.c.religion);
  }
  cultureGroup() {
    return cultureGroup(this.c.culture);
  }
  hasModifier(id: string) {
    return hasModifier(this.c, id);
  }
  provincesOfFaith(faith: string) {
    let n = 0;
    for (const id of this.provinces()) if (this.state.provinces[id].religion === faith) n++;
    return n;
  }
  pickProvince(test?: (id: number) => boolean) {
    const s = this.state;
    const pool = test ? this.provinces().filter(test) : this.provinces();
    if (!pool.length) return 0;
    let total = 0;
    for (const id of pool) total += s.provinces[id].dev + 1;
    let r = random(s) * total;
    for (const id of pool) {
      r -= s.provinces[id].dev + 1;
      if (r <= 0) return id;
    }
    return pool[pool.length - 1];
  }
  pickNeighbour(test?: (index: number) => boolean) {
    const s = this.state;
    const pool = [...realmNeighbours(s, this.world, this.c.index)].filter(
      (i) => s.countries[i]?.alive && !s.countries[i].rebel && (!test || test(i)),
    );
    return pool.length ? pool[Math.floor(random(s) * pool.length)] : 0;
  }
  terrain(id: number) {
    return this.world.region(id).terrain ?? 'plains';
  }
  opinionOf(other: number) {
    return opinionOf(this.state, this.world, this.c.index, other);
  }
  heresiesHere() {
    const out = new Set<string>();
    for (const id of this.provinces()) {
      const r = this.state.provinces[id].religion;
      if (r && HERESIES[r]?.parent === this.c.religion) out.add(r);
    }
    return [...out];
  }
}

export function eventContext(state: GameState, world: SimWorld, c: Country): EventContext {
  return new Context(state, world, c);
}

// ── Texts ─────────────────────────────────────────────────────────

function capitalise(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** An event's title and story with the blanks filled in. */
export function eventText(
  state: GameState,
  e: Pick<PendingEvent, 'event' | 'country' | 'province' | 'other'>,
): { title: string; text: string } {
  const def = EVENT_BY_ID[e.event];
  const c = state.countries[e.country];
  if (!def || !c) return { title: '', text: '' };
  const plague = state.plague ? PLAGUE_BY_ID[state.plague.id]?.name : '';
  const vars: Record<string, string> = {
    realm: c.name,
    land: c.short,
    adj: c.adj,
    ruler: character(state, c.ruler)?.name ?? 'The ruler',
    capital: c.capital ? placeName(state, c.capital) : c.name,
    province: e.province ? placeName(state, e.province) : c.capital ? placeName(state, c.capital) : '',
    other: state.countries[e.other]?.name ?? 'A neighbour',
    faith: faithName(c.religion),
    plague: plague || 'the pestilence',
  };
  // A blank that opens a sentence opens with a capital ("The Black Death has reached …").
  const fill = (s: string) =>
    s.replace(/\{(\w+)\}/g, (_m, key: string, at: number) => {
      const v = vars[key] ?? '';
      return /(^|[.!?]\s+)$/.test(s.slice(0, at)) ? capitalise(v) : v;
    });
  return { title: fill(def.title), text: fill(def.text) };
}

// ── Effects ───────────────────────────────────────────────────────

/** Gold of a month for costs and gains, never less than a token sum. */
function monthGold(state: GameState, c: Country): number {
  return Math.max(5, income(state, c).total);
}

/** Gold an option costs (positive) or brings (negative), rounded. */
export function goldOf(state: GameState, c: Country, effects: EventEffects): number {
  let g = effects.gold ? Math.round(effects.gold * monthGold(state, c)) : 0;
  if (effects.run === 'embrace_reform') g += Math.round(6 * monthGold(state, c));
  if (effects.run === 'anglican') g += Math.round(8 * monthGold(state, c));
  return g;
}

export const SPECIAL_TEXT: Record<SpecialId, string> = {
  embrace_reform:
    'The realm takes up the reformed faith and seizes the church’s lands; the clergy are furious (−25) and stability falls by 1',
  anglican: 'The crown heads its own church and dissolves the monasteries; the clergy −20, legitimacy +5',
  constitution: 'Becomes a constitutional monarchy: legitimacy −10, the burghers +20 and the commons +10',
  republic: 'The monarchy falls: a republic, which elects its first leader at once',
  revolt_commons: 'Repression, stability −1, and the commons may rise in revolt',
  burn_heretics: 'The province returns to the faith',
  scholar: 'A learned scholar joins the court',
  general: 'A gifted officer joins the court',
  loan: 'The treasury borrows',
  privilege_nobles: 'The nobility gain privileges (taxes −5%); legitimacy +10',
};

export interface EffectLine {
  text: string;
  good: boolean;
}

const signed = (v: number) => `${v > 0 ? '+' : '−'}${Math.abs(Math.round(v))}`;

/** What an option would do, line by line, for the player to read before choosing. */
export function effectLines(state: GameState, c: Country, effects: EventEffects, scope: EventScope): EffectLine[] {
  const out: EffectLine[] = [];
  const gold = goldOf(state, c, effects);
  if (gold) out.push({ text: `${signed(gold)} gold`, good: gold > 0 });
  if (effects.stability) out.push({ text: `Stability ${signed(effects.stability)}`, good: effects.stability > 0 });
  if (effects.legitimacy) out.push({ text: `Legitimacy ${signed(effects.legitimacy)}`, good: effects.legitimacy > 0 });
  if (effects.warExhaustion)
    out.push({ text: `War weariness ${signed(effects.warExhaustion)}`, good: effects.warExhaustion < 0 });
  if (effects.manpower) {
    const men = effects.manpower * maxManpower(state, c).total;
    out.push({ text: `${signed(men)} levies`, good: men > 0 });
  }
  if (effects.dev && scope.province)
    out.push({
      text: `Development of ${placeName(state, scope.province)} ${signed(effects.dev)}`,
      good: effects.dev > 0,
    });
  for (const e of ESTATES) {
    const v = effects.mood?.[e];
    if (v) out.push({ text: `${estateName(c, e)} ${signed(v)}`, good: v > 0 });
  }
  if (effects.modifier) {
    const def = MODIFIERS[effects.modifier];
    const years = effects.years ?? def.years;
    const parts = (Object.entries(def.effects) as [ModifierEffectKey, number][]).map(([k, v]) => MODIFIER_TEXT[k](v));
    out.push({
      text: `${def.name} for ${years} year${years === 1 ? '' : 's'}: ${parts.join(', ')}`,
      good: !def.bad,
    });
  }
  if (effects.remove) out.push({ text: `Ends ${MODIFIERS[effects.remove]?.name ?? effects.remove}`, good: true });
  if (effects.research) out.push({ text: `${effects.research} months of research in every field`, good: true });
  if (effects.death) out.push({ text: `${Math.round(effects.death * 100)}% chance that the ruler dies`, good: false });
  if (effects.opinion && scope.other) {
    const o = state.countries[scope.other];
    out.push({ text: `${o?.name ?? 'They'}: opinion of us ${signed(effects.opinion)}`, good: effects.opinion > 0 });
  }
  if (effects.claim && scope.other)
    out.push({ text: `A claim on land of ${state.countries[scope.other]?.name}`, good: true });
  if (effects.run) out.push({ text: SPECIAL_TEXT[effects.run], good: effects.run !== 'revolt_commons' });
  return out;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function moodChange(c: Country, e: EstateId, v: number) {
  c.estates[e].mood = clamp(c.estates[e].mood + v, -60, 60);
}

/** Does what an option says. */
export function applyEffects(state: GameState, world: SimWorld, c: Country, effects: EventEffects, scope: EventScope) {
  if (effects.gold) c.gold += Math.round(effects.gold * monthGold(state, c));
  if (effects.stability) c.stability = clamp(c.stability + effects.stability, -3, 3);
  if (effects.legitimacy) c.legitimacy = clamp(c.legitimacy + effects.legitimacy, 0, 100);
  if (effects.warExhaustion) c.warExhaustion = clamp(c.warExhaustion + effects.warExhaustion, 0, 20);
  if (effects.manpower) c.manpower = Math.max(0, c.manpower + effects.manpower * maxManpower(state, c).total);
  if (effects.dev && scope.province) {
    const p = state.provinces[scope.province];
    p.dev = clamp(p.dev + effects.dev, 1, MAX_DEV);
    state.mapVersion++;
  }
  if (effects.mood) for (const e of ESTATES) if (effects.mood[e]) moodChange(c, e, effects.mood[e]!);
  if (effects.modifier) addModifier(state, c, effects.modifier, effects.years);
  if (effects.remove) removeModifier(state, c, effects.remove);
  if (effects.research)
    for (const t of TECH_TRACKS) c.research[t] += effects.research * researchPoints(state, c, t).total;
  if (effects.opinion && scope.other)
    remember(state, scope.other, c.index, effects.opinion > 0 ? 'gift' : 'insulted', effects.opinion);
  if (effects.claim && scope.other) {
    const land = borderProvinces(state, world, c.index, scope.other).filter((id) => !c.claims.includes(id));
    if (land.length) c.claims.push(land.reduce((a, b) => (state.provinces[b].dev > state.provinces[a].dev ? b : a)));
  }
  if (effects.run) special(state, world, c, effects.run, scope);
  if (effects.mood || effects.stability || effects.legitimacy) invalidateRealm(state, c.index);
  // Last, as it may end the reign.
  if (effects.death && chance(state, effects.death)) {
    const r = character(state, c.ruler);
    if (r) die(state, world, r);
  }
}

function special(state: GameState, world: SimWorld, c: Country, id: SpecialId, scope: EventScope) {
  switch (id) {
    case 'embrace_reform': {
      const own = provincesOf(state, c.index);
      const count = (f: string) => own.filter((p) => state.provinces[p].religion === f).length;
      const faith = count('reformed') > count('protestant') ? 'reformed' : 'protestant';
      c.gold += Math.round(6 * monthGold(state, c));
      turnFaith(state, c, faith);
      moodChange(c, 'clergy', -25);
      c.stability = Math.max(-3, c.stability - 1);
      addModifier(state, c, 'reformed_zeal');
      return;
    }
    case 'anglican': {
      c.gold += Math.round(8 * monthGold(state, c));
      turnFaith(state, c, 'anglican');
      // Half the parishes follow the crown at once.
      for (const id of provincesOf(state, c.index))
        if (state.provinces[id].religion === 'catholic' && chance(state, 0.5))
          state.provinces[id].religion = 'anglican';
      moodChange(c, 'clergy', -20);
      c.legitimacy = Math.min(100, c.legitimacy + 5);
      return;
    }
    case 'constitution':
      changeGovernment(state, c, 'constitutional', { legitimacy: 10, stability: 0 });
      moodChange(c, 'burghers', 20);
      moodChange(c, 'commons', 10);
      return;
    case 'republic': {
      const gov = knowsId(c, 'popular_sovereignty') ? 'democracy' : 'republic';
      changeGovernment(state, c, gov, { legitimacy: 0, stability: 1 });
      // The first election is held next month.
      c.termEnds = state.day;
      moodChange(c, 'commons', 20);
      moodChange(c, 'nobles', -30);
      return;
    }
    case 'revolt_commons':
      addModifier(state, c, 'repression');
      c.stability = Math.max(-3, c.stability - 1);
      moodChange(c, 'commons', -20);
      invalidateRealm(state, c.index);
      if (chance(state, 0.5)) startRevolt(state, world, c, 'commons');
      return;
    case 'burn_heretics':
      if (scope.province) {
        state.provinces[scope.province].religion = c.religion;
        state.mapVersion++;
      }
      return;
    case 'scholar': {
      const s = makeCharacter(state, world, c, { talent: 3 });
      s.skills.lrn = Math.max(s.skills.lrn, 14);
      s.skills.stw = Math.max(s.skills.stw, 9);
      c.courtiers.push(s.id);
      return;
    }
    case 'general': {
      const g = makeCharacter(state, world, c, { talent: 3, age: 28 });
      g.skills.mar = Math.max(g.skills.mar, 15);
      c.courtiers.push(g.id);
      return;
    }
    case 'loan':
      takeLoan(state, c);
      return;
    case 'privilege_nobles':
      grantPrivilege(state, c, 'nobles');
      c.legitimacy = Math.min(100, c.legitimacy + 10);
      return;
  }
}

// ── Choosing ──────────────────────────────────────────────────────

/** Options open to the realm, by index into the event's options. */
export function openOptions(ctx: EventContext, def: EventDef): number[] {
  return def.options.map((o, i) => (!o.when || o.when(ctx) ? i : -1)).filter((i) => i >= 0);
}

export function canChoose(state: GameState, world: SimWorld, e: PendingEvent, index: number): Check {
  const def = EVENT_BY_ID[e.event];
  const c = state.countries[e.country];
  const o = def?.options[index];
  if (!def || !c || !o) return no('No such choice');
  if (o.when && !o.when(eventContext(state, world, c))) return no('Not open to you');
  const gold = goldOf(state, c, o.effects);
  if (gold < 0 && c.gold < -gold) return no(`It needs ${-gold} gold`);
  return yes;
}

function aiWeight(ctx: EventContext, o: EventOption): number {
  const w = typeof o.ai === 'function' ? o.ai(ctx) : (o.ai ?? 1);
  return Math.max(0, w);
}

/** The AI's choice: by the options' weights, among those it can afford. */
function aiChoose(state: GameState, world: SimWorld, c: Country, def: EventDef): number {
  const ctx = eventContext(state, world, c);
  const open = openOptions(ctx, def);
  const weights = open.map((i) => {
    const gold = goldOf(state, c, def.options[i].effects);
    return gold < 0 && c.gold < -gold ? 0 : aiWeight(ctx, def.options[i]);
  });
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) {
    // Nothing affordable pleases it: the cheapest will do.
    let best = open[0];
    for (const i of open)
      if (goldOf(state, c, def.options[i].effects) > goldOf(state, c, def.options[best].effects)) best = i;
    return best;
  }
  let r = random(state) * total;
  for (let k = 0; k < open.length; k++) {
    r -= weights[k];
    if (r <= 0) return open[k];
  }
  return open[open.length - 1];
}

// ── Happening ─────────────────────────────────────────────────────

function onCooldown(state: GameState, c: Country, def: EventDef): boolean {
  const last = c.history[def.id];
  if (last === undefined) return false;
  if (def.once) return true;
  const years = def.cooldown ?? 20;
  return years > 0 && state.day - last < years * 365;
}

/**
 * An event happens to a realm, if its conditions hold: the AI chooses at once, the player is asked.
 * Returns whether it happened.
 */
export function fireEvent(state: GameState, world: SimWorld, c: Country, id: string, scope: EventScope = {}): boolean {
  const def = EVENT_BY_ID[id];
  if (!def || !c?.alive || c.rebel || onCooldown(state, c, def)) return false;
  const ctx = eventContext(state, world, c);
  if (!def.when(ctx)) return false;
  const province = scope.province ?? (def.province ? def.province(ctx) : 0);
  const other = scope.other ?? (def.other ? def.other(ctx) : 0);
  if ((def.province && !province) || (def.other && !other)) return false;
  c.history[def.id] = state.day;
  if (c.index === state.player) {
    state.events.push({ id: state.nextId++, event: id, country: c.index, province, other, day: state.day });
    return true;
  }
  const choice = aiChoose(state, world, c, def);
  applyEffects(state, world, c, def.options[choice].effects, { province, other });
  return true;
}

const PERIODIC = EVENTS.filter((e) => e.mtth > 0);
const WEIGHTS = PERIODIC.map((e) => 1 / e.mtth);
const WEIGHT_SUM = WEIGHTS.reduce((s, w) => s + w, 0);
/** The monthly chance that a realm meets some event, before its conditions are asked. */
const MONTHLY_RATE = WEIGHT_SUM / 12;

/**
 * Each month, each realm may meet an event: one draw decides whether it does, a second which one,
 * so an event with a mean time of N years comes about once in N years to a realm that qualifies.
 */
export function monthlyEvents(state: GameState, world: SimWorld) {
  // Events for a realm the player no longer rules are dropped.
  if (state.events.length) state.events = state.events.filter((e) => e.country === state.player);
  for (const c of state.countries) {
    if (!c?.alive || c.rebel) continue;
    if (random(state) >= MONTHLY_RATE) continue;
    let r = random(state) * WEIGHT_SUM;
    let k = 0;
    while (k < PERIODIC.length - 1 && r >= WEIGHTS[k]) r -= WEIGHTS[k++];
    fireEvent(state, world, c, PERIODIC[k].id);
  }
}

/** The player's answer to an event. */
export function answerEvent(state: GameState, world: SimWorld, eventId: number, index: number): Check {
  const e = state.events.find((x) => x.id === eventId);
  if (!e) return no('No such event');
  const check = canChoose(state, world, e, index);
  if (!check.ok) return check;
  state.events = state.events.filter((x) => x !== e);
  const c = state.countries[e.country];
  const def = EVENT_BY_ID[e.event];
  applyEffects(state, world, c, def.options[index].effects, { province: e.province, other: e.other });
  return yes;
}

/** The pending event of the player that should be shown first. */
export function playerEvent(state: GameState): PendingEvent | undefined {
  return state.events.find((e) => e.country === state.player);
}
