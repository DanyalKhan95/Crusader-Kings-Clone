/**
 * The AI. Each AI country thinks once a month (spread over the month): it keeps its court, builds,
 * recruits, picks wars it can win and makes peace. At war, each army re-plans every few days: strike
 * enemy armies it can beat, besiege enemy land, or fall back to a fortress.
 */
import { BUILDING_ORDER, BUILDINGS } from '../data/buildings';
import { UNITS } from '../data/units';
import { TRAITS } from '../data/traits';
import { character, staffCourt } from './characters';
import { canBuild, fortLevel, income, repayLoan, startBuilding } from './economy';
import { availableMaa, disband, inBattle, mergeInto, orderMove, raiseArmy, recruit } from './military';
import {
  armiesOf,
  armySize,
  atWar,
  hasTruce,
  isInRealm,
  menIn,
  provincesOf,
  realmProvinces,
  realmStrength,
  topLiege,
  warsOf,
} from './queries';
import { chance, pick, random } from './rng';
import type { Army, Country, GameState, PeaceTerms, UnitType, War } from './types';
import {
  borderTargets,
  canDeclare,
  declareWar,
  endWar,
  peaceAcceptance,
  peaceCost,
  proposeToPlayer,
  scoreFor,
  winnerSide,
} from './war';
import { distanceKm, type SimWorld } from './world';

function aggression(state: GameState, c: Country): number {
  const ruler = character(state, c.ruler);
  let a = 0;
  for (const t of ruler?.traits ?? []) a += TRAITS[t]?.aggression ?? 0;
  return a;
}

// ── Monthly thinking ──────────────────────────────────────────────

export function monthlyAI(state: GameState, world: SimWorld, c: Country) {
  staffCourt(state, world, c, true);
  const wars = warsOf(state, c.index);
  if (wars.length) {
    // Everyone to arms.
    if (c.manpower > 300 || menIn(c.reserve) > 0) raiseArmy(state, world, c);
    for (const w of wars) considerPeace(state, world, c, w);
  } else {
    for (const a of armiesOf(state, c.index)) if (!inBattle(state, a)) disband(state, a);
    economy(state, world, c);
    considerWar(state, world, c);
  }
}

function economy(state: GameState, world: SimWorld, c: Country) {
  const monthly = income(state, c).total;
  // Pay debts first.
  for (let i = c.loans.length - 1; i >= 0; i--) if (c.gold > c.loans[i].amount * 1.5) repayLoan(c, i);
  if (c.loans.length) return;
  // Keep some men-at-arms: their upkeep at home up to a quarter of income.
  let upkeep = 0;
  for (const [t, men] of Object.entries(c.reserve) as [UnitType, number][])
    upkeep += (men / 100) * UNITS[t].reserveUpkeep;
  const types = availableMaa(c);
  const regiments = 1 + Math.floor(monthly / 25);
  for (let i = 0; i < regiments && upkeep < monthly * 0.25 && c.gold > 60; i++) {
    const pool: UnitType[] = types.filter((x) => x !== 'siege');
    if (types.includes('siege') && chance(state, 0.2)) pool.push('siege');
    const t = pick(state, pool);
    if (!recruit(c, t, 1)) break;
    upkeep += UNITS[t].reserveUpkeep * (UNITS[t].regiment / 100);
  }
  // Build the most useful things it can afford, keeping a reserve; big realms build several at once.
  const reserve = Math.max(30, monthly * 3);
  if (state.day < c.ai.nextBuild) return;
  const own = provincesOf(state, c.index);
  const projects = 1 + Math.floor(own.length / 20);
  for (let n = 0; n < projects && c.gold >= reserve + 50; n++) {
    let best: { id: number; type: (typeof BUILDING_ORDER)[number]; value: number } | null = null;
    for (const id of own) {
      const p = state.provinces[id];
      for (const type of BUILDING_ORDER) {
        const check = canBuild(state, world, c.index, id, type);
        if (!check.ok || c.gold - check.cost < reserve) continue;
        const e = BUILDINGS[type].effects;
        let value = p.dev * ((e.tax ?? 0) * 1.2 + (e.levy ?? 0) * 0.6 + (e.growth ?? 0) * 0.3);
        if (e.fort) value = id === c.capital || p.dev >= 10 ? 1.5 + p.dev * 0.1 : 0.3;
        value /= check.cost;
        if (!best || value > best.value) best = { id, type, value };
      }
    }
    if (!best) break;
    startBuilding(state, world, c.index, best.id, best.type);
  }
  c.ai.nextBuild = state.day + 45;
}

