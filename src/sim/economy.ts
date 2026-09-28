/**
 * Taxes, levies, upkeep, loans, development and buildings. Every figure the UI shows comes with a
 * breakdown of where it comes from.
 */
import {
  BUILDING_ORDER,
  BUILDINGS,
  buildingCost,
  buildingDays,
  MAX_LEVEL,
  type BuildingEffects,
} from '../data/buildings';
import {
  CONSCRIPTION_LEVY,
  CONSCRIPTION_TAX,
  CROWN_TRIBUTE,
  ESTATE_INFO,
  GOVERNMENT_INFO,
  TAXATION_TAX,
} from '../data/politics';
import { unitDef } from '../data/units';
import { rulerSkill } from './characters';
import { provinceMultiplier } from './faith';
import { buildingTech, eraOf, maxBuildingLevel, militaryEra, techEffect } from './tech';
import { log } from './log';
import { modifierEffect, modifierParts } from './modifiers';
import { BLOCKADE_TAX, blockades, navyUpkeep } from './naval';
import { estateEffect, taskSkill } from './politics';
import { armiesOf, atWar, menIn, provincesOf, tributariesOf, vassalsOf } from './queries';
import { chance } from './rng';
import type { BuildingType, Country, GameState, ProvinceState, ShipType, UnitType } from './types';
import type { SimWorld } from './world';
import { placeName } from './places';

export interface Part {
  label: string;
  value: number;
}

export interface Breakdown {
  total: number;
  parts: Part[];
}

function breakdown(parts: Part[]): Breakdown {
  return { total: parts.reduce((s, p) => s + p.value, 0), parts: parts.filter((p) => Math.abs(p.value) > 1e-9) };
}

/** Gold per development point per month. */
export const TAX_PER_DEV = 0.25;
/** Levy men per development point. */
export const LEVY_PER_DEV = 110;
export const MAX_DEV = 80;

/**
 * How far a province can grow: its natural size (the development it had in 1066), raised by its
 * owner's economic technology, from a sixth more in the middle ages to about two and a half times.
 */
export function devCap(world: SimWorld, c: Country, id: number): number {
  const base = world.region(id).dev ?? 1;
  return Math.min(MAX_DEV, Math.round(base * (1 + 0.05 * c.tech.economy)) + 1);
}

/** Each effect per level of each building type, in BUILDING_ORDER: summed over every province each month. */
const PER_LEVEL = Object.fromEntries(
  (['tax', 'levy', 'fort', 'growth', 'supply', 'research'] as const).map((k) => [
    k,
    BUILDING_ORDER.map((t) => BUILDINGS[t].effects[k] ?? 0),
  ]),
) as Record<keyof BuildingEffects, number[]>;

export function buildingEffect(p: ProvinceState, key: keyof BuildingEffects): number {
  const per = PER_LEVEL[key];
  let v = 0;
  for (let i = 0; i < BUILDING_ORDER.length; i++) {
    const level = p.buildings[BUILDING_ORDER[i]];
    if (level) v += per[i] * level;
  }
  return v;
}

// ── Multipliers ───────────────────────────────────────────────────

export function taxMultiplier(state: GameState, c: Country): Breakdown {
  const gov = GOVERNMENT_INFO[c.gov];
  const parts: Part[] = [
    { label: 'Base', value: 1 },
    { label: 'Taxation law', value: TAXATION_TAX[c.laws.taxation] - 1 },
    { label: 'Conscription law', value: CONSCRIPTION_TAX[c.laws.conscription] },
    { label: gov.name, value: gov.tax },
    { label: 'Ruler’s stewardship', value: rulerSkill(state, c, 'stw') * 0.01 },
    { label: 'Steward', value: taskSkill(state, c, 'steward', 'taxes') * 0.015 },
    { label: 'The burghers', value: estateEffect(state, c, 'burghers') * 0.1 },
    { label: 'Stability', value: c.stability * 0.05 },
    { label: 'War weariness', value: -c.warExhaustion * 0.01 },
    { label: 'Technology', value: techEffect(c, 'tax') },
    ...modifierParts(c, 'tax'),
  ];
  for (const e of ['nobles', 'clergy', 'burghers'] as const)
    if (c.estates[e].privileged) parts.push({ label: ESTATE_INFO[e].privilege, value: -0.05 });
  return breakdown(parts);
}

