/**
 * Happenings of the whole world: the comet that returns every 76 years, the Horde that rides out of
 * the steppe, the crash of the stock exchanges, the crises between rival great powers, and the wars
 * of the great powers of the modern age that alliance blocs turn into world wars. Pestilence lives
 * in `plague.ts`.
 */
import { COMETS, WORLD_WAR_NAMES } from '../data/events';
import { TECHS } from '../data/techs';
import { toDate } from './calendar';
import { cultureGroup } from './beliefs';
import { character } from './characters';
import { chronicle, theName } from './chronicle';
import { alliesOf, opinionOf, realmDev } from './diplomacy';
import { maxManpower } from './economy';
import { fireEvent } from './events';
import { log } from './log';
import { addModifier, hasModifier } from './modifiers';
import { realmNeighbours, sideOf, strengthOf } from './queries';
import { chance } from './rng';
import { eraOf } from './tech';
import type { Country, GameState } from './types';
import { callToArms, canDeclare, declareWar } from './war';
import { distanceKm, type SimWorld } from './world';

export function monthlyWorldEvents(state: GameState, world: SimWorld) {
  const { y, m } = toDate(state.day);
  comets(state, world, y, m);
  horde(state, world, y);
  crash(state, world, y);
  crisis(state, world, y);
  worldWars(state, world, y);
}

// ── Comets ────────────────────────────────────────────────────────

function comets(state: GameState, world: SimWorld, year: number, month: number) {
  const due = COMETS.find(([y, m]) => y === year && m === month);
  const key = `comet_${year}`;
  if (!due || state.happened[key] !== undefined) return;
  state.happened[key] = state.day;
  for (const c of state.countries) if (c?.alive && !c.rebel) fireEvent(state, world, c, 'comet');
}

// ── The Horde ─────────────────────────────────────────────────────

/** Where the Horde gathers: the steppe of Mongolia. */
const STEPPE = { lon: 103, lat: 47 } as Parameters<typeof distanceKm>[0];
const STEPPE_KM = 2000;
const STEPPE_PEOPLES = new Set(['mongolic', 'turkic', 'tungusic']);

/** The realm that rides as the Horde, if any. */
export function hordeRealm(state: GameState): Country | undefined {
  return state.countries.find((c) => c?.alive && hasModifier(c, 'horde'));
}

/**
 * Early in the 13th century a nomad of the eastern steppe unites the tribes: its realm becomes the
 * Horde, stronger than any army of its day and hungry for conquest. Every realm it comes to border
 * hears of it.
 */
function horde(state: GameState, world: SimWorld, year: number) {
  const khan = hordeRealm(state);
  if (khan) {
    for (const n of realmNeighbours(state, world, khan.index))
      fireEvent(state, world, state.countries[n], 'horde_arrives', { other: khan.index });
    return;
  }
  if (year < 1203 || year > 1240 || state.happened.horde !== undefined || !chance(state, 1 / 24)) return;
  // The Mongols, if they still ride; else the strongest steppe people of the east. Settled empires
  // of the steppe peoples (the Liao) are not hordes.
  let best: Country | undefined;
  const rank = (c: Country) => (c.culture === 'mongol' ? 1e9 : 0) + strengthOf(state, c.index);
  for (const c of state.countries) {
    if (!c?.alive || c.rebel || c.liege || !c.capital || c.gov === 'imperial') continue;
    if (!STEPPE_PEOPLES.has(cultureGroup(c.culture))) continue;
    if (distanceKm(STEPPE, world.region(c.capital)) > STEPPE_KM) continue;
    if (!best || rank(c) > rank(best)) best = c;
  }
  if (!best) return;
  state.happened.horde = state.day;
  const ruler = character(state, best.ruler);
  const was = ruler?.name ?? 'A chieftain';
  if (ruler) ruler.name = 'Genghis Khan';
  if (best.culture === 'mongol') {
    best.name = 'Mongol Empire';
    best.short = 'Mongolia';
    best.adj = 'Mongol';
  } else best.name = `Great ${best.adj} Horde`;
  best.rank = 'empire';
  best.gov = 'nomadic';
  best.legitimacy = 100;
  best.stability = 3;
  best.gold += 300;
  addModifier(state, best, 'horde');
  best.reserve.horse_archers = (best.reserve.horse_archers ?? 0) + 24000;
  best.reserve.light_cavalry = (best.reserve.light_cavalry ?? 0) + 8000;
  best.manpower = maxManpower(state, best).total;
  best.ai.nextWarCheck = state.day;
  state.mapVersion++;
  state.borderVersion++;
  chronicle(state, `${was} unites the peoples of the steppe as Genghis Khan: the ${best.adj} Horde rides out.`, {
    province: best.capital,
    realm: best.index,
  });
  const player = state.countries[state.player];
  const near = !!player?.capital && distanceKm(world.region(player.capital), world.region(best.capital)) < 5000;
  log(
    state,
    'all',
    'event',
    `${was} has united the peoples of the steppe and taken the name Genghis Khan. The ${best.adj} Horde rides out to conquer the world.`,
    { province: best.capital, important: near || best.index === state.player },
  );
}

// ── The crash ─────────────────────────────────────────────────────

/** Economic learning a realm needs to have stock exchanges that can crash. */
const EXCHANGES = 'stock_exchanges';

/**
 * From 1929, once there are stock exchanges enough in the world to crash, they crash together: every
 * realm with one falls into depression, and must choose how to meet it.
 */
