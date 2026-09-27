/**
 * The AI. Each AI country thinks once a month (spread over the month): it keeps its court, looks for
 * friends, builds, recruits, forges claims, picks wars it can win and makes peace. Vassals and
 * tributaries weigh their loyalty against their strength. At war, each army re-plans every few days:
 * strike enemy armies it can beat, besiege enemy land, or fall back to a fortress.
 */
import { BUILDING_ORDER, BUILDINGS } from '../data/buildings';
import { unitDef } from '../data/units';
import { TECH_TRACKS } from '../data/techs';
import { TRAITS } from '../data/traits';
import { holySites } from './beliefs';
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
import { buildingEffect, canBuild, canDevelop, develop, fortLevel, income, repayLoan, startBuilding } from './economy';
import { acceptCulture, adoptFaith, canAcceptCulture, cultureShares, diversity, faithsToAdopt } from './faith';
import { holyWarGoals, unbelievers, wagesHolyWar } from './holywars';
import { canReform, militaryEra, reform, reformOptions } from './tech';
import { changeLaw, estateInfluence, estateLoyalty, grantPrivilege, lawCooldown } from './politics';
import { revoltRisk } from './revolts';
import { log } from './log';
import { modifierEffect } from './modifiers';
import { availableMaa, detach, disband, inBattle, mergeInto, orderMove, raiseArmy, recruit } from './military';
import { freeTransport } from './naval';
import { navyAI } from './navalAi';
import { colonyAI } from './colonies';
import { decisionsAI } from './decisions';
import { espionageAI } from './espionage';
import { toDate } from './calendar';
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
import {
  ESTATES,
  type Army,
  type BuildingType,
  type Country,
  type CouncilSeat,
  type EstateId,
  type GameState,
  type PactKind,
  type PeaceTerms,
  type TaskId,
  type UnitType,
  type War,
} from './types';
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
  let a = modifierEffect(c, 'aggression');
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
  if (c.rebel) {
    // Rebels have one war and one purpose.
    if (c.manpower > 300) raiseArmy(state, world, c);
    for (const w of warsOf(state, c.index)) considerPeace(state, world, c, w);
    return;
  }
  const month = toDate(state.day).m;
  politicsAI(state, c);
  faithAI(state, world, c);
  techAI(state, c);
  navyAI(state, world, c);
  colonyAI(state, world, c, month);
  espionageAI(state, world, c);
  if (month === 1) decisionsAI(state, world, c);
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
  if (c.overlord) considerIndependence(state, world, c);
}

// ── Politics ──────────────────────────────────────────────────────

/** The council's tasks that suit the moment: the AI sets them, and the player's councillors recommend them. */
export function councilPlan(state: GameState, c: Country): Record<CouncilSeat, TaskId> {
  const fighting = warsOf(state, c.index).length > 0;
  const d = diversity(state, c);
  const rich = c.gold > Math.max(200, c.lastBalance * 12);
  const unrest = ESTATES.some((e) => revoltRisk(state, c, e) > 0) || state.factions.some((f) => f.realm === c.index);
  return {
    chancellor: c.fabricating ? 'claims' : fighting ? 'negotiate' : 'embassies',
    marshal: fighting ? 'drill' : 'levies',
    steward: !fighting && d.foreign >= 0.2 && c.lastBalance > 0 ? 'assimilate' : rich ? 'develop' : 'taxes',
    chaplain:
      c.legitimacy < 40
        ? 'legitimacy'
        : c.stability < 1
          ? 'stability'
          : d.sister + d.heathen > 0.02
            ? 'convert'
            : c.legitimacy < 60
              ? 'legitimacy'
              : 'stability',
    spymaster: unrest ? (fighting ? 'sieges' : 'watch') : fighting ? 'sieges' : c.spyTarget ? 'network' : 'watch',
  };
}

/** An estate close to revolt that a privilege would calm. */
export function estateOnTheBrink(state: GameState, c: Country): EstateId | null {
  for (const e of ESTATES) if (!c.estates[e].privileged && revoltRisk(state, c, e) > 0) return e;
  return null;
}

