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
import { canBuild, develop, income, repayLoan, startBuilding, takeLoan } from './economy';
import { cultureName, faithName } from './beliefs';
import {
  acceptCulture,
  adoptFaith,
  askBlessing,
  blessingCost,
  canAcceptCulture,
  canAdoptFaith,
  canAskBlessing,
  canAssimilate,
  canConvert,
  headOf,
  startAssimilation,
  startConversion,
  unacceptCulture,
} from './faith';
import { callHolyWar, canCallHolyWar, greatHolyWarOf } from './holywars';
import { canReform, reform, setFocus } from './tech';
import type { TechTrack } from '../data/techs';
import type { Government } from '../shared/dataTypes';
import { grouped, log } from './log';
import { canReach, disband, inBattle, mergeInto, orderMove, raiseArmy, recruit, split } from './military';
import { armyById, armySize, lordOf, sideOf } from './queries';
import { abandonColony, startColony } from './colonies';
import { knows, knowsWorld } from './exploration';
import {
  buildShips,
  buildTransports,
  canBuildShips,
  disbandFleet,
  fleetById,
  fleetInBattle,
  freeTransport,
  homePort,
  isOpenOcean,
  mayDock,
  mergeFleets,
  oceanGoing,
  orderFleet,
  splitFleet,
} from './naval';
import { canChangeLaw, changeLaw, grantPrivilege, invalidatePolitics, revokePrivilege, setTask } from './politics';
import { answerEvent } from './events';
import { canForm, formNation } from './decisions';
import { canPlot, canSpyOn, carryOut } from './espionage';
import { NATION_BY_ID } from '../data/nations';
import type { PlotId } from '../data/espionage';
import { factionWar, grantFreedom } from './revolts';
import type {
  BuildingType,
  CasusBelli,
  CouncilSeat,
  EstateId,
  GameState,
  LawId,
  Laws,
  PactKind,
  PeaceTerms,
  ShipType,
  TaskId,
  UnitType,
} from './types';
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
import { placeName } from './places';

export type Result = { ok: true; message?: string } | { ok: false; reason: string };

const ok = (message?: string): Result => ({ ok: true, message });
const no = (reason: string): Result => ({ ok: false, reason });

export function moveArmy(state: GameState, world: SimWorld, armyId: number, to: number): Result {
  const army = armyById(state, armyId);
  if (!army || army.owner !== state.player) return no('Not your army');
  if (inBattle(state, army)) return no('The army is in battle');
  if (army.retreating) return no('The army is retreating');
  if (world.region(to)?.kind !== 'land') return no('Armies march over land: send it to a coast');
  if (!knows(world, state.countries[army.owner], to)) return no('Your realm knows nothing of that land');
  if (!mayEnter(state, army.owner, to)) {
    const owner = state.countries[state.provinces[to]?.owner ?? 0];
    return no(`${owner?.name ?? 'They'} will not let your armies in: ask for military access`);
  }
  if (!orderMove(state, world, army, to)) {
    const afloat = freeTransport(state, world, army.owner);
    if (afloat < armySize(army) && canReach(state, world, army.owner, army.location, to, true))
      return no(
        `Not enough transports to carry ${grouped(armySize(army))} men over the sea: room for ${grouped(Math.max(0, afloat))}`,
      );
    return no('No route there: the way is barred by realms that give you no access');
  }
  army.objective = 0;
  return ok();
}

// ── The navy ──────────────────────────────────────────────────────

export function moveFleet(state: GameState, world: SimWorld, fleetId: number, to: number): Result {
  const fleet = fleetById(state, fleetId);
  if (!fleet || fleet.owner !== state.player) return no('Not your fleet');
  if (fleetInBattle(state, fleet)) return no('The fleet is in battle');
  if (fleet.retreating) return no('The fleet is making for port');
  const r = world.region(to);
  const c = state.countries[fleet.owner];
  if (r.kind === 'land' && !r.coastal) return no('Fleets sail the sea: choose a sea, or a port');
  if (r.kind === 'land' && !mayDock(state, fleet.owner, to)) return no('Your ships may put in only at friendly ports');
  if (r.kind !== 'land' && isOpenOcean(world, to) && !oceanGoing(c))
    return no('Your ships cannot cross the open ocean: that needs Cartography');
  if (!orderFleet(state, world, fleet, to)) return no('There is no way there by sea for your ships');
  fleet.mission = undefined;
  fleet.objective = 0;
  return ok();
}

export function returnToPort(state: GameState, world: SimWorld, fleetId: number): Result {
  const fleet = fleetById(state, fleetId);
  if (!fleet || fleet.owner !== state.player) return no('Not your fleet');
  if (fleetInBattle(state, fleet)) return no('The fleet is in battle');
  const home = homePort(state, world, fleet);
  if (!home) return no('No port of yours can be reached');
  fleet.mission = undefined;
  if (!orderFleet(state, world, fleet, home.port)) return no('No port of yours can be reached');
  return ok(`${fleet.name} makes for ${placeName(state, home.port)}.`);
}

