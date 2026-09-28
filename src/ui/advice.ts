/**
 * The council's counsel: what the player's councillors suggest doing next, from the same judgements
 * the AI makes for its own realms (sim/ai.ts): the tasks that suit the moment, claims worth forging
 * or pressing, allies worth having, what to build and develop, what to accept and integrate. Each
 * piece comes with a click that does it, and only when it can be done now.
 */
import type { IconName } from '../assets/icons';
import { BUILDINGS } from '../data/buildings';
import { ESTATE_INFO, LEVEL_LAWS, TASK_INFO } from '../data/politics';
import { TECH_TRACKS, TRACK_INFO } from '../data/techs';
import { unitDef } from '../data/units';
import {
  bestAlly,
  buildingOptions,
  claimCandidates,
  claimWars,
  councilPlan,
  cultureToAccept,
  developOption,
  estateOnTheBrink,
  napCandidate,
  treasuryMarks,
  vassalToIntegrate,
} from '../sim/ai';
import { cultureName } from '../sim/beliefs';
import { alive, character, SEAT_INFO, SEAT_SKILL, skill } from '../sim/characters';
import * as cmd from '../sim/commands';
import { alliesOf, fabricationCost, pactWillingness } from '../sim/diplomacy';
import { expenses, income, reserveMen } from '../sim/economy';
import { diversity } from '../sim/faith';
import { availableMaa } from '../sim/military';
import { canChangeLaw, estateLoyalty, estateName } from '../sim/politics';
import { armiesOf, provincesOf, warsOf } from '../sim/queries';
import { revoltRisk } from '../sim/revolts';
import { militaryEra } from '../sim/tech';
import {
  COUNCIL_SEATS,
  type Country,
  type CouncilSeat,
  type GameState,
  type TaskId,
  type UnitType,
} from '../sim/types';
import { openDeclareWar, run } from './actions';
import type { Game } from './game';
import { placeName } from '../sim/places';

export interface Counsel {
  /** the same from month to month while it stands, for keys and for setting it aside */
  id: string;
  /** who gives it */
  seat: CouncilSeat;
  text: string;
  action?: { label: string; icon: IconName; run: (game: Game) => void };
  /** an encyclopedia entry that explains it */
  more?: string;
  /** how much it matters: the council raises the weightiest first */
  weight: number;
}

/** Why a councillor would take up each task now. */
function taskReason(state: GameState, c: Country, task: TaskId): { text: string; weight: number } {
  const d = diversity(state, c);
  switch (task) {
    case 'legitimacy':
      return c.legitimacy < 40
        ? { text: `Legitimacy is low (${Math.round(c.legitimacy)}). Let me anoint the crown.`, weight: 75 }
        : { text: 'The crown’s right could stand strengthening. Let me anoint it.', weight: 25 };
    case 'stability':
      return c.stability < 1
        ? { text: `The realm is unsettled (stability ${c.stability}). Let me preach obedience.`, weight: 70 }
        : { text: 'All is quiet. Let me preach obedience, and keep it so.', weight: 15 };
    case 'convert':
      return {
        text: `${Math.round((d.sister + d.heathen) * 100)}% of the realm follows other faiths. Let me send missionaries.`,
        weight: 30,
      };
    case 'claims':
      return {
        text: 'While a claim is being forged, let me search the archives: it will take a third less time.',
        weight: 45,
      };
    case 'negotiate':
      return { text: 'We are at war. Let me prepare the peace: better terms, and a slower weariness.', weight: 40 };
    case 'embassies':
      return {
        text: 'We are at peace. Let me send embassies: every realm will think a little better of us.',
        weight: 20,
      };
    case 'drill':
      return { text: 'We are at war. Let me drill the troops: armies will recover their morale faster.', weight: 45 };
    case 'levies':
      return { text: 'We are at peace. Let me muster the levies: the realm will field more men.', weight: 15 };
    case 'develop':
      return { text: 'Gold is piling up. Let me develop the land instead of collecting every coin.', weight: 35 };
    case 'assimilate':
      return {
        text: `${Math.round(d.foreign * 100)}% of the realm are foreign peoples. Let me found schools.`,
        weight: 30,
      };
    case 'taxes':
      return { text: 'The treasury needs filling. Let me collect the taxes.', weight: 30 };
    case 'watch':
      return { text: 'The realm is restless. Let me watch it: the estates and vassals will keep faith.', weight: 55 };
    case 'sieges':
      return { text: 'We are at war. Let me undermine the enemy’s walls: our sieges will go faster.', weight: 35 };
    case 'network':
      return { text: 'Let me build our network where you have sent me.', weight: 15 };
  }
}

