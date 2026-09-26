/**
 * Colonisation. Land no realm rules can be settled: a colonist founds a colony that takes a few years
 * and some gold every month, faster for a realm of richer technology, slower where natives live, who
 * may attack it. How many colonies a realm can found at once, and how far from its land, grow with
 * technology. Colonies far over the sea, on another continent, are governed by a colonial nation:
 * a vassal of the realm that founded them, which may one day want its freedom.
 */
import { eraOfLevel } from '../data/eras';
import { ADJ_STRAIT } from '../shared/dataTypes';
import { cultureGroup } from './beliefs';
import { makeCharacter, staffCourt } from './characters';
import { knows, revealAround } from './exploration';
import { log } from './log';
import { isPassable, isWater } from './movement';
import { defaultEstates, defaultTasks, initialLaws } from './politics';
import { countryByTag, isInRealm, provincesOf, realmMembers, topLiege } from './queries';
import { chance, randInt } from './rng';
import { techEffect } from './tech';
import type { Country, GameState, Mission } from './types';
import { distanceKm, type SimWorld } from './world';

/** How far from its land a realm without the technology for more may found a colony, in km. */
export const BASE_RANGE = 400;
/** Gold a month for each colony being founded. */
export const COLONY_UPKEEP = 1.5;
/** Provinces a realm must hold in a colonial region before a colonial nation governs them. */
const NATION_AT = 3;
/** A colony is overseas, and may join a colonial nation, when this far from its founder's capital. */
const OVERSEAS_KM = 2500;

export function colonists(c: Country): number {
  return 1 + techEffect(c, 'colonists');
}

export function colonialRange(c: Country): number {
  return BASE_RANGE + techEffect(c, 'colonialRange');
}

/** The native people of a province no realm rules: how many there are (0 if none). */
export function natives(state: GameState, world: SimWorld, id: number): number {
  const p = state.provinces[id];
  if (!p || p.owner || !p.culture || world.region(id).kind !== 'land') return 0;
  return world.region(id).dev ?? 1;
}

/** Who is settling a province now, if anyone. */
export function colonisedBy(state: GameState, id: number): Country | undefined {
  return state.countries.find((c) => c?.alive && c.colonies.some((m) => m.province === id));
}

export function colonyCost(_state: GameState, world: SimWorld, id: number): number {
  return 30 + 5 * (world.region(id).dev ?? 1);
}

/** Months a colony takes: slower among many natives, faster with the economy of later eras. */
export function colonyMonths(state: GameState, world: SimWorld, c: Country, id: number): number {
  const era = eraOfLevel(c.tech.economy);
  return Math.round((48 * (1 + natives(state, world, id) / 4)) / (1 + 0.15 * era));
}

/** Distance in km from a province to the nearest land of the realm. */
export function distanceToRealm(state: GameState, world: SimWorld, c: Country, id: number): number {
  const r = world.region(id);
  let best = Infinity;
  for (const m of realmMembers(state, topLiege(state, c.index)))
    for (const x of provincesOf(state, m)) {
      const d = distanceKm(r, world.region(x));
      if (d < best) best = d;
    }
  return best;
}

/** True if the province borders land of the realm (across a border, river or strait). */
function bordersRealm(state: GameState, world: SimWorld, c: Country, id: number): boolean {
  const realm = topLiege(state, c.index);
  return world.region(id).adj.some(([n]) => {
    const o = state.provinces[n]?.owner ?? 0;
    return o && isInRealm(state, o, realm);
  });
}

export type ColonyCheck = { ok: true; cost: number; months: number } | { ok: false; reason: string };

