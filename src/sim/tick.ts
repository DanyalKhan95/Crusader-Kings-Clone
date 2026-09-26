/**
 * One day of the world. Daily: marching and sailing, battles on land and at sea, blockades, sieges,
 * supply, construction, forged claims. Monthly (on the 1st): the economy, wars, mortality, stability,
 * diplomacy, politics, faith, research, maps and colonies. The AI thinks once a month per country,
 * spread over the days so the work is even.
 */
import { monthlyAI, planArmies } from './ai';
import { monthlyMortality, staffCourt } from './characters';
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
import { dailyConstruction, monthlyEconomy } from './economy';
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
import { estateEffect, monthlyElections, monthlyEstateMoods, monthlyLegitimacy, taskSkill } from './politics';
import { monthlyFactions, monthlyRevolts, orphanRebels } from './revolts';
import { chance } from './rng';
import { runScheduled } from './scripted';
import { dailySieges } from './siege';
import type { GameState } from './types';
import { expireOffers, monthlyWars } from './war';
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
  if (state.offers.length) expireOffers(state);
  runScheduled(state, world);
  const date = toDate(state.day);
  if (date.d === 1) {
    monthlyEconomy(state, world);
    monthlyWars(state, world);
    monthlyMortality(state, world);
    monthlyStability(state);
    monthlyMemories(state);
    monthlyLegitimacy(state);
    monthlyEstateMoods(state);
    monthlyElections(state);
    monthlyIntegration(state);
    cleanupDiplomacy(state);
    monthlyCoalitions(state);
    pruneClaims(state);
    orphanRebels(state);
    monthlyRevolts(state, world);
    monthlyFactions(state, world);
    monthlyFaith(state, world);
    monthlyHeresies(state, world);
    monthlyGreatHolyWars(state, world);
    monthlyResearch(state, world);
    monthlyMaps(state, world, date.m === 1);
    monthlyColonies(state, world);
    expelArmies(state, world);
    if (date.m === 1)
      for (const c of state.countries) if (c?.alive) staffCourt(state, world, c, c.index !== state.player);
  }
  for (const c of state.countries)
    if (c?.alive && c.index !== state.player && (c.index % 28) + 1 === date.d) monthlyAI(state, world, c);
  planArmies(state, world);
  planFleets(state, world);
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
