/**
 * War and peace: declaring war for a cause, calling allies to arms, the war score, peace deals and
 * truces. Throne wars end with the victor's ruler taking the loser's crown, as William's did in 1066;
 * independence wars free a vassal or tributary; coalition wars punish an aggressor.
 */
import { cultureName } from './beliefs';
import { years } from './calendar';
import { markDead, mergeReigns } from './characters';
import {
  addAggression,
  AE_FACTOR,
  alliesOf,
  coalitionAgainst,
  dropPacts,
  guarantorsOf,
  hasPact,
  leaveCoalition,
  makeTributary,
  memory,
  opinionOf,
  pruneClaims,
  realmDev,
  release,
  remember,
  removePact,
} from './diplomacy';
import { income, type Breakdown, type Part } from './economy';
import { grantHolyLand, holyLandOf, holyVictory, holyWarGoals, unbelievers, wagesHolyWar } from './holywars';
import { agree, chronicle, theName, TheName } from './chronicle';
import { turnFaith } from './faith';
import { log } from './log';
import { hasModifier } from './modifiers';
import { blockades } from './naval';
import { invalidateRealm, taskSkill } from './politics';
import {
  atWar,
  hasTruce,
  isInRealm,
  lordOf,
  provincesOf,
  realmMembers,
  realmProvinces,
  sideOf,
  strengthOf,
  topLiege,
  touchesRealm,
  warsOf,
} from './queries';
import { destroyCountry, fixCapitals } from './realm';
import { endRevolt, factionWar, releasable, releaseNation, type Releasable } from './revolts';
import type { CasusBelli, Country, GameState, PeaceOffer, PeaceTerms, War } from './types';
import { distanceKm, type SimWorld } from './world';
import { placeName } from './places';

export { destroyCountry } from './realm';

export const TRUCE_YEARS = 5;

export const CB_INFO: Record<CasusBelli, { name: string; blurb: string }> = {
  claim: {
    name: 'Press a claim',
    blurb: 'Take a province you hold a claim on. Claimed land costs half as much at the peace table.',
  },
  throne: {
    name: 'Claim on the throne',
    blurb: 'Press your claim to the crown. If you win, your ruler takes it and your lands join that kingdom.',
  },
  conquest: {
    name: 'War of conquest',
    blurb: 'War without a just cause. It costs a point of stability, and what you take alarms every neighbour.',
  },
  independence: {
    name: 'War of independence',
    blurb: 'Throw off your liege or overlord. Win, and your realm answers to no one.',
  },
  coalition: {
    name: 'Coalition war',
    blurb: 'Strike the realm your coalition fears. Every member of the coalition is called to arms.',
  },
  revolt: {
    name: 'Revolt',
    blurb: 'An estate has risen against the crown. If the rebels win, their demand becomes law.',
  },
  holy: {
    name: 'Holy war',
    blurb:
      'Fight the unbelievers for a province on your border or a holy place of your faith. The war goal costs half as much at the peace table, and victory strengthens the crown.',
  },
  crusade: {
    name: 'Great holy war',
    blurb:
      'The head of the faith has called the faithful to free a holy city. If they win, the land around it is won for the faith.',
  },
};

export type Check = { ok: true } | { ok: false; reason: string };
const ok: Check = { ok: true };
const no = (reason: string): Check => ({ ok: false, reason });

function breakdown(parts: Part[]): Breakdown {
  const kept = parts.filter((p) => Math.abs(p.value) >= 0.5);
  return { total: kept.reduce((s, p) => s + p.value, 0), parts: kept };
}

export function canDeclare(
  state: GameState,
  world: SimWorld,
  attacker: number,
  target: number,
  cb: CasusBelli,
  goal: number,
): Check {
  const a = state.countries[attacker];
  const t = state.countries[target];
  if (!a?.alive || !t?.alive) return no('No such country');
  if (cb === 'revolt') return no('Revolts are not declared');
  if (cb === 'crusade') return no('Only the head of a faith can call a great holy war');
  if (a.rebel) return no('Rebels fight only their own war');
  if (state.countries[topLiege(state, target)]?.rebel) return no('They are rebels in another realm’s war');
  if (cb === 'independence') {
    const lord = lordOf(state, attacker);
    if (!lord) return no('Only a vassal or a tributary can fight for independence');
    if (target !== lord) return no(`Independence is won from ${state.countries[lord].name}`);
    if (atWar(state, attacker, lord)) return no('Already at war');
    if (hasTruce(state, attacker, lord)) return no('A truce is in force');
    return ok;
  }
  // A vassal may press a claim to a foreign crown, as William did; other wars are for its liege.
  if (a.liege && cb !== 'throne') return no('Vassals cannot declare wars of their own');
  const defender = topLiege(state, target);
  if (defender === attacker || isInRealm(state, target, topLiege(state, attacker)))
    return no('They are part of your realm');
  if (lordOf(state, attacker) === defender) return no('They are your overlord: fight for your independence');
  if (state.countries[defender].overlord === attacker) return no('They pay you tribute');
  if (atWar(state, attacker, defender)) return no('Already at war');
  if (hasTruce(state, attacker, defender)) return no('A truce is in force');
  if (hasPact(state, 'alliance', attacker, defender)) return no('You are allies');
  if (hasPact(state, 'nap', attacker, defender)) return no('A non-aggression pact binds you');
  if (hasPact(state, 'guarantee', attacker, defender)) return no('You guarantee their independence');
  if (cb === 'throne' && !a.throneClaims.includes(defender)) return no('You have no claim on their throne');
  if (cb === 'claim') {
    if (!a.claims.includes(goal)) return no('Pick a province you claim');
    const p = state.provinces[goal];
    if (!p?.owner || !isInRealm(state, p.owner, defender)) return no('They do not hold that province');
  }
  if (cb === 'coalition' && !coalitionAgainst(state, defender)?.members.includes(attacker))
    return no('You are not in a coalition against them');
  if (cb === 'holy') {
    if (!wagesHolyWar(a)) return no('Your faith does not wage holy wars');
    if (!unbelievers(state, attacker, defender)) return no('They are not unbelievers');
    if (!holyWarGoals(state, world, attacker, defender).includes(goal))
      return no('Pick a province on your border, or a holy site of your faith');
  }
  return ok;
}

/** Claimed provinces a war could be fought over: held by the target's realm. */
export function claimTargets(state: GameState, attacker: number, target: number): number[] {
  const defender = topLiege(state, target);
  return (state.countries[attacker]?.claims ?? []).filter((id) => {
    const o = state.provinces[id]?.owner ?? 0;
    return o && isInRealm(state, o, defender);
  });
}

/** Provinces of the target realm that touch ours, to fabricate claims on. */
export function borderProvinces(state: GameState, world: SimWorld, attacker: number, target: number): number[] {
  const defender = topLiege(state, target);
  return realmProvinces(state, defender).filter((id) => touchesRealm(state, world, attacker, id));
}

