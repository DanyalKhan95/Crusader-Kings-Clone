/**
 * Runs the world headless with every country under AI control and reports what happened.
 *   npm run simulate -- --years 50 [--seed 7]
 */
import { readFileSync } from 'node:fs';
import { toDate } from '../src/sim/calendar.ts';
import { armySize, provincesOf, realmProvinces } from '../src/sim/queries.ts';
import { createGameState } from '../src/sim/setup.ts';
import { advanceDay } from '../src/sim/tick.ts';
import { makeSimWorld } from '../src/sim/world.ts';
import type { RegionData, ScenarioData, WorldData } from '../src/shared/dataTypes.ts';

const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
};
const years = arg('years', 20);
const seed = arg('seed', 0);

const read = <T>(f: string): T => JSON.parse(readFileSync(`public/data/${f}`, 'utf8')) as T;
const world = makeSimWorld(read<WorldData>('world.json'), read<RegionData[]>('provinces.json'));
const scenario = read<ScenarioData>('scenario-1066.json');
const state = createGameState(world, scenario, seed ? { seed } : {});

const fmt = (d: number) => {
  const t = toDate(d);
  return `${t.y}-${String(t.m).padStart(2, '0')}-${String(t.d).padStart(2, '0')}`;
};

const start = state.day;
const t0 = performance.now();
let wars = 0,
  peaces = 0,
  lastWars = new Set<number>();
const initialOwners = state.provinces.map((p) => p?.owner ?? 0);
for (let d = 0; d < years * 365; d++) {
  advanceDay(state, world);
  const ids = new Set(state.wars.map((w) => w.id));
  for (const id of ids) if (!lastWars.has(id)) wars++;
  for (const id of lastWars) if (!ids.has(id)) peaces++;
  lastWars = ids;
  if (d % (365 * 5) === 0 || d === years * 365 - 1) {
    const alive = state.countries.filter((c) => c?.alive).length;
    const men = state.armies.reduce((s, a) => s + armySize(a), 0);
    console.log(
      `${fmt(state.day)}  countries ${alive}  wars ${state.wars.length}  armies ${state.armies.length} (${Math.round(men / 1000)}k men)  battles ${state.battles.length}`,
    );
  }
}
const ms = performance.now() - t0;
const days = state.day - start;
console.log(`\n${days} days in ${(ms / 1000).toFixed(1)} s: ${Math.round((days / ms) * 1000)} days per second`);
console.log(`wars started ${wars}, ended ${peaces}`);
const changed = state.provinces.filter((p, id) => p && p.owner !== initialOwners[id]).length;
console.log(`provinces that changed hands: ${changed}`);
const ranking = state.countries
  .filter((c) => c?.alive && !c.liege)
  .map((c) => ({ c, n: realmProvinces(state, c.index).length }))
  .sort((a, b) => b.n - a.n)
  .slice(0, 12);
console.log('largest realms:');
for (const { c, n } of ranking)
  console.log(
    `  ${c.name.padEnd(34)} ${String(n).padStart(4)} provinces (${provincesOf(state, c.index).length} own)  gold ${Math.round(c.gold)}  loans ${c.loans.length}  stability ${c.stability}`,
  );
const broke = state.countries.filter((c) => c?.alive && c.gold < 0).length;
const indebted = state.countries.filter((c) => c?.alive && c.loans.length >= 3).length;
console.log(`countries in the red: ${broke}, with 3+ loans: ${indebted}`);
const dead = state.countries.filter((c) => c && !c.alive).map((c) => c.tag);
console.log(`destroyed: ${dead.length ? dead.join(' ') : 'none'}`);
const eng = state.countries.find((c) => c?.tag === 'ENG');
if (eng) {
  const ruler = state.characters[eng.ruler];
  console.log(
    `England: ${eng.alive ? 'alive' : 'gone'}, ruled by ${ruler?.name}, ${provincesOf(state, eng.index).length} provinces`,
  );
}
console.log(`messages logged: ${state.messages.length}`);
