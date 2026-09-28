/** Builds the starting state of a scenario: realms, rulers and courts, treasuries and armies. */
import type { CountryData, ScenarioData } from '../shared/dataTypes';
import { cultureGroup, registerBeliefs } from './beliefs';
import { makeCharacter, staffCourt } from './characters';
import { parseDate, years } from './calendar';
import { income, maxManpower } from './economy';
import { initialKnowledge } from './exploration';
import { newFleet } from './naval';
import { defaultEstates, defaultTasks, initialLaws } from './politics';
import { hashString, randInt } from './rng';
import { setup1066 } from './scripted';
import { snapshot } from './score';
import { initialTech } from './tech';
import { TRANSPORT_CAPACITY } from '../data/ships';
import type { Country, GameState, ProvinceState, Units } from './types';
import type { SimWorld } from './world';

export function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

const RANK_MAA: Record<string, number> = { county: 200, duchy: 400, kingdom: 900, empire: 1800 };

function startingMaa(c: CountryData): Units {
  const men = RANK_MAA[c.rank] ?? 300;
  const r = (f: number) => Math.round((men * f) / 100) * 100;
  switch (c.gov) {
    case 'nomadic':
      return { horse_archers: r(0.6), light_cavalry: r(0.2), spearmen: r(0.2) };
    case 'clan':
      return { spearmen: r(0.4), archers: r(0.3), light_cavalry: r(0.3) };
    case 'tribal':
      return { spearmen: r(0.6), archers: r(0.4) };
    case 'republic':
      return { spearmen: r(0.5), archers: r(0.5) };
    default:
      return { spearmen: r(0.5), archers: r(0.3), knights: r(0.2) };
  }
}

function strip(u: Units): Units {
  const out: Units = {};
  for (const [k, v] of Object.entries(u)) if (v) out[k as keyof Units] = v;
  return out;
}