function politicsAI(state: GameState, c: Country) {
  const fighting = warsOf(state, c.index).length > 0;
  const loyal = (e: EstateId) => estateLoyalty(state, c, e).total;
  Object.assign(c.tasks, councilPlan(state, c));
  const d = diversity(state, c);
  // A privilege to calm an estate on the brink.
  const brink = estateOnTheBrink(state, c);
  if (brink) {
    grantPrivilege(state, c, brink);
    return;
  }
  if (lawCooldown(state, c) > 0 || !chance(state, 0.1)) return;
  const commons = loyal('commons'),
    burghers = loyal('burghers'),
    nobles = loyal('nobles');
  const poor = c.loans.length > 0 || c.lastBalance < 0;
  const l = c.laws;
  const vassals = vassalsOf(state, c.index);
  // Rulers bear some grumbling before they give way; the greedy bear more.
  const greed = aggression(state, c) > 0.2 ? 10 : 0;
  if ((commons < -25 - greed || burghers < -25 - greed) && l.taxation > 1)
    changeLaw(state, c, 'taxation', l.taxation - 1);
  else if (poor && l.taxation < 2 && commons > -5 && burghers > -5) changeLaw(state, c, 'taxation', l.taxation + 1);
  else if (c.loans.length >= 2 && l.taxation === 2 && commons > -15) changeLaw(state, c, 'taxation', 3);
  else if (fighting && l.conscription < 2 && commons > 10) changeLaw(state, c, 'conscription', l.conscription + 1);
  else if (!fighting && l.conscription > 1 && commons < 10) changeLaw(state, c, 'conscription', l.conscription - 1);
  else if ((state.factions.some((f) => f.realm === c.index) || nobles < -20) && l.crown > 0)
    changeLaw(state, c, 'crown', l.crown - 1);
  else if (vassals.length && nobles > 20 && l.crown < 2 && c.legitimacy >= 60)
    changeLaw(state, c, 'crown', l.crown + 1);
  else {
    // Tolerance where unbelievers are many; persecution only under a zealous ruler with few of them.
    const others = d.heathen + d.sister * 0.5;
    const pious = character(state, c.ruler)?.traits.includes('pious');
    if (l.tolerance < 2 && others > 0.35) changeLaw(state, c, 'tolerance', l.tolerance + 1);
    else if (l.tolerance === 2 && others < 0.15) changeLaw(state, c, 'tolerance', 1);
    else if (l.tolerance === 1 && pious && others > 0.02 && others < 0.15 && commons > 0)
      changeLaw(state, c, 'tolerance', 0);
    else if (l.tolerance === 0 && (others >= 0.25 || commons < -20)) changeLaw(state, c, 'tolerance', 1);
  }
}

/**
 * Scholars favour the track that lags, or the art of war in wartime. New forms of government are
 * taken up as history offers them: absolutism for strong crowns, a constitution where the towns
 * are powerful, democracy where the people are restless; the new tyrannies come only in a crisis.
 */
function techAI(state: GameState, c: Country) {
  const fighting = warsOf(state, c.index).length > 0;
  c.focus = fighting ? 'military' : [...TECH_TRACKS].sort((a, b) => c.tech[a] - c.tech[b])[0];
  if (c.liege || !chance(state, 0.02)) return;
  const options = reformOptions(c);
  if (!options.length) return;
  const share = estateInfluence(state, c).share;
  const crisis = c.stability < 0 && c.legitimacy < 30;
  const pick = (g: (typeof options)[number]) => options.includes(g) && canReform(state, c, g).ok;
  const choice = (
    [
      ['feudal', c.gov === 'tribal' || c.gov === 'nomadic' || c.gov === 'clan'],
      [
        'absolute',
        (c.gov === 'feudal' || c.gov === 'clan' || c.gov === 'imperial') && c.legitimacy >= 45 && chance(state, 0.25),
      ],
      ['constitutional', (c.gov === 'absolute' || c.gov === 'feudal') && share.burghers >= 0.3 && chance(state, 0.12)],
      // The people must be strong, and the old order worn out, before a crown gives way to the vote.
      [
        'democracy',
        (c.gov === 'constitutional' || c.gov === 'republic') &&
          share.burghers + share.commons >= 0.62 &&
          chance(state, 0.15),
      ],
      ['communist', crisis && chance(state, 0.2)],
      ['dictatorship', crisis && chance(state, 0.3)],
    ] as [(typeof options)[number], boolean][]
  ).find(([g, want]) => want && pick(g));
  if (choice) reform(state, c, choice[0]);
}