export function warName(state: GameState, cb: CasusBelli, attacker: Country, defender: Country, goal: number): string {
  switch (cb) {
    case 'throne':
      return `${attacker.adj} Claim on ${defender.short}`;
    case 'claim':
      return `${attacker.adj}–${defender.adj} War over ${placeName(state, goal)}`;
    case 'holy':
      return `${attacker.adj} Holy War for ${placeName(state, goal)}`;
    case 'independence':
      return `${attacker.adj} War of Independence`;
    case 'coalition':
      return `Coalition War against ${defender.short}`;
    case 'revolt':
      return attacker.name;
    default:
      return `${attacker.adj} Invasion of ${defender.short}`;
  }
}

export function declareWar(
  state: GameState,
  world: SimWorld,
  attacker: number,
  target: number,
  cb: CasusBelli,
  goal = 0,
): War | null {
  if (!canDeclare(state, world, attacker, target, cb, goal).ok) return null;
  const defender = cb === 'independence' ? lordOf(state, attacker) : topLiege(state, target);
  const a = state.countries[attacker],
    d = state.countries[defender];
  const attackers = realmMembers(state, attacker);
  // Rebels quit the wars they fought for their liege.
  if (cb === 'independence') for (const w of [...state.wars]) dropFromWar(state, w, attackers);
  const war: War = {
    id: state.nextId++,
    name: warName(state, cb, a, d, goal),
    cb,
    goal: cb === 'throne' ? defender : cb === 'claim' || cb === 'holy' ? goal : 0,
    attacker,
    defender,
    attackers,
    defenders: realmMembers(state, defender).filter((x) => !attackers.includes(x)),
    start: state.day,
    battleGain: 0,
    battleLoss: 0,
    ticking: 0,
  };
  state.wars.push(war);
  state.diploVersion++;
  // A horde needs no cause.
  if (cb === 'conquest' && !hasModifier(a, 'horde')) a.stability = Math.max(-3, a.stability - 1);
  log(state, [...war.attackers, ...war.defenders], 'war', `${a.name} has declared war on ${d.name}: ${war.name}.`, {
    important: war.defenders.includes(state.player),
    province: cb === 'claim' || cb === 'holy' ? goal : d.capital,
  });
  if (cb === 'independence') return war;
  if (cb === 'coalition')
    for (const m of coalitionAgainst(state, defender)?.members ?? [])
      if (m !== attacker) callToArms(state, world, war, m, 'attacker', 'coalition');
  for (const ally of alliesOf(state, attacker)) callToArms(state, world, war, ally, 'attacker', 'alliance');
  for (const ally of alliesOf(state, defender)) callToArms(state, world, war, ally, 'defender', 'alliance');
  for (const g of guarantorsOf(state, defender)) callToArms(state, world, war, g, 'defender', 'guarantee');
  if (d.overlord) callToArms(state, world, war, d.overlord, 'defender', 'overlord');
  return war;
}

// ── Calls to arms ─────────────────────────────────────────────────

export type CallReason = 'alliance' | 'guarantee' | 'overlord' | 'coalition' | 'crusade';

export const CALL_REASON: Record<CallReason, string> = {
  alliance: 'Alliance',
  guarantee: 'Their guarantee',
  overlord: 'Duty to a tributary',
  coalition: 'Coalition',
  crusade: 'The call of the faith',
};

/** Why a friend cannot take a side at all (no blame attaches), or null. */
export function cannotJoin(state: GameState, war: War, ally: number, side: 'attacker' | 'defender'): string | null {
  const enemy = side === 'attacker' ? war.defender : war.attacker;
  const name = state.countries[enemy]?.name ?? 'the enemy';
  if (war.attackers.includes(ally) || war.defenders.includes(ally)) return 'already in the war';
  if (hasTruce(state, ally, enemy)) return `a truce with ${name}`;
  if (hasPact(state, 'nap', ally, enemy)) return `a non-aggression pact with ${name}`;
  if (hasPact(state, 'alliance', ally, enemy)) return `an alliance with ${name} as well`;
  if (lordOf(state, ally) === enemy || lordOf(state, enemy) === ally) return `ties of vassalage to ${name}`;
  return null;
}

function sideStrength(state: GameState, members: number[]): number {
  let n = 0;
  for (const m of members) if (!state.countries[m]?.liege) n += strengthOf(state, m);
  return n;
}

/** How willing an AI friend is to answer a call. Zero or more means it comes. */
export function callWillingness(
  state: GameState,
  world: SimWorld,
  war: War,
  ally: number,
  side: 'attacker' | 'defender',
  reason: CallReason,
): Breakdown {
  const leader = side === 'attacker' ? war.attacker : war.defender;
  const enemy = side === 'attacker' ? war.defender : war.attacker;
  const c = state.countries[ally];
  if (reason === 'crusade') return crusadeWillingness(state, world, war, c, side);
  const parts: Part[] = [{ label: CALL_REASON[reason], value: reason === 'alliance' ? 40 : 30 }];
  if (side === 'attacker' && reason === 'alliance') parts.push({ label: 'A war of aggression', value: -15 });
  parts.push({
    label: `Opinion of ${state.countries[leader].short}`,
    value: Math.round(opinionOf(state, world, ally, leader) * 0.4),
  });
  parts.push({
    label: `Opinion of ${state.countries[enemy].short}`,
    value: Math.round(-opinionOf(state, world, ally, enemy) * 0.2),
  });
  if (c.warExhaustion >= 1) parts.push({ label: 'War weariness', value: -Math.round(c.warExhaustion * 3) });
  const busy = warsOf(state, ally).length;
  if (busy) parts.push({ label: 'Already at war', value: -25 * busy });
  const ours = sideStrength(state, side === 'attacker' ? war.attackers : war.defenders) + strengthOf(state, ally);
  const theirs = sideStrength(state, side === 'attacker' ? war.defenders : war.attackers);
  if (theirs > ours * 1.5) parts.push({ label: 'The enemy is far stronger', value: -30 });
  const capA = state.countries[ally].capital,
    capE = state.countries[enemy].capital;
  if (capA && capE)
    parts.push({
      label: 'Distance',
      value: -Math.round(Math.min(30, distanceKm(world.region(capA), world.region(capE)) / 100)),
    });
  if (c.loans.length >= 2) parts.push({ label: 'Debts', value: -20 });
  return breakdown(parts);
}

/** Will a realm take the cross, or rally to the defence of the faith? Piety, distance and its troubles decide. */
function crusadeWillingness(
  state: GameState,
  world: SimWorld,
  war: War,
  c: Country,
  side: 'attacker' | 'defender',
): Breakdown {
  const leader = side === 'attacker' ? war.attacker : war.defender;
  const parts: Part[] = [{ label: CALL_REASON.crusade, value: 20 }];
  const traits = state.characters[c.ruler]?.traits ?? [];
  if (traits.includes('pious')) parts.push({ label: 'A pious ruler', value: 20 });
  if (traits.includes('cynical')) parts.push({ label: 'A cynical ruler', value: -25 });
  parts.push({
    label: `Opinion of ${state.countries[leader].short}`,
    value: Math.round(opinionOf(state, world, c.index, leader) * 0.3),
  });
  if (c.warExhaustion >= 1) parts.push({ label: 'War weariness', value: -Math.round(c.warExhaustion * 3) });
  const busy = warsOf(state, c.index).length;
  if (busy) parts.push({ label: 'Already at war', value: -30 * busy });
  if (c.stability < 0) parts.push({ label: 'Unrest at home', value: -15 });
  if (c.loans.length >= 2) parts.push({ label: 'Debts', value: -20 });
  if (c.capital && war.goal)
    parts.push({
      label: 'Distance',
      value: -Math.round(Math.min(25, distanceKm(world.region(c.capital), world.region(war.goal)) / 200)),
    });
  return breakdown(parts);
}