export function levyMultiplier(state: GameState, c: Country): Breakdown {
  const gov = GOVERNMENT_INFO[c.gov];
  const parts: Part[] = [
    { label: 'Base', value: 1 },
    { label: 'Conscription law', value: CONSCRIPTION_LEVY[c.laws.conscription] - 1 },
    { label: gov.name, value: gov.levy },
    { label: 'Ruler’s martial skill', value: rulerSkill(state, c, 'mar') * 0.01 },
    { label: 'Marshal', value: taskSkill(state, c, 'marshal', 'levies') * 0.015 },
    { label: 'The nobility', value: estateEffect(state, c, 'nobles') * 0.1 },
    { label: 'Stability', value: c.stability * 0.03 },
    { label: 'Technology', value: techEffect(c, 'levy') },
    ...modifierParts(c, 'levy'),
  ];
  if (c.estates.commons.privileged) parts.push({ label: ESTATE_INFO.commons.privilege, value: -0.1 });
  return breakdown(parts);
}

/** Base monthly tax of a province before the realm's multiplier. */
export function provinceTax(p: ProvinceState): number {
  return p.dev * TAX_PER_DEV * (1 + buildingEffect(p, 'tax'));
}

export function provinceLevy(p: ProvinceState): number {
  return p.dev * LEVY_PER_DEV * (1 + buildingEffect(p, 'levy'));
}

export function fortLevel(state: GameState, id: number): number {
  const p = state.provinces[id];
  if (!p) return 0;
  const capital = state.countries[p.owner]?.capital === id ? 1 : 0;
  return capital + buildingEffect(p, 'fort');
}

// ── Income and expenses ───────────────────────────────────────────

/** Share of a tributary's taxes paid to its overlord (a vassal's share depends on crown authority). */
export const TRIBUTARY_TRIBUTE = 0.15;
/** Share of its taxes a beaten realm pays each month to a realm it owes reparations. */
export const REPARATIONS = 0.2;

/**
 * What a realm's own provinces yield before its multipliers: taxes and levies in full, what is paid
 * once other faiths and peoples have held back their share, and the taxes lost to enemy blockades.
 */
interface Yield {
  tax: number;
  taxPaid: number;
  taxLost: number;
  levy: number;
  levyPaid: number;
}

function yieldOf(state: GameState, c: Country): Yield {
  const y: Yield = { tax: 0, taxPaid: 0, taxLost: 0, levy: 0, levyPaid: 0 };
  const blocked = blockades(state);
  const taxPer = PER_LEVEL.tax,
    levyPer = PER_LEVEL.levy;
  for (const id of provincesOf(state, c.index)) {
    const p = state.provinces[id];
    if (p.controller !== c.index) continue;
    const m = provinceMultiplier(c, p);
    // provinceTax and provinceLevy, with one pass over the buildings for both
    let bTax = 0,
      bLevy = 0;
    for (let i = 0; i < BUILDING_ORDER.length; i++) {
      const level = p.buildings[BUILDING_ORDER[i]];
      if (level) {
        bTax += taxPer[i] * level;
        bLevy += levyPer[i] * level;
      }
    }
    const t = p.dev * TAX_PER_DEV * (1 + bTax);
    const due = t * m;
    y.tax += t;
    y.taxPaid += due;
    if (blocked.has(id)) y.taxLost += due * BLOCKADE_TAX;
    const l = p.dev * LEVY_PER_DEV * (1 + bLevy);
    y.levy += l;
    y.levyPaid += l * m;
  }
  return y;
}

interface Taxes {
  taxes: number;
  withheld: number;
  blockaded: number;
}