export function canColonise(state: GameState, world: SimWorld, c: Country, id: number): ColonyCheck {
  const r = world.region(id);
  const p = state.provinces[id];
  if (!r || r.kind !== 'land' || !p) return { ok: false, reason: 'Not land' };
  if (!isPassable(r)) return { ok: false, reason: 'No one can live there' };
  if (p.owner) return { ok: false, reason: 'Already ruled by a realm' };
  if (!knows(world, c, id)) return { ok: false, reason: 'Unknown land' };
  const other = colonisedBy(state, id);
  if (other) return { ok: false, reason: other === c ? 'Your colonists are there' : `${other.name} is settling it` };
  if (natives(state, world, id) && !techEffect(c, 'colonists'))
    return { ok: false, reason: 'Settling among natives needs Cartography or joint-stock companies' };
  if (c.colonies.length >= colonists(c)) return { ok: false, reason: 'No colonist is free' };
  // Over land from the realm's own border, or over the sea to a coast within range.
  if (!bordersRealm(state, world, c, id)) {
    if (!r.coastal) return { ok: false, reason: 'Only reachable by land from your own' };
    const km = distanceToRealm(state, world, c, id);
    if (km > colonialRange(c)) return { ok: false, reason: `Too far: ${Math.round(km)} km of ${colonialRange(c)}` };
  }
  const cost = colonyCost(state, world, id);
  if (c.gold < cost) return { ok: false, reason: `Needs ${cost} gold` };
  return { ok: true, cost, months: colonyMonths(state, world, c, id) };
}

export function startColony(state: GameState, world: SimWorld, c: Country, id: number): ColonyCheck {
  const check = canColonise(state, world, c, id);
  if (!check.ok) return check;
  c.gold -= check.cost;
  c.colonies.push({ province: id, progress: 0, needed: check.months });
  return check;
}

export function abandonColony(c: Country, id: number): boolean {
  const before = c.colonies.length;
  c.colonies = c.colonies.filter((m) => m.province !== id);
  return c.colonies.length < before;
}

/** Colonies grow each month; natives may strike, and a colony that is taken first is given up. */
export function monthlyColonies(state: GameState, world: SimWorld) {
  // Land a realm holds over the sea, where it has a colonial nation, is governed by it.
  for (const n of state.countries) {
    if (!n?.alive || !n.colony || !n.liege) continue;
    const lord = state.countries[n.liege];
    for (const id of provincesOf(state, lord.index)) {
      if (colonialRegion(world, id) !== n.colony || landmassOf(world, id) === landmassOf(world, lord.capital)) continue;
      state.provinces[id].owner = n.index;
      if (state.provinces[id].controller === lord.index) state.provinces[id].controller = n.index;
      state.mapVersion++;
      state.borderVersion++;
    }
  }
  for (const c of state.countries) {
    if (!c?.alive || !c.colonies.length) continue;
    for (const m of [...c.colonies]) {
      const p = state.provinces[m.province];
      const name = world.region(m.province).name;
      if (p.owner) {
        abandonColony(c, m.province);
        log(state, [c.index], 'colony', `The colony at ${name} was given up: the land now has a ruler.`);
        continue;
      }
      c.gold -= COLONY_UPKEEP;
      m.progress++;
      const n = natives(state, world, m.province);
      if (n && chance(state, 0.004 * n)) {
        m.progress = Math.max(0, m.progress - Math.ceil(m.needed / 4));
        log(state, [c.index], 'colony', `Natives have attacked the colony at ${name}.`, { province: m.province });
      }
      if (m.progress >= m.needed) {
        abandonColony(c, m.province);
        foundColony(state, world, c, m);
      }
    }
  }
}

function foundColony(state: GameState, world: SimWorld, c: Country, m: Mission) {
  const id = m.province;
  const p = state.provinces[id];
  const n = natives(state, world, id);
  // Settlers bring their ways to empty land; where many natives live, the natives keep theirs.
  if (!p.culture || n <= 2) {
    p.culture = c.culture;
    p.religion = c.religion;
  }
  p.dev = Math.max(1, Math.floor((world.region(id).dev ?? 1) / 2));
  p.owner = c.index;
  p.controller = c.index;
  state.mapVersion++;
  state.borderVersion++;
  revealAround(state, world, c.index, id);
  log(state, [c.index], 'colony', `A colony has been founded at ${world.region(id).name}.`, { province: id });
  governColony(state, world, c, id);
}