export interface CallPreview {
  country: number;
  side: 'attacker' | 'defender';
  reason: CallReason;
  /** join: an AI that would come; refuse: one that would not; cannot: blocked; asked: the player decides */
  answer: 'join' | 'refuse' | 'cannot' | 'asked';
  why?: string;
}

/** Who would be called into a war, and how they would answer: for the declaration dialog. */
export function previewCalls(
  state: GameState,
  world: SimWorld,
  attacker: number,
  target: number,
  cb: CasusBelli,
): CallPreview[] {
  if (cb === 'independence') return [];
  const defender = topLiege(state, target);
  const war: War = {
    id: -1,
    name: '',
    cb,
    goal: 0,
    attacker,
    defender,
    attackers: realmMembers(state, attacker),
    defenders: realmMembers(state, defender),
    start: state.day,
    battleGain: 0,
    battleLoss: 0,
    ticking: 0,
  };
  const out: CallPreview[] = [];
  const add = (country: number, side: 'attacker' | 'defender', reason: CallReason) => {
    if (!country || out.some((x) => x.country === country) || state.countries[country]?.liege) return;
    const blocked = cannotJoin(state, war, country, side);
    if (blocked === 'already in the war') return;
    if (blocked) out.push({ country, side, reason, answer: 'cannot', why: blocked });
    else if (country === state.player) out.push({ country, side, reason, answer: 'asked' });
    else {
      const will = callWillingness(state, world, war, country, side, reason).total >= 0;
      out.push({ country, side, reason, answer: will ? 'join' : 'refuse' });
    }
  };
  if (cb === 'coalition')
    for (const m of coalitionAgainst(state, defender)?.members ?? [])
      if (m !== attacker) add(m, 'attacker', 'coalition');
  for (const a of alliesOf(state, attacker)) add(a, 'attacker', 'alliance');
  for (const a of alliesOf(state, defender)) add(a, 'defender', 'alliance');
  for (const g of guarantorsOf(state, defender)) add(g, 'defender', 'guarantee');
  add(state.countries[defender]?.overlord ?? 0, 'defender', 'overlord');
  return out;
}

/** Asks a friend to join a war. AI friends answer at once; the player is asked. */
export function callToArms(
  state: GameState,
  world: SimWorld,
  war: War,
  ally: number,
  side: 'attacker' | 'defender',
  reason: CallReason,
) {
  const c = state.countries[ally];
  if (!c?.alive || c.liege) return;
  const leader = state.countries[side === 'attacker' ? war.attacker : war.defender];
  const blocked = cannotJoin(state, war, ally, side);
  if (blocked) {
    if (blocked !== 'already in the war')
      log(state, [leader.index, ally], 'diplomacy', `${c.name} cannot join ${war.name}: ${blocked}.`);
    return;
  }
  if (ally === state.player) {
    if (state.offers.some((o) => o.kind === 'call' && o.war === war.id && o.to === ally)) return;
    state.offers.push({
      id: state.nextId++,
      kind: 'call',
      war: war.id,
      from: leader.index,
      to: ally,
      expires: state.day + 30,
    });
    log(
      state,
      [ally],
      'diplomacy',
      reason === 'crusade'
        ? `${war.name} is called: take the cross and free ${placeName(state, war.goal)}!`
        : `${leader.name} calls you to arms in ${war.name}.`,
      { important: true },
    );
    return;
  }
  if (callWillingness(state, world, war, ally, side, reason).total >= 0) joinWar(state, war, ally, side);
  else refuseCall(state, war, ally, side, reason);
}

/** The price of leaving a friend alone: the treaty ends and the friend remembers. */
export function refuseCall(
  state: GameState,
  war: War,
  ally: number,
  side: 'attacker' | 'defender',
  reason: CallReason,
) {
  const leader = side === 'attacker' ? war.attacker : war.defender;
  const enemy = side === 'attacker' ? war.defender : war.attacker;
  if (reason === 'crusade') {
    // No treaty binds anyone to take the cross; only the player hears of it.
    log(state, [ally], 'diplomacy', `${state.countries[ally].name} stays out of ${war.name}.`);
    return;
  }
  if (reason === 'alliance') removePact(state, 'alliance', ally, leader);
  else if (reason === 'guarantee') removePact(state, 'guarantee', ally, leader);
  else if (reason === 'overlord') release(state, leader);
  else leaveCoalition(state, ally, enemy);
  remember(state, leader, ally, 'betrayed', reason === 'coalition' ? -15 : -50);
  const what =
    reason === 'alliance'
      ? 'The alliance is broken.'
      : reason === 'guarantee'
        ? 'The guarantee is void.'
        : reason === 'overlord'
          ? `${state.countries[leader].name} no longer pays it tribute.`
          : 'It leaves the coalition.';
  log(
    state,
    [leader, ally],
    'diplomacy',
    `${state.countries[ally].name} refuses the call to arms in ${war.name}. ${what}`,
    {
      important: leader === state.player,
    },
  );
}

/** A country and its vassals join a war on one side. */
export function joinWar(state: GameState, war: War, country: number, side: 'attacker' | 'defender') {
  const list = side === 'attacker' ? war.attackers : war.defenders;
  for (const m of realmMembers(state, country))
    if (!war.attackers.includes(m) && !war.defenders.includes(m)) list.push(m);
  state.diploVersion++;
  const leader = state.countries[side === 'attacker' ? war.attacker : war.defender];
  log(
    state,
    [...war.attackers, ...war.defenders],
    'war',
    `${state.countries[country].name} joins ${war.name} on the side of ${leader.name}.`,
  );
}

/** Takes countries out of a war without a treaty: their occupations end and battles stop. */
function dropFromWar(state: GameState, war: War, members: number[]) {
  const inWar = members.filter((m) => war.attackers.includes(m) || war.defenders.includes(m));
  if (!inWar.length) return;
  const side = sideOf(war, inWar[0]);
  const enemies = side === 'attacker' ? war.defenders : war.attackers;
  war.attackers = war.attackers.filter((x) => !inWar.includes(x));
  war.defenders = war.defenders.filter((x) => !inWar.includes(x));
  state.provinces.forEach((p) => {
    if (!p?.owner) return;
    const theirsHeldByUs = enemies.includes(p.owner) && inWar.includes(p.controller);
    const oursHeldByThem = inWar.includes(p.owner) && enemies.includes(p.controller);
    if ((theirsHeldByUs || oursHeldByThem) && !atWar(state, p.owner, p.controller)) {
      p.controller = p.owner;
      p.siege = undefined;
    }
  });
  state.battles = state.battles.filter((b) => atWar(state, b.attacker.country, b.defender.country));
  state.mapVersion++;
  state.diploVersion++;
}