/** Taxes of the realm's own provinces: what they pay, and what other faiths and peoples withhold. */
function taxesOf(state: GameState, c: Country, y: Yield): Taxes {
  const mult = Math.max(0.3, taxMultiplier(state, c).total);
  return { taxes: (y.taxPaid - y.taxLost) * mult, withheld: (y.tax - y.taxPaid) * mult, blockaded: y.taxLost * mult };
}

/**
 * What a realm's accounts need to know of the others: yields, taxes and who owes tribute. Worked out
 * afresh for one realm's figures, or once for the whole month's accounts (`monthlyEconomy`).
 */
interface Accounts {
  yields(c: Country): Yield;
  taxes(c: Country): Taxes;
  vassals(index: number): Country[];
  tributaries(index: number): Country[];
  /** realms that owe this one reparations */
  debtors(index: number): Country[];
}

function freshAccounts(state: GameState): Accounts {
  return {
    yields: (c) => yieldOf(state, c),
    taxes: (c) => taxesOf(state, c, yieldOf(state, c)),
    vassals: (index) => vassalsOf(state, index),
    tributaries: (index) => tributariesOf(state, index),
    debtors: (index) => state.countries.filter((c) => c?.alive && c.reparations.some((r) => r.to === index)),
  };
}

/** Share of a realm's taxes it pays to a realm it owes reparations, unless the two are at war again. */
function reparationsTo(state: GameState, payer: Country, to: number): number {
  return payer.reparations.some((r) => r.to === to && r.until > state.day) && !atWar(state, payer.index, to)
    ? REPARATIONS
    : 0;
}

export function income(state: GameState, c: Country, accounts: Accounts = freshAccounts(state)): Breakdown {
  const { taxes, withheld, blockaded } = accounts.taxes(c);
  let fromVassals = 0,
    fromTributaries = 0,
    fromDebtors = 0,
    toCreditors = 0;
  for (const v of accounts.vassals(c.index))
    if (!atWar(state, v.index, c.index)) fromVassals += accounts.taxes(v).taxes * CROWN_TRIBUTE[c.laws.crown];
  for (const t of accounts.tributaries(c.index))
    if (!atWar(state, t.index, c.index)) fromTributaries += accounts.taxes(t).taxes * TRIBUTARY_TRIBUTE;
  for (const d of accounts.debtors(c.index)) fromDebtors += accounts.taxes(d).taxes * reparationsTo(state, d, c.index);
  for (const r of c.reparations) toCreditors += taxes * reparationsTo(state, c, r.to);
  const paysLiege = c.liege && !atWar(state, c.index, c.liege);
  const paysOverlord = c.overlord && !atWar(state, c.index, c.overlord);
  return breakdown([
    { label: `Taxes from ${provincesOf(state, c.index).length} provinces`, value: taxes + withheld + blockaded },
    { label: 'Withheld by other faiths and peoples', value: -withheld },
    { label: 'Lost to enemy blockades', value: -blockaded },
    { label: 'Tribute from vassals', value: fromVassals },
    { label: 'Tribute from tributaries', value: fromTributaries },
    { label: 'Reparations owed to us', value: fromDebtors },
    {
      label: 'Tribute to your liege',
      value: paysLiege ? -taxes * CROWN_TRIBUTE[state.countries[c.liege].laws.crown] : 0,
    },
    { label: 'Tribute to your overlord', value: paysOverlord ? -taxes * TRIBUTARY_TRIBUTE : 0 },
    { label: 'Reparations we pay', value: -toCreditors },
  ]);
}

/** Years of income a treasury may hold before the gold beyond starts to go to waste. */
export const IDLE_YEARS = 3;
/** Share of the gold beyond that lost each month to idle courtiers and embezzlement. */
export const IDLE_WASTE = 0.02;

/** Gold a treasury far richer than the realm needs loses each month. */
export function idleWaste(c: Country, monthlyIncome: number): number {
  const keep = IDLE_YEARS * 12 * Math.max(10, monthlyIncome);
  return c.gold > keep ? (c.gold - keep) * IDLE_WASTE : 0;
}

