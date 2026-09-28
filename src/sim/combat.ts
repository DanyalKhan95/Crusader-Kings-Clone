/**
 * Battles. Armies of countries at war that stand in the same province fight, one round a day, until
 * one side breaks: unit counters, terrain, river crossings, commanders and morale all count. The
 * loser flees to a safe neighbouring province and suffers in the pursuit.
 */
import { UNITS, UNIT_ORDER, unitDef } from '../data/units';
import { ADJ_RIVER, ADJ_STRAIT } from '../shared/dataTypes';
import { character, die, skill } from './characters';
import { mayEnter } from './diplomacy';
import { grouped, log } from './log';
import { isPassable, stepDays } from './movement';
import { armySize, atWar, menIn, sideOf } from './queries';
import { chance, jitter } from './rng';
import { modifierEffect } from './modifiers';
import { militaryEra, techEffect } from './tech';
import type { Army, Battle, BattleSide, GameState, UnitType, Units } from './types';
import type { SimWorld } from './world';
import { placeName } from './places';

/** Damage multiplier for attackers by the defender's terrain. */
const TERRAIN_DEFENCE: Record<string, number> = {
  hills: 0.85,
  mountains: 0.7,
  forest: 0.9,
  taiga: 0.9,
  jungle: 0.85,
  wetlands: 0.85,
};
const CROSSING_PENALTY = 0.75;
const MAX_DAYS = 15;

export function battleAt(state: GameState, province: number): Battle | undefined {
  return state.battles.find((b) => b.province === province);
}

function armiesOfSide(state: GameState, side: BattleSide): Army[] {
  return side.armies.map((id) => state.armies.find((a) => a.id === id)).filter((a): a is Army => !!a);
}

export function sideUnits(armies: Army[]): Units {
  const u: Units = {};
  for (const a of armies) for (const [t, n] of Object.entries(a.units) as [UnitType, number][]) u[t] = (u[t] ?? 0) + n;
  return u;
}

function bestMartial(state: GameState, armies: Army[]): number {
  return armies.reduce((m, a) => Math.max(m, skill(character(state, a.commander), 'mar')), 0);
}

function sideMorale(armies: Army[]): number {
  const men = armies.reduce((s, a) => s + armySize(a), 0);
  return men ? armies.reduce((s, a) => s + a.morale * armySize(a), 0) / men : 0;
}

/** Edge flags between two regions (river / strait). */
function crossingBetween(world: SimWorld, from: number, to: number): boolean {
  const e = world.region(from)?.adj.find(([n]) => n === to);
  return !!e && (e[2] & (ADJ_RIVER | ADJ_STRAIT)) !== 0;
}

// ── Starting battles ──────────────────────────────────────────────

/**
 * Starts battles where hostile armies meet. `arrived` lists armies that entered a region today with
 * the region they came from; they attack.
 */
export function startBattles(state: GameState, world: SimWorld, arrived: { army: Army; from: number }[]) {
  const byProvince = new Map<number, Army[]>();
  for (const a of state.armies) {
    if (world.region(a.location).kind !== 'land' || a.retreating) continue;
    let list = byProvince.get(a.location);
    if (!list) byProvince.set(a.location, (list = []));
    list.push(a);
  }
  for (const [province, armies] of byProvince) {
    if (armies.length < 2) continue;
    const existing = battleAt(state, province);
    if (existing) {
      // Newcomers join the side they are allied with.
      for (const a of armies) {
        if (existing.attacker.armies.includes(a.id) || existing.defender.armies.includes(a.id)) continue;
        if (atWar(state, a.owner, existing.defender.country)) existing.attacker.armies.push(a.id);
        else if (atWar(state, a.owner, existing.attacker.country)) existing.defender.armies.push(a.id);
      }
      continue;
    }
    let pair: [Army, Army] | null = null;
    for (let i = 0; i < armies.length && !pair; i++)
      for (let j = i + 1; j < armies.length; j++)
        if (atWar(state, armies[i].owner, armies[j].owner)) {
          pair = [armies[i], armies[j]];
          break;
        }
    if (!pair) continue;
    const [x, y] = pair;
    const sideX = armies.filter((a) => atWar(state, a.owner, y.owner) && !atWar(state, a.owner, x.owner));
    const sideY = armies.filter((a) => atWar(state, a.owner, x.owner) && !atWar(state, a.owner, y.owner));
    const newX = arrived.filter((e) => sideX.includes(e.army));
    const newY = arrived.filter((e) => sideY.includes(e.army));
    const controller = state.provinces[province]?.controller ?? 0;
    let attackerIsX: boolean;
    if (newX.length && !newY.length) attackerIsX = true;
    else if (newY.length && !newX.length) attackerIsX = false;
    else attackerIsX = !(controller && (controller === x.owner || !atWar(state, controller, y.owner)));
    const att = attackerIsX ? sideX : sideY;
    const def = attackerIsX ? sideY : sideX;
    const crossing = (attackerIsX ? newX : newY).some((e) => crossingBetween(world, e.from, province));
    const men = (l: Army[]) => l.reduce((s, a) => s + armySize(a), 0);
    for (const a of [...att, ...def]) {
      a.path = [];
      a.progress = 0;
    }
    state.battles.push({
      id: state.nextId++,
      province,
      day: state.day,
      crossing,
      attacker: { armies: att.map((a) => a.id), country: att[0].owner, start: men(att), losses: 0 },
      defender: { armies: def.map((a) => a.id), country: def[0].owner, start: men(def), losses: 0 },
    });
  }
}