/** The best courtier for a seat, by the skill it asks. */
function bestFor(state: GameState, c: Country, seat: CouncilSeat): number {
  let best = 0,
    v = -1;
  for (const id of c.courtiers) {
    const s = skill(character(state, id), SEAT_SKILL[seat]);
    if (alive(state, id) && s > v) {
      v = s;
      best = id;
    }
  }
  return best;
}

/** What the council advises now, the weightiest first. */
export function counsel(game: Game): Counsel[] {
  const { state, world } = game;
  const c = state.countries[state.player];
  if (!c?.alive || c.rebel) return [];
  const out: Counsel[] = [];
  const act = (label: string, icon: IconName, go: (game: Game) => void) => ({ label, icon, run: go });
  const fighting = warsOf(state, c.index).length > 0;
  const monthly = income(state, c).total;
  const { reserve, floor } = treasuryMarks(monthly);

  // Empty seats first: a councillor who is not there gives no counsel.
  for (const seat of COUNCIL_SEATS) {
    if (alive(state, c.council[seat])) continue;
    const id = bestFor(state, c, seat);
    if (!id) continue;
    const who = character(state, id)!;
    out.push({
      id: `seat:${seat}`,
      seat,
      text: `The ${SEAT_INFO[seat].name.toLowerCase()}’s seat is empty. ${who.name} is the ablest at court.`,
      action: act(`Appoint ${who.name}`, 'organigram', (g) => run(g, cmd.appointCouncillor(g.state, seat, id))),
      more: 'rule:council',
      weight: 90,
    });
  }

  // An army to raise, if war has come and none is in the field.
  if (fighting && !armiesOf(state, c.index).length && c.manpower + reserveMen(c) >= 300)
    out.push({
      id: 'raise',
      seat: 'marshal',
      text: 'We are at war and no army of ours is in the field.',
      action: act('Raise the army', 'knight-banner', (g) => run(g, cmd.raise(g.state, g.world))),
      more: 'rule:levies',
      weight: 95,
    });

  // An estate on the brink.
  const brink = estateOnTheBrink(state, c);
  if (brink)
    out.push({
      id: `privilege:${brink}`,
      seat: 'spymaster',
      text: `The ${estateName(c, brink).toLowerCase()} are close to revolt: about ${Math.round(revoltRisk(state, c, brink) * 100)}% a month that they rise. ${ESTATE_INFO[brink].privilege} would calm them.`,
      action: act(`Grant ${ESTATE_INFO[brink].privilege.toLowerCase()}`, 'wax-seal', (g) =>
        run(g, cmd.privilege(g.state, brink, true)),
      ),
      more: 'rule:estates',
      weight: 100,
    });

  // The council's tasks, as the moment asks.
  const plan = councilPlan(state, c);
  for (const seat of COUNCIL_SEATS) {
    const task = plan[seat];
    if (c.tasks[seat] === task || !alive(state, c.council[seat])) continue;
    const why = taskReason(state, c, task);
    out.push({
      id: `task:${seat}:${task}`,
      seat,
      text: why.text,
      action: act(TASK_INFO[task].name, 'organigram', (g) => run(g, cmd.councilTask(g.state, seat, task))),
      more: 'rule:council',
      weight: why.weight,
    });
  }

  // Debts that can be paid.
  c.loans.forEach((l, i) => {
    if (c.gold > l.amount * 1.5 && i === c.loans.findIndex((x) => c.gold > x.amount * 1.5))
      out.push({
        id: `repay:${l.amount}`,
        seat: 'steward',
        text: `We can repay a loan of ${l.amount} gold, and save ${l.interest.toFixed(1)} gold a month in interest.`,
        action: act('Repay it', 'bank', (g) => run(g, cmd.repay(g.state, i))),
        more: 'rule:loans',
        weight: 65,
      });
  });

  // A treasury that shrinks: higher taxes, if the people will bear them.
  const balance = monthly - expenses(state, c, monthly).total;
  const commons = estateLoyalty(state, c, 'commons').total;
  const burghers = estateLoyalty(state, c, 'burghers').total;
  if (balance < 0 && c.laws.taxation < 2 && commons > -5 && burghers > -5) {
    const next = c.laws.taxation + 1;
    if (canChangeLaw(state, c, 'taxation', next).ok)
      out.push({
        id: `taxation:${next}`,
        seat: 'steward',
        text: `We lose ${Math.abs(balance).toFixed(1)} gold a month. The commons and burghers would bear higher taxes.`,
        action: act(`Taxation: ${LEVEL_LAWS.taxation.levels[next].toLowerCase()}`, 'coins-pile', (g) =>
          run(g, cmd.setLaw(g.state, 'taxation', next)),
        ),
        more: 'law:taxation',
        weight: 60,
      });
  }

  // Gold to put to work: the most useful building, and development once gold is piling up.
  if (c.gold >= reserve + 50 && !c.loans.length) {
    const best = buildingOptions(state, world, c, reserve).sort((a, b) => b.value - a.value)[0];
    if (best) {
      const level = (state.provinces[best.id].buildings[best.type] ?? 0) + 1;
      const name = BUILDINGS[best.type].levels[level - 1];
      const where = placeName(state, best.id);
      out.push({
        id: `build:${best.id}:${best.type}:${level}`,
        seat: 'steward',
        text: `The treasury can spare ${best.cost} gold. ${name} in ${where} would serve the realm best.`,
        action: act(`Build in ${where}`, 'hammer-nails', (g) =>
          run(g, cmd.build(g.state, g.world, best.id, best.type)),
        ),
        more: `building:${best.type}`,
        weight: c.gold > floor ? 50 : 35,
      });
    }
  }
  if (c.gold > floor && !c.loans.length) {
    let best: ReturnType<typeof developOption> | null = null;
    for (const id of provincesOf(state, c.index)) {
      const o = developOption(state, world, c, id);
      if (o.value > 0 && (!best || o.value > best.value)) best = o;
    }
    if (best) {
      const where = placeName(state, best.id);
      const id = best.id;
      out.push({
        id: `develop:${id}`,
        seat: 'steward',
        text: `Gold is piling up, and gold beyond three years of income wastes away. Develop ${where} for ${best.cost} gold.`,
        action: act(`Develop ${where}`, 'village', (g) => run(g, cmd.developProvince(g.state, g.world, id))),
        more: 'rule:development',
        weight: 55,
      });
    }
  }

  // Men-at-arms, while they cost little.
  if (!c.loans.length && c.gold > 60) {
    const era = militaryEra(c);
    let upkeep = 0;
    for (const [t, men] of Object.entries(c.reserve) as [UnitType, number][])
      upkeep += (men / 100) * unitDef(t, era).reserveUpkeep;
    const types = availableMaa(c).filter((t) => t !== 'siege' && t !== 'air');
    if (upkeep < monthly * 0.15 && types.length) {
      const t = types.sort((a, b) => (c.reserve[a] ?? 0) - (c.reserve[b] ?? 0))[0];
      const u = unitDef(t, era);
      out.push({
        id: `recruit:${t}`,
        seat: 'marshal',
        text: `Our men-at-arms cost ${Math.round((upkeep / Math.max(1, monthly)) * 100)}% of our income. We could keep more: a regiment of ${u.name.toLowerCase()}.`,
        action: act(`Recruit ${u.name.toLowerCase()}`, u.icon, (g) => run(g, cmd.recruitMaa(g.state, t, 1))),
        more: 'rule:men-at-arms',
        weight: 25,
      });
    }
  }

  // Claims: one to press, or one to forge.
  if (!fighting && !c.liege) {
    const war = claimWars(state, world, c)[0];
    if (war) {
      const t = state.countries[war.target];
      const where = placeName(state, war.goal);
      out.push({
        id: `press:${war.goal}`,
        seat: 'chancellor',
        text: `Our claim on ${where} can be pressed: ${t.name} ${war.ratio >= 2 ? 'is far weaker than we are' : 'is weaker than we are'}.`,
        action: act('Consider the war', 'crossed-swords', (g) => openDeclareWar(g, war.target, war.goal)),
        more: 'rule:casus-belli',
        weight: 50,
      });
    }
    if (!c.fabricating && c.claims.length < 2 && c.stability >= 0 && !c.loans.length) {
      const best = claimCandidates(state, world, c).sort((a, b) => b.value - a.value)[0];
      if (best) {
        const where = placeName(state, best.id);
        out.push({
          id: `forge:${best.id}`,
          seat: 'chancellor',
          text: `We could forge a claim on ${where}, held by ${state.countries[best.target].name}, a weaker realm. It costs ${fabricationCost(state, best.id)} gold.`,
          action: act(`Forge a claim on ${where}`, 'scroll-quill', (g) =>
            run(g, cmd.fabricate(g.state, g.world, best.id)),
          ),
          more: 'rule:claims',
          weight: 30,
        });
      }
    }
  }

  // Friends: an ally who would have us, or peace with a dangerous neighbour.
  if (!c.liege && !c.overlord && alliesOf(state, c.index).length < 2) {
    const o = bestAlly(state, world, c);
    if (o && pactWillingness(state, world, 'alliance', o.index, c.index).total >= 0)
      out.push({
        id: `ally:${o.index}`,
        seat: 'chancellor',
        text: `${o.name} would welcome an alliance with us.`,
        action: act('Propose an alliance', 'shaking-hands', (g) =>
          run(g, cmd.proposePact(g.state, g.world, 'alliance', o.index)),
        ),
        more: 'pact:alliance',
        weight: 40,
      });
  }
  if (!c.liege) {
    const o = napCandidate(state, world, c);
    if (o && pactWillingness(state, world, 'nap', o.index, c.index).total >= 0)
      out.push({
        id: `nap:${o.index}`,
        seat: 'chancellor',
        text: `${o.name} is a danger to us, but would sign a non-aggression pact.`,
        action: act('Propose a pact', 'peace-dove', (g) => run(g, cmd.proposePact(g.state, g.world, 'nap', o.index))),
        more: 'pact:nap',
        weight: 45,
      });
  }

  // Peoples to accept, and vassals to integrate.
  const culture = cultureToAccept(state, c);
  if (culture)
    out.push({
      id: `accept:${culture}`,
      seat: 'steward',
      text: `The ${cultureName(culture)} are a fifth of our realm or more. Accepted, they would pay and serve as our own.`,
      action: act(`Accept the ${cultureName(culture)}`, 'meeple-group', (g) => run(g, cmd.accept(g.state, culture))),
      more: 'rule:culture',
      weight: 40,
    });
  if (!c.integrating && !fighting) {
    const v = vassalToIntegrate(state, world, c);
    if (v)
      out.push({
        id: `integrate:${v.index}`,
        seat: 'chancellor',
        text: `${v.name} is small and loyal. It could be integrated into the realm.`,
        action: act('Integrate it', 'crossed-chains', (g) => run(g, cmd.integrate(g.state, g.world, v.index))),
        more: 'rule:subjects',
        weight: 30,
      });
  }

  // Scholars without a focus.
  if (!c.focus) {
    const track = [...TECH_TRACKS].sort((a, b) => c.tech[a] - c.tech[b])[0];
    out.push({
      id: `focus:${track}`,
      seat: 'chaplain',
      text: `Our scholars have no focus. ${TRACK_INFO[track].name} lags behind: let them favour it (+25% research).`,
      action: act(`Focus on ${TRACK_INFO[track].name.toLowerCase()}`, 'graduate-cap', (g) =>
        run(g, cmd.researchFocus(g.state, track)),
      ),
      more: 'rule:technology',
      weight: 25,
    });
  }

  return out.sort((a, b) => b.weight - a.weight);
}
