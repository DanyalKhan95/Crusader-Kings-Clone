/**
 * What a player may do. Every order is checked here, so the UI can call these directly and show the
 * reason when something is not possible.
 */
import { appoint } from './characters';
import {
  canFabricate,
  canIntegrate,
  canJoinCoalition,
  canPropose,
  cancelPact,
  giftCost,
  joinCoalition,
  leaveCoalition,
  mayEnter,
  pactWillingness,
  PACT_INFO,
  release,
  remember,
  sendGift,
  signPact,
  startFabrication,
  startIntegration,
} from './diplomacy';
import { canBuild, income, repayLoan, startBuilding, takeLoan } from './economy';
import { log } from './log';
import { disband, inBattle, mergeInto, orderMove, raiseArmy, recruit, split } from './military';
import { armyById, lordOf, sideOf } from './queries';
import type { BuildingType, CasusBelli, CouncilSeat, GameState, PactKind, PeaceTerms, UnitType } from './types';
import {
  callReason,
  canDeclare,
  canLeaveWar,
  declareWar,
  endWar,
  joinWar,
  leaveWar,
  peaceAcceptance,
  refuseCall,
  winnerSide,
} from './war';
import type { SimWorld } from './world';

export type Result = { ok: true; message?: string } | { ok: false; reason: string };

const ok = (message?: string): Result => ({ ok: true, message });
const no = (reason: string): Result => ({ ok: false, reason });

export function moveArmy(state: GameState, world: SimWorld, armyId: number, to: number): Result {
  const army = armyById(state, armyId);
  if (!army || army.owner !== state.player) return no('Not your army');
  if (inBattle(state, army)) return no('The army is in battle');
  if (army.retreating) return no('The army is retreating');
  if (!mayEnter(state, army.owner, to)) {
    const owner = state.countries[state.provinces[to]?.owner ?? 0];
    return no(`${owner?.name ?? 'They'} will not let your armies in: ask for military access`);
  }
  if (!orderMove(state, world, army, to))
    return no('No route there: the way is barred by realms that give you no access');
  army.objective = 0;
  return ok();
}

export function raise(state: GameState, world: SimWorld): Result {
  const c = state.countries[state.player];
  const army = raiseArmy(state, world, c);
  return army ? ok(`${army.name} gathers at ${world.region(army.location).name}.`) : no('No men to raise');
}

export function disbandArmy(state: GameState, armyId: number): Result {
  const army = armyById(state, armyId);
  if (!army || army.owner !== state.player) return no('Not your army');
  return disband(state, army) ? ok() : no('The army is in battle');
}

export function mergeArmies(state: GameState, ids: number[]): Result {
  const armies = ids.map((id) => armyById(state, id)).filter((a) => a && a.owner === state.player);
  if (armies.length < 2) return no('Select two armies of yours');
  const [first, ...rest] = armies;
  for (const a of rest) {
    if (a!.location !== first!.location) return no('Armies must stand in the same province');
    if (inBattle(state, a!) || inBattle(state, first!)) return no('An army is in battle');
  }
  for (const a of rest) mergeInto(state, first!, a!);
  first!.path = [];
  return ok();
}

export function splitArmy(state: GameState, armyId: number): Result {
  const army = armyById(state, armyId);
  if (!army || army.owner !== state.player) return no('Not your army');
  return split(state, army) ? ok() : no('Too small to split');
}

export function recruitMaa(state: GameState, type: UnitType, regiments = 1): Result {
  const c = state.countries[state.player];
  return recruit(c, type, regiments) ? ok() : no('Not enough gold');
}

export function build(state: GameState, world: SimWorld, province: number, type: BuildingType): Result {
  const check = canBuild(state, world, state.player, province, type);
  if (!check.ok) return no(check.reason);
  startBuilding(state, world, state.player, province, type);
  return ok();
}

export function borrow(state: GameState): Result {
  return takeLoan(state, state.countries[state.player]) ? ok() : no('No one will lend you more');
}

export function repay(state: GameState, index: number): Result {
  return repayLoan(state.countries[state.player], index) ? ok() : no('Not enough gold');
}

export function appointCouncillor(state: GameState, seat: CouncilSeat, characterId: number): Result {
  const c = state.countries[state.player];
  const all = [...c.courtiers, ...Object.values(c.council)];
  if (!all.includes(characterId)) return no('Not at your court');
  appoint(state, c, seat, characterId);
  return ok();
}

export function declare(state: GameState, world: SimWorld, target: number, cb: CasusBelli, goal: number): Result {
  const check = canDeclare(state, state.player, target, cb, goal);
  if (!check.ok) return no(check.reason);
  declareWar(state, world, state.player, target, cb, goal);
  return ok();
}

/** Offers terms to the enemy leader; the AI answers at once. */
export function offerPeace(state: GameState, world: SimWorld, warId: number, terms: PeaceTerms): Result {
  const war = state.wars.find((w) => w.id === warId);
  if (!war) return no('No such war');
  if (war.attacker !== state.player && war.defender !== state.player) return no('Only the war leader can make peace');
  const answer = peaceAcceptance(state, war, state.player, terms);
  if (!answer.accept) return no(answer.reason);
  endWar(state, world, war, terms.white ? null : winnerSide(war, state.player), terms);
  return ok();
}

