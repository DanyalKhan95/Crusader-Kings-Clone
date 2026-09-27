import { describe, expect, it } from 'vitest';
import type { StaticWorld } from '../src/game/world';
import type { MeshBundle } from '../src/render/meshBuilder';
import { countryByTag } from '../src/sim/queries';
import { createGameState } from '../src/sim/setup';
import { makeSimWorld } from '../src/sim/world';
import { counsel } from '../src/ui/advice';
import { createGame, type Game } from '../src/ui/game';
import { currentHint, markSeen, resetHints } from '../src/ui/hints';
import { settings } from '../src/ui/settings';
import { loadData } from './helpers';

const { world: worldData, regions, scenario } = loadData();
const world = makeSimWorld(worldData, regions);

function realm(tag: string): Game {
  const state = createGameState(world, scenario);
  state.player = countryByTag(state, tag)!.index;
  const game = createGame(world as unknown as StaticWorld, scenario, state, null as unknown as MeshBundle);
  game.ui.set({ phase: 'playing', player: state.player });
  return game;
}

const ids = (game: Game) => counsel(game).map((x) => x.id);

describe('the council’s counsel', () => {
  it('fills an empty seat with the ablest courtier, and the click does it', () => {
    const game = realm('FRA');
    const me = game.state.countries[game.state.player];
    me.council.marshal = 0;
    const advice = counsel(game).find((x) => x.id === 'seat:marshal')!;
    expect(advice.weight).toBeGreaterThanOrEqual(90);
    advice.action!.run(game);
    expect(me.council.marshal).not.toBe(0);
    expect(ids(game)).not.toContain('seat:marshal');
  });

  it('puts gold that piles up to work, and pays debts it can', () => {
    const game = realm('FRA');
    const me = game.state.countries[game.state.player];
    me.gold = 20000;
    const list = ids(game);
    expect(list.some((id) => id.startsWith('build:'))).toBe(true);
    expect(list.some((id) => id.startsWith('develop:'))).toBe(true);
    me.loans = [{ amount: 100, interest: 1 }];
    expect(ids(game)).toContain('repay:100');
    const repay = counsel(game).find((x) => x.id === 'repay:100')!;
    repay.action!.run(game);
    expect(me.loans).toEqual([]);
  });

  it('calms an estate on the brink with a privilege', () => {
    const game = realm('FRA');
    const me = game.state.countries[game.state.player];
    me.laws.taxation = 3;
    me.laws.conscription = 3;
    me.estates.commons.mood = -60;
    const advice = counsel(game).find((x) => x.id === 'privilege:commons');
    expect(advice?.weight).toBe(100);
    expect(counsel(game)[0].id).toBe('privilege:commons');
  });

  it('asks the chaplain to anoint a crown of doubtful right, weightiest first', () => {
    const game = realm('FRA');
    const me = game.state.countries[game.state.player];
    me.legitimacy = 20;
    me.tasks.chaplain = 'stability';
    const list = counsel(game);
    const anoint = list.find((x) => x.id === 'task:chaplain:legitimacy')!;
    expect(anoint.text).toContain('Legitimacy is low');
    for (let i = 1; i < list.length; i++) expect(list[i - 1].weight).toBeGreaterThanOrEqual(list[i].weight);
  });

  it('gives no counsel before a realm is chosen', () => {
    const game = realm('FRA');
    game.state.player = 0;
    expect(counsel(game)).toEqual([]);
  });
});

describe('hints', () => {
  it('say what matters the first time, once each, and not when turned off', () => {
    resetHints();
    settings.set({ hints: true });
    const game = realm('ENG');
    // England is at war with Norway in 1066.
    expect(currentHint(game)?.id).toBe('war');
    markSeen('war');
    expect(currentHint(game)).toBeNull();
    game.ui.set({ screen: 'court' });
    expect(currentHint(game)?.entry).toBe('rule:council');
    game.ui.set({ modal: 'menu' });
    expect(currentHint(game)).toBeNull();
    game.ui.set({ modal: 'none' });
    settings.set({ hints: false });
    expect(currentHint(game)).toBeNull();
    settings.set({ hints: true });
    resetHints();
  });
});