function crash(state: GameState, world: SimWorld, year: number) {
  if (year < 1929 || state.happened.crash !== undefined || toDate(state.day).m < 10) return;
  const hit = state.countries.filter(
    (c) => c?.alive && !c.rebel && c.tech.economy >= techLevel(EXCHANGES) && eraOf(c) >= 3,
  );
  if (hit.length < 3) return;
  state.happened.crash = state.day;
  chronicle(state, 'The great stock exchanges crash, and a depression grips the industrial world.');
  log(state, 'all', 'economy', 'The great stock exchanges have crashed. A depression grips the industrial world.', {
    important: hit.some((c) => c.index === state.player),
  });
  for (const c of hit) {
    addModifier(state, c, 'depression');
    fireEvent(state, world, c, 'crash');
  }
}

function techLevel(id: string): number {
  return TECHS.economy.find((t) => t.id === id)?.level ?? 99;
}

// ── World wars ────────────────────────────────────────────────────

/** How many great powers the modern world has. */
const GREAT_POWERS = 8;

/** The great powers: the richest independent realms of the industrial age and after. */
export function greatPowers(state: GameState): number[] {
  const list = state.countries
    .filter((c) => c?.alive && !c.rebel && !c.liege && !c.overlord && eraOf(c) >= 3)
    .map((c) => ({ i: c.index, dev: realmDev(state, c.index) }))
    .sort((a, b) => b.dev - a.dev)
    .slice(0, GREAT_POWERS);
  return list.map((x) => x.i);
}

/** Years between the outbreaks of two world wars, at the least. */
const WORLD_WAR_GAP = 40;

/** The first year a crisis between great powers may break out. */
const CRISIS_FROM = 1905;

/**
 * Once a generation has passed since the last world war, the rivalry of two great powers that
 * share a border may come to a crisis (about once in ten years): the stronger marches, and their
 * alliances decide whether the world follows. The player is never made to strike first.
 */
function crisis(state: GameState, world: SimWorld, year: number) {
  if (year < CRISIS_FROM || state.wars.some((w) => w.world)) return;
  const last = state.happened.last_world_war;
  if (last !== undefined && state.day - last < WORLD_WAR_GAP * 365) return;
  if (!chance(state, 1 / 120)) return;
  const powers = greatPowers(state);
  let worst: { a: number; b: number; opinion: number } | null = null;
  for (const a of powers)
    for (const b of powers) {
      if (a === b || a === state.player || !realmNeighbours(state, world, a).has(b)) continue;
      // The stronger of the two strikes, unless it is the player's realm.
      if (b !== state.player && strengthOf(state, a) < strengthOf(state, b)) continue;
      if (!canDeclare(state, world, a, b, 'conquest', 0).ok) continue;
      const opinion = opinionOf(state, world, a, b) + opinionOf(state, world, b, a);
      if (!worst || opinion < worst.opinion) worst = { a, b, opinion };
    }
  if (!worst) return;
  const a = state.countries[worst.a],
    b = state.countries[worst.b];
  log(state, 'all', 'war', `A crisis between ${a.name} and ${b.name} ends in war.`, { province: b.capital });
  declareWar(state, world, a.index, b.index, 'conquest', 0);
}

/**
 * From 1900 a war with three great powers or more, on both sides, becomes a world war, a generation
 * after the last: it is named, every realm in it goes over to total war, and each side calls its
 * allies in turn, so the blocs are drawn in one after another.
 */
function worldWars(state: GameState, world: SimWorld, year: number) {
  if (year < 1900 || !state.wars.length) return;
  let powers: Set<number> | null = null;
  for (const war of state.wars) {
    if (war.cb === 'revolt') continue;
    if (!war.world) {
      powers ??= new Set(greatPowers(state));
      const last = state.happened.last_world_war;
      if (last !== undefined && state.day - last < WORLD_WAR_GAP * 365) continue;
      const a = war.attackers.filter((x) => powers!.has(x)).length;
      const d = war.defenders.filter((x) => powers!.has(x)).length;
      if (!a || !d || a + d < 3) continue;
      const n = (state.happened.world_wars ?? 0) + 1;
      state.happened.world_wars = n;
      state.happened.last_world_war = state.day;
      war.world = n;
      const name = WORLD_WAR_NAMES[n - 1] ?? `World War ${n}`;
      war.name = name[0].toUpperCase() + name.slice(1);
      state.diploVersion++;
      chronicle(
        state,
        `${war.name} begins: ${theName(state.countries[war.attacker].name)} against ${theName(state.countries[war.defender].name)}.`,
        { realm: war.attacker },
      );
      log(
        state,
        'all',
        'war',
        `${war.name} has begun: ${state.countries[war.attacker].name} and ${state.countries[war.defender].name} have drawn the great powers into war.`,
        { important: true },
      );
    }
    // Total war, and the blocs are called in.
    for (const side of ['attacker', 'defender'] as const) {
      const members = side === 'attacker' ? war.attackers : war.defenders;
      for (const m of [...members]) {
        const c = state.countries[m];
        if (!c?.alive) continue;
        addModifier(state, c, 'total_war', 45 / 365);
        if (c.liege) continue;
        for (const ally of alliesOf(state, m))
          if (!sideOf(war, ally)) callToArms(state, world, war, ally, side, 'alliance');
      }
    }
  }
}
