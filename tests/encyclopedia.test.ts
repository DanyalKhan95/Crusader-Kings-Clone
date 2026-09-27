import { createElement, Fragment, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TECHS } from '../src/data/techs';
import { UNIT_ORDER } from '../src/data/units';
import type { StaticWorld } from '../src/game/world';
import type { MeshBundle } from '../src/render/meshBuilder';
import { faithIds } from '../src/sim/beliefs';
import { countryByTag } from '../src/sim/queries';
import { createGameState } from '../src/sim/setup';
import { makeSimWorld } from '../src/sim/world';
import { encyclopedia } from '../src/ui/encyclopedia';
import { CATEGORIES, search } from '../src/ui/encyclopedia/model';
import { createGame, GameContext, type Game } from '../src/ui/game';
import { loadData } from './helpers';

const { world: worldData, regions, scenario } = loadData();
const world = makeSimWorld(worldData, regions);

function england(): Game {
  const state = createGameState(world, scenario);
  state.player = countryByTag(state, 'ENG')!.index;
  const game = createGame(world as unknown as StaticWorld, scenario, state, null as unknown as MeshBundle);
  game.ui.set({ phase: 'playing', player: state.player });
  return game;
}

/** An entry's article as HTML, with the realm's own figures, as a campaign shows it. */
function render(game: Game, node: ReactNode): string {
  return renderToStaticMarkup(
    createElement(GameContext.Provider, { value: game }, createElement(Fragment, null, node)),
  );
}

/** Every page a link may lead to: an entry, a category, or the contents. */
function resolves(id: string): boolean {
  const { byId } = encyclopedia();
  if (id === '') return true;
  if (id.startsWith('cat:')) return CATEGORIES.some((c) => `cat:${c.id}` === id);
  return byId.has(id);
}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? sources(p) : p.endsWith('.tsx') || p.endsWith('.ts') ? [p] : [];
  });
}

describe('the encyclopedia', () => {
  it('has an entry for every technology, arm and faith, each id once', () => {
    const { entries, byId } = encyclopedia();
    expect(byId.size).toBe(entries.length);
    const count = (prefix: string) => entries.filter((e) => e.id.startsWith(prefix)).length;
    expect(count('tech:')).toBe(TECHS.economy.length + TECHS.military.length + TECHS.society.length);
    expect(count('unit:')).toBe(UNIT_ORDER.length);
    expect(count('faith:')).toBe(faithIds().length);
    expect(faithIds().length).toBeGreaterThan(30);
    for (const c of CATEGORIES)
      expect(
        entries.some((e) => e.category === c.id),
        c.id,
      ).toBe(true);
    expect(count('rule:')).toBeGreaterThan(45);
  });

  it('leads only to pages that exist, from its articles and from the rest of the interface', () => {
    const game = england();
    const { entries } = encyclopedia();
    const broken: string[] = [];
    for (const e of entries) {
      for (const id of e.see ?? []) if (!resolves(id)) broken.push(`${e.id} sees ${id}`);
      const html = render(game, [e.body(game), e.live?.(game)]);
      for (const [, id] of html.matchAll(/data-entry="([^"]*)"/g)) if (!resolves(id)) broken.push(`${e.id} → ${id}`);
    }
    // Links written into the screens and tooltips.
    for (const file of sources('src/ui')) {
      const text = readFileSync(file, 'utf8');
      for (const [, id] of text.matchAll(
        /(?:to|more)="((?:rule|law|cat|pact|cb|seat|estate|unit|ship|building|track|era|tech|gov|faith|plot|plague|modifier|trait|event|nation):[^"]*)"/g,
      ))
        if (!resolves(id)) broken.push(`${file} → ${id}`);
    }
    expect(broken).toEqual([]);
  });

  it('shows the realm’s own figures while a campaign is played', () => {
    const game = england();
    const { byId } = encyclopedia();
    const html = render(game, byId.get('rule:taxes')!.live!(game));
    expect(html).toContain('Your tax rate');
    game.ui.set({ phase: 'menu' });
    expect(byId.get('rule:taxes')!.live!(game)).toBeNull();
  });

  it('finds what is asked for, the rules first', () => {
    const { entries } = encyclopedia();
    expect(search(entries, 'legitimacy')[0].id).toBe('rule:legitimacy');
    expect(search(entries, 'knights').map((e) => e.id)).toContain('unit:knights');
    expect(search(entries, 'black death')[0].id).toBe('plague:black_death');
    expect(search(entries, 'war sc')[0].id).toBe('rule:war-score');
    expect(search(entries, 'zzzz')).toEqual([]);
    expect(search(entries, '   ')).toEqual([]);
  });
});