// ── Fighting ──────────────────────────────────────────────────────

function counterShare(t: UnitType, enemy: Units, enemyMen: number): number {
  if (!enemyMen) return 0;
  let n = 0;
  for (const u of UNIT_ORDER) if (UNITS[u].counters.includes(t)) n += enemy[u] ?? 0;
  return n / enemyMen;
}

/** Damage a side deals in a day: each army fights with its own realm's weapons and doctrine. */
function damageOf(
  state: GameState,
  armies: Army[],
  enemy: Units,
  martial: number,
  morale: number,
  mult: number,
): number {
  const enemyMen = menIn(enemy);
  let d = 0;
  for (const a of armies) {
    const owner = state.countries[a.owner];
    const era = militaryEra(owner);
    const doctrine = 1 + (owner ? techEffect(owner, 'combat') + modifierEffect(owner, 'combat') : 0);
    for (const [t, men] of Object.entries(a.units) as [UnitType, number][])
      d += (men / 100) * unitDef(t, era).damage * doctrine * (1 - 0.5 * counterShare(t, enemy, enemyMen));
  }
  return d * (1 + 0.04 * martial) * (0.5 + 0.5 * morale) * mult;
}

function toughness(state: GameState, a: Army, t: UnitType): number {
  return unitDef(t, militaryEra(state.countries[a.owner])).toughness;
}

/** Spreads losses over the armies of a side: fragile troops die first. */
function applyLosses(state: GameState, armies: Army[], losses: number): number {
  let weight = 0;
  for (const a of armies)
    for (const [t, men] of Object.entries(a.units) as [UnitType, number][]) weight += men / toughness(state, a, t);
  if (weight <= 0) return 0;
  let dealt = 0;
  for (const a of armies)
    for (const [t, men] of Object.entries(a.units) as [UnitType, number][]) {
      const loss = Math.min(men, (losses * (men / toughness(state, a, t))) / weight);
      a.units[t] = men - loss;
      dealt += loss;
    }
  return dealt;
}

export function dailyBattles(state: GameState, world: SimWorld) {
  for (const battle of [...state.battles]) {
    const att = armiesOfSide(state, battle.attacker);
    const def = armiesOfSide(state, battle.defender);
    battle.attacker.armies = att.map((a) => a.id);
    battle.defender.armies = def.map((a) => a.id);
    const menA = att.reduce((s, a) => s + armySize(a), 0);
    const menD = def.reduce((s, a) => s + armySize(a), 0);
    if (!menA || !menD) {
      endBattle(state, world, battle, menA ? 'attacker' : 'defender');
      continue;
    }
    const uA = sideUnits(att),
      uD = sideUnits(def);
    const terrain = world.region(battle.province).terrain ?? 'plains';
    const attMult =
      (TERRAIN_DEFENCE[terrain] ?? 1) * (battle.crossing && state.day - battle.day < 3 ? CROSSING_PENALTY : 1);
    const dmgA = damageOf(
      state,
      att,
      uD,
      bestMartial(state, att),
      sideMorale(att),
      attMult * (1 + 0.15 * jitter(state)),
    );
    const dmgD = damageOf(state, def, uA, bestMartial(state, def), sideMorale(def), 1 + 0.15 * jitter(state));
    const lossD = applyLosses(state, def, dmgA * 0.4);
    const lossA = applyLosses(state, att, dmgD * 0.4);
    battle.attacker.losses += lossA;
    battle.defender.losses += lossD;
    for (const a of att) a.morale = Math.max(0, a.morale - (lossA / menA) * 2.5 - 0.03);
    for (const a of def) a.morale = Math.max(0, a.morale - (lossD / menD) * 2.5 - 0.03);
    const leftA = menA - lossA,
      leftD = menD - lossD;
    const brokenA = sideMorale(att) <= 0.2 || leftA < battle.attacker.start * 0.12;
    const brokenD = sideMorale(def) <= 0.2 || leftD < battle.defender.start * 0.12;
    if (brokenA || brokenD || state.day - battle.day >= MAX_DAYS) {
      let winner: 'attacker' | 'defender';
      if (brokenA && !brokenD) winner = 'defender';
      else if (brokenD && !brokenA) winner = 'attacker';
      else winner = leftA / battle.attacker.start >= leftD / battle.defender.start ? 'attacker' : 'defender';
      endBattle(state, world, battle, winner);
    }
  }
}