export function expenses(state: GameState, c: Country, monthlyIncome = income(state, c).total): Breakdown {
  const era = militaryEra(c);
  const pay = 1 - techEffect(c, 'upkeep');
  let field = 0,
    levies = 0;
  for (const a of armiesOf(state, c.index))
    for (const [t, men] of Object.entries(a.units) as [UnitType, number][]) {
      if (t === 'levy') levies += (men / 100) * unitDef('levy', era).upkeep;
      else field += (men / 100) * unitDef(t, era).upkeep * pay;
    }
  let reserve = 0;
  for (const [t, men] of Object.entries(c.reserve) as [UnitType, number][])
    reserve += (men / 100) * unitDef(t, era).reserveUpkeep * pay;
  const interest = c.loans.reduce((s, l) => s + l.interest, 0);
  const navy = navyUpkeep(state, c);
  return breakdown([
    { label: 'Men-at-arms in the field', value: field },
    { label: 'Men-at-arms at home', value: reserve },
    { label: 'Raised levies', value: levies },
    { label: 'Warships', value: navy.fleets },
    { label: 'Transports', value: navy.transports },
    { label: 'Interest on loans', value: interest },
    { label: 'Waste of an idle treasury', value: idleWaste(c, monthlyIncome) },
  ]);
}

export function monthlyBalance(state: GameState, c: Country): number {
  const inc = income(state, c).total;
  return inc - expenses(state, c, inc).total;
}

export function maxManpower(state: GameState, c: Country, y: Yield = yieldOf(state, c)): Breakdown {
  const full = y.levy,
    base = y.levyPaid;
  const mult = levyMultiplier(state, c);
  return breakdown([
    { label: 'Levies of your provinces', value: full },
    { label: 'Other faiths and peoples serve less', value: base - full },
    ...mult.parts.filter((p) => p.label !== 'Base').map((p) => ({ label: p.label, value: base * p.value })),
  ]);
}

// ── Loans ─────────────────────────────────────────────────────────

export const MAX_LOANS = 5;

export function loanSize(state: GameState, c: Country): number {
  return Math.max(50, Math.round((income(state, c).total * 8) / 10) * 10);
}

export function takeLoan(state: GameState, c: Country): boolean {
  if (c.loans.length >= MAX_LOANS) return false;
  const amount = loanSize(state, c);
  const rate = 0.12 * Math.max(0.3, 1 - techEffect(c, 'interest'));
  c.loans.push({ amount, interest: Math.round(((amount * rate) / 12) * 100) / 100 });
  c.gold += amount;
  return true;
}

export function repayLoan(c: Country, i: number): boolean {
  const loan = c.loans[i];
  if (!loan || c.gold < loan.amount) return false;
  c.gold -= loan.amount;
  c.loans.splice(i, 1);
  return true;
}

// ── Buildings ─────────────────────────────────────────────────────

export type BuildCheck = { ok: true; cost: number; days: number; level: number } | { ok: false; reason: string };

export function canBuild(
  state: GameState,
  world: SimWorld,
  country: number,
  id: number,
  type: BuildingType,
): BuildCheck {
  const p = state.provinces[id];
  const r = world.region(id);
  const c = state.countries[country];
  if (!p || !c || r.kind !== 'land') return { ok: false, reason: 'Not a province' };
  if (p.owner !== country) return { ok: false, reason: 'Not your province' };
  if (p.controller !== country) return { ok: false, reason: 'The province is occupied' };
  const level = (p.buildings[type] ?? 0) + 1;
  if (level > MAX_LEVEL) return { ok: false, reason: 'Fully built' };
  if (level > maxBuildingLevel(c, type)) {
    const t = buildingTech(type, level);
    return { ok: false, reason: t ? `Needs ${t.name}` : 'Not yet known' };
  }
  const def = BUILDINGS[type];
  if (def.coastal && !r.coastal) return { ok: false, reason: 'Needs a coast' };
  if (def.minDev && p.dev < def.minDev) return { ok: false, reason: `Needs development ${def.minDev}` };
  if (p.construction) return { ok: false, reason: 'Already building' };
  const cost = buildingCost(type, level);
  if (c.gold < cost) return { ok: false, reason: `Needs ${cost} gold` };
  return { ok: true, cost, days: buildingDays(type, level), level };
}