// ── Colonial nations ──────────────────────────────────────────────

interface ColonialRegion {
  name: string;
  /** colonial nations here are named "New <founder>" rather than "<founder's> <region>" */
  newWorld?: boolean;
  countries: string[];
}

/** Regions where colonies over the sea are governed by colonial nations, by modern country. */
export const COLONIAL_REGIONS: Record<string, ColonialRegion> = {
  north_america: { name: 'America', newWorld: true, countries: ['USA', 'CAN', 'GRL', 'SPM', 'BMU'] },
  caribbean: {
    name: 'the Caribbean',
    countries: [
      ...['MEX', 'GTM', 'BLZ', 'HND', 'SLV', 'NIC', 'CRI', 'PAN', 'CUB', 'JAM', 'HTI', 'DOM', 'PRI', 'BHS', 'TTO'],
      ...['ATG', 'BRB', 'DMA', 'GRD', 'KNA', 'LCA', 'VCT', 'ABW', 'CUW', 'VIR', 'VGB', 'TCA', 'CYM', 'AIA', 'MSR'],
      ...['GLP', 'MTQ', 'BLM', 'MAF', 'SXM', 'BES'],
    ],
  },
  brazil: { name: 'Brazil', countries: ['BRA'] },
  la_plata: { name: 'La Plata', countries: ['ARG', 'URY', 'PRY', 'FLK'] },
  andes: { name: 'Peru', countries: ['PER', 'BOL', 'ECU', 'COL', 'VEN', 'GUY', 'SUR', 'GUF', 'CHL'] },
  australia: { name: 'Australia', newWorld: true, countries: ['AUS', 'NZL'] },
  pacific: {
    name: 'Oceania',
    countries: ['PNG', 'SLB', 'VUT', 'FJI', 'NCL', 'PYF', 'FSM', 'WSM', 'TON', 'KIR', 'MHL', 'PLW', 'GUM', 'MNP'],
  },
  east_indies: { name: 'the East Indies', countries: ['IDN', 'PHL', 'MYS', 'BRN', 'TLS'] },
  west_africa: {
    name: 'Guinea',
    countries: [
      ...['SEN', 'GMB', 'GNB', 'GIN', 'SLE', 'LBR', 'CIV', 'GHA', 'TGO', 'BEN', 'NGA', 'CMR', 'MLI', 'BFA', 'NER'],
      'MRT',
    ],
  },
  central_africa: { name: 'the Congo', countries: ['GAB', 'COG', 'COD', 'CAF', 'GNQ', 'AGO', 'TCD'] },
  east_africa: {
    name: 'East Africa',
    countries: ['KEN', 'TZA', 'UGA', 'RWA', 'BDI', 'MOZ', 'MWI', 'ZMB', 'MDG', 'SOM', 'ETH', 'ERI', 'SDN', 'SDS'],
  },
  south_africa: { name: 'the Cape', countries: ['ZAF', 'NAM', 'BWA', 'ZWE', 'LSO', 'SWZ'] },
};

const landmasses = new WeakMap<SimWorld, Int32Array>();

/**
 * Landmasses: land joined by land, not across straits. Eurasia and Africa are one, the Americas
 * another; islands are their own.
 */
export function landmassOf(world: SimWorld, id: number): number {
  let label = landmasses.get(world);
  if (!label) {
    label = new Int32Array(world.regions.length + 1).fill(-1);
    let next = 0;
    for (const r of world.regions) {
      if (r.kind !== 'land' || label[r.id] >= 0) continue;
      const stack = [r.id];
      label[r.id] = next;
      while (stack.length) {
        const x = stack.pop()!;
        for (const [n, , flags] of world.region(x).adj)
          if (world.region(n)?.kind === 'land' && !(flags & ADJ_STRAIT) && label[n] < 0) {
            label[n] = next;
            stack.push(n);
          }
      }
      next++;
    }
    landmasses.set(world, label);
  }
  return label[id] ?? -1;
}

