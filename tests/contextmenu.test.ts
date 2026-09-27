import { describe, expect, it } from 'vitest';
import type { StaticWorld } from '../src/game/world';
import type { MeshBundle } from '../src/render/meshBuilder';
import { fabricationCost } from '../src/sim/diplomacy';
import { ALL_KNOWN, knows } from '../src/sim/exploration';
import { countryByTag, provincesOf } from '../src/sim/queries';
import { createGameState } from '../src/sim/setup';
import type { GameState } from '../src/sim/types';
import { makeSimWorld } from '../src/sim/world';
import { cycleArmies, cycleFleets } from '../src/ui/actions';
import { createGame, type Game } from '../src/ui/game';
import { menuFor, type Menu, type MenuItem } from '../src/ui/hud/ContextMenu';
import { loadData } from './helpers';

const { world: worldData, regions, scenario } = loadData();
const world = makeSimWorld(worldData, regions);

/** A campaign as England, with the UI store the menus and keys use. */
function england(): { state: GameState; game: Game } {
  const state = createGameState(world, scenario);
  state.player = countryByTag(state, 'ENG')!.index;
  const game = createGame(world as unknown as StaticWorld, scenario, state, null as unknown as MeshBundle);
  game.ui.set({ phase: 'playing', player: state.player });
  return { state, game };
}

const byName = (name: string) => regions.find((r) => r.name === name)!.id;
const items = (m: Menu | null): MenuItem[] => m?.groups.flat() ?? [];
const item = (m: Menu | null, key: string) => items(m).find((i) => i.key === key);

describe('the menu of a place', () => {
  it('offers building and recruiting at home', () => {
    const { state, game } = england();
    const me = state.countries[state.player];
    const home = menuFor(game, me.capital)!;
    expect([home.title, home.sub]).toEqual(['London', 'Your province']);
    expect(items(home).map((i) => i.key)).toEqual(['look', 'build', 'recruit']);

    const build = menuFor(game, me.capital, 'build')!;
    expect(item(build, 'back')?.page).toBe('main');
    expect(item(build, 'farms')).toMatchObject({ label: 'Cleared fields', cost: 75 });
    // A building beyond the realm's purse says so, and costs nothing yet.
    me.gold = 10;
    expect(item(menuFor(game, me.capital, 'build'), 'farms')).toMatchObject({
      reason: 'Needs 75 gold',
      cost: undefined,
    });

    const recruit = menuFor(game, me.capital, 'recruit')!;
    expect(item(recruit, 'raise')?.reason).toBeUndefined();
    expect(
      items(recruit)
        .filter((i) => i.key.startsWith('maa:'))
        .every((i) => i.reason?.startsWith('Needs')),
    ).toBe(true);
  });

  it('offers war, a claim, a gift and treaties abroad', () => {
    const { state, game } = england();
    const me = state.countries[state.player];
    const powys = byName('Powys');
    const gwynedd = state.provinces[powys].owner;
    const m = menuFor(game, powys)!;
    expect(m.sub).toBe('The Kingdom of Gwynedd');
    expect(item(m, 'declare')).toMatchObject({ label: 'Declare war on Gwynedd', tone: 'danger', reason: undefined });
    expect(item(m, 'fabricate')?.cost).toBe(fabricationCost(state, powys));
    expect(item(m, 'gift')?.cost).toBeGreaterThan(0);
    expect(item(m, 'treaties')).toMatchObject({ label: 'Treaties with Gwynedd', page: 'treaties' });
    expect(items(menuFor(game, powys, 'treaties')).map((i) => i.key)).toEqual([
      'back',
      'alliance',
      'nap',
      'access',
      'guarantee',
    ]);

    // A truce closes the road to war, and says until when.
    state.truces.push({ a: state.player, b: gwynedd, until: state.day + 400 });
    expect(item(menuFor(game, powys), 'declare')?.reason).toMatch(/^A truce holds until /);

    // A claim of our own: no second one, and the war would be for it.
    me.claims.push(powys);
    const claimed = menuFor(game, powys)!;
    expect(item(claimed, 'fabricate')).toBeUndefined();
    expect(item(claimed, 'claimed')?.act).toBeUndefined();
    expect(item(claimed, 'declare')?.note).toBe('For your claim on Powys');
  });

  it('leads to the war with an enemy, and offers no gifts', () => {
    const { state, game } = england();
    const norway = countryByTag(state, 'NRW')!;
    const m = menuFor(game, norway.capital)!;
    expect(item(m, 'war')?.note).toBe(state.wars[0].name);
    expect(item(m, 'declare')).toBeUndefined();
    expect(item(m, 'gift')).toBeUndefined();
    expect(item(m, 'treaties')).toBeUndefined();
  });

  it('lets a vassal fight its liege for independence', () => {
    const { state, game } = england();
    const vassal = state.countries.find((c) => c?.alive && c.liege && provincesOf(state, c.liege).length)!;
    state.player = vassal.index;
    const m = menuFor(game, provincesOf(state, vassal.liege)[0])!;
    expect(item(m, 'independence')?.tone).toBe('danger');
    expect(item(m, 'declare')).toBeUndefined();
    expect(item(m, 'fabricate')).toBeUndefined();
  });

  it('offers a colony in empty land, or says why not', () => {
    const { state, game } = england();
    state.countries[state.player].known = ALL_KNOWN;
    const wild = regions.find((r) => r.kind === 'land' && !r.impassable && !state.provinces[r.id]?.owner)!;
    const m = menuFor(game, wild.id)!;
    expect(m.arms).toBeUndefined();
    expect(item(m, 'colonise')?.reason).toBeTruthy();
  });

  it('knows nothing of unknown lands, and little of the sea', () => {
    const { state, game } = england();
    const me = state.countries[state.player];
    const unknown = regions.find((r) => !knows(world, me, r.id))!;
    expect(menuFor(game, unknown.id)).toEqual({
      title: 'Unknown lands',
      sub: 'Your people know nothing of them',
      groups: [],
    });
    const sea = regions.find((r) => r.kind === 'sea' && knows(world, me, r.id))!;
    expect(items(menuFor(game, sea.id)).map((i) => i.key)).toEqual(['look']);
  });
});

describe('the keys for armies and fleets', () => {
  it('go round the armies, and back with Shift', () => {
    const { state, game } = england();
    const ids = state.armies.filter((a) => a.owner === state.player).map((a) => a.id);
    expect(ids.length).toBeGreaterThan(1);
    const selected = () => game.ui.get().selectedArmy;
    cycleArmies(game, 1);
    expect(selected()).toBe(ids[0]);
    cycleArmies(game, 1);
    expect(selected()).toBe(ids[1]);
    cycleArmies(game, -1);
    expect(selected()).toBe(ids[0]);
    cycleArmies(game, -1);
    expect(selected()).toBe(ids.at(-1));
    expect(game.ui.get().panel).toBe('army');
  });

  it('go round the fleets from none selected, backwards to the last', () => {
    const { state, game } = england();
    const ids = state.fleets.filter((f) => f.owner === state.player).map((f) => f.id);
    cycleFleets(game, -1);
    expect(game.ui.get()).toMatchObject({ panel: 'fleet', selectedFleet: ids.at(-1) });
  });
});