/** Sends a fleet to chart unknown waters on its own, or calls it back. */
export function explore(state: GameState, fleetId: number, on: boolean): Result {
  const fleet = fleetById(state, fleetId);
  if (!fleet || fleet.owner !== state.player) return no('Not your fleet');
  if (fleetInBattle(state, fleet)) return no('The fleet is in battle');
  if (on && knowsWorld(state.countries[fleet.owner])) return no('Your realm knows the whole world');
  fleet.mission = on ? 'explore' : undefined;
  fleet.replan = state.day;
  if (!on) {
    fleet.path = [];
    fleet.progress = 0;
  }
  return ok(on ? `${fleet.name} sails to chart the unknown.` : undefined);
}

export function buildWarships(
  state: GameState,
  world: SimWorld,
  province: number,
  type: ShipType,
  count: number,
): Result {
  const c = state.countries[state.player];
  const check = canBuildShips(state, world, c, province, type, count);
  if (!check.ok) return no(check.reason);
  buildShips(state, world, c, province, type, count);
  return ok();
}

export function buildTransportShips(state: GameState, world: SimWorld, count: number): Result {
  const c = state.countries[state.player];
  const check = buildTransports(state, world, c, count);
  return check.ok ? ok() : no(check.reason);
}

export function splitFleetInTwo(state: GameState, world: SimWorld, fleetId: number): Result {
  const fleet = fleetById(state, fleetId);
  if (!fleet || fleet.owner !== state.player) return no('Not your fleet');
  return splitFleet(state, world, fleet) ? ok() : no('Too few ships to split');
}

export function mergeFleetsHere(state: GameState, ids: number[]): Result {
  const fleets = ids.map((id) => fleetById(state, id)).filter((f) => f && f.owner === state.player);
  if (fleets.length < 2) return no('Select two fleets of yours');
  const [first, ...rest] = fleets;
  for (const f of rest) {
    if (f!.location !== first!.location) return no('Fleets must lie in the same place');
    if (fleetInBattle(state, f!) || fleetInBattle(state, first!)) return no('A fleet is in battle');
  }
  for (const f of rest) mergeFleets(state, first!, f!);
  first!.path = [];
  return ok();
}

export function disbandFleetCmd(state: GameState, fleetId: number): Result {
  const fleet = fleetById(state, fleetId);
  if (!fleet || fleet.owner !== state.player) return no('Not your fleet');
  return disbandFleet(state, fleet) ? ok(`${fleet.name} is paid off.`) : no('The fleet is in battle');
}

// ── Colonies ──────────────────────────────────────────────────────

export function colonise(state: GameState, world: SimWorld, province: number): Result {
  const c = state.countries[state.player];
  const check = startColony(state, world, c, province);
  if (!check.ok) return no(check.reason);
  return ok(`Colonists set out for ${placeName(state, province)}. The colony will take about ${check.months} months.`);
}

export function abandonColonyCmd(state: GameState, province: number): Result {
  const c = state.countries[state.player];
  return abandonColony(c, province) ? ok() : no('No colony of yours is there');
}