/** A great people of the realm (a fifth of it) worth accepting, when the crown can afford the legitimacy. */
export function cultureToAccept(state: GameState, c: Country): string | null {
  for (const { culture, share } of cultureShares(state, c))
    if (share >= 0.2 && c.legitimacy >= 50 && canAcceptCulture(state, c, culture).ok) return culture;
  return null;
}

/** Great peoples of the realm are accepted; a pagan crown may take up the faith of a strong neighbour. */
function faithAI(state: GameState, world: SimWorld, c: Country) {
  if (chance(state, 0.05)) {
    const culture = cultureToAccept(state, c);
    if (culture) acceptCulture(state, c, culture);
  }
  if (!chance(state, 0.0015)) return;
  const options = faithsToAdopt(state, world, c);
  if (!options.length) return;
  // The faith of the mightiest neighbour, if it is mightier than we are.
  let best = '',
    might = strengthOf(state, c.index);
  for (const n of realmNeighbours(state, world, c.index)) {
    const o = state.countries[n];
    if (o && options.includes(o.religion) && strengthOf(state, n) > might) {
      might = strengthOf(state, n);
      best = o.religion;
    }
  }
  if (best && c.legitimacy >= 20) adoptFaith(state, world, c, best);
}

function economy(state: GameState, world: SimWorld, c: Country) {
  const monthly = income(state, c).total;
  // Pay debts first.
  for (let i = c.loans.length - 1; i >= 0; i--) if (c.gold > c.loans[i].amount * 1.5) repayLoan(c, i);
  if (c.loans.length) return;
  // Gold beyond the floor is beyond any need: the realm keeps more soldiers, and puts the rest into the land.
  const { reserve, floor } = treasuryMarks(monthly);
  // Keep some men-at-arms: their upkeep at home up to a quarter of income, or two fifths for a rich realm.
  const share = c.gold > floor ? 0.4 : 0.25;
  const era = militaryEra(c);
  let upkeep = 0;
  for (const [t, men] of Object.entries(c.reserve) as [UnitType, number][])
    upkeep += (men / 100) * unitDef(t, era).reserveUpkeep;
  const types = availableMaa(c);
  const regiments = 1 + Math.floor(monthly / 25);
  for (let i = 0; i < regiments && upkeep < monthly * share && c.gold > 60; i++) {
    const pool: UnitType[] = types.filter((x) => x !== 'siege');
    if (types.includes('siege') && chance(state, 0.2)) pool.push('siege');
    const t = pick(state, pool);
    if (!recruit(c, t, 1)) break;
    upkeep += unitDef(t, era).reserveUpkeep * (unitDef(t, era).regiment / 100);
  }
  // Build the most useful things it can afford, keeping a reserve; big realms build several at once.
  if (state.day < c.ai.nextBuild) return;
  const own = provincesOf(state, c.index);
  const projects = 1 + Math.floor(own.length / 20);
  // What could be built and what each is worth, worked out once: each project changes only the gold
  // left and the province where it goes up.
  const options = c.gold >= reserve + 50 ? buildingOptions(state, world, c, reserve) : [];
  const building = new Set<number>();
  for (let n = 0; n < projects && c.gold >= reserve + 50; n++) {
    let best: (typeof options)[number] | null = null;
    for (const o of options) {
      if (building.has(o.id) || c.gold - o.cost < reserve) continue;
      if (!best || o.value > best.value) best = o;
    }
    if (!best) break;
    startBuilding(state, world, c.index, best.id, best.type);
    building.add(best.id);
  }
  c.ai.nextBuild = state.day + 45;
  // The most productive provinces first.
  if (c.gold > floor) invest(state, world, c, own, floor);
}

export interface BuildOption {
  id: number;
  type: BuildingType;
  /** worth for each gold spent */
  value: number;
  cost: number;
}

