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
import { mark, profileStart } from './profile';
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
  profileStart();
  state.day++;
  const arrived = dailyMarch(state, world);
  startBattles(state, world, arrived);
  for (const { army } of arrived) revealAround(state, world, army.owner, army.location);
  mark('marching');
  dailyBattles(state, world);
  mark('battles');
  const sailed = dailySail(state, world);
  startNavalBattles(state, world, sailed);
  dailyNavalBattles(state, world);
  dailyInterception(state, world);
  mark('sailing');
  updateBlockades(state, world);
  mark('blockades');
  dailySieges(state, world);
  mark('sieges');
  dailyUpkeep(state, world);
  dailyFleets(state, world);
  mark('supply and upkeep');
  dailyConstruction(state);
  dailyFabrication(state);
  dailyModifiers(state);
  if (state.offers.length) expireOffers(state);
  runScheduled(state, world);
  mark('daily business');
  const date = toDate(state.day);
  // The month's business is spread over its first week, so that no one day carries all of it.
  switch (date.d) {
    case 1: // the treasury and the wars; on New Year's Day the courts and the standing of nations
      monthlyEconomy(state);
      mark('monthlyEconomy');
      monthlyWars(state, world);
      mark('monthlyWars');
      if (date.m === 1) {
        for (const c of state.countries) if (c?.alive) staffCourt(state, world, c, c.index !== state.player);
        mark('staffCourt');
        pruneCharacters(state);
        mark('pruneCharacters');
        yearlyScore(state);
        mark('yearlyScore');
      }
      break;
    case 2: // the court and the estates
      monthlyMortality(state, world);
      mark('monthlyMortality');
      monthlyStability(state);
      mark('monthlyStability');
      monthlyLegitimacy(state);
      mark('monthlyLegitimacy');
      monthlyEstateMoods(state);
      mark('monthlyEstateMoods');
      monthlyElections(state);
      mark('monthlyElections');
      break;
    case 3: // treaties, subjects and unrest
      monthlyMemories(state);
      mark('monthlyMemories');
      monthlyIntegration(state);
      mark('monthlyIntegration');
      cleanupDiplomacy(state);
      mark('cleanupDiplomacy');
      monthlyCoalitions(state);
      mark('monthlyCoalitions');
      pruneClaims(state);
      mark('pruneClaims');
      orphanRebels(state);
      mark('orphanRebels');
      monthlyRevolts(state, world);
      mark('monthlyRevolts');
      monthlyFactions(state, world);
      mark('monthlyFactions');
      expelArmies(state, world);
      mark('expelArmies');
      break;
    case 4: // faith and the wide world
      monthlyFaith(state, world);
      mark('monthlyFaith');
      monthlyHeresies(state, world);
      mark('monthlyHeresies');
      monthlyPlague(state, world);
      mark('monthlyPlague');
      monthlyGreatHolyWars(state, world);
      mark('monthlyGreatHolyWars');
      monthlyWorldEvents(state, world);
      mark('monthlyWorldEvents');
      break;
    case 5: // learning and the map
      monthlyResearch(state, world);
      mark('monthlyResearch');
      monthlyMaps(state, world, date.m === 1);
      mark('monthlyMaps');
      monthlyColonies(state, world);
      mark('monthlyColonies');
      break;
    case 6: // events and intrigue
      monthlyEvents(state, world);
      mark('monthlyEvents');
      monthlyEspionage(state, world);
      mark('monthlyEspionage');
      break;
    case 7: // the land grows
      monthlyGrowth(state, world);
      mark('monthlyGrowth');
      break;
  }
  // Each realm's AI thinks once a month on a day of its own, never on the busy first.
  for (const c of state.countries)
    if (c?.alive && c.index !== state.player && aiDay(c.index) === date.d) monthlyAI(state, world, c);
  mark('monthlyAI');
  planArmies(state, world);
  mark('planArmies');
  planFleets(state, world);
  mark('planFleets');
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