export function startBuilding(state: GameState, world: SimWorld, country: number, id: number, type: BuildingType) {
  const check = canBuild(state, world, country, id, type);
  if (!check.ok) return check;
  state.countries[country].gold -= check.cost;
  state.provinces[id].construction = { type, level: check.level, start: state.day, done: state.day + check.days };
  return check;
}

export function dailyConstruction(state: GameState) {
  state.provinces.forEach((p, id) => {
    if (!p?.construction || p.construction.done > state.day) return;
    const { type, level } = p.construction;
    p.buildings[type] = level;
    p.construction = undefined;
    log(state, [p.owner], 'building', `${BUILDINGS[type].levels[level - 1]} completed in ${placeName(state, id)}.`, {
      province: id,
    });
  });
}

// ── Development ───────────────────────────────────────────────────

/**
 * Gold to raise a province's development by a point: clearing land, draining marshes, founding
 * towns. Dearer the more developed it already is, and in later ages, when everything costs more.
 */
export function developCost(c: Country, p: ProvinceState): number {
  return Math.round(20 * (1 + p.dev / 4) * (1 + 0.5 * eraOf(c)));
}

export function canDevelop(
  state: GameState,
  world: SimWorld,
  country: number,
  id: number,
): { ok: true; cost: number } | { ok: false; reason: string } {
  const p = state.provinces[id];
  const c = state.countries[country];
  if (!p || !c || world.region(id).kind !== 'land') return { ok: false, reason: 'Not a province' };
  if (p.owner !== country) return { ok: false, reason: 'Not your province' };
  if (p.controller !== country) return { ok: false, reason: 'The province is occupied' };
  if (p.plague !== undefined) return { ok: false, reason: 'Not while pestilence rages there' };
  if (p.dev >= devCap(world, c, id)) return { ok: false, reason: 'It is as developed as the land and the age allow' };
  const cost = developCost(c, p);
  if (c.gold < cost) return { ok: false, reason: `Needs ${cost} gold` };
  return { ok: true, cost };
}

/** Invests in a province: a point of development, at once. */
export function develop(state: GameState, world: SimWorld, country: number, id: number) {
  const check = canDevelop(state, world, country, id);
  if (!check.ok) return check;
  state.countries[country].gold -= check.cost;
  state.provinces[id].dev++;
  state.mapVersion++;
  return check;
}

// ── The monthly tick ──────────────────────────────────────────────

/** Months of accounts the player's realm keeps. */
export const BOOK_MONTHS = 240;

/** Writes the month's accounts into the player's books. */
function keepBooks(state: GameState, c: Country, income: number, expenses: number) {
  const books = (c.books ??= []);
  books.push([
    state.day,
    Math.round(income * 10) / 10,
    Math.round(expenses * 10) / 10,
    Math.round(c.gold),
    Math.round(c.manpower),
  ]);
  if (books.length > BOOK_MONTHS) books.splice(0, books.length - BOOK_MONTHS);
}