/** What the realm could build now, keeping `reserve` gold, and what each is worth for its cost. */
export function buildingOptions(state: GameState, world: SimWorld, c: Country, reserve: number): BuildOption[] {
  const own = provincesOf(state, c.index);
  // Learning pays less with every school already built.
  const schools = own.reduce((n, id) => n + (state.provinces[id].buildings.university ?? 0), 0);
  const options: BuildOption[] = [];
  for (const id of own) {
    const p = state.provinces[id];
    for (const type of BUILDING_ORDER) {
      const check = canBuild(state, world, c.index, id, type);
      if (!check.ok || c.gold - check.cost < reserve) continue;
      const e = BUILDINGS[type].effects;
      let value = p.dev * ((e.tax ?? 0) * 1.2 + (e.levy ?? 0) * 0.6 + (e.growth ?? 0) * 0.3);
      if (e.research) value += (e.research * 10) / Math.sqrt(1 + schools) + p.dev * 0.05;
      if (e.fort) value = id === c.capital || p.dev >= 10 ? 1.5 + p.dev * 0.1 : 0.3;
      value /= check.cost;
      options.push({ id, type, value, cost: check.cost });
    }
  }
  return options;
}

/** A province's worth to develop, for each gold a point costs (0 where it cannot be developed). */
export function developOption(state: GameState, world: SimWorld, c: Country, id: number) {
  const check = canDevelop(state, world, c.index, id);
  if (!check.ok) return { id, value: 0, cost: Infinity };
  const p = state.provinces[id];
  return {
    id,
    value: (1 + buildingEffect(p, 'tax') + buildingEffect(p, 'levy') * 0.5) / check.cost,
    cost: check.cost,
  };
}

/** Gold a realm keeps against a bad month, and the treasury beyond which gold is better spent. */
export function treasuryMarks(monthlyIncome: number): { reserve: number; floor: number } {
  const reserve = Math.max(30, monthlyIncome * 3);
  return { reserve, floor: Math.max(reserve * 3, monthlyIncome * 24) };
}

/** Puts spare gold into developing the realm's own provinces, a few points a month. */
function invest(state: GameState, world: SimWorld, c: Country, own: number[], floor: number) {
  const points = 1 + Math.floor(own.length / 8);
  // Each province's worth and cost, worked out once and again only where a point went.
  const option = (id: number) => developOption(state, world, c, id);
  const options = own.map(option);
  for (let n = 0; n < points; n++) {
    let best = -1,
      value = 0;
    for (let i = 0; i < options.length; i++) {
      const o = options[i];
      if (c.gold - o.cost < floor) continue;
      if (o.value > value) {
        value = o.value;
        best = i;
      }
    }
    if (best < 0) return;
    develop(state, world, c.index, options[best].id);
    options[best] = option(options[best].id);
  }
}

/** Can this realm expect to beat that one, friends included? Above 1 it is the stronger. */
export function odds(state: GameState, attacker: number, target: number): number {
  return offensiveStrength(state, attacker) / Math.max(1, defensiveStrength(state, target));
}

/** Realms we may not attack: friends, protégés, those bound to us. */
export function offLimits(state: GameState, c: number, t: number): boolean {
  return (
    !!state.countries[t]?.rebel ||
    hasPact(state, 'alliance', c, t) ||
    hasPact(state, 'nap', c, t) ||
    hasPact(state, 'guarantee', c, t) ||
    lordOf(state, t) === c ||
    lordOf(state, c) === t
  );
}

/**
 * Provinces of weaker neighbours on the border that a claim could be forged on, keeping a reserve of
 * gold, with what each is worth: its development by the odds, more for our own people.
 */
export function claimCandidates(
  state: GameState,
  world: SimWorld,
  c: Country,
): { id: number; target: number; ratio: number; value: number }[] {
  const reserve = Math.max(40, income(state, c).total * 2);
  const out: { id: number; target: number; ratio: number; value: number }[] = [];
  for (const t of realmNeighbours(state, world, c.index)) {
    if (offLimits(state, c.index, t) || !state.countries[t]?.alive) continue;
    const ratio = odds(state, c.index, t);
    if (ratio < 1.4) continue;
    for (const id of borderProvinces(state, world, c.index, t)) {
      if (!canFabricate(state, world, c.index, id).ok || c.gold - fabricationCost(state, id) < reserve) continue;
      const p = state.provinces[id];
      out.push({ id, target: t, ratio, value: p.dev * Math.min(3, ratio) + (p.culture === c.culture ? 4 : 0) });
    }
  }
  return out;
}

