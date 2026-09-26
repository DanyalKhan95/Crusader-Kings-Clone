/**
 * Runs the world headless with every country under AI control and reports what happened.
 *   npm run simulate -- --years 50 [--seed 7]
 */
import { readFileSync } from 'node:fs';
import { faithName } from '../src/sim/beliefs.ts';
import { ERAS } from '../src/data/eras.ts';
import { eraOf } from '../src/sim/tech.ts';
import { toDate } from '../src/sim/calendar.ts';
import { loyalty, memory } from '../src/sim/diplomacy.ts';
import { estateInfluence, estateLoyalty } from '../src/sim/politics.ts';
import { ESTATES } from '../src/sim/types.ts';
import { armySize, lordOf, provincesOf, realmProvinces } from '../src/sim/queries.ts';
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
const every = arg('every', 5);

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
const byCause = new Map<string, number>();
let revolts = 0;
const initialOwners = state.provinces.map((p) => p?.owner ?? 0);
const initialFaiths = state.provinces.map((p) => p?.religion ?? null);
const initialCultures = state.provinces.map((p) => p?.culture ?? null);
const crusades: string[] = [];
for (let d = 0; d < years * 365; d++) {
  advanceDay(state, world);
  const ids = new Set(state.wars.map((w) => w.id));
  for (const w of state.wars)
    if (!lastWars.has(w.id)) {
      wars++;
      byCause.set(w.cb, (byCause.get(w.cb) ?? 0) + 1);
      if (state.countries[w.attacker]?.rebel) revolts++;
      if (w.cb === 'crusade')
        crusades.push(
          `${fmt(state.day)} ${w.name}: ${state.countries[w.attacker].tag} vs ${state.countries[w.defender].tag}, ${w.attackers.length} realms took the cross`,
        );
    }
  for (const id of lastWars) if (!ids.has(id)) peaces++;
  lastWars = ids;
  if (d % Math.round(365 * every) === 0 || d === years * 365 - 1) {
    const alive = state.countries.filter((c) => c?.alive).length;
    const men = state.armies.reduce((s, a) => s + armySize(a), 0);
    const pacts = (k: string) => state.pacts.filter((p) => p.kind === k).length;
    const claims = state.countries.reduce((s, c) => s + (c?.alive ? c.claims.length : 0), 0);
    const forging = state.countries.filter((c) => c?.alive && c.fabricating).length;
    const tributaries = state.countries.filter((c) => c?.alive && c.overlord).length;
    console.log(
      `${fmt(state.day)}  countries ${alive}  wars ${state.wars.length}  armies ${state.armies.length} (${Math.round(men / 1000)}k men)  battles ${state.battles.length}`,
    );
    const realms = state.countries.filter((c) => c?.alive && !c.liege && !c.rebel);
    const eras = ERAS.map((e, i) => `${e.name.toLowerCase()} ${realms.filter((c) => eraOf(c!) === i).length}`)
      .filter((x) => !x.endsWith(' 0'))
      .join(', ');
    const top = Math.max(...realms.map((c) => Math.max(c!.tech.economy, c!.tech.military, c!.tech.society)));
    console.log(`            eras: ${eras}; highest level ${top}`);
    console.log(
      `            alliances ${pacts('alliance')}  naps ${pacts('nap')}  guarantees ${pacts('guarantee')}  access ${pacts('access')}  tributaries ${tributaries}  coalitions ${state.coalitions.length}  claims ${claims} (+${forging} forging)`,
    );
  }
}
const ms = performance.now() - t0;
const days = state.day - start;
console.log(`\n${days} days in ${(ms / 1000).toFixed(1)} s: ${Math.round((days / ms) * 1000)} days per second`);
console.log(`wars started ${wars}, ended ${peaces}: ${[...byCause].map(([k, n]) => `${k} ${n}`).join(', ')}`);
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
console.log(`revolts: ${revolts}; factions now: ${state.factions.length}`);
for (const e of ESTATES) {
  const vals = state.countries
    .filter((c) => c?.alive && !c.rebel)
    .map((c) => estateLoyalty(state, c!, e).total)
    .sort((a, b) => a - b);
  const powerful = state.countries.filter(
    (c) =>
      c?.alive && !c.rebel && estateInfluence(state, c!).share[e] >= 0.2 && estateLoyalty(state, c!, e).total < -35,
  ).length;
  console.log(
    `  ${e.padEnd(9)} loyalty min ${Math.round(vals[0])}  median ${Math.round(vals[vals.length >> 1])}  max ${Math.round(vals[vals.length - 1])}  at risk ${powerful}`,
  );
}
const laws = { taxation: [0, 0, 0, 0], conscription: [0, 0, 0, 0], crown: [0, 0, 0, 0] };
for (const c of state.countries)
  if (c?.alive && !c.rebel) for (const k of ['taxation', 'conscription', 'crown'] as const) laws[k][c.laws[k]]++;