/** Can this country make a separate peace? Only those who are not leading a side. */
export function canLeaveWar(state: GameState, war: War, country: number): Check {
  if (!sideOf(war, country)) return no('Not in this war');
  if (country === war.attacker || country === war.defender) return no('The leader of a side must make peace for all');
  if (state.countries[country]?.liege && sideOf(war, state.countries[country].liege))
    return no('Your liege decides for the realm');
  return ok;
}

/** A separate white peace: the country and its vassals leave the war. */
export function leaveWar(state: GameState, war: War, country: number) {
  const side = sideOf(war, country);
  if (!side) return;
  const leader = side === 'attacker' ? war.attacker : war.defender;
  const enemy = side === 'attacker' ? war.defender : war.attacker;
  dropFromWar(state, war, realmMembers(state, country));
  state.truces.push({ a: country, b: enemy, until: state.day + years(TRUCE_YEARS) });
  if (state.day - war.start < 365) remember(state, leader, country, 'betrayed', -20);
  log(
    state,
    [country, leader, enemy],
    'peace',
    `${state.countries[country].name} makes a separate peace in ${war.name}.`,
  );
}

// ── War score ─────────────────────────────────────────────────────

/** Share of the war score for holding all of the other side's land. */
export const OCCUPATION_WEIGHT = 70;
/** Most war score each side's victories in battle can bring. */
export const BATTLE_CAP = 40;
/** How much of the other side's battle score a victory wipes out, as a share of its own gain. */
const BATTLE_EROSION = 0.5;
/** War score for blockading all of the other side's land, and the most blockades can bring. */
export const BLOCKADE_WEIGHT = 40;
export const BLOCKADE_CAP = 10;
/** War score for taking a war goal that is a place: a province or a capital. */
export const GOAL_TAKEN = 10;
/** Most war score from months of holding the war goal, and from holding out without losing land. */
export const GOAL_CAP = 40;
export const HOLDOUT_CAP = 25;
/** Months the war goal's count runs to, either way, and what it loses each month the goal is not held. */
export const MAX_MONTHS = 36;
export const GOAL_DECAY = 3;

/** War score for holding the war goal for so many months: it counts for more the longer it is held. */
export function goalScore(months: number): number {
  const m = Math.max(0, months);
  return Math.min(GOAL_CAP, 1.2 * m + (m * m) / 40);
}

/** A victory in battle adds to the winners' share of the war score and wears down the losers'. */
export function recordBattle(war: War, attackersWon: boolean, swing: number) {
  if (attackersWon) {
    war.battleGain = Math.min(BATTLE_CAP, war.battleGain + swing);
    war.battleLoss = Math.max(0, war.battleLoss - swing * BATTLE_EROSION);
  } else {
    war.battleLoss = Math.min(BATTLE_CAP, war.battleLoss + swing);
    war.battleGain = Math.max(0, war.battleGain - swing * BATTLE_EROSION);
  }
}

function sideDev(state: GameState, members: number[]): number {
  let dev = 0;
  for (const m of members) for (const id of provincesOf(state, m)) dev += state.provinces[id].dev;
  return dev;
}

function occupiedDev(state: GameState, owners: number[], occupiers: number[]): number {
  let dev = 0;
  for (const m of owners)
    for (const id of provincesOf(state, m)) {
      const p = state.provinces[id];
      if (occupiers.includes(p.controller)) dev += p.dev;
    }
  return dev;
}

function blockadedDev(state: GameState, owners: number[], blockaders: number[]): number {
  let dev = 0;
  for (const [id, by] of blockades(state)) {
    const p = state.provinces[id];
    if (p && owners.includes(p.owner) && blockaders.includes(by)) dev += p.dev;
  }
  return dev;
}

/** A war goal that is a place, taken by the attackers: the province fought over, or the crown's capital. */
function goalTaken(state: GameState, war: War): boolean {
  switch (war.cb) {
    case 'claim':
    case 'holy':
    case 'crusade':
      return war.attackers.includes(state.provinces[war.goal]?.controller ?? 0);
    case 'throne': {
      const cap = state.countries[war.defender]?.capital ?? 0;
      return war.attackers.includes(state.provinces[cap]?.controller ?? 0);
    }
    default:
      return false;
  }
}

/** Whether the attackers hold what they fight for: a place, or for rebels, their own land kept free. */
function goalHeld(state: GameState, war: War): boolean {
  switch (war.cb) {
    case 'independence':
      // Rebels who keep their own land free for half a year are winning.
      return state.day - war.start > 180 && occupiedDev(state, war.attackers, war.defenders) === 0;
    case 'revolt':
      return state.day - war.start > 90 && occupiedDev(state, war.attackers, war.defenders) === 0;
    default:
      return goalTaken(state, war);
  }
}

const months = (n: number) => `${n} month${n === 1 ? '' : 's'}`;

/**
 * The war score, -100 … 100, seen from one side (the attackers' unless `view` says otherwise), with
 * where it comes from: the land each side holds of the other's, the battles each has won, blockades,
 * and the war goal, which counts for more the longer it is held (or the longer the defenders hold out
 * without losing any land).
 */
export function warScore(state: GameState, war: War, view: 'attacker' | 'defender' = 'attacker'): Breakdown {
  const [us, them] = view === 'attacker' ? [war.attackers, war.defenders] : [war.defenders, war.attackers];
  const ourDev = Math.max(1, sideDev(state, us)),
    theirDev = Math.max(1, sideDev(state, them));
  const sign = view === 'attacker' ? 1 : -1;
  const parts: Part[] = [
    { label: 'Enemy land we hold', value: (occupiedDev(state, them, us) / theirDev) * OCCUPATION_WEIGHT },
    { label: 'Our land they hold', value: (-occupiedDev(state, us, them) / ourDev) * OCCUPATION_WEIGHT },
    { label: 'Battles we won', value: view === 'attacker' ? war.battleGain : war.battleLoss },
    { label: 'Battles we lost', value: -(view === 'attacker' ? war.battleLoss : war.battleGain) },
    {
      label: 'Enemy coasts blockaded',
      value: Math.min(BLOCKADE_CAP, (blockadedDev(state, them, us) / theirDev) * BLOCKADE_WEIGHT),
    },
    {
      label: 'Our coasts blockaded',
      value: -Math.min(BLOCKADE_CAP, (blockadedDev(state, us, them) / ourDev) * BLOCKADE_WEIGHT),
    },
  ];
  if (war.ticking > 0) {
    const taken = goalTaken(state, war) ? GOAL_TAKEN : 0;
    const place = war.cb !== 'independence' && war.cb !== 'revolt';
    const label = place
      ? view === 'attacker'
        ? 'War goal held'
        : 'They hold the war goal'
      : view === 'attacker'
        ? 'Our land kept free'
        : 'Their land kept free';
    parts.push({ label: `${label}, ${months(war.ticking)}`, value: sign * (taken + goalScore(war.ticking)) });
  } else if (war.ticking < 0)
    parts.push({
      label: view === 'attacker' ? `They hold out, ${months(-war.ticking)}` : `We hold out, ${months(-war.ticking)}`,
      value: -sign * Math.min(HOLDOUT_CAP, goalScore(-war.ticking)),
    });
  else if (goalTaken(state, war))
    parts.push({ label: view === 'attacker' ? 'War goal taken' : 'They took the war goal', value: sign * GOAL_TAKEN });
  const total = Math.max(
    -100,
    Math.min(
      100,
      parts.reduce((s, p) => s + p.value, 0),
    ),
  );
  return { total, parts: parts.filter((p) => Math.abs(p.value) > 0.05) };
}

