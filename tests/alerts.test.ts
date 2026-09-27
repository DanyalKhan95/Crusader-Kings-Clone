import { describe, expect, it } from 'vitest';
import { countryByTag, provincesOf } from '../src/sim/queries';
import { createGameState } from '../src/sim/setup';
import type { GameState } from '../src/sim/types';
import { makeSimWorld } from '../src/sim/world';
import type { Game } from '../src/ui/game';
import { alertsFor } from '../src/ui/hud/Alerts';
import { loadData } from './helpers';

const { world: worldData, regions, scenario } = loadData();
const world = makeSimWorld(worldData, regions);

/** A campaign as England, as the HUD would see it. */
function england(): { state: GameState; game: Game } {
  const state = createGameState(world, scenario);
  state.player = countryByTag(state, 'ENG')!.index;
  // The Norwegian and Norman wars of 1066 aside: a quiet realm to test against.
  state.wars = [];
  return { state, game: { state, world } as unknown as Game };
}

const titles = (game: Game) => alertsFor(game).map((a) => a.title);

describe('the alerts', () => {
  it('are few in a quiet realm', () => {
    const { game } = england();
    expect(titles(game)).toEqual(['The laws may change']);
  });

  it('warn of an empty treasury and of debts', () => {
    const { state, game } = england();
    const eng = state.countries[state.player];
    eng.gold = -40;
    eng.loans = [{ amount: 100, interest: 1.2 }];
    const alert = alertsFor(game).find((a) => a.title === 'The treasury runs dry')!;
    expect(alert.tone).toBe('bad');
    expect(alert.lines).toEqual(['The treasury is empty.', '1 loan costs 1.2 gold a month.']);
  });

  it('name an empty seat and a spymaster with nowhere to spy', () => {
    const { state, game } = england();
    const eng = state.countries[state.player];
    eng.council.steward = 0;
    eng.tasks.spymaster = 'network';
    eng.spyTarget = 0;
    expect(alertsFor(game).find((a) => a.title === 'The council is idle')?.lines).toEqual([
      'No steward sits on the council.',
      'The spymaster has no realm to spy on.',
    ]);
  });

  it('find an army too large for the land to feed', () => {
    const { state, game } = england();
    const army = state.armies.find((a) => a.owner === state.player)!;
    army.units = { levy: 90_000 };
    const alert = alertsFor(game).find((a) => a.title === 'An army is starving')!;
    expect(alert.lines[0]).toMatch(new RegExp(`^${army.name}: 90k men where .* feeds`));
  });

  it('offer a claim to press, but not on our own land', () => {
    const { state, game } = england();
    const eng = state.countries[state.player];
    const france = countryByTag(state, 'FRA')!;
    eng.claims = [provincesOf(state, france.index)[0], provincesOf(state, eng.index)[0]];
    const alert = alertsFor(game).find((a) => a.title === 'A claim to press')!;
    expect(alert.tone).toBe('good');
    expect(alert.lines).toHaveLength(1);
    expect(alert.lines[0]).toMatch(/, held by Kingdom of France$/);
  });

  it('say nothing once the realm has fallen', () => {
    const { state, game } = england();
    state.countries[state.player].alive = false;
    expect(alertsFor(game)).toEqual([]);
  });
});
