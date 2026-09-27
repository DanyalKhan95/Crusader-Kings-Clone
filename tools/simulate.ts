/**
 * Runs the world headless with every country under AI control and reports what happened.
 *   npm run simulate -- --years 50 [--seed 7] [--load save.json] [--save out.json] [--profile]
 * --load starts from a save (every realm under AI); --save writes the world at the end as a save;
 * --profile reports where each day's time goes.
 */
import { readFileSync, writeFileSync } from 'node:fs';
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
import { fleetSize } from '../src/sim/naval.ts';
import { ProfileTotals, setProfileSink } from '../src/sim/profile.ts';
import { deserialize, serialize } from '../src/sim/save.ts';
import { makeSimWorld } from '../src/sim/world.ts';
import { ranking as scoreRanking } from '../src/sim/score.ts';
import type { RegionData, ScenarioData, WorldData } from '../src/shared/dataTypes.ts';

const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
};
const text = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const years = arg('years', 20);
const seed = arg('seed', 0);
const every = arg('every', 5);
const load = text('load');
const saveTo = text('save');
const profile = process.argv.includes('--profile') ? new ProfileTotals() : null;

/** With --profile: each day's cost, where the costliest days went, and the collector's pauses. */
const days_: { day: number; start: number; ms: number; parts: Map<string, number> }[] = [];
let today = new Map<string, number>();
const pauses: { start: number; ms: number }[] = [];
if (profile) {
  const totals = profile;
  setProfileSink({
    add(system, ms) {
      totals.add(system, ms);
      today.set(system, (today.get(system) ?? 0) + ms);
    },
  });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) pauses.push({ start: e.startTime, ms: e.duration });
  }).observe({ entryTypes: ['gc'] });
}

const read = <T>(f: string): T => JSON.parse(readFileSync(`public/data/${f}`, 'utf8')) as T;
const world = makeSimWorld(read<WorldData>('world.json'), read<RegionData[]>('provinces.json'));
const scenario = read<ScenarioData>('scenario-1066.json');
const state = load
  ? deserialize(readFileSync(load, 'utf8'), world)
  : createGameState(world, scenario, seed ? { seed } : {});
// Every realm under AI, the player's too.
state.player = 0;

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
const seenSeaBattles = new Set<number>();
let seaBattles = 0;
for (let d = 0; d < years * 365; d++) {
  const d0 = performance.now();
  advanceDay(state, world);
  if (profile) {
    days_.push({ day: state.day, start: d0, ms: performance.now() - d0, parts: today });
    today = new Map();
  }
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
  for (const b of state.navalBattles)
    if (!seenSeaBattles.has(b.id)) {
      seenSeaBattles.add(b.id);
      seaBattles++;
    }
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
    const ships = state.fleets.reduce((s, f) => s + fleetSize(f), 0);
    const expeditions = state.fleets.filter((f) => f.mission === 'explore').length;
    const settling = state.countries.reduce((s, c) => s + (c?.alive ? c.colonies.length : 0), 0);
    const colonial = state.countries.filter((c) => c?.alive && c.colony).length;
    const unowned = state.provinces.filter((p, id) => p && world.region(id).kind === 'land' && !p.owner).length;
    console.log(
      `            fleets ${state.fleets.length} (${Math.round(ships)} ships, ${expeditions} exploring)  sea battles ${seaBattles}  colonies being founded ${settling}  colonial nations ${colonial}  unclaimed land ${unowned}`,
    );
  }
}
const ms = performance.now() - t0;
const days = state.day - start;
console.log(`\n${days} days in ${(ms / 1000).toFixed(1)} s: ${Math.round((days / ms) * 1000)} days per second`);
if (profile) {
  await new Promise((r) => setTimeout(r, 0)); // the collector's last entries
  const total = profile.total();
  console.log(`where the time goes (${(total / days).toFixed(2)} ms a day on average):`);
  for (const c of profile.ranked().slice(0, 24))
    console.log(
      `  ${c.system.padEnd(22)} ${((c.ms / total) * 100).toFixed(1).padStart(5)}%  ${(c.ms / days).toFixed(3).padStart(7)} ms a day  ${(c.ms / c.calls).toFixed(3).padStart(7)} ms a run  max ${c.max.toFixed(1)} ms`,
    );
  // The collector's pauses, by the day they fell in.
  const gcOf = (d: (typeof days_)[number]) =>
    pauses.filter((p) => p.start >= d.start && p.start < d.start + d.ms).reduce((s, p) => s + p.ms, 0);
  // The first weeks warm the engine up; the rest is what a player meets.
  const settled = days_.slice(Math.min(60, days_.length >> 2));
  const sorted = settled.map((d) => d.ms).sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))].toFixed(1);
  const over = (ms: number) => settled.filter((d) => d.ms > ms).length;
  console.log(
    `a day, after the first weeks: median ${at(0.5)} ms, 90% ${at(0.9)}, 99% ${at(0.99)}, 99.9% ${at(0.999)}, most ${at(1)}; over 8 ms ${over(8)} days, over 16 ms ${over(16)}`,
  );
  const gcTotal = pauses.reduce((s, p) => s + p.ms, 0);
  const gcMost = pauses.reduce((m, p) => Math.max(m, p.ms), 0);
  console.log(
    `the collector: ${pauses.length} pauses, ${gcTotal.toFixed(0)} ms in all, the longest ${gcMost.toFixed(1)} ms`,
  );
  console.log('the costliest days:');
  for (const d of [...settled].sort((a, b) => b.ms - a.ms).slice(0, arg('worst', 10))) {
    const parts = [...d.parts]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => `${k} ${v.toFixed(1)}`)
      .join(', ');
    const gc = gcOf(d);
    console.log(
      `  ${fmt(d.day)} ${d.ms.toFixed(1).padStart(5)} ms: ${parts}${gc ? `; collector ${gc.toFixed(1)} ms` : ''}`,
    );
  }
}
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
// ── Events, pestilence, nations and spies ──
const fired = new Map<string, number>();
for (const c of state.countries)
  if (c) for (const k of Object.keys(c.history)) if (!k.includes(':')) fired.set(k, (fired.get(k) ?? 0) + 1);
