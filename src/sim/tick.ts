/**
 * One day of the world. Daily: marching, battles, sieges, supply, construction. Monthly (on the 1st):
 * the economy, wars, mortality. The AI thinks once a month per country, spread over the days so the
 * work is even.
 */
import { monthlyAI, planArmies } from './ai';
import { monthlyMortality, seatSkill, staffCourt } from './characters';
import { toDate } from './calendar';
import { dailyBattles, startBattles } from './combat';
import { dailyConstruction, monthlyEconomy } from './economy';
import { dailyMarch, dailyUpkeep } from './military';
import { chance } from './rng';
import { runScheduled } from './scripted';
import { dailySieges } from './siege';
import type { GameState } from './types';
import { monthlyWars } from './war';
import type { SimWorld } from './world';

export function advanceDay(state: GameState, world: SimWorld) {
  state.day++;
  const arrived = dailyMarch(state, world);
  startBattles(state, world, arrived);
  dailyBattles(state, world);
  dailySieges(state, world);
  dailyUpkeep(state, world);
  dailyConstruction(state, world);
  runScheduled(state, world);
  const date = toDate(state.day);
  if (date.d === 1) {
    monthlyEconomy(state, world);
    monthlyWars(state, world);
    monthlyMortality(state, world);
    monthlyStability(state);
    if (date.m === 1)
      for (const c of state.countries) if (c?.alive) staffCourt(state, world, c, c.index !== state.player);
  }
  for (const c of state.countries)
    if (c?.alive && c.index !== state.player && (c.index % 28) + 1 === date.d) monthlyAI(state, world, c);
  planArmies(state, world);
}

/** Stability drifts back towards +1, faster with a learned chaplain. */
function monthlyStability(state: GameState) {
  for (const c of state.countries) {
    if (!c?.alive) continue;
    const p = 0.04 + seatSkill(state, c, 'chaplain') * 0.004;
    if (c.stability < 1 && chance(state, p)) c.stability++;
    else if (c.stability > 1 && chance(state, p / 2)) c.stability--;
  }
}