/** War score seen from one country's side. */
export function scoreFor(state: GameState, war: War, country: number): number {
  return warScore(state, war, sideOf(war, country) === 'defender' ? 'defender' : 'attacker').total;
}

export function monthlyWars(state: GameState, world: SimWorld) {
  for (const war of [...state.wars]) {
    const a = state.countries[war.attacker],
      d = state.countries[war.defender];
    if (!a?.alive || !d?.alive || !war.attackers.includes(war.attacker) || !war.defenders.includes(war.defender)) {
      endWar(state, world, war, null, { provinces: [], gold: 0, white: true });
      continue;
    }
    // Members that died or left drop out.
    war.attackers = war.attackers.filter((c) => state.countries[c]?.alive);
    war.defenders = war.defenders.filter((c) => state.countries[c]?.alive);
    // The war goal's months: they count up while it is held and drain away once it is lost; defenders
    // who have lost no land for a year count months of their own, which fade once the enemy gains a foothold.
    const anyHeld = occupiedDev(state, war.defenders, war.attackers) > 0;
    if (goalHeld(state, war)) war.ticking = Math.min(MAX_MONTHS, Math.max(0, war.ticking) + 1);
    else if (war.ticking > 0) war.ticking = Math.max(0, war.ticking - GOAL_DECAY);
    else if (!anyHeld && state.day - war.start > years(1)) war.ticking = Math.max(-MAX_MONTHS, war.ticking - 1);
    else if (anyHeld && war.ticking < 0) war.ticking = Math.min(0, war.ticking + GOAL_DECAY);
    for (const c of [...war.attackers, ...war.defenders]) {
      const country = state.countries[c];
      const slower = 1 - taskSkill(state, country, 'chancellor', 'negotiate') * 0.02;
      country.warExhaustion = Math.min(20, country.warExhaustion + 0.3 * Math.max(0.4, slower));
    }
  }
  for (const c of state.countries) {
    if (!c?.alive) continue;
    if (!state.wars.some((w) => w.attackers.includes(c.index) || w.defenders.includes(c.index)))
      c.warExhaustion = Math.max(0, c.warExhaustion - 0.5);
    // Reparations end with their term, or with the realm they were owed to.
    if (c.reparations.length)
      c.reparations = c.reparations.filter((r) => r.until > state.day && state.countries[r.to]?.alive);
  }
  state.truces = state.truces.filter((t) => t.until > state.day);
}

/** Offers lapse after a month; an unanswered call to arms counts as a refusal. */
export function expireOffers(state: GameState) {
  for (const o of [...state.offers]) {
    const war = o.kind === 'pact' || o.kind === 'ultimatum' ? null : state.wars.find((w) => w.id === o.war);
    if (o.kind !== 'pact' && o.kind !== 'ultimatum' && !war) {
      state.offers = state.offers.filter((x) => x !== o);
      continue;
    }
    if (o.expires > state.day) continue;
    state.offers = state.offers.filter((x) => x !== o);
    if (o.kind === 'call' && war) {
      const side = sideOf(war, o.from);
      if (side) refuseCall(state, war, o.to, side, callReason(state, war, o.to, side));
    }
    // An ultimatum left unanswered is an ultimatum refused.
    if (o.kind === 'ultimatum') factionWar(state, o.to, o.members, o.from);
  }
}

/** Why a friend is bound to a side of a war. */
export function callReason(state: GameState, war: War, ally: number, side: 'attacker' | 'defender'): CallReason {
  const leader = side === 'attacker' ? war.attacker : war.defender;
  const enemy = side === 'attacker' ? war.defender : war.attacker;
  if (hasPact(state, 'alliance', ally, leader)) return 'alliance';
  if (hasPact(state, 'guarantee', ally, leader)) return 'guarantee';
  if (state.countries[leader]?.overlord === ally) return 'overlord';
  if (war.cb === 'coalition' && coalitionAgainst(state, enemy)?.members.includes(ally)) return 'coalition';
  if (war.cb === 'crusade') return 'crusade';
  return 'alliance';
}

// ── Peace ─────────────────────────────────────────────────────────

/** The reparations a peace may ask for: years of payment, and their cost in war score. */
export const REPARATION_TERMS: { years: number; cost: number }[] = [
  { years: 5, cost: 18 },
  { years: 10, cost: 30 },
];
/** Legitimacy a humiliation takes from the beaten crown, and gives the victor's. */
export const HUMILIATION = { loser: 25, winner: 10, memory: -40 };
/** War score the smaller terms cost. */
export const TERM_COST = { convert: 30, humiliate: 15, breakAlliances: 12, renounce: 5, perClaim: 2, maxClaims: 15 };
/** War score for setting a people free, per point of the losing side's development they hold, and for each. */
export const RELEASE_WEIGHT = 0.6;
export const RELEASE_BASE = 8;
/** A realm may be made a vassal only if its realm is at most this share of the victor's. */
export const VASSAL_SHARE = 0.75;

/** The Holy Land costs a fixed share of the war, and a little more for every province it holds. */
function holyLandCost(state: GameState, world: SimWorld, war: War, loserDev: number): number {
  let cost = 25;
  for (const id of holyLandOf(state, world, war)) cost += ((state.provinces[id].dev / loserDev) * 130 + 4) * 0.3;
  return cost;
}

function leaders(state: GameState, war: War, winner: 'attacker' | 'defender') {
  return {
    winLeader: state.countries[winner === 'attacker' ? war.attacker : war.defender],
    loseLeader: state.countries[winner === 'attacker' ? war.defender : war.attacker],
  };
}

/** Claims the losing leader holds on the winners' land and crowns: a peace may make it renounce them. */
export function claimsToRenounce(
  state: GameState,
  war: War,
  winner: 'attacker' | 'defender',
): { provinces: number[]; thrones: number[] } {
  const { loseLeader } = leaders(state, war, winner);
  const winners = winner === 'attacker' ? war.attackers : war.defenders;
  if (!loseLeader) return { provinces: [], thrones: [] };
  return {
    provinces: loseLeader.claims.filter((id) => {
      const o = state.provinces[id]?.owner ?? 0;
      return o && winners.some((w) => isInRealm(state, o, w));
    }),
    thrones: loseLeader.throneClaims.filter((t) => winners.includes(t)),
  };
}

/** The peoples a peace would set free, without the land the same peace takes. */
function releasedLand(state: GameState, loser: Country, terms: PeaceTerms): Releasable[] {
  if (!terms.release?.length) return [];
  return releasable(state, loser)
    .filter((g) => terms.release!.includes(g.culture))
    .map((g) => {
      const provinces = g.provinces.filter((id) => !terms.provinces.includes(id));
      return { ...g, provinces, dev: provinces.reduce((s, id) => s + state.provinces[id].dev, 0) };
    })
    .filter((g) => g.provinces.length > 0);
}

