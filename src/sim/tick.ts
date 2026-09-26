/**
 * One day of the world. Daily: marching and sailing, battles on land and at sea, blockades, sieges,
 * supply, construction, forged claims. Monthly, over the first week: the economy and wars; the
 * court and estates; diplomacy and unrest; faith and world events; research, maps and colonies;
 * events and espionage; the growth of the land. The AI thinks once a month per country, spread over
 * the days so the work is even.
 */
import { monthlyAI, planArmies } from './ai';
import { monthlyMortality, pruneCharacters, staffCourt } from './characters';
import { toDate } from './calendar';
import { monthlyColonies } from './colonies';
import { dailyBattles, startBattles } from './combat';
import {
  cleanupDiplomacy,
  dailyFabrication,
  monthlyCoalitions,
  monthlyIntegration,
  monthlyMemories,
  pruneClaims,
} from './diplomacy';
import { dailyConstruction, monthlyEconomy, monthlyGrowth } from './economy';
import { monthlyEspionage } from './espionage';
import { monthlyEvents } from './events';
import { monthlyMaps, revealAround } from './exploration';
import { monthlyFaith, monthlyHeresies } from './faith';
import { monthlyGreatHolyWars } from './holywars';
import { monthlyResearch } from './tech';
import { dailyMarch, dailyUpkeep, expelArmies } from './military';
import {
  dailyFleets,
  dailyInterception,
  dailyNavalBattles,
  dailySail,
  startNavalBattles,
  updateBlockades,
} from './naval';
import { planFleets } from './navalAi';
import { dailyModifiers } from './modifiers';
import { monthlyPlague } from './plague';
import { estateEffect, monthlyElections, monthlyEstateMoods, monthlyLegitimacy, taskSkill } from './politics';
import { monthlyFactions, monthlyRevolts, orphanRebels } from './revolts';
import { chance } from './rng';
import { runScheduled } from './scripted';
import { yearlyScore } from './score';
import { dailySieges } from './siege';
import type { GameState } from './types';
import { expireOffers, monthlyWars } from './war';
import { monthlyWorldEvents } from './worldEvents';
import type { SimWorld } from './world';

export function advanceDay(state: GameState, world: SimWorld) {
  state.day++;
  const arrived = dailyMarch(state, world);
  startBattles(state, world, arrived);
  for (const { army } of arrived) revealAround(state, world, army.owner, army.location);
  dailyBattles(state, world);
  const sailed = dailySail(state, world);
  startNavalBattles(state, world, sailed);
  dailyNavalBattles(state, world);
  dailyInterception(state, world);
  updateBlockades(state, world);
  dailySieges(state, world);
  dailyUpkeep(state, world);
  dailyFleets(state, world);
  dailyConstruction(state, world);
  dailyFabrication(state, world);
  dailyModifiers(state);
  if (state.offers.length) expireOffers(state);
  runScheduled(state, world);
  const date = toDate(state.day);
  // The month's business is spread over its first week, so that no one day carries all of it.
  switch (date.d) {
    case 1: // the treasury and the wars; on New Year's Day the courts and the standing of nations
      monthlyEconomy(state);
      monthlyWars(state, world);
      if (date.m === 1) {
        for (const c of state.countries) if (c?.alive) staffCourt(state, world, c, c.index !== state.player);
        pruneCharacters(state);
        yearlyScore(state);
      }
      break;
    case 2: // the court and the estates
      monthlyMortality(state, world);
      monthlyStability(state);
      monthlyLegitimacy(state);
      monthlyEstateMoods(state);
      monthlyElections(state);
      break;
    case 3: // treaties, subjects and unrest
      monthlyMemories(state);
      monthlyIntegration(state);
      cleanupDiplomacy(state);
      monthlyCoalitions(state);
      pruneClaims(state);
      orphanRebels(state);
      monthlyRevolts(state, world);
      monthlyFactions(state, world);
      expelArmies(state, world);
      break;
    case 4: // faith and the wide world
      monthlyFaith(state, world);
      monthlyHeresies(state, world);
      monthlyPlague(state, world);
      monthlyGreatHolyWars(state, world);
      monthlyWorldEvents(state, world);
      break;
    case 5: // learning and the map
      monthlyResearch(state, world);
      monthlyMaps(state, world, date.m === 1);
      monthlyColonies(state, world);
      break;
    case 6: // events and intrigue
      monthlyEvents(state, world);
      monthlyEspionage(state, world);
      break;
    case 7: // the land grows
      monthlyGrowth(state, world);
      break;
  }
  // Each realm's AI thinks once a month on a day of its own, never on the busy first.
  for (const c of state.countries)
    if (c?.alive && c.index !== state.player && aiDay(c.index) === date.d) monthlyAI(state, world, c);
  planArmies(state, world);
  planFleets(state, world);
}

/** The day of the month on which a realm's AI makes its plans. */
export function aiDay(index: number): number {
  return (index % 27) + 2;
}

/**
 * Stability drifts back towards +1 (towards 0 under a ruler of doubtful right), faster with a
 * chaplain preaching obedience and a loyal clergy.
 */
function monthlyStability(state: GameState) {
  for (const c of state.countries) {
    if (!c?.alive) continue;
    const p = Math.max(
      0.01,
      0.04 + taskSkill(state, c, 'chaplain', 'stability') * 0.004 + 0.01 * estateEffect(state, c, 'clergy'),
    );
    const target = c.legitimacy < 30 ? 0 : 1;
    if (c.stability < target && chance(state, p)) c.stability++;
    else if (c.stability > target && chance(state, p / 2)) c.stability--;
  }
}