console.log(
  `events that befell realms: ${[...fired]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k} ${n}`)
    .join(', ')}`,
);
const mods = new Map<string, number>();
for (const c of state.countries) if (c?.alive) for (const m of c.modifiers) mods.set(m.id, (mods.get(m.id) ?? 0) + 1);
console.log(
  `modifiers now: ${[...mods]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k} ${n}`)
    .join(', ')}`,
);
const world_ = Object.entries(state.happened)
  .filter(([k]) => !k.startsWith('tag:'))
  .map(([k, v]) => (k === 'world_wars' ? `world wars ${v}` : `${k} ${fmt(v)}`));
console.log(`world events: ${world_.join(', ') || 'none'}`);
const sick = state.provinces.filter((p) => p?.plague !== undefined).length;
const lost = state.provinces.reduce((s, p) => s + (p?.lost ?? 0), 0);
console.log(
  `pestilence: ${state.plague ? `${state.plague.id} since ${fmt(state.plague.since)}, ${sick} provinces sick` : 'none now'}; development still to regrow ${lost}`,
);
const nations = state.countries.filter((c) => c?.alive && Object.keys(c.history).some((k) => k.startsWith('nation:')));
console.log(
  `nations proclaimed: ${nations.map((c) => `${c.name} (${fmt(c.history[Object.keys(c.history).find((k) => k.startsWith('nation:'))!])})`).join(', ') || 'none'}`,
);
let networks = 0,
  strong = 0,
  plotted = 0;
for (const c of state.countries)
  if (c?.alive) {
    for (const v of Object.values(c.spies)) {
      networks++;
      if (v >= 50) strong++;
    }
    for (const k of Object.keys(c.memories)) if (memory(state, c.index, Number(k), 'plotted') < 0) plotted++;
  }
console.log(`spy networks: ${networks} (${strong} of 50 or more); grudges over exposed plots: ${plotted}`);
const hordes = state.countries.filter((c) => c?.alive && c.modifiers.some((m) => m.id === 'horde'));
for (const h of hordes) console.log(`the Horde: ${h.name}, ${realmProvinces(state, h.index).length} provinces`);
// ── Score, ledger and chronicle ──
const ranks = scoreRanking(state).slice(0, 10);
console.log(`ranking: ${ranks.map((c, i) => `${i + 1}. ${c.name} ${Math.round(c.score)}`).join(', ')}`);
console.log(`ledger snapshots: ${state.ledger.length}; chronicle entries: ${state.chronicle.length}`);
for (const e of state.chronicle.slice(-arg('chronicle', 25))) console.log(`  ${fmt(e.day)} ${e.text}`);
if (saveTo) {
  writeFileSync(saveTo, serialize(state));
  console.log(`saved the world of ${fmt(state.day)} to ${saveTo}`);
}