console.log(`laws: ${JSON.stringify(laws)}`);
const govs = new Map<string, number>();
for (const c of state.countries) if (c?.alive && !c.rebel) govs.set(c.gov, (govs.get(c.gov) ?? 0) + 1);
console.log(
  `governments: ${[...govs]
    .sort((a, b) => b[1] - a[1])
    .map(([g, n]) => `${g} ${n}`)
    .join(', ')}`,
);
const tolerance = [0, 0, 0];
for (const c of state.countries) if (c?.alive && !c.rebel) tolerance[c.laws.tolerance]++;
console.log(`religious policy (persecution, established, tolerance): ${tolerance.join(', ')}`);
const converted = state.provinces.filter((p, id) => p && p.religion !== initialFaiths[id]).length;
const assimilated = state.provinces.filter((p, id) => p && p.culture !== initialCultures[id]).length;
const accepted = state.countries.reduce((n, c) => n + (c?.alive ? c.accepted.length : 0), 0);
console.log(`provinces that changed faith: ${converted}, people: ${assimilated}; accepted cultures: ${accepted}`);
const faiths = new Map<string, number>();
for (const p of state.provinces) if (p?.religion) faiths.set(p.religion, (faiths.get(p.religion) ?? 0) + 1);
console.log(
  `faiths: ${[...faiths]
    .sort((a, b) => b[1] - a[1])
    .map(([f, n]) => `${faithName(f)} ${n}`)
    .join(', ')}`,
);
const crowns = new Map<string, number>();
for (const c of state.countries) if (c?.alive && !c.rebel) crowns.set(c.religion, (crowns.get(c.religion) ?? 0) + 1);
console.log(
  `crowns by faith: ${[...crowns]
    .sort((a, b) => b[1] - a[1])
    .map(([f, n]) => `${faithName(f)} ${n}`)
    .join(', ')}`,
);
console.log(`great holy wars: ${crusades.length ? '' : 'none'}`);
for (const line of crusades) console.log(`  ${line}`);
const jer = state.countries.find((c) => c?.tag === 'JER' && c.alive);
const holy = state.provinces.findIndex((_, id) => world.region(id)?.name === 'Jerusalem');
console.log(
  `Jerusalem is held by ${state.countries[state.provinces[holy]?.owner]?.name ?? 'no one'}${jer ? `; the Kingdom of Jerusalem has ${provincesOf(state, jer.index).length} provinces` : ''}`,
);
const subjects = state.countries
  .filter((c) => c?.alive && lordOf(state, c.index))
  .map((c) => ({ c, l: loyalty(state, world, c.index).total }))
  .sort((a, b) => a.l - b.l);
console.log(
  `least loyal subjects: ${subjects
    .slice(0, 6)
    .map(({ c, l }) => `${c.tag}→${state.countries[lordOf(state, c.index)].tag} ${Math.round(l)}`)
    .join(', ')}`,
);
let worst = { v: 0, of: 0, about: 0 };
for (const c of state.countries)
  if (c?.alive)
    for (const k of Object.keys(c.memories)) {
      const v = memory(state, c.index, Number(k), 'ae');
      if (v < worst.v) worst = { v, of: c.index, about: Number(k) };
    }
if (worst.of)
  console.log(
    `worst aggressive expansion: ${state.countries[worst.of].tag} about ${state.countries[worst.about].tag}: ${Math.round(worst.v)}`,
  );
