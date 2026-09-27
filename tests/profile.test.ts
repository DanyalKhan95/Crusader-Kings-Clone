import { afterEach, describe, expect, it } from 'vitest';
import { ProfileTotals, setProfileSink } from '../src/sim/profile';
import { createGameState } from '../src/sim/setup';
import { advanceDay } from '../src/sim/tick';
import { makeSimWorld } from '../src/sim/world';
import { loadData } from './helpers';

const { world: worldData, regions, scenario } = loadData();
const world = makeSimWorld(worldData, regions);

describe('profiling', () => {
  afterEach(() => setProfileSink(null));

  it('times every system of the day without changing the world', () => {
    const timed = createGameState(world, scenario, { seed: 5 });
    const plain = createGameState(world, scenario, { seed: 5 });
    const totals = new ProfileTotals();
    setProfileSink(totals);
    for (let i = 0; i < 40; i++) advanceDay(timed, world);
    setProfileSink(null);
    for (let i = 0; i < 40; i++) advanceDay(plain, world);
    expect(JSON.stringify(timed)).toBe(JSON.stringify(plain));

    const ranked = totals.ranked();
    const names = ranked.map((c) => c.system);
    // Daily systems run every day; the month's business on its own day.
    expect(ranked.find((c) => c.system === 'marching')?.calls).toBe(40);
    expect(names).toContain('monthlyEconomy');
    expect(names).toContain('monthlyAI');
    expect(ranked[0].ms).toBeGreaterThanOrEqual(ranked.at(-1)!.ms);
    expect(totals.total()).toBeGreaterThan(0);
  });
});