export function raise(state: GameState, world: SimWorld): Result {
  const c = state.countries[state.player];
  const army = raiseArmy(state, world, c);
  return army ? ok(`${army.name} gathers at ${placeName(state, army.location)}.`) : no('No men to raise');
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

export function developProvince(state: GameState, world: SimWorld, province: number): Result {
  const check = develop(state, world, state.player, province);
  return check.ok ? ok() : no(check.reason);
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
  const answer = peaceAcceptance(state, world, war, state.player, terms);
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
  if (offer.kind === 'ultimatum') {
    if (accept) grantFreedom(state, offer.to, offer.members);
    else factionWar(state, offer.to, offer.members, offer.from);
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
  return ok(`Your chancellor begins to forge a claim on ${placeName(state, province)}.`);
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

// ── Politics ──────────────────────────────────────────────────────

export function setLaw(state: GameState, law: LawId, value: Laws[LawId]): Result {
  const c = state.countries[state.player];
  const check = canChangeLaw(state, c, law, value);
  if (!check.ok) return no(check.reason);
  changeLaw(state, c, law, value);
  return ok('The new law is proclaimed.');
}

export function councilTask(state: GameState, seat: CouncilSeat, task: TaskId): Result {
  return setTask(state, state.countries[state.player], seat, task) ? ok() : no('Not a task for that seat');
}

export function privilege(state: GameState, estate: EstateId, grant: boolean): Result {
  const c = state.countries[state.player];
  const done = grant ? grantPrivilege(state, c, estate) : revokePrivilege(state, c, estate);
  return done ? ok() : no(grant ? 'They already have it' : 'They have none to lose');
}

// ── Faith and peoples ─────────────────────────────────────────────

/** The court chaplain takes up a mission to one province. */
export function convert(state: GameState, province: number): Result {
  const c = state.countries[state.player];
  const check = canConvert(state, c, province);
  if (!check.ok) return no(check.reason);
  startConversion(state, c, province);
  return ok(`Missionaries set out for ${placeName(state, province)}.`);
}

/** The steward founds schools in one province. */
export function assimilate(state: GameState, province: number): Result {
  const c = state.countries[state.player];
  const check = canAssimilate(state, c, province);
  if (!check.ok) return no(check.reason);
  startAssimilation(state, c, province);
  return ok(`Schools open in ${placeName(state, province)}.`);
}

export function accept(state: GameState, culture: string): Result {
  const c = state.countries[state.player];
  const check = canAcceptCulture(state, c, culture);
  if (!check.ok) return no(check.reason);
  acceptCulture(state, c, culture);
  return ok(`The ${cultureName(culture)} are now counted among the realm's own peoples.`);
}

export function unaccept(state: GameState, culture: string): Result {
  return unacceptCulture(state.countries[state.player], culture) ? ok() : no('That culture is not accepted');
}

export function blessing(state: GameState): Result {
  const c = state.countries[state.player];
  const cost = blessingCost(income(state, c).total);
  const check = canAskBlessing(state, c, cost);
  if (!check.ok) return no(check.reason);
  const head = headOf(state, c.religion)!;
  askBlessing(state, c, cost);
  return ok(`${head.name} blesses your reign in return for ${cost} gold.`);
}

export function adopt(state: GameState, world: SimWorld, faith: string): Result {
  const c = state.countries[state.player];
  const check = canAdoptFaith(state, world, c, faith);
  if (!check.ok) return no(check.reason);
  adoptFaith(state, world, c, faith);
  return ok(`Your realm now follows ${faithName(faith)}.`);
}

/** The head of a faith, or its protector, calls the faithful to a great holy war. */
export function greatHolyWar(state: GameState, world: SimWorld): Result {
  const def = greatHolyWarOf(state.countries[state.player]?.religion);
  if (!def) return no('Your faith does not call great holy wars');
  const check = canCallHolyWar(state, def, state.player);
  if (!check.ok) return no(check.reason);
  const war = callHolyWar(state, world, def);
  return war ? ok(`${war.name} is called.`) : no('The faithful do not answer');
}

// ── Technology and government ─────────────────────────────────────

export function researchFocus(state: GameState, track: TechTrack | null): Result {
  setFocus(state.countries[state.player], track);
  return ok();
}

export function reformGovernment(state: GameState, gov: Government): Result {
  const c = state.countries[state.player];
  const check = canReform(state, c, gov);
  if (!check.ok) return no(check.reason);
  reform(state, c, gov);
  return ok();
}

// ── Events, decisions and espionage ───────────────────────────────

export function chooseEventOption(state: GameState, world: SimWorld, eventId: number, option: number): Result {
  const check = answerEvent(state, world, eventId, option);
  return check.ok ? ok() : no(check.reason);
}

export function proclaimNation(state: GameState, world: SimWorld, id: string): Result {
  const c = state.countries[state.player];
  const n = NATION_BY_ID[id];
  if (!n) return no('No such nation');
  const check = canForm(state, c, n);
  if (!check.ok) return no(check.reason);
  formNation(state, world, c, n);
  return ok(`You have proclaimed the ${n.name}.`);
}

/** Sets the spymaster to build a network in a realm (0 recalls the agents). */
export function spyOn(state: GameState, target: number): Result {
  const c = state.countries[state.player];
  if (target) {
    const check = canSpyOn(state, c, target);
    if (!check.ok) return no(check.reason);
  }
  c.spyTarget = target;
  if (target) c.tasks.spymaster = 'network';
  else if (c.tasks.spymaster === 'network') c.tasks.spymaster = 'watch';
  invalidatePolitics(state);
  return ok(target ? `Your spymaster sends agents into ${state.countries[target].name}.` : 'Your agents are recalled.');
}

export function plot(state: GameState, world: SimWorld, target: number, id: PlotId): Result {
  const c = state.countries[state.player];
  const check = canPlot(state, world, c, target, id);
  if (!check.ok) return no(check.reason);
  const result = carryOut(state, world, c, target, id);
  return result ? ok(result.text) : no('The plot could not go ahead');
}

// ── The end of the age ────────────────────────────────────────────

/** The player has seen the final ranking and plays on. */
export function playOnAfterTheAge(state: GameState): Result {
  if (state.happened.end === undefined) return no('The age has not ended');
  state.happened.end_seen ??= state.day;
  return ok();
}
