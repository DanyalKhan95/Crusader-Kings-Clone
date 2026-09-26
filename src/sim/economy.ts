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
import { UNITS } from '../data/units';
import { rulerSkill, seatSkill } from './characters';
import { log } from './log';
import { armiesOf, menIn, provincesOf, vassalsOf } from './queries';
import { chance } from './rng';
import type { BuildingType, Country, GameState, ProvinceState, UnitType } from './types';
import type { SimWorld } from './world';

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
export const MAX_DEV = 40;

export function buildingEffect(p: ProvinceState, key: keyof BuildingEffects): number {
  let v = 0;
  for (const t of BUILDING_ORDER) {
    const level = p.buildings[t] ?? 0;
    if (level) v += (BUILDINGS[t].effects[key] ?? 0) * level;
  }
  return v;
}

// ── Multipliers ───────────────────────────────────────────────────

export function taxMultiplier(state: GameState, c: Country): Breakdown {
  return breakdown([
    { label: 'Base', value: 1 },
    { label: 'Ruler’s stewardship', value: rulerSkill(state, c, 'stw') * 0.01 },
    { label: 'Steward', value: seatSkill(state, c, 'steward') * 0.015 },
    { label: 'Stability', value: c.stability * 0.05 },
    { label: 'War weariness', value: -c.warExhaustion * 0.01 },
  ]);
}

export function levyMultiplier(state: GameState, c: Country): Breakdown {
  return breakdown([
    { label: 'Base', value: 1 },
    { label: 'Ruler’s martial skill', value: rulerSkill(state, c, 'mar') * 0.01 },
    { label: 'Marshal', value: seatSkill(state, c, 'marshal') * 0.015 },
    { label: 'Stability', value: c.stability * 0.03 },
  ]);
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

const VASSAL_TRIBUTE = 0.25;

function ownTaxes(state: GameState, c: Country): number {
  let t = 0;
  for (const id of provincesOf(state, c.index)) {
    const p = state.provinces[id];
    if (p.controller === c.index) t += provinceTax(p);
  }
  return t * Math.max(0.3, taxMultiplier(state, c).total);
}

export function income(state: GameState, c: Country): Breakdown {
  const taxes = ownTaxes(state, c);
  let tribute = 0;
  for (const v of vassalsOf(state, c.index)) tribute += ownTaxes(state, v) * VASSAL_TRIBUTE;
  return breakdown([
    { label: `Taxes from ${provincesOf(state, c.index).length} provinces`, value: taxes },
    { label: 'Tribute from vassals', value: tribute },
    { label: 'Tribute to your liege', value: c.liege ? -taxes * VASSAL_TRIBUTE : 0 },
  ]);
}

export function expenses(state: GameState, c: Country): Breakdown {
  let field = 0,
    levies = 0;
  for (const a of armiesOf(state, c.index))
    for (const [t, men] of Object.entries(a.units) as [UnitType, number][]) {
      if (t === 'levy') levies += (men / 100) * UNITS.levy.upkeep;
      else field += (men / 100) * UNITS[t].upkeep;
    }
  let reserve = 0;
  for (const [t, men] of Object.entries(c.reserve) as [UnitType, number][])
    reserve += (men / 100) * UNITS[t].reserveUpkeep;
  const interest = c.loans.reduce((s, l) => s + l.interest, 0);
  return breakdown([
    { label: 'Men-at-arms in the field', value: field },
    { label: 'Men-at-arms at home', value: reserve },
    { label: 'Raised levies', value: levies },
    { label: 'Interest on loans', value: interest },
  ]);
}

export function monthlyBalance(state: GameState, c: Country): number {
  return income(state, c).total - expenses(state, c).total;
}

export function maxManpower(state: GameState, c: Country): Breakdown {
  let base = 0;
  for (const id of provincesOf(state, c.index)) {
    const p = state.provinces[id];
    if (p.controller === c.index) base += provinceLevy(p);
  }
  const mult = levyMultiplier(state, c);
  return breakdown([
    { label: 'Levies of your provinces', value: base },
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
  c.loans.push({ amount, interest: Math.round(((amount * 0.12) / 12) * 100) / 100 });
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

export function dailyConstruction(state: GameState, world: SimWorld) {
  state.provinces.forEach((p, id) => {
    if (!p?.construction || p.construction.done > state.day) return;
    const { type, level } = p.construction;
    p.buildings[type] = level;
    p.construction = undefined;
    log(state, [p.owner], 'building', `${BUILDINGS[type].levels[level - 1]} completed in ${world.region(id).name}.`, {
      province: id,
    });
  });
}

// ── The monthly tick ──────────────────────────────────────────────

export function monthlyEconomy(state: GameState, world: SimWorld) {
  for (const c of state.countries) {
    if (!c?.alive) continue;
    const balance = monthlyBalance(state, c);
    c.gold += balance;
    c.lastBalance = balance;
    const max = maxManpower(state, c).total;
    // Levies recover a tenth of the full pool a month.
    if (c.manpower < max) c.manpower = Math.min(max, c.manpower + max * 0.1);
    else c.manpower = Math.max(max, c.manpower - max * 0.05);
    if (c.gold < 0) handleDebt(state, c);
  }
  // Development grows slowly, faster with farms and workshops and a stable realm.
  state.provinces.forEach((p, id) => {
    if (!p?.owner || p.dev >= MAX_DEV) return;
    const c = state.countries[p.owner];
    const rate = 0.0025 * (1 + buildingEffect(p, 'growth')) * (c.stability >= 0 ? 1 : 0.5);
    if (p.controller === p.owner && chance(state, rate)) {
      p.dev++;
      log(state, [p.owner], 'economy', `${world.region(id).name} has grown to development ${p.dev}.`, { province: id });
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
  log(state, [c.index], 'economy', `${c.name} is bankrupt. Its debts are repudiated and half its soldiers desert.`, {
    important: true,
  });
}

export function reserveMen(c: Country): number {
  return menIn(c.reserve);
}
