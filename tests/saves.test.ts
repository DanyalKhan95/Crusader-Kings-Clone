import { describe, expect, it } from 'vitest';
import { toDay } from '../src/sim/calendar';
import { countryByTag } from '../src/sim/queries';
import { readSave, serialize } from '../src/sim/save';
import { createGameState } from '../src/sim/setup';
import { makeSimWorld } from '../src/sim/world';
import type { Game } from '../src/ui/game';
import { defaultSaveName, formatPlayed, formatSavedAt } from '../src/ui/saves';
import { loadData } from './helpers';

const { world: worldData, regions, scenario } = loadData();
const world = makeSimWorld(worldData, regions);

describe('saves', () => {
  it('keep the campaign, the time played and ironman beside the state', () => {
    const s = createGameState(world, scenario);
    const back = readSave(serialize(s, { campaign: 'abc', played: 3725, ironman: true }), world);
    expect(back.campaign).toBe('abc');
    expect(back.played).toBe(3725);
    expect(back.ironman).toBe(true);
    expect(JSON.stringify(back.state)).toBe(JSON.stringify(s));
  });

  it('read saves made before they kept a campaign', () => {
    const s = createGameState(world, scenario);
    const file = JSON.parse(serialize(s));
    file.played = -4;
    const back = readSave(JSON.stringify(file), world);
    expect(back.campaign).toBeUndefined();
    expect(back.played).toBeUndefined();
    expect(back.ironman).toBeUndefined();
  });

  it('are offered a name from the realm and the day', () => {
    const state = createGameState(world, scenario);
    state.player = countryByTag(state, 'ENG')!.index;
    state.day = toDay(1071, 3, 5);
    expect(defaultSaveName({ state } as Game)).toBe('England, 5 Mar 1071');
  });

  it('tell the time played and when they were made', () => {
    expect(formatPlayed(undefined)).toBe('under a minute');
    expect(formatPlayed(59)).toBe('under a minute');
    expect(formatPlayed(12 * 60 + 5)).toBe('12 min');
    expect(formatPlayed(3 * 3600 + 20 * 60)).toBe('3 h 20 min');
    const now = new Date(2026, 8, 27, 15, 0);
    expect(formatSavedAt(new Date(2026, 8, 27, 14, 5).toISOString(), now)).toMatch(/^today at /);
    expect(formatSavedAt(new Date(2026, 8, 26, 9, 30).toISOString(), now)).toMatch(/^yesterday at /);
    expect(formatSavedAt(new Date(2026, 2, 12).toISOString(), now)).toMatch(/2026/);
    expect(formatSavedAt('not a date', now)).toBe('');
  });
});