function considerWar(state: GameState, world: SimWorld, c: Country) {
  if (c.liege || c.stability < 0 || c.gold < 0 || c.loans.length > 1) return;
  if (state.day < c.ai.nextWarCheck) return;
  c.ai.nextWarCheck = state.day + 240 + Math.floor(random(state) * 240);
  const appetite = 0.18 + aggression(state, c) * 0.25;
  if (!chance(state, Math.max(0.03, appetite))) return;
  const mine = realmStrength(state, c.index);
  // Throne claims first.
  for (const t of c.throneClaims) {
    const target = state.countries[t];
    if (target?.alive && mine > realmStrength(state, t) * 0.9 && canDeclare(state, world, c.index, t, 'throne', t).ok) {
      declareWar(state, world, c.index, t, 'throne', t);
      return;
    }
  }
  // Otherwise a border province of a weaker neighbour.
  const neighbours = new Set<number>();
  for (const id of realmProvinces(state, c.index))
    for (const [n] of world.region(id).adj) {
      const o = state.provinces[n]?.owner ?? 0;
      if (o && !isInRealm(state, o, c.index)) neighbours.add(topLiege(state, o));
    }
  let best: { target: number; goal: number; value: number } | null = null;
  for (const t of neighbours) {
    if (t === c.index || hasTruce(state, c.index, t) || atWar(state, c.index, t)) continue;
    if (state.wars.some((w) => w.attackers.includes(t) || w.defenders.includes(t)) && chance(state, 0.5)) continue;
    const theirs = realmStrength(state, t);
    if (mine < theirs * 1.6) continue;
    for (const goal of borderTargets(state, world, c.index, t)) {
      const value = state.provinces[goal].dev * (mine / Math.max(1, theirs)) + random(state);
      if (!best || value > best.value) best = { target: t, goal, value };
    }
  }
  if (best) declareWar(state, world, c.index, best.target, 'border', best.goal);
}

// ── Peace ─────────────────────────────────────────────────────────

function considerPeace(state: GameState, world: SimWorld, c: Country, war: War) {
  const leader = war.attacker === c.index || war.defender === c.index;
  if (!leader) return;
  const side = winnerSide(war, c.index);
  const enemy = side === 'attacker' ? war.defender : war.attacker;
  const score = scoreFor(state, war, c.index);
  const terms = bestTerms(state, war, c.index, score);
  if (terms) {
    if (enemy === state.player) proposeToPlayer(state, war, c.index, terms);
    else if (peaceAcceptance(state, war, c.index, terms).accept) {
      endWar(state, world, war, side, terms);
      return;
    }
  }
  // A lost or endless war: ask for a white peace.
  const long = state.day - war.start > 365 * 2;
  if (score < -35 || c.warExhaustion > 14 || (long && Math.abs(score) < 15)) {
    const white: PeaceTerms = { provinces: [], gold: 0, white: true };
    if (enemy === state.player) {
      if (chance(state, 0.3)) proposeToPlayer(state, war, c.index, white);
    } else if (peaceAcceptance(state, war, c.index, white).accept) endWar(state, world, war, null, white);
  }
}

/** The most this side can ask for with its war score, or null if nothing worth asking. */
function bestTerms(state: GameState, war: War, from: number, score: number): PeaceTerms | null {
  if (score < 15) return null;
  const side = winnerSide(war, from);
  const us = side === 'attacker' ? war.attackers : war.defenders;
  const them = side === 'attacker' ? war.defenders : war.attackers;
  const terms: PeaceTerms = { provinces: [], gold: 0 };
  if (war.cb === 'throne' && side === 'attacker') {
    terms.throne = true;
    return peaceCost(state, war, side, terms) <= score ? terms : null;
  }
  // The war goal, then occupied land by value.
  const candidates: number[] = [];
  if (war.cb === 'border' && side === 'attacker') candidates.push(war.goal);
  const occupied: number[] = [];
  for (const m of them)
    for (const id of provincesOf(state, m))
      if (us.includes(state.provinces[id].controller) && id !== war.goal) occupied.push(id);
  occupied.sort((a, b) => state.provinces[b].dev - state.provinces[a].dev);
  candidates.push(...occupied);
  for (const id of candidates) {
    const trial = { ...terms, provinces: [...terms.provinces, id] };
    if (peaceCost(state, war, side, trial) <= score) terms.provinces = trial.provinces;
  }
  const loser = state.countries[side === 'attacker' ? war.defender : war.attacker];
  const left = score - peaceCost(state, war, side, terms);
  if (left > 5 && loser.gold > 20)
    terms.gold = Math.floor(Math.min(loser.gold, (left / 25) * income(state, loser).total * 12));
  if (!terms.provinces.length && terms.gold < 20) return null;
  return terms;
}