const regionOfCountry = new Map<string, string>();
for (const [id, r] of Object.entries(COLONIAL_REGIONS)) for (const cc of r.countries) regionOfCountry.set(cc, id);

/** The colonial region of a province, from the modern country it lies in (null for most of the Old World). */
export function colonialRegion(world: SimWorld, id: number): string | null {
  const cc = world.region(id)?.modern?.[0];
  return cc ? (regionOfCountry.get(cc) ?? null) : null;
}

/** The colonial nation that governs a region for a realm, if there is one. */
export function colonialNation(state: GameState, c: Country, region: string): Country | undefined {
  return state.countries.find((x) => x?.alive && x.liege === c.index && x.colony === region);
}

/**
 * A new colony over the sea passes to the realm's colonial nation there, and enough of them found
 * one.
 */
function governColony(state: GameState, world: SimWorld, c: Country, id: number) {
  if (c.colony) return;
  const region = colonialRegion(world, id);
  if (!region) return;
  if (colonialRegion(world, c.capital) === region) return;
  const overseas = (x: number) =>
    landmassOf(world, x) !== landmassOf(world, c.capital) &&
    distanceKm(world.region(c.capital), world.region(x)) >= OVERSEAS_KM;
  if (!overseas(id)) return;
  const nation = colonialNation(state, c, region);
  if (nation) {
    state.provinces[id].owner = nation.index;
    state.provinces[id].controller = nation.index;
    state.mapVersion++;
    state.borderVersion++;
    return;
  }
  const held = provincesOf(state, c.index).filter(
    (x) => colonialRegion(world, x) === region && distanceKm(world.region(c.capital), world.region(x)) >= OVERSEAS_KM,
  );
  if (held.length >= NATION_AT) foundColonialNation(state, world, c, region, held);
}

function colonialName(state: GameState, c: Country, region: string): { name: string; short: string; adj: string } {
  const def = COLONIAL_REGIONS[region];
  const base = c.short.replace(/^the /, '');
  const taken = (s: string) => state.countries.some((x) => x?.alive && x.short === s);
  if (def.newWorld && !taken(`New ${base}`)) return { name: `New ${base}`, short: `New ${base}`, adj: c.adj };
  const short = `${c.adj} ${def.name.replace(/^the /, '')}`;
  return { name: `${c.adj} ${def.name.replace(/^the /, '')}`, short, adj: c.adj };
}

function colonialTag(state: GameState): string {
  for (let n = 1; ; n++) {
    const tag = `C${n.toString(36).toUpperCase().padStart(2, '0')}`;
    if (!countryByTag(state, tag)) return tag;
  }
}

const COLONIAL_GOVERNMENT: Partial<Record<Country['gov'], Country['gov']>> = {
  tribal: 'feudal',
  nomadic: 'feudal',
  clan: 'feudal',
  theocracy: 'feudal',
  imperial: 'feudal',
};

