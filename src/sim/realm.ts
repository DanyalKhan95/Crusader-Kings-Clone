/** Changes to a realm as a whole: its capital moving, and the end of a country. */
import { provincesOf } from './queries';
import type { Country, GameState } from './types';
import type { SimWorld } from './world';

/** A realm that lost its capital moves the court to its richest remaining province. */
export function fixCapitals(state: GameState, world: SimWorld) {
  for (const c of state.countries) {
    if (!c?.alive || state.provinces[c.capital]?.owner === c.index) continue;
    let best = 0,
      bestDev = -1;
    for (const id of provincesOf(state, c.index)) {
      if (world.region(id).kind !== 'land') continue;
      const dev = state.provinces[id].dev;
      if (dev > bestDev) {
        bestDev = dev;
        best = id;
      }
    }
    if (best) c.capital = best;
  }
}

/** A country with nothing left leaves the game, and everything bound to it lets go. */
export function destroyCountry(state: GameState, c: Country) {
  c.alive = false;
  c.liege = 0;
  c.overlord = 0;
  c.fabricating = null;
  c.integrating = null;
  for (const v of state.countries) {
    if (!v) continue;
    if (v.liege === c.index) v.liege = 0;
    if (v.overlord === c.index) v.overlord = 0;
    if (v.integrating?.vassal === c.index) v.integrating = null;
  }
  state.armies = state.armies.filter((a) => a.owner !== c.index);
  for (const w of state.wars) {
    w.attackers = w.attackers.filter((x) => x !== c.index);
    w.defenders = w.defenders.filter((x) => x !== c.index);
  }
  state.pacts = state.pacts.filter((p) => p.a !== c.index && p.b !== c.index);
  for (const co of state.coalitions) co.members = co.members.filter((m) => m !== c.index);
  state.coalitions = state.coalitions.filter((co) => co.target !== c.index && co.members.length > 0);
  state.offers = state.offers.filter((o) => o.from !== c.index && o.to !== c.index);
  state.borderVersion++;
  state.diploVersion++;
}