/** An ambitious realm sets its chancellor to forge a claim on a weaker neighbour. */
function planClaims(state: GameState, world: SimWorld, c: Country) {
  if (c.liege || c.fabricating || c.claims.length >= 2 || c.stability < 0 || c.loans.length) return;
  const appetite = 0.18 + aggression(state, c) * 0.25;
  if (!chance(state, Math.max(0.02, appetite * 0.6))) return;
  let best: { id: number; value: number } | null = null;
  for (const o of claimCandidates(state, world, c)) {
    const value = o.value + random(state);
    if (!best || value > best.value) best = { id: o.id, value };
  }
  if (best) startFabrication(state, world, c.index, best.id);
}

/** Claims the realm could go to war for now, with odds good enough for the AI to try (1.4 or better). */
export function claimWars(
  state: GameState,
  world: SimWorld,
  c: Country,
): { goal: number; target: number; ratio: number; value: number }[] {
  const out: { goal: number; target: number; ratio: number; value: number }[] = [];
  for (const id of c.claims) {
    const o = state.provinces[id]?.owner ?? 0;
    if (!o) continue;
    const t = topLiege(state, o);
    const ratio = odds(state, c.index, t);
    if (ratio < 1.4 || !canDeclare(state, world, c.index, t, 'claim', id).ok) continue;
    out.push({ goal: id, target: t, ratio, value: state.provinces[id].dev * Math.min(3, ratio) });
  }
  return out.sort((a, b) => b.value - a.value);
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
    if (bal.coalition >= bal.target * 1.1 && canDeclare(state, world, c.index, co.target, 'coalition', 0).ok) {
      declareWar(state, world, c.index, co.target, 'coalition', 0);
      return;
    }
  }
  // Throne claims are pressed when the ruler has the stomach for it (checked a few times a year).
  const appetite = 0.18 + aggression(state, c) * 0.25;
  if (chance(state, Math.max(0.03, appetite) / 3))
    for (const t of c.throneClaims) {
      const target = state.countries[t];
      if (target?.alive && odds(state, c.index, t) > 0.9 && canDeclare(state, world, c.index, t, 'throne', t).ok) {
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
    if (ratio < 1.4 || !canDeclare(state, world, c.index, t, 'claim', id).ok) continue;
    const value = state.provinces[id].dev * Math.min(3, ratio) + random(state);
    if (!best || value > best.value) best = { target: t, goal: id, value };
  }
  if (best) {
    declareWar(state, world, c.index, best.target, 'claim', best.goal);
    return;
  }
  // A holy war on unbelievers next door, more readily under a pious ruler.
  const traits = character(state, c.ruler)?.traits ?? [];
  const zeal = traits.includes('pious') ? 0.1 : traits.includes('cynical') ? -0.04 : 0;
  if (
    wagesHolyWar(c) &&
    state.day >= (c.ai.nextHolyWar ?? 0) &&
    chance(state, Math.max(0.02, 0.06 + zeal + aggression(state, c) * 0.1))
  ) {
    let holy: { target: number; goal: number; value: number } | null = null;
    for (const t of realmNeighbours(state, world, c.index)) {
      if (offLimits(state, c.index, t) || !unbelievers(state, c.index, t)) continue;
      const ratio = odds(state, c.index, t);
      if (ratio < 2) continue;
      const goals = holyWarGoals(state, world, c.index, t);
      if (!goals.length || !canDeclare(state, world, c.index, t, 'holy', goals[0]).ok) continue;
      for (const id of goals) {
        const site = holySiteOf(c, id) ? 10 : 0;
        const value = state.provinces[id].dev * Math.min(3, ratio) + site + random(state);
        if (!holy || value > holy.value) holy = { target: t, goal: id, value };
      }
    }
    if (holy) {
      declareWar(state, world, c.index, holy.target, 'holy', holy.goal);
      // The faithful have had their holy war for a while.
      c.ai.nextHolyWar = state.day + 365 * 8;
      return;
    }
  }
  // A warlike ruler may attack a much weaker neighbour without any cause; a horde attacks anyone.
  const hunger = modifierEffect(c, 'aggression');
  if (aggression(state, c) < 0.3 || c.stability < 1 || !chance(state, Math.min(0.6, 0.1 + hunger * 0.15))) return;
  let prey: { target: number; ratio: number } | null = null;
  for (const t of realmNeighbours(state, world, c.index)) {
    if (offLimits(state, c.index, t) || !canDeclare(state, world, c.index, t, 'conquest', 0).ok) continue;
    const ratio = odds(state, c.index, t);
    if (ratio >= (hunger > 0 ? 1.2 : 2.5) && (!prey || ratio > prey.ratio)) prey = { target: t, ratio };
  }
  if (prey) declareWar(state, world, c.index, prey.target, 'conquest', 0);
}