// ── Aftermath ─────────────────────────────────────────────────────

function retreatTarget(state: GameState, world: SimWorld, army: Army): number {
  const here = world.region(army.location);
  let best = 0,
    bestScore = -Infinity;
  for (const [n] of here.adj) {
    const r = world.region(n);
    if (r.kind !== 'land' || !isPassable(r)) continue;
    if (state.armies.some((a) => a.location === n && atWar(state, a.owner, army.owner))) continue;
    const ctrl = state.provinces[n]?.controller ?? 0;
    let score = -stepDays(world, army.location, n);
    if (ctrl === army.owner) score += 20;
    else if (ctrl && !atWar(state, ctrl, army.owner)) score += 8;
    // Fleeing into a realm that never gave leave is the last resort.
    if (!mayEnter(state, army.owner, n)) score -= 30;
    if (score > bestScore) {
      bestScore = score;
      best = n;
    }
  }
  return best;
}

function endBattle(state: GameState, world: SimWorld, battle: Battle, winner: 'attacker' | 'defender') {
  state.battles = state.battles.filter((b) => b !== battle);
  const W = winner === 'attacker' ? battle.attacker : battle.defender;
  const L = winner === 'attacker' ? battle.defender : battle.attacker;
  const winners = armiesOfSide(state, W);
  const losers = armiesOfSide(state, L);
  // Pursuit
  let pursuit = 0,
    screen = 0;
  for (const a of winners)
    for (const [t, men] of Object.entries(a.units) as [UnitType, number][]) pursuit += (men / 100) * UNITS[t].pursuit;
  for (const a of losers)
    for (const [t, men] of Object.entries(a.units) as [UnitType, number][]) screen += (men / 100) * UNITS[t].screen;
  const remaining = menIn(sideUnits(losers));
  const chased = Math.min(remaining * 0.4, Math.max(0, pursuit * 6 - screen * 4) + remaining * 0.05);
  L.losses += applyLosses(state, losers, chased);
  // Retreat
  for (const a of losers) {
    a.morale = 0;
    const to = retreatTarget(state, world, a);
    if (!to) {
      L.losses += armySize(a);
      a.units = {};
      continue;
    }
    a.path = [to];
    a.progress = 0;
    a.stepDays = stepDays(world, a.location, to);
    a.retreating = true;
    a.objective = 0;
  }
  state.armies = state.armies.filter((a) => armySize(a) >= 10);
  // Commanders may fall.
  for (const a of losers) {
    const c = character(state, a.commander);
    if (c && chance(state, 0.06)) die(state, world, c);
  }
  for (const a of winners) {
    const c = character(state, a.commander);
    if (c && chance(state, 0.01)) die(state, world, c);
  }
  // War score and weariness
  const war = state.wars.find((w) => {
    const sw = sideOf(w, W.country),
      sl = sideOf(w, L.country);
    return sw && sl && sw !== sl;
  });
  if (war) {
    const swing = Math.min(12, (40 * L.losses) / Math.max(1, W.start + L.start) + 2);
    const sign = sideOf(war, W.country) === 'attacker' ? 1 : -1;
    war.battleScore = Math.max(-40, Math.min(40, war.battleScore + sign * swing));
  }
  for (const side of [W, L]) {
    const c = state.countries[side.country];
    if (c) c.warExhaustion = Math.min(20, c.warExhaustion + side.losses / 2500);
  }
  const place = placeName(state, battle.province);
  const wc = state.countries[W.country],
    lc = state.countries[L.country];
  const text = `Battle of ${place}: ${wc.adj} victory over ${lc?.adj ?? 'enemy'} forces. Losses: ${grouped(W.losses)} against ${grouped(L.losses)}.`;
  log(state, [...winners.map((a) => a.owner), ...losers.map((a) => a.owner)], 'battle', text, {
    province: battle.province,
    important: losers.some((a) => a.owner === state.player),
  });
}
