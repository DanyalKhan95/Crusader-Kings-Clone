/**
 * What each day of the world costs, as the performance budget measures it (docs/ROADMAP.md, M9): the
 * same span played several times from one start, keeping each day's fastest time, so that the
 * collector's pauses and the engine's warming fall away and the work itself is left.
 *   npm run daycost -- [--load save.json] [--years 3] [--runs 3] [--worst 12]
 * Without --load it starts in 1066. Late-game worlds come from the simulator:
 *   npm run simulate -- --years 849 --seed 11 --save 1915.json
 */
import { readFileSync } from 'node:fs';
import type { RegionData, ScenarioData, WorldData } from '../src/shared/dataTypes.ts';
import { toDate } from '../src/sim/calendar.ts';
import { setProfileSink } from '../src/sim/profile.ts';
import { deserialize } from '../src/sim/save.ts';
import { createGameState } from '../src/sim/setup.ts';
import { advanceDay } from '../src/sim/tick.ts';
import { makeSimWorld } from '../src/sim/world.ts';

const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
};
const i = process.argv.indexOf('--load');
const load = i >= 0 ? process.argv[i + 1] : undefined;
const days = Math.round(arg('years', 3) * 365);
const runs = Math.max(1, arg('runs', 3));

const read = <T>(f: string): T => JSON.parse(readFileSync(`public/data/${f}`, 'utf8')) as T;
const world = makeSimWorld(read<WorldData>('world.json'), read<RegionData[]>('provinces.json'));
const text = load ? readFileSync(load, 'utf8') : undefined;
const start = () =>
  text ? deserialize(text, world) : createGameState(world, read<ScenarioData>('scenario-1066.json'));

/** Each day's fastest time, and where that time went. */
const best: { day: number; ms: number; parts: Map<string, number> }[] = [];
let today = new Map<string, number>();
setProfileSink({ add: (system, ms) => void today.set(system, (today.get(system) ?? 0) + ms) });
for (let r = 0; r < runs; r++) {
  const state = start();
  state.player = 0; // every realm under AI
  for (let d = 0; d < days; d++) {
    today = new Map();
    const t = performance.now();
    advanceDay(state, world);
    const ms = performance.now() - t;
    if (!best[d] || ms < best[d].ms) best[d] = { day: state.day, ms, parts: today };
  }
}

const fmt = (day: number) => {
  const t = toDate(day);
  return `${t.y}-${String(t.m).padStart(2, '0')}-${String(t.d).padStart(2, '0')}`;
};
const sorted = best.map((b) => b.ms).sort((a, b) => a - b);
const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))].toFixed(1);
const mean = sorted.reduce((s, ms) => s + ms, 0) / sorted.length;
console.log(
  `${fmt(best[0].day)} to ${fmt(best.at(-1)!.day)}, fastest of ${runs} runs: mean ${mean.toFixed(2)} ms, median ${at(0.5)}, 99% ${at(0.99)}, most ${at(1)}; over 8 ms ${best.filter((b) => b.ms > 8).length} days, over 12 ms ${best.filter((b) => b.ms > 12).length}`,
);
console.log('the costliest days:');
for (const b of [...best].sort((a, c) => c.ms - a.ms).slice(0, arg('worst', 12))) {
  const parts = [...b.parts]
    .sort((a, c) => c[1] - a[1])
    .slice(0, 3)
    .map(([k, v]) => `${k} ${v.toFixed(1)}`)
    .join(', ');
  console.log(`  ${fmt(b.day)} ${b.ms.toFixed(1).padStart(5)} ms: ${parts}`);
}
