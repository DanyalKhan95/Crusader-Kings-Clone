/**
 * The AI. Each AI country thinks once a month (spread over the month): it keeps its court, looks for
 * friends, builds, recruits, forges claims, picks wars it can win and makes peace. Vassals and
 * tributaries weigh their loyalty against their strength. At war, each army re-plans every few days:
 * strike enemy armies it can beat, besiege enemy land, or fall back to a fortress.
 */
import { BUILDING_ORDER, BUILDINGS } from '../data/buildings';
import { UNITS } from '../data/units';
import { TRAITS } from '../data/traits';
import { character, staffCourt } from './characters';
import {
  alliesOf,
  canIntegrate,
  canPropose,
  cancelPact,
  canFabricate,
  coalitionAgainst,
  coalitionBalance,
  coalitionOf,
  fabricationCost,
  guarantorsOf,
  hasPact,
  loyalty,
  memory,
  opinionOf,
  pactWillingness,
  REBEL_LOYALTY,
  signPact,
  startFabrication,
  startIntegration,
  threatsTo,
} from './diplomacy';
import { canBuild, fortLevel, income, repayLoan, startBuilding } from './economy';
import { log } from './log';
import { availableMaa, disband, inBattle, mergeInto, orderMove, raiseArmy, recruit } from './military';
import {
  armiesOf,
  armySize,
  hasTruce,
  isInRealm,
  lordOf,
  menIn,
  provincesOf,
  realmNeighbours,
  strengthOf,
  topLiege,
  vassalsOf,
  warsOf,
} from './queries';
import { chance, pick, random } from './rng';
import type { Army, Country, GameState, PactKind, PeaceTerms, UnitType, War } from './types';
import {
  allowedTerms,
  borderProvinces,
  canDeclare,
  canLeaveWar,
  declareWar,
  endWar,
  leaveWar,
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

/** Men a realm can count on when attacked: its own, and some of its friends'. */
export function defensiveStrength(state: GameState, t: number): number {
  let n = strengthOf(state, t);
  for (const a of alliesOf(state, t)) n += strengthOf(state, a) * 0.6;
  for (const g of guarantorsOf(state, t)) n += strengthOf(state, g) * 0.5;
  const o = state.countries[t]?.overlord;
  if (o) n += strengthOf(state, o) * 0.5;
  return n;
}

/** Men a realm can count on when it attacks: allies come less readily to a war of aggression. */
export function offensiveStrength(state: GameState, c: number): number {
  let n = strengthOf(state, c);
  for (const a of alliesOf(state, c)) n += strengthOf(state, a) * 0.4;
  return n;
}

// ── Monthly thinking ──────────────────────────────────────────────

export function monthlyAI(state: GameState, world: SimWorld, c: Country) {
  staffCourt(state, world, c, true);
  diplomacyAI(state, world, c);
  const wars = warsOf(state, c.index);
  if (wars.length) {
    // Everyone to arms.
    if (c.manpower > 300 || menIn(c.reserve) > 0) raiseArmy(state, world, c);
    for (const w of wars) considerPeace(state, world, c, w);
  } else {
    for (const a of armiesOf(state, c.index)) if (!inBattle(state, a)) disband(state, a);
    economy(state, world, c);
    planClaims(state, world, c);
    considerWar(state, world, c);
  }
  if (lordOf(state, c.index)) considerIndependence(state, world, c);
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

/** Can this realm expect to beat that one, friends included? */
function odds(state: GameState, attacker: number, target: number): number {
  return offensiveStrength(state, attacker) / Math.max(1, defensiveStrength(state, target));
}

/** Realms we may not attack: friends, protégés, those bound to us. */
function offLimits(state: GameState, c: number, t: number): boolean {
  return (
    hasPact(state, 'alliance', c, t) ||
    hasPact(state, 'nap', c, t) ||
    hasPact(state, 'guarantee', c, t) ||
    lordOf(state, t) === c ||
    lordOf(state, c) === t
  );
}

/** An ambitious realm sets its chancellor to forge a claim on a weaker neighbour. */
function planClaims(state: GameState, world: SimWorld, c: Country) {
  if (c.liege || c.fabricating || c.claims.length >= 2 || c.stability < 0 || c.loans.length) return;
  const appetite = 0.18 + aggression(state, c) * 0.25;
  if (!chance(state, Math.max(0.02, appetite * 0.6))) return;
  const reserve = Math.max(40, income(state, c).total * 2);
  let best: { id: number; value: number } | null = null;
  for (const t of realmNeighbours(state, world, c.index)) {
    if (offLimits(state, c.index, t) || !state.countries[t]?.alive) continue;
    const ratio = odds(state, c.index, t);
    if (ratio < 1.4) continue;
    for (const id of borderProvinces(state, world, c.index, t)) {
      if (!canFabricate(state, world, c.index, id).ok || c.gold - fabricationCost(state, id) < reserve) continue;
      const p = state.provinces[id];
      const value = p.dev * Math.min(3, ratio) + (p.culture === c.culture ? 4 : 0) + random(state);
      if (!best || value > best.value) best = { id, value };
    }
  }
  if (best) startFabrication(state, world, c.index, best.id);
}

function considerWar(state: GameState, world: SimWorld, c: Country) {
  if (c.liege || c.stability < 0 || c.gold < 0 || c.loans.length > 1) return;
  if (state.day < c.ai.nextWarCheck) return;
  c.ai.nextWarCheck = state.day + 60 + Math.floor(random(state) * 60);
  // A coalition we lead strikes when it is strong enough.
  for (const co of coalitionOf(state, c.index)) {
    const leader = co.members
      .filter((m) => m !== state.player)
      .sort((a, b) => strengthOf(state, b) - strengthOf(state, a))[0];
    if (leader !== c.index || co.members.length < 2) continue;
    const bal = coalitionBalance(state, co.target);
    if (bal.coalition >= bal.target * 1.1 && canDeclare(state, c.index, co.target, 'coalition', 0).ok) {
      declareWar(state, world, c.index, co.target, 'coalition', 0);
      return;
    }
  }
  // Throne claims are pressed when the ruler has the stomach for it (checked a few times a year).
  const appetite = 0.18 + aggression(state, c) * 0.25;
  if (chance(state, Math.max(0.03, appetite) / 3))
    for (const t of c.throneClaims) {
      const target = state.countries[t];
      if (target?.alive && odds(state, c.index, t) > 0.9 && canDeclare(state, c.index, t, 'throne', t).ok) {
        declareWar(state, world, c.index, t, 'throne', t);
        return;
      }
    }
  // A forged claim is pressed as soon as the odds are good.
  let best: { target: number; goal: number; value: number } | null = null;
  for (const id of c.claims) {
    const o = state.provinces[id]?.owner ?? 0;
    if (!o) continue;
    const t = topLiege(state, o);
    if (state.wars.some((w) => w.attackers.includes(t) || w.defenders.includes(t)) && chance(state, 0.5)) continue;
    const ratio = odds(state, c.index, t);
    if (ratio < 1.4 || !canDeclare(state, c.index, t, 'claim', id).ok) continue;
    const value = state.provinces[id].dev * Math.min(3, ratio) + random(state);
    if (!best || value > best.value) best = { target: t, goal: id, value };
  }
  if (best) {
    declareWar(state, world, c.index, best.target, 'claim', best.goal);
    return;
  }
  // A warlike ruler may attack a much weaker neighbour without any cause.
  if (aggression(state, c) < 0.3 || c.stability < 1 || !chance(state, 0.1)) return;
  let prey: { target: number; ratio: number } | null = null;
  for (const t of realmNeighbours(state, world, c.index)) {
    if (offLimits(state, c.index, t) || !canDeclare(state, c.index, t, 'conquest', 0).ok) continue;
    const ratio = odds(state, c.index, t);
    if (ratio >= 2.5 && (!prey || ratio > prey.ratio)) prey = { target: t, ratio };
  }
  if (prey) declareWar(state, world, c.index, prey.target, 'conquest', 0);
}

/** A disloyal subject that feels strong enough rises. */
function considerIndependence(state: GameState, world: SimWorld, c: Country) {
  const lord = lordOf(state, c.index);
  if (!lord || hasTruce(state, c.index, lord) || state.day < c.ai.nextWarCheck) return;
  c.ai.nextWarCheck = state.day + 120 + Math.floor(random(state) * 120);
  if (loyalty(state, world, c.index).total > REBEL_LOYALTY) return;
  const mine = strengthOf(state, c.index);
  const theirs = c.liege ? strengthOf(state, lord) - mine : defensiveStrength(state, lord);
  if (mine >= theirs * 0.6 && chance(state, 0.5)) declareWar(state, world, c.index, lord, 'independence', 0);
}

// ── Diplomacy ─────────────────────────────────────────────────────

function capitalKm(world: SimWorld, a: Country, b: Country): number {
  return a.capital && b.capital ? distanceKm(world.region(a.capital), world.region(b.capital)) : Infinity;
}

/** An AI proposal to the player, at most one pending, and not to someone who just said no. */
function proposeToPlayerPact(state: GameState, from: Country, pact: PactKind) {
  if (state.day < state.proposalCooldown || state.offers.some((o) => o.kind === 'pact')) return;
  if (memory(state, from.index, state.player, 'refused') < 0) return;
  state.offers.push({
    id: state.nextId++,
    kind: 'pact',
    pact,
    from: from.index,
    to: state.player,
    expires: state.day + 30,
  });
  state.proposalCooldown = state.day + 120;
}

function sign(state: GameState, kind: PactKind, a: Country, b: Country) {
  signPact(state, kind, a.index, b.index);
  const text =
    kind === 'alliance'
      ? `${a.name} and ${b.name} have made an alliance.`
      : kind === 'nap'
        ? `${a.name} and ${b.name} have signed a non-aggression pact.`
        : kind === 'guarantee'
          ? `${a.name} guarantees the independence of ${b.name}.`
          : `${b.name} grants ${a.name} military access.`;
  log(state, [a.index, b.index], 'diplomacy', text);
}

function diplomacyAI(state: GameState, world: SimWorld, c: Country) {
  if (c.liege) return;
  // Allies we have come to hate are dropped.
  for (const a of alliesOf(state, c.index)) {
    if (warsOf(state, c.index).some((w) => w.attackers.includes(a) || w.defenders.includes(a))) continue;
    if (opinionOf(state, world, c.index, a) < -25) {
      cancelPact(state, 'alliance', c.index, a);
      log(state, [c.index, a], 'diplomacy', `${c.name} has broken its alliance with ${state.countries[a].name}.`, {
        important: a === state.player,
      });
    }
  }
  considerIntegration(state, world, c);
  if (state.day < c.ai.nextDiplo) return;
  c.ai.nextDiplo = state.day + 90 + Math.floor(random(state) * 90);
  if (!warsOf(state, c.index).length) {
    seekAlliance(state, world, c);
    seekNap(state, world, c);
    offerGuarantee(state, world, c);
  }
}

function seekAlliance(state: GameState, world: SimWorld, c: Country) {
  if (c.overlord || alliesOf(state, c.index).length >= 2) return;
  let best: { o: Country; want: number } | null = null;
  for (const o of state.countries) {
    if (!o?.alive || o.liege || o.index === c.index || o.overlord) continue;
    if (capitalKm(world, c, o) > 1500) continue;
    if (!canPropose(state, 'alliance', c.index, o.index).ok) continue;
    const want = pactWillingness(state, world, 'alliance', c.index, o.index).total;
    if (want >= 0 && (!best || want > best.want)) best = { o, want };
  }
  if (!best) return;
  if (best.o.index === state.player) proposeToPlayerPact(state, c, 'alliance');
  else if (pactWillingness(state, world, 'alliance', best.o.index, c.index).total >= 0)
    sign(state, 'alliance', c, best.o);
}

/** Peace with a dangerous neighbour buys time. */
function seekNap(state: GameState, world: SimWorld, c: Country) {
  for (const t of threatsTo(state, world, c.index)) {
    const o = state.countries[t];
    if (!o?.alive || o.liege || !canPropose(state, 'nap', c.index, t).ok) continue;
    if (pactWillingness(state, world, 'nap', c.index, t).total < 0) continue;
    if (t === state.player) proposeToPlayerPact(state, c, 'nap');
    else if (pactWillingness(state, world, 'nap', t, c.index).total >= 0) sign(state, 'nap', c, o);
    return;
  }
}

/** Great realms take small friendly neighbours under their protection. */
function offerGuarantee(state: GameState, world: SimWorld, c: Country) {
  if (c.rank !== 'kingdom' && c.rank !== 'empire') return;
  if (state.pacts.some((p) => p.kind === 'guarantee' && p.a === c.index)) return;
  const mine = strengthOf(state, c.index);
  for (const t of realmNeighbours(state, world, c.index)) {
    const o = state.countries[t];
    if (!o?.alive || o.liege || strengthOf(state, t) > mine * 0.4) continue;
    if (!canPropose(state, 'guarantee', c.index, t).ok) continue;
    if (pactWillingness(state, world, 'guarantee', c.index, t).total < 0) continue;
    sign(state, 'guarantee', c, o);
    return;
  }
}

/** A liege absorbs a small, loyal vassal now and then. Great vassals (duchies and up) are left be. */
function considerIntegration(state: GameState, world: SimWorld, c: Country) {
  if (c.integrating || warsOf(state, c.index).length || !chance(state, 0.1)) return;
  for (const v of vassalsOf(state, c.index)) {
    if (v.rank !== 'county' || v.index === state.player) continue;
    if (loyalty(state, world, v.index).total < 25 || !canIntegrate(state, world, c.index, v.index).ok) continue;
    startIntegration(state, world, c.index, v.index);
    return;
  }
}

// ── Peace ─────────────────────────────────────────────────────────

function considerPeace(state: GameState, world: SimWorld, c: Country, war: War) {
  const leader = war.attacker === c.index || war.defender === c.index;
  if (!leader) {
    // An ally that has had enough goes home.
    if (!canLeaveWar(state, war, c.index).ok) return;
    const score = scoreFor(state, war, c.index);
    if (c.warExhaustion > 12 || (score < -40 && c.warExhaustion > 6)) leaveWar(state, war, c.index);
    return;
  }
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
  const allowed = allowedTerms(state, war, side);
  const us = side === 'attacker' ? war.attackers : war.defenders;
  const them = side === 'attacker' ? war.defenders : war.attackers;
  const terms: PeaceTerms = { provinces: [], gold: 0 };
  if (allowed.throne) {
    terms.throne = true;
    return peaceCost(state, war, side, terms) <= score ? terms : null;
  }
  if (allowed.independence) {
    terms.independence = true;
    return peaceCost(state, war, side, terms) <= score ? terms : null;
  }
  // The war goal, then claims we hold, then other occupied land by value.
  const winner = state.countries[from];
  const candidates: number[] = [];
  if (war.cb === 'claim' && side === 'attacker') candidates.push(war.goal);
  const occupied: number[] = [];
  for (const m of them)
    for (const id of provincesOf(state, m))
      if (us.includes(state.provinces[id].controller) && id !== war.goal) occupied.push(id);
  const claimed = new Set(winner.claims);
  occupied.sort(
    (a, b) => state.provinces[b].dev * (claimed.has(b) ? 2 : 1) - state.provinces[a].dev * (claimed.has(a) ? 2 : 1),
  );
  candidates.push(...occupied);
  for (const id of candidates) {
    const trial = { ...terms, provinces: [...terms.provinces, id] };
    if (peaceCost(state, war, side, trial) <= score) terms.provinces = trial.provinces;
  }
  const loser = state.countries[side === 'attacker' ? war.defender : war.attacker];
  // Nothing to take, but the enemy is beaten: make it pay tribute.
  if (
    !terms.provinces.length &&
    allowed.tributary &&
    peaceCost(state, war, side, { ...terms, tributary: true }) <= score
  )
    terms.tributary = true;
  const left = score - peaceCost(state, war, side, terms);
  if (left > 5 && loser.gold > 20)
    terms.gold = Math.floor(Math.min(loser.gold, (left / 25) * income(state, loser).total * 12));
  if (!terms.provinces.length && !terms.tributary && terms.gold < 20) return null;
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
    if (orderMove(state, world, army, friend.location)) {
      army.objective = friend.location;
      return;
    }
  }
  // 2. Flee from a much stronger army close by.
  const danger = hostile.find((e) => armySize(e) > size * 1.4 && distanceKm(here, world.region(e.location)) < 250);
  if (danger && !bestArmy) {
    const home = state.countries[army.owner].capital;
    if (home && army.location !== home && fortLevel(state, home) && orderMove(state, world, army, home)) return;
  }
  if (bestArmy) {
    if (army.objective === bestArmy.at && army.path.length) return;
    if (orderMove(state, world, army, bestArmy.at)) {
      army.objective = bestArmy.at;
      return;
    }
  }
  // 3. Besiege enemy land: valuable, close, and not defended by more than we have.
  const p = state.provinces[army.location];
  if (p && p.controller && enemies.has(p.controller) && !army.path.length) return; // keep sieging here
  if (army.objective && army.path.length && enemies.has(state.provinces[army.objective]?.controller ?? 0)) return;
  const targets: { id: number; score: number }[] = [];
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
      targets.push({ id, score: q.dev * 2 + goalBonus - km / 25 - fort * 4 });
    }
  targets.sort((a, b) => b.score - a.score);
  // The best few, in case some cannot be reached.
  for (const t of targets.slice(0, 4))
    if (orderMove(state, world, army, t.id)) {
      army.objective = t.id;
      return;
    }
}

/** The coalition a country could lead against a target, for the UI. */
export function coalitionLeader(state: GameState, target: number): number {
  const co = coalitionAgainst(state, target);
  if (!co) return 0;
  return [...co.members].sort((a, b) => strengthOf(state, b) - strengthOf(state, a))[0] ?? 0;
}