/** War score a deal costs the side that gains from it. */
export function peaceCost(
  state: GameState,
  world: SimWorld,
  war: War,
  winner: 'attacker' | 'defender',
  terms: PeaceTerms,
): number {
  if (terms.white) return 0;
  const losers = winner === 'attacker' ? war.defenders : war.attackers;
  const loserDev = Math.max(1, sideDev(state, losers));
  const { winLeader, loseLeader } = leaders(state, war, winner);
  const claimed = new Set(winLeader?.claims ?? []);
  if (war.cb === 'holy' && winner === 'attacker') claimed.add(war.goal);
  let cost = 0;
  for (const id of terms.provinces) {
    const p = state.provinces[id];
    const base = (p.dev / loserDev) * 100 * 1.3 + 4;
    cost += claimed.has(id) ? base * 0.5 : base;
  }
  if (terms.holyLand) cost += holyLandCost(state, world, war, loserDev);
  if (terms.gold > 0) cost += (terms.gold / Math.max(10, income(state, loseLeader).total * 12)) * 25;
  if (terms.throne) cost += 70;
  if (terms.tributary) cost += 25 + Math.min(1, realmDev(state, loseLeader.index) / loserDev) * 50;
  if (terms.independence) cost += 50;
  if (terms.demands) cost += 40;
  if (terms.crush) cost += 30;
  for (const g of releasedLand(state, loseLeader, terms))
    cost += (g.dev / loserDev) * 100 * RELEASE_WEIGHT + RELEASE_BASE;
  if (terms.vassal) cost += 40 + Math.min(1, realmDev(state, loseLeader.index) / loserDev) * 40;
  if (terms.convert) cost += TERM_COST.convert;
  if (terms.humiliate) cost += TERM_COST.humiliate;
  if (terms.reparations) cost += REPARATION_TERMS.find((r) => r.years === terms.reparations)?.cost ?? 0;
  if (terms.breakAlliances) cost += TERM_COST.breakAlliances;
  if (terms.renounce) {
    const { provinces, thrones } = claimsToRenounce(state, war, winner);
    cost +=
      TERM_COST.renounce + Math.min(TERM_COST.maxClaims, (provinces.length + thrones.length * 3) * TERM_COST.perClaim);
  }
  return Math.min(100, cost);
}

/** What terms cost the side asking for them, after its chancellor has negotiated. */
export function offerCost(
  state: GameState,
  world: SimWorld,
  war: War,
  side: 'attacker' | 'defender',
  terms: PeaceTerms,
): number {
  const proposer = state.countries[side === 'attacker' ? war.attacker : war.defender];
  const discount = 1 - Math.min(0.2, taskSkill(state, proposer, 'chancellor', 'negotiate') * 0.01);
  return peaceCost(state, world, war, side, terms) * discount;
}

/** A war between a realm and its own rebels. */
export function isRevolt(state: GameState, war: War): boolean {
  return state.countries[war.attacker]?.rebel?.realm === war.defender;
}

const independent = (c: Country | undefined) => !!c?.alive && !c.liege && !c.overlord && !c.rebel;

/** Which terms a side may ask for in this war. */
export function allowedTerms(state: GameState, war: War, winner: 'attacker' | 'defender') {
  const { winLeader, loseLeader } = leaders(state, war, winner);
  const revolt = isRevolt(state, war);
  const crusaders = war.cb === 'crusade' && winner === 'attacker';
  /** terms between realms: rebels win their demands or are crushed, and nothing else */
  const between = !revolt && !!winLeader && !!loseLeader;
  const renounce = claimsToRenounce(state, war, winner);
  return {
    throne: war.cb === 'throne' && winner === 'attacker',
    independence: war.cb === 'independence' && winner === 'attacker',
    demands: war.cb === 'revolt' && winner === 'attacker',
    crush: revolt && winner === 'defender',
    holyLand: crusaders,
    /** land and gold change hands only between realms, not with rebels */
    spoils: between,
    /** crusaders fight for the Holy Land alone, not for land of their own */
    land: between && !crusaders,
    tributary:
      between &&
      war.cb !== 'independence' &&
      !crusaders &&
      !loseLeader.liege &&
      !loseLeader.overlord &&
      tributariesOfCount(state, loseLeader.index) === 0,
    release: between && !crusaders && releasable(state, loseLeader).length > 0,
    vassal:
      between &&
      !crusaders &&
      war.cb !== 'independence' &&
      independent(winLeader) &&
      independent(loseLeader) &&
      realmDev(state, loseLeader.index) <= realmDev(state, winLeader.index) * VASSAL_SHARE,
    convert: between && loseLeader.religion !== winLeader.religion,
    humiliate: between,
    reparations: between && !loseLeader.reparations.some((r) => r.to === winLeader.index),
    breakAlliances: between && alliesOf(state, loseLeader.index).length > 0,
    renounce: between && renounce.provinces.length + renounce.thrones.length > 0,
  };
}

function tributariesOfCount(state: GameState, index: number): number {
  return state.countries.filter((c) => c?.alive && c.overlord === index).length;
}

/** Why terms cannot be asked for in this war at all, or null. */
export function impossibleTerms(
  state: GameState,
  war: War,
  side: 'attacker' | 'defender',
  terms: PeaceTerms,
): string | null {
  const allowed = allowedTerms(state, war, side);
  if (
    (terms.throne && !allowed.throne) ||
    (terms.independence && !allowed.independence) ||
    (terms.tributary && !allowed.tributary) ||
    (terms.demands && !allowed.demands) ||
    (terms.crush && !allowed.crush) ||
    (terms.holyLand && !allowed.holyLand) ||
    (terms.provinces.length > 0 && !allowed.land) ||
    ((terms.provinces.length > 0 || terms.gold > 0) && !allowed.spoils) ||
    (terms.release?.length && !allowed.release) ||
    (terms.vassal && !allowed.vassal) ||
    (terms.convert && !allowed.convert) ||
    (terms.humiliate && !allowed.humiliate) ||
    (terms.reparations && (!allowed.reparations || !REPARATION_TERMS.some((r) => r.years === terms.reparations))) ||
    (terms.breakAlliances && !allowed.breakAlliances) ||
    (terms.renounce && !allowed.renounce)
  )
    return 'Those terms are not possible in this war';
  if (terms.vassal && (terms.throne || terms.tributary)) return 'A vassal cannot also pay tribute or lose its crown';
  if (terms.throne && terms.tributary) return 'A crown you take cannot pay you tribute';
  return null;
}

export interface PeaceCheck {
  accept: boolean;
  reason: string;
  /** how the other side weighs the offer: it accepts at zero or more */
  why: Breakdown;
}

const NOTHING: Breakdown = { total: 0, parts: [] };