// ── Armies ────────────────────────────────────────────────────────

/** Armies of one AI country standing idle in the same place join up. */
function mergeIdle(state: GameState) {
  const seen = new Map<string, Army>();
  for (const army of [...state.armies]) {
    if (army.owner === state.player || army.path.length || army.retreating || inBattle(state, army)) continue;
    const key = `${army.owner}:${army.location}`;
    const host = seen.get(key);
    if (host) mergeInto(state, host, army);
    else seen.set(key, army);
  }
}

export function planArmies(state: GameState, world: SimWorld) {
  if (state.day % 5 === 0) mergeIdle(state);
  for (const army of state.armies) {
    if (army.owner === state.player || army.replan > state.day) continue;
    army.replan = state.day + 6 + Math.floor(random(state) * 5);
    if (inBattle(state, army) || army.retreating) continue;
    const enemies = new Set<number>();
    for (const w of warsOf(state, army.owner))
      for (const e of w.attackers.includes(army.owner) ? w.defenders : w.attackers) enemies.add(e);
    if (!enemies.size) {
      if (army.location !== state.countries[army.owner]?.capital && !army.path.length)
        orderMove(state, world, army, state.countries[army.owner].capital);
      continue;
    }
    planArmy(state, world, army, enemies);
  }
}

function planArmy(state: GameState, world: SimWorld, army: Army, enemies: Set<number>) {
  const size = armySize(army);
  const here = world.region(army.location);
  const hostile = state.armies.filter((a) => enemies.has(a.owner) && !a.retreating);
  // 0. Join forces with a friendly army close by before taking on anyone.
  const friend = state.armies.find(
    (a) =>
      a !== army &&
      a.owner === army.owner &&
      !a.retreating &&
      !inBattle(state, a) &&
      armySize(a) >= size &&
      distanceKm(here, world.region(a.location)) < 400,
  );
  // 1. Beat an enemy army we can take, nearest first; in our own land we fight at even odds.
  let bestArmy: { at: number; score: number } | null = null;
  const realm = topLiege(state, army.owner);
  const friendlyNear = friend ? armySize(friend) : 0;
  for (const e of hostile) {
    const r = world.region(e.location);
    if (r.kind !== 'land') continue;
    const inOurLand = isInRealm(state, state.provinces[e.location]?.owner ?? 0, realm);
    const ratio = (size + (friend && inOurLand ? friendlyNear : 0)) / Math.max(1, armySize(e));
    if (ratio < (inOurLand ? 0.95 : 1.2)) continue;
    const km = distanceKm(here, r);
    if (km > 1500) continue;
    const score = ratio * 100 - km / 10 + (inOurLand ? 80 : 0);
    if (!bestArmy || score > bestArmy.score) bestArmy = { at: e.location, score };
  }
  if (friend && !bestArmy && friend.location !== army.location) {
    orderMove(state, world, army, friend.location);
    army.objective = friend.location;
    return;
  }
  // 2. Flee from a much stronger army close by.
  const danger = hostile.find((e) => armySize(e) > size * 1.4 && distanceKm(here, world.region(e.location)) < 250);
  if (danger && !bestArmy) {
    const home = state.countries[army.owner].capital;
    if (home && army.location !== home && fortLevel(state, home)) {
      orderMove(state, world, army, home);
      return;
    }
  }
  if (bestArmy) {
    if (army.objective !== bestArmy.at || !army.path.length) {
      army.objective = bestArmy.at;
      orderMove(state, world, army, bestArmy.at);
    }
    return;
  }
  // 3. Besiege enemy land: valuable, close, and not defended by more than we have.
  const p = state.provinces[army.location];
  if (p && p.controller && enemies.has(p.controller) && !army.path.length) return; // keep sieging here
  let target: { id: number; score: number } | null = null;
  for (const e of enemies)
    for (const id of provincesOf(state, e)) {
      const q = state.provinces[id];
      if (!enemies.has(q.controller)) continue;
      const r = world.region(id);
      const km = distanceKm(here, r);
      if (km > 2500) continue;
      const defended = hostile.some((h) => h.location === id && armySize(h) > size * 0.8);
      if (defended) continue;
      const fort = fortLevel(state, id);
      const goalBonus = state.wars.some(
        (w) => w.goal === id || (w.cb === 'throne' && state.countries[w.goal]?.capital === id),
      )
        ? 25
        : 0;
      const score = q.dev * 2 + goalBonus - km / 25 - fort * 4;
      if (!target || score > target.score) target = { id, score };
    }
  if (target) {
    if (army.objective === target.id && army.path.length) return;
    if (orderMove(state, world, army, target.id)) army.objective = target.id;
  }
}