/** Leaves a war fought for someone else, with nothing gained or lost. */
export function separatePeace(state: GameState, warId: number): Result {
  const war = state.wars.find((w) => w.id === warId);
  if (!war) return no('No such war');
  const check = canLeaveWar(state, war, state.player);
  if (!check.ok) return no(check.reason);
  leaveWar(state, war, state.player);
  return ok('You have made a separate peace.');
}

/** Answers an AI proposal: peace terms, a call to arms or a treaty. */
export function answerOffer(state: GameState, world: SimWorld, offerId: number, accept: boolean): Result {
  const offer = state.offers.find((o) => o.id === offerId);
  if (!offer) return no('The offer has lapsed');
  state.offers = state.offers.filter((o) => o !== offer);
  if (offer.kind === 'pact') {
    const from = state.countries[offer.from];
    if (!from?.alive) return no('They are no more');
    if (!accept) {
      remember(state, offer.from, offer.to, 'refused', -20);
      return ok();
    }
    const check = canPropose(state, offer.pact, offer.from, offer.to);
    if (!check.ok) return no(check.reason);
    signPact(state, offer.pact, offer.from, offer.to);
    log(state, [offer.from, offer.to], 'diplomacy', `${PACT_INFO[offer.pact].name} signed with ${from.name}.`);
    return ok();
  }
  const war = state.wars.find((w) => w.id === offer.war);
  if (!war) return no('The war is already over');
  if (offer.kind === 'call') {
    const side = sideOf(war, offer.from);
    if (!side) return no('They are no longer in that war');
    if (accept) joinWar(state, war, offer.to, side);
    else refuseCall(state, war, offer.to, side, callReason(state, war, offer.to, side));
    return ok();
  }
  if (!accept) return ok();
  endWar(state, world, war, offer.terms.white ? null : winnerSide(war, offer.from), offer.terms);
  return ok();
}

// ── Diplomacy ─────────────────────────────────────────────────────

/** Proposes a treaty; the AI answers at once. A guarantee needs no one's consent. */
export function proposePact(state: GameState, world: SimWorld, kind: PactKind, target: number): Result {
  const check = canPropose(state, kind, state.player, target);
  if (!check.ok) return no(check.reason);
  const t = state.countries[target];
  if (kind !== 'guarantee') {
    const will = pactWillingness(state, world, kind, target, state.player);
    if (will.total < 0) return no(`${t.name} declines.`);
  }
  signPact(state, kind, state.player, target);
  log(state, [state.player, target], 'diplomacy', `${PACT_INFO[kind].name}: ${t.name} agrees.`);
  return ok(kind === 'guarantee' ? `You now guarantee ${t.name}.` : `${t.name} accepts.`);
}

export function cancelTreaty(state: GameState, kind: PactKind, target: number): Result {
  if (!cancelPact(state, kind, state.player, target)) return no('There is no such treaty');
  return ok();
}

export function gift(state: GameState, target: number): Result {
  const cost = giftCost(income(state, state.countries[target]).total);
  if (!sendGift(state, state.player, target, cost)) return no(`A fitting gift costs ${cost} gold`);
  return ok(`${state.countries[target].name} receives your gift of ${cost} gold.`);
}

export function fabricate(state: GameState, world: SimWorld, province: number): Result {
  const check = canFabricate(state, world, state.player, province);
  if (!check.ok) return no(check.reason);
  startFabrication(state, world, state.player, province);
  return ok(`Your chancellor begins to forge a claim on ${world.region(province).name}.`);
}

export function cancelFabrication(state: GameState): Result {
  const c = state.countries[state.player];
  if (!c.fabricating) return no('No claim is being forged');
  c.fabricating = null;
  return ok();
}

export function joinCoalitionAgainst(state: GameState, target: number): Result {
  const check = canJoinCoalition(state, state.player, target);
  if (!check.ok) return no(check.reason);
  joinCoalition(state, state.player, target);
  return ok(`You join the coalition against ${state.countries[target].name}.`);
}

export function leaveCoalitionAgainst(state: GameState, target: number): Result {
  leaveCoalition(state, state.player, target);
  return ok();
}

export function integrate(state: GameState, world: SimWorld, vassal: number): Result {
  const check = canIntegrate(state, world, state.player, vassal);
  if (!check.ok) return no(check.reason);
  startIntegration(state, world, state.player, vassal);
  return ok(`The integration of ${state.countries[vassal].name} begins.`);
}

export function stopIntegration(state: GameState): Result {
  const c = state.countries[state.player];
  if (!c.integrating) return no('No integration under way');
  c.integrating = null;
  state.diploVersion++;
  return ok();
}

/** Frees a vassal or tributary; it will remember the kindness. */
export function releaseSubject(state: GameState, subject: number): Result {
  if (lordOf(state, subject) !== state.player) return no('They do not answer to you');
  release(state, subject);
  remember(state, subject, state.player, 'freed_us', 40);
  log(state, [state.player, subject], 'diplomacy', `${state.countries[subject].name} is free.`);
  return ok();
}