/** Would the other side accept? `from` is the side proposing (and gaining). */
export function peaceAcceptance(
  state: GameState,
  world: SimWorld,
  war: War,
  from: number,
  terms: PeaceTerms,
): PeaceCheck {
  const side = sideOf(war, from);
  if (!side) return { accept: false, reason: 'Not in this war', why: NOTHING };
  const score = scoreFor(state, war, from);
  const other = state.countries[side === 'attacker' ? war.defender : war.attacker];
  const age = (state.day - war.start) / 365;
  if (terms.white) {
    const why = breakdown([
      { label: 'War score', value: score },
      { label: 'Peace is welcome', value: 10 },
      { label: 'War weariness', value: other.warExhaustion * 1.5 },
      { label: 'A long war', value: Math.max(0, age - 2) * 15 },
    ]);
    return why.total >= 0
      ? { accept: true, reason: 'They are ready to end the war', why }
      : { accept: false, reason: 'They still hope to win', why };
  }
  const impossible = impossibleTerms(state, war, side, terms);
  if (impossible) return { accept: false, reason: impossible, why: NOTHING };
  const cost = offerCost(state, world, war, side, terms);
  const why = breakdown([
    { label: 'War score', value: score },
    { label: 'What you ask', value: -cost },
    { label: 'Utterly beaten', value: score >= 99 ? 100 : 0 },
    { label: 'War weariness', value: other.warExhaustion * 0.5 },
    { label: 'A long war', value: Math.max(0, age - 3) * 3 },
  ]);
  if (why.total >= 0) return { accept: true, reason: `A war score of ${Math.round(score)} covers what you ask`, why };
  return {
    accept: false,
    reason: `It needs a war score of ${Math.ceil(score - why.total)}; you have ${Math.round(score)}`,
    why,
  };
}

/**
 * A beaten realm swears fealty to the victor: it makes peace in its other wars, gives up its treaties,
 * its tributaries and its place in any coalition, and its land joins the victor's realm.
 */
function makeVassal(state: GameState, world: SimWorld, subject: Country, liege: Country) {
  for (const w of [...state.wars]) {
    if (!state.wars.includes(w) || !sideOf(w, subject.index)) continue;
    if (w.attacker === subject.index || w.defender === subject.index)
      endWar(state, world, w, null, { provinces: [], gold: 0, white: true });
    else dropFromWar(state, w, realmMembers(state, subject.index));
  }
  dropPacts(state, subject.index);
  for (const c of state.countries) if (c?.alive && c.overlord === subject.index) c.overlord = 0;
  state.coalitions = state.coalitions.filter((co) => co.target !== subject.index);
  for (const co of state.coalitions) co.members = co.members.filter((m) => m !== subject.index);
  subject.overlord = 0;
  subject.liege = liege.index;
  state.mapVersion++;
  state.borderVersion++;
  state.diploVersion++;
}

/** The beaten crown is humbled before its own lords and the world, and will not forget it. */
function humiliate(state: GameState, winner: Country, loser: Country) {
  loser.legitimacy = Math.max(0, loser.legitimacy - HUMILIATION.loser);
  winner.legitimacy = Math.min(100, winner.legitimacy + HUMILIATION.winner);
  remember(state, loser.index, winner.index, 'humiliated', HUMILIATION.memory);
  invalidateRealm(state, loser.index);
  invalidateRealm(state, winner.index);
}

type PeaceSink = (state: GameState, war: War, winner: 'attacker' | 'defender' | null, terms: PeaceTerms) => void;
let peaceSink: PeaceSink | null = null;

/** Tells a listener of every peace made, with its terms: for the headless reports of `tools/simulate.ts`. */
export function setPeaceSink(sink: PeaceSink | null) {
  peaceSink = sink;
}

/** Ends a war on terms. `winner` is null for a white peace. */
export function endWar(
  state: GameState,
  world: SimWorld,
  war: War,
  winner: 'attacker' | 'defender' | null,
  terms: PeaceTerms,
) {
  state.wars = state.wars.filter((w) => w !== war);
  peaceSink?.(state, war, winner, terms);
  const winLeader = winner ? state.countries[winner === 'attacker' ? war.attacker : war.defender] : null;
  const loseLeader = winner ? state.countries[winner === 'attacker' ? war.defender : war.attacker] : null;
  const participants = [...war.attackers, ...war.defenders];
  // Occupied land goes back to its owners.
  state.provinces.forEach((p) => {
    if (!p?.owner || !participants.includes(p.owner)) return;
    if (p.controller !== p.owner && participants.includes(p.controller) && !atWar(state, p.owner, p.controller)) {
      p.controller = p.owner;
      p.siege = undefined;
    }
  });
  let changed = false;
  const claimed: number[] = [],
    taken: number[] = [];
  const freed: string[] = [];
  if (winLeader && loseLeader && !terms.white) {
    const claims = new Set(winLeader.claims);
    // What the loser must give up is settled before the land changes hands.
    const renounced = terms.renounce ? claimsToRenounce(state, war, winner!) : null;
    const vassalLand = terms.vassal ? realmProvinces(state, loseLeader.index) : [];
    for (const id of terms.provinces) {
      const p = state.provinces[id];
      if (!p || !participants.includes(p.owner)) continue;
      remember(state, topLiege(state, p.owner), winLeader.index, 'took_land', -(p.dev * 2 + 5));
      p.owner = winLeader.index;
      p.controller = winLeader.index;
      p.siege = undefined;
      (claims.has(id) ? claimed : taken).push(id);
      changed = true;
    }
    if (terms.gold > 0) {
      const g = Math.min(terms.gold, Math.max(0, loseLeader.gold));
      loseLeader.gold -= g;
      winLeader.gold += g;
    }
    winLeader.stability = Math.min(3, winLeader.stability + 1);
    loseLeader.stability = Math.max(-3, loseLeader.stability - 1);
    if (terms.independence)
      for (const m of war.attackers)
        if (state.countries[m]?.liege === war.defender || state.countries[m]?.overlord === war.defender) {
          const free = state.countries[m];
          // The chronicle remembers kingdoms and colonies that win their freedom.
          if (free.colony || free.rank === 'kingdom' || free.rank === 'empire')
            chronicle(
              state,
              `${TheName(free.name)} ${agree(free.name, 'wins its', 'win their')} independence from ${theName(loseLeader.name)}.`,
              {
                province: free.capital,
                realm: free.index,
              },
            );
          release(state, m);
        }
    if (terms.tributary) {
      addAggression(state, world, winLeader.index, realmProvinces(state, loseLeader.index), 0.25);
      makeTributary(state, loseLeader.index, winLeader.index);
    }
    if (terms.holyLand && grantHolyLand(state, world, war)) changed = true;
    if (war.cb === 'holy' || war.cb === 'crusade') holyVictory(state, war, winner!);
    for (const culture of terms.release ?? [])
      if (releaseNation(state, world, loseLeader, culture, winLeader)) {
        freed.push(cultureName(culture));
        changed = true;
      }
    if (terms.vassal) {
      addAggression(state, world, winLeader.index, vassalLand, 0.5);
      makeVassal(state, world, loseLeader, winLeader);
      changed = true;
    }
    if (terms.convert) turnFaith(state, loseLeader, winLeader.religion, winLeader);
    if (terms.humiliate) humiliate(state, winLeader, loseLeader);
    if (terms.reparations)
      loseLeader.reparations.push({ to: winLeader.index, until: state.day + years(terms.reparations) });
    if (terms.breakAlliances) dropPacts(state, loseLeader.index, ['alliance']);
    if (renounced) {
      loseLeader.claims = loseLeader.claims.filter((id) => !renounced.provinces.includes(id));
      loseLeader.throneClaims = loseLeader.throneClaims.filter((t) => !renounced.thrones.includes(t));
    }
  }
  if (winLeader) {
    addAggression(state, world, winLeader.index, claimed, AE_FACTOR.claim);
    addAggression(
      state,
      world,
      winLeader.index,
      taken,
      war.cb === 'coalition' || war.cb === 'conquest' || war.cb === 'holy' ? AE_FACTOR[war.cb] : 1,
    );
  }
  // Truces between the leaders, and between each realm that fought and the other side's leader.
  const until = state.day + years(TRUCE_YEARS);
  state.truces.push({ a: war.attacker, b: war.defender, until });
  for (const m of war.attackers)
    if (m !== war.attacker && !state.countries[m]?.liege) state.truces.push({ a: m, b: war.defender, until });
  for (const m of war.defenders)
    if (m !== war.defender && !state.countries[m]?.liege) state.truces.push({ a: m, b: war.attacker, until });
  // Comrades remember each other.
  for (const side of [war.attackers, war.defenders]) {
    const heads = side.filter((m) => !state.countries[m]?.liege);
    for (const x of heads) for (const y of heads) if (x !== y) remember(state, x, y, 'fought_beside', 10);
  }
  // A coalition that fought has had its say.
  if (war.cb === 'coalition') {
    const co = coalitionAgainst(state, war.defender);
    for (const m of co?.members ?? [])
      remember(state, m, war.defender, 'ae', -memory(state, m, war.defender, 'ae') / 2);
    state.coalitions = state.coalitions.filter((c) => c !== co);
  }
  state.battles = state.battles.filter((b) => atWar(state, b.attacker.country, b.defender.country));
  state.mapVersion++;
  state.diploVersion++;
  if (changed) state.borderVersion++;
  log(state, participants, 'peace', peaceText(state, war, winLeader, loseLeader, terms, freed), {
    important: participants.includes(state.player),
  });
  if (winLeader && loseLeader && terms.throne) inheritThrone(state, winLeader, loseLeader);
  endRevolt(state, world, war, winner === 'attacker', terms);
  for (const c of [...state.countries]) if (c?.alive && !provincesOf(state, c.index).length) destroyCountry(state, c);
  fixCapitals(state, world);
  pruneClaims(state);
}