export function createGameState(world: SimWorld, scenario: ScenarioData, opts: { seed?: number } = {}): GameState {
  registerBeliefs(world.world, world.regions);
  const seed = opts.seed ?? hashString(scenario.id);
  const state: GameState = {
    version: 10,
    scenario: scenario.id,
    seed,
    rng: seed,
    day: parseDate(scenario.start),
    countries: [null as unknown as Country],
    provinces: [],
    characters: {},
    armies: [],
    battles: [],
    fleets: [],
    navalBattles: [],
    wars: [],
    truces: [],
    pacts: [],
    coalitions: [],
    factions: [],
    holyWars: {},
    offers: [],
    proposalCooldown: 0,
    messages: [],
    nextId: 1,
    player: 0,
    mapVersion: 1,
    borderVersion: 1,
    diploVersion: 1,
    scheduled: [],
    events: [],
    happened: {},
    plague: null,
    chronicle: [],
    ledger: [],
  };
  const byTag = new Map<string, Country>();
  scenario.countries.forEach((c, i) => {
    const country: Country = {
      index: i + 1,
      tag: c.tag,
      name: c.name,
      short: c.short,
      adj: c.adj,
      gov: c.gov,
      rank: c.rank,
      color: hexToRgb(c.color),
      colorHex: c.color,
      liege: 0,
      overlord: 0,
      capital: c.capital,
      culture: c.culture,
      religion: c.religion,
      alive: true,
      gold: 0,
      stability: 1,
      warExhaustion: 0,
      manpower: 0,
      loans: [],
      reparations: [],
      lastBalance: 0,
      ruler: 0,
      rulerSince: 0,
      termEnds: 0,
      heir: 0,
      council: { chancellor: 0, marshal: 0, steward: 0, spymaster: 0, chaplain: 0 },
      courtiers: [],
      reserve: strip(startingMaa(c)),
      throneClaims: [],
      claims: [],
      fabricating: null,
      integrating: null,
      accepted: [],
      converting: null,
      assimilating: null,
      blessed: parseDate(scenario.start) - years(10),
      tech: initialTech(c.gov),
      research: { economy: 0, military: 0, society: 0 },
      focus: null,
      reformed: parseDate(scenario.start) - years(20),
      transports: 0,
      known: '',
      colonies: [],
      memories: {},
      modifiers: [],
      history: {},
      spies: {},
      spyTarget: 0,
      score: 0,
      laws: initialLaws(c.gov, c.tag, cultureGroup(c.culture)),
      lawChanged: 0,
      legitimacy: 60,
      estates: defaultEstates(),
      tasks: defaultTasks(),
      ai: { nextWarCheck: 0, nextBuild: 0, nextDiplo: 0 },
    };
    state.countries.push(country);
    byTag.set(c.tag, country);
  });
  scenario.countries.forEach((c) => {
    if (c.liege && byTag.has(c.liege)) byTag.get(c.tag)!.liege = byTag.get(c.liege)!.index;
  });

  for (const r of world.regions) {
    const entry = scenario.provinces[r.id];
    const owner = entry?.[0] ? (byTag.get(entry[0])?.index ?? 0) : 0;
    const p: ProvinceState = {
      owner,
      controller: owner,
      culture: entry?.[1] ?? null,
      religion: entry?.[2] ?? null,
      dev: r.kind === 'land' ? (r.dev ?? 1) : 0,
      buildings: {},
    };
    if (r.kind === 'land' && owner) {
      if (p.dev >= 10) p.buildings.castle = 1;
      if (p.dev >= 14) p.buildings.market = 1;
      if (p.dev >= 9 && r.coastal) p.buildings.port = 1;
    }
    state.provinces[r.id] = p;
  }
  for (const c of state.countries) {
    if (!c) continue;
    const cap = state.provinces[c.capital];
    if (cap) {
      cap.buildings.castle = Math.max(1, cap.buildings.castle ?? 0);
      cap.buildings.market = Math.max(1, cap.buildings.market ?? 0);
    }
  }

  // Rulers and courts
  scenario.countries.forEach((data, i) => {
    const c = state.countries[i + 1];
    const ruler = makeCharacter(state, world, c, {
      name: data.ruler?.name,
      age: data.ruler?.age ?? randInt(state, 20, 55),
      female: data.ruler?.female ?? false,
      talent: 2,
    });
    if (c.laws.succession !== 'republic') ruler.traits.push('_reigned');
    c.ruler = ruler.id;
    c.rulerSince = state.day - 5 * 365;
    c.lawChanged = state.day - years(5);
    if (c.laws.succession === 'republic') c.termEnds = state.day + years(1) + (c.index % 7) * 365;
    staffCourt(state, world, c, true);
  });

  // Treasuries and levies
  for (const c of state.countries) {
    if (!c) continue;
    c.manpower = Math.round(maxManpower(state, c).total);
    c.gold = Math.round(income(state, c).total * 4 + 25);
    c.ai.nextWarCheck = state.day + 60 + (c.index % 90);
    c.ai.nextBuild = state.day + (c.index % 60);
    c.ai.nextDiplo = state.day + 20 + (c.index % 100);
  }

  startingNavies(state, world);
  initialKnowledge(state, world);
  state.proposalCooldown = state.day + 60;
  if (scenario.id === '1066') setup1066(state, world);
  snapshot(state);
  return state;
}

/** Seafaring realms of 1066 whose fleets were greater than their size alone would give them. */
const SEAFARERS: Record<string, number> = {
  VEN: 5,
  NRW: 2,
  DEN: 2,
  SWE: 1.5,
  NRM: 1.5,
  BYZ: 1.5,
  FAT: 1.5,
  SRV: 2,
  CHO: 2,
  SIC: 1.5,
  ZIR: 1.5,
  ORK: 2,
  ISL: 2,
  JAP: 1.2,
};

/**
 * Fleets and transports for every realm with a coast: more for rich realms and those whose land lies
 * mostly by the sea, and for the seafaring peoples.
 */
function startingNavies(state: GameState, world: SimWorld) {
  for (const c of state.countries) {
    if (!c?.alive) continue;
    const own = state.provinces.flatMap((p, id) => (p?.owner === c.index ? [id] : []));
    const coast = own.filter((id) => world.region(id).coastal);
    if (!coast.length) continue;
    const share = coast.length / own.length;
    const boost = SEAFARERS[c.tag] ?? 1;
    const men = maxManpower(state, c).total * share * 0.35 * boost;
    c.transports = Math.round(men / TRANSPORT_CAPACITY[0]);
    const ships = Math.round((income(state, c).total * share * 0.25 + 1) * boost);
    if (ships < 4) continue;
    const port = coast.includes(c.capital)
      ? c.capital
      : coast.reduce((a, b) => (state.provinces[b].dev > state.provinces[a].dev ? b : a));
    const heavy = Math.round(ships * 0.4);
    newFleet(state, world, c, port, { heavy, light: ships - heavy });
  }
}