export function monthlyEconomy(state: GameState) {
  // Each realm's provinces and taxes are counted once, for its own accounts and its lord's tribute
  // alike, and who owes tribute to whom is found once: nothing in the month's accounts changes it.
  const yields: Yield[] = [];
  const taxes: (Taxes | undefined)[] = [];
  const vassals = new Map<number, Country[]>();
  const tributaries = new Map<number, Country[]>();
  const debtors = new Map<number, Country[]>();
  const add = (subjects: Map<number, Country[]>, lord: number, c: Country) => {
    const list = subjects.get(lord);
    if (list) list.push(c);
    else subjects.set(lord, [c]);
  };
  for (const c of state.countries) {
    if (!c?.alive) continue;
    if (c.liege) add(vassals, c.liege, c);
    if (c.overlord) add(tributaries, c.overlord, c);
    for (const r of c.reparations) add(debtors, r.to, c);
  }
  const accounts: Accounts = {
    yields: (c) => (yields[c.index] ??= yieldOf(state, c)),
    taxes: (c) => (taxes[c.index] ??= taxesOf(state, c, accounts.yields(c))),
    vassals: (index) => vassals.get(index) ?? [],
    tributaries: (index) => tributaries.get(index) ?? [],
    debtors: (index) => debtors.get(index) ?? [],
  };
  for (const c of state.countries) {
    if (!c?.alive) continue;
    const inc = income(state, c, accounts).total;
    const balance = inc - expenses(state, c, inc).total;
    c.gold += balance;
    c.lastBalance = balance;
    if (c.index === state.player) keepBooks(state, c, inc, inc - balance);
    const max = maxManpower(state, c, accounts.yields(c)).total;
    // Levies recover a tenth of the full pool a month, faster when the commons are content.
    const recovery = 0.1 * (1 + 0.2 * estateEffect(state, c, 'commons'));
    if (c.manpower < max) c.manpower = Math.min(max, c.manpower + max * recovery);
    else c.manpower = Math.max(max, c.manpower - max * 0.05);
    if (c.gold < 0) {
      handleDebt(state, c);
      // Bankruptcy costs stability, and so taxes: its lord's tribute is counted anew.
      taxes[c.index] = undefined;
    }
  }
}

/**
 * Development grows slowly towards what the land and the age allow, faster with farms and workshops
 * and a stable realm.
 */
export function monthlyGrowth(state: GameState, world: SimWorld) {
  const growth: number[] = [];
  const growthOf = (c: Country) =>
    (growth[c.index] ??=
      0.0025 *
      (c.stability >= 0 ? 1 : 0.5) *
      (1 + taskSkill(state, c, 'steward', 'develop') * 0.05) *
      (1 + 0.1 * estateEffect(state, c, 'commons')) *
      (1 + techEffect(c, 'growth')) *
      Math.max(0, 1 + modifierEffect(c, 'growth')));
  state.provinces.forEach((p, id) => {
    if (!p?.owner) return;
    const c = state.countries[p.owner];
    const cap = devCap(world, c, id);
    if (p.dev >= cap) return;
    const rate = growthOf(c) * (1 - p.dev / cap) * (1 + buildingEffect(p, 'growth'));
    if (p.controller === p.owner && chance(state, rate)) {
      p.dev++;
      log(state, [p.owner], 'economy', `${placeName(state, id)} has grown to development ${p.dev}.`, { province: id });
    }
  });
}

/** An empty treasury: borrow, and when no one will lend, go bankrupt. */
function handleDebt(state: GameState, c: Country) {
  if (takeLoan(state, c)) {
    log(
      state,
      [c.index],
      'economy',
      `The treasury ran dry. ${c.name} borrowed ${c.loans[c.loans.length - 1].amount} gold.`,
      {
        important: true,
      },
    );
    return;
  }
  c.loans = [];
  c.gold = 0;
  c.stability = Math.max(-3, c.stability - 2);
  // Unpaid soldiers go home.
  for (const k of Object.keys(c.reserve) as UnitType[]) c.reserve[k] = Math.floor((c.reserve[k] ?? 0) / 2);
  for (const a of armiesOf(state, c.index))
    for (const k of Object.keys(a.units) as UnitType[])
      if (k !== 'levy') a.units[k] = Math.floor((a.units[k] ?? 0) / 2);
  // Unpaid crews too.
  for (const f of state.fleets)
    if (f.owner === c.index)
      for (const k of Object.keys(f.ships) as ShipType[]) f.ships[k] = Math.floor((f.ships[k] ?? 0) / 2);
  c.transports = Math.floor(c.transports / 2);
  log(state, [c.index], 'economy', `${c.name} is bankrupt. Its debts are repudiated and half its soldiers desert.`, {
    important: true,
  });
}

export function reserveMen(c: Country): number {
  return menIn(c.reserve);
}