/** The peace as the heralds cry it: who won what. */
function peaceText(
  state: GameState,
  war: War,
  winLeader: Country | null,
  loseLeader: Country | null,
  terms: PeaceTerms,
  freed: string[],
): string {
  const names = terms.provinces.map((id) => placeName(state, id));
  const them = loseLeader?.name ?? 'the enemy';
  const what = terms.white
    ? 'a white peace'
    : [
        terms.throne ? 'the crown' : '',
        terms.independence ? 'independence' : '',
        terms.vassal ? `the fealty of ${them}` : '',
        terms.tributary ? `tribute from ${them}` : '',
        terms.holyLand ? 'the Holy Land' : '',
        names.length > 3 ? `${names.length} provinces` : names.join(' and '),
        freed.length ? `freedom for the ${freed.join(' and the ')}` : '',
        terms.convert ? `the conversion of ${them}` : '',
        terms.humiliate ? `the humiliation of ${them}` : '',
        terms.reparations ? `reparations for ${terms.reparations} years` : '',
        terms.breakAlliances ? `an end to the alliances of ${them}` : '',
        terms.renounce ? `an end to the claims of ${them}` : '',
        terms.gold ? `${Math.round(terms.gold)} gold` : '',
      ]
        .filter(Boolean)
        .join(', ');
  return winLeader
    ? `${war.name} is over. ${winLeader.name} wins ${what || 'the war'}.`
    : `${war.name} is over: ${what}.`;
}

/** The claimant's ruler takes the crown: the claimant's lands, vassals and armies join the target. */
export function inheritThrone(state: GameState, claimant: Country, target: Country) {
  const oldRuler = state.characters[target.ruler];
  if (oldRuler && oldRuler.died === undefined) markDead(state, oldRuler);
  const oldHeir = state.characters[target.heir];
  if (oldHeir && oldHeir.died === undefined) markDead(state, oldHeir);
  for (const c of Object.values(state.characters)) if (c.country === claimant.index) c.country = target.index;
  mergeReigns(state, claimant.index, target.index);
  target.ruler = claimant.ruler;
  target.rulerSince = state.day;
  target.heir = claimant.heir;
  target.council = { ...claimant.council };
  target.courtiers = [
    ...claimant.courtiers,
    ...target.courtiers.filter((id) => state.characters[id]?.died === undefined),
  ];
  target.gold += claimant.gold;
  target.manpower += claimant.manpower;
  target.loans.push(...claimant.loans);
  for (const [t, n] of Object.entries(claimant.reserve))
    target.reserve[t as keyof typeof target.reserve] =
      (target.reserve[t as keyof typeof target.reserve] ?? 0) + (n ?? 0);
  target.throneClaims = claimant.throneClaims.filter((c) => c !== target.index);
  for (const id of claimant.claims) if (!target.claims.includes(id)) target.claims.push(id);
  state.provinces.forEach((p) => {
    if (!p) return;
    if (p.owner === claimant.index) p.owner = target.index;
    if (p.controller === claimant.index) p.controller = target.index;
  });
  for (const c of state.countries) {
    if (c?.liege === claimant.index) c.liege = target.index;
    if (c?.overlord === claimant.index) c.overlord = target.index;
  }
  for (const a of state.armies) if (a.owner === claimant.index) a.owner = target.index;
  target.stability = Math.max(-3, target.stability - 1);
  const wasPlayer = state.player === claimant.index;
  destroyCountry(state, claimant);
  if (wasPlayer) state.player = target.index;
  state.mapVersion++;
  state.borderVersion++;
  const ruler = state.characters[target.ruler];
  log(state, 'all', 'event', `${ruler?.name ?? 'The claimant'} is crowned: ${target.name} has a new ruler.`, {
    important: wasPlayer || target.index === state.player,
    province: target.capital,
  });
}

// ── Offers ────────────────────────────────────────────────────────

/** Records an AI peace proposal for the player to answer. */
export function proposeToPlayer(state: GameState, war: War, from: number, terms: PeaceTerms) {
  if (state.offers.some((o) => o.kind === 'peace' && o.war === war.id)) return;
  const offer: PeaceOffer = {
    id: state.nextId++,
    kind: 'peace',
    war: war.id,
    from,
    to: state.player,
    terms,
    expires: state.day + 30,
  };
  state.offers.push(offer);
  log(state, [state.player], 'peace', `${state.countries[from].name} proposes peace in ${war.name}.`, {
    important: true,
  });
}

export function winnerSide(war: War, from: number): 'attacker' | 'defender' {
  return war.attackers.includes(from) ? 'attacker' : 'defender';
}
