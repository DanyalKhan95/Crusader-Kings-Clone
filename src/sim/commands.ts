/**
 * What a player may do. Every order is checked here, so the UI can call these directly and show the
 * reason when something is not possible.
 */
import { appoint } from './characters';
import { canBuild, repayLoan, startBuilding, takeLoan } from './economy';
import { disband, inBattle, mergeInto, orderMove, raiseArmy, recruit, split } from './military';
import { armyById } from './queries';
import type { BuildingType, CasusBelli, CouncilSeat, GameState, PeaceTerms, UnitType } from './types';
import { canDeclare, declareWar, endWar, peaceAcceptance, winnerSide } from './war';
import type { SimWorld } from './world';

export type Result = { ok: true; message?: string } | { ok: false; reason: string };

const ok = (message?: string): Result => ({ ok: true, message });
const no = (reason: string): Result => ({ ok: false, reason });

export function moveArmy(state: GameState, world: SimWorld, armyId: number, to: number): Result {
  const army = armyById(state, armyId);
  if (!army || army.owner !== state.player) return no('Not your army');
  if (inBattle(state, army)) return no('The army is in battle');
  if (army.retreating) return no('The army is retreating');
  if (!orderMove(state, world, army, to)) return no('No route there');
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
  const check = canDeclare(state, world, state.player, target, cb, goal);
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

export function answerOffer(state: GameState, world: SimWorld, offerId: number, accept: boolean): Result {
  const offer = state.offers.find((o) => o.id === offerId);
  if (!offer) return no('The offer has lapsed');
  state.offers = state.offers.filter((o) => o !== offer);
  const war = state.wars.find((w) => w.id === offer.war);
  if (!war) return no('The war is already over');
  if (!accept) return ok();
  endWar(state, world, war, offer.terms.white ? null : winnerSide(war, offer.from), offer.terms);
  return ok();
}