function holySiteOf(c: Country, province: number): boolean {
  return holySites(c.religion).includes(province);
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

/** The realm within 1,500 km that the realm would most like as an ally, if any would do. */
export function bestAlly(state: GameState, world: SimWorld, c: Country): Country | null {
  let best: { o: Country; want: number } | null = null;
  for (const o of state.countries) {
    if (!o?.alive || o.liege || o.index === c.index || o.overlord) continue;
    if (capitalKm(world, c, o) > 1500) continue;
    if (!canPropose(state, 'alliance', c.index, o.index).ok) continue;
    const want = pactWillingness(state, world, 'alliance', c.index, o.index).total;
    if (want >= 0 && (!best || want > best.want)) best = { o, want };
  }
  return best?.o ?? null;
}

function seekAlliance(state: GameState, world: SimWorld, c: Country) {
  if (c.overlord || alliesOf(state, c.index).length >= 2) return;
  const o = bestAlly(state, world, c);
  if (!o) return;
  if (o.index === state.player) proposeToPlayerPact(state, c, 'alliance');
  else if (pactWillingness(state, world, 'alliance', o.index, c.index).total >= 0) sign(state, 'alliance', c, o);
}

/** The dangerous neighbour the realm would first seek a non-aggression pact with, if any. */
export function napCandidate(state: GameState, world: SimWorld, c: Country): Country | null {
  for (const t of threatsTo(state, world, c.index)) {
    const o = state.countries[t];
    if (!o?.alive || o.liege || !canPropose(state, 'nap', c.index, t).ok) continue;
    if (pactWillingness(state, world, 'nap', c.index, t).total < 0) continue;
    return o;
  }
  return null;
}

/** Peace with a dangerous neighbour buys time. */
function seekNap(state: GameState, world: SimWorld, c: Country) {
  const o = napCandidate(state, world, c);
  if (!o) return;
  if (o.index === state.player) proposeToPlayerPact(state, c, 'nap');
  else if (pactWillingness(state, world, 'nap', o.index, c.index).total >= 0) sign(state, 'nap', c, o);
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

/** A small, loyal vassal (a county, loyalty 25 or more) the realm could integrate. */
export function vassalToIntegrate(state: GameState, world: SimWorld, c: Country): Country | null {
  for (const v of vassalsOf(state, c.index)) {
    if (v.rank !== 'county' || v.index === state.player) continue;
    if (loyalty(state, world, v.index).total < 25 || !canIntegrate(state, world, c.index, v.index).ok) continue;
    return v;
  }
  return null;
}

/** A liege absorbs a small, loyal vassal now and then. Great vassals (duchies and up) are left be. */
function considerIntegration(state: GameState, world: SimWorld, c: Country) {
  if (c.integrating || warsOf(state, c.index).length || !chance(state, 0.1)) return;
  const v = vassalToIntegrate(state, world, c);
  if (v) startIntegration(state, world, c.index, v.index);
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
  const terms = bestTerms(state, world, war, c.index, score);
  if (terms) {
    if (enemy === state.player) proposeToPlayer(state, war, c.index, terms);
    else if (peaceAcceptance(state, world, war, c.index, terms).accept) {
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
    } else if (peaceAcceptance(state, world, war, c.index, white).accept) endWar(state, world, war, null, white);
  }
}

/** The most this side can ask for with its war score, or null if nothing worth asking. */
function bestTerms(state: GameState, world: SimWorld, war: War, from: number, score: number): PeaceTerms | null {
  if (score < 15) return null;
  const side = winnerSide(war, from);
  const allowed = allowedTerms(state, war, side);
  const us = side === 'attacker' ? war.attackers : war.defenders;
  const them = side === 'attacker' ? war.defenders : war.attackers;
  const terms: PeaceTerms = { provinces: [], gold: 0 };
  if (allowed.throne) {
    terms.throne = true;
    return peaceCost(state, world, war, side, terms) <= score ? terms : null;
  }
  if (allowed.independence) {
    terms.independence = true;
    return peaceCost(state, world, war, side, terms) <= score ? terms : null;
  }
  if (allowed.demands) {
    terms.demands = true;
    return peaceCost(state, world, war, side, terms) <= score ? terms : null;
  }
  if (allowed.crush) {
    terms.crush = true;
    return peaceCost(state, world, war, side, terms) <= score ? terms : null;
  }
  if (allowed.holyLand) {
    // The Holy Land first, then what gold the rest of the score will buy.
    terms.holyLand = true;
    if (peaceCost(state, world, war, side, terms) > score) return null;
    const loser = state.countries[war.defender];
    const left = score - peaceCost(state, world, war, side, terms);
    if (left > 5 && loser.gold > 20)
      terms.gold = Math.floor(Math.min(loser.gold, (left / 25) * income(state, loser).total * 12));
    return terms;
  }
  if (!allowed.spoils) return null;
  // The war goal, then claims we hold, then other occupied land by value.
  const winner = state.countries[from];
  const candidates: number[] = [];
  if ((war.cb === 'claim' || war.cb === 'holy') && side === 'attacker') candidates.push(war.goal);
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
    if (peaceCost(state, world, war, side, trial) <= score) terms.provinces = trial.provinces;
  }
  const loser = state.countries[side === 'attacker' ? war.defender : war.attacker];
  // Nothing to take, but the enemy is beaten: make it pay tribute.
  if (
    !terms.provinces.length &&
    allowed.tributary &&
    peaceCost(state, world, war, side, { ...terms, tributary: true }) <= score
  )
    terms.tributary = true;
  const left = score - peaceCost(state, world, war, side, terms);
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
  // Crusaders go to the Holy Land, however far.
  const holy = state.wars
    .filter((w) => w.cb === 'crusade' && w.attackers.includes(army.owner))
    .map((w) => world.region(w.goal));
  for (const e of enemies)
    for (const id of provincesOf(state, e)) {
      const q = state.provinces[id];
      if (!enemies.has(q.controller)) continue;
      const r = world.region(id);
      const km = distanceKm(here, r);
      const crusade = holy.some((g) => distanceKm(g, r) <= 500);
      if (km > 2500 && !crusade) continue;
      const defended = hostile.some((h) => h.location === id && armySize(h) > size * 0.8);
      if (defended) continue;
      const fort = fortLevel(state, id);
      const goalBonus = state.wars.some(
        (w) => w.goal === id || (w.cb === 'throne' && state.countries[w.goal]?.capital === id),
      )
        ? 25
        : 0;
      const far = crusade ? km / 100 - 30 : km / 25;
      targets.push({ id, score: q.dev * 2 + goalBonus - far - fort * 4 });
    }
  targets.sort((a, b) => b.score - a.score);
  // The best few, in case some cannot be reached.
  for (const t of targets.slice(0, 4))
    if (orderMove(state, world, army, t.id)) {
      army.objective = t.id;
      return;
    }
  // Too many for the ships: send over what they can carry.
  const room = here.kind === 'land' && here.coastal ? freeTransport(state, world, army.owner) : 0;
  if (targets.length && room >= 1000 && room < size) {
    const force = detach(state, army, room * 0.95);
    if (!force) return;
    for (const t of targets.slice(0, 4))
      if (orderMove(state, world, force, t.id)) {
        force.objective = t.id;
        return;
      }
    mergeInto(state, army, force);
  }
}

/** The coalition a country could lead against a target, for the UI. */
export function coalitionLeader(state: GameState, target: number): number {
  const co = coalitionAgainst(state, target);
  if (!co) return 0;
  return [...co.members].sort((a, b) => strengthOf(state, b) - strengthOf(state, a))[0] ?? 0;
}