export function foundColonialNation(
  state: GameState,
  world: SimWorld,
  c: Country,
  region: string,
  provinces: number[],
): Country {
  const index = state.countries.length;
  const names = colonialName(state, c, region);
  const [r, g, b] = c.color;
  const color: [number, number, number] = [
    Math.min(255, Math.round(r * 0.75 + 60)),
    Math.min(255, Math.round(g * 0.75 + 50)),
    Math.min(255, Math.round(b * 0.75 + 30)),
  ];
  const gov = COLONIAL_GOVERNMENT[c.gov] ?? c.gov;
  const capital = provinces.reduce((a, x) => (state.provinces[x].dev > state.provinces[a].dev ? x : a));
  const tag = colonialTag(state);
  const k: Country = {
    index,
    tag,
    ...names,
    gov,
    rank: 'duchy',
    color,
    colorHex: `#${color.map((v) => v.toString(16).padStart(2, '0')).join('')}`,
    liege: c.index,
    overlord: 0,
    capital,
    culture: c.culture,
    religion: c.religion,
    alive: true,
    gold: 50,
    stability: 1,
    warExhaustion: 0,
    manpower: 0,
    loans: [],
    lastBalance: 0,
    ruler: 0,
    rulerSince: state.day,
    termEnds: 0,
    heir: 0,
    council: { chancellor: 0, marshal: 0, steward: 0, spymaster: 0, chaplain: 0 },
    courtiers: [],
    reserve: {},
    throneClaims: [],
    claims: [],
    fabricating: null,
    integrating: null,
    accepted: [],
    converting: null,
    assimilating: null,
    blessed: state.day,
    tech: { ...c.tech },
    research: { economy: 0, military: 0, society: 0 },
    focus: null,
    reformed: state.day,
    transports: 20,
    known: c.known,
    colonies: [],
    colony: region,
    memories: {},
    modifiers: [],
    history: {},
    spies: {},
    spyTarget: 0,
    score: 0,
    laws: initialLaws(gov, tag, cultureGroup(c.culture)),
    lawChanged: state.day,
    legitimacy: 60,
    estates: defaultEstates(),
    tasks: defaultTasks(),
    ai: { nextWarCheck: state.day + 365 * 5, nextBuild: state.day + 30, nextDiplo: state.day + 90 },
  };
  state.countries.push(k);
  const ruler = makeCharacter(state, world, k, { age: randInt(state, 30, 55), talent: 1 });
  k.ruler = ruler.id;
  staffCourt(state, world, k, true);
  for (const id of provinces) {
    state.provinces[id].owner = index;
    state.provinces[id].controller = index;
  }
  state.mapVersion++;
  state.borderVersion++;
  state.diploVersion++;
  log(state, [c.index], 'colony', `The colonies of ${c.name} in ${COLONIAL_REGIONS[region].name} now form ${k.name}.`, {
    province: capital,
    important: c.index === state.player,
  });
  return k;
}

// ── The AI ────────────────────────────────────────────────────────

/**
 * Every few months, a realm with a free colonist and gold to spare settles the best land in reach:
 * rich, with few natives, and close.
 */
export function colonyAI(state: GameState, world: SimWorld, c: Country, month: number) {
  if (c.rebel || (month + c.index) % 3 || c.colonies.length >= colonists(c) || c.loans.length) return;
  if (c.gold < 120 || state.wars.some((w) => w.attackers.includes(c.index) || w.defenders.includes(c.index))) return;
  const range = colonialRange(c);
  const own = provincesOf(state, c.index);
  if (!own.length) return;
  const coasts = own.filter((id) => world.region(id).coastal);
  const scored: { id: number; score: number }[] = [];
  const consider = (id: number, overland: boolean) => {
    const p = state.provinces[id];
    const r = world.region(id);
    if (p.owner || r.kind !== 'land' || !isPassable(r) || !knows(world, c, id)) return;
    const score =
      (r.dev ?? 1) * 2 - natives(state, world, id) * 1.5 + (overland ? 4 : 0) + (r.terrain === 'ice' ? -8 : 0);
    scored.push({ id, score });
  };
  // Over the border.
  const seen = new Set<number>();
  for (const x of own)
    for (const [n] of world.region(x).adj)
      if (!seen.has(n) && !isWater(world.region(n))) {
        seen.add(n);
        consider(n, true);
      }
  // Over the sea, to coasts in range (roughly: measured from a few of the realm's ports).
  if (coasts.length && range > BASE_RANGE) {
    const ports = coasts.slice(0, 12).map((id) => world.region(id));
    state.provinces.forEach((p, id) => {
      if (!p || p.owner || seen.has(id)) return;
      const r = world.region(id);
      if (r.kind !== 'land' || !r.coastal) return;
      if (range < 5000 && !ports.some((q) => distanceKm(q, r) <= range)) return;
      consider(id, false);
    });
  }
  scored.sort((a, b) => b.score - a.score);
  for (const t of scored.slice(0, 6)) {
    const check = canColonise(state, world, c, t.id);
    if (!check.ok || c.gold - check.cost < 60) continue;
    startColony(state, world, c, t.id);
    return;
  }
}
