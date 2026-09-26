/**
 * Revolts and factions. A powerful estate pushed too far rises: part of the realm breaks away as a
 * rebel realm, and a war decides whether its demand is granted. Nobles who have lost faith in an
 * illegitimate ruler fight for a pretender instead, in a throne war. Disloyal vassals band into a
 * faction, and once strong enough they send an ultimatum: their freedom, or war.
 */
import { cultureName } from './beliefs';
import { makeCharacter, staffCourt } from './characters';
import { loyalty, release, remember } from './diplomacy';
import { maxManpower, provinceLevy } from './economy';
import { log } from './log';
import { newArmy } from './military';
import {
  defaultEstates,
  defaultTasks,
  estateInfluence,
  estateLoyalty,
  estateName,
  invalidatePolitics,
} from './politics';
import { atWar, hasTruce, provincesOf, realmMembers, strengthOf, vassalsOf } from './queries';
import { cultureStanding } from './faith';
import { chance, random, randInt } from './rng';
import { destroyCountry } from './realm';
import { knowsId, nationalist } from './tech';
import {
  ESTATES,
  type Country,
  type Demand,
  type EstateId,
  type GameState,
  type PeaceTerms,
  type Units,
  type War,
} from './types';
import { distanceKm, type SimWorld } from './world';

export const REVOLT_LOYALTY = -30;

export const DEMAND_INFO: Record<Demand | 'throne', string> = {
  lower_taxes: 'lower taxes',
  lower_conscription: 'an end to heavy conscription',
  lower_crown: 'less power for the crown',
  privileges: 'privileges',
  nation: 'a nation of their own',
  throne: 'the throne for their pretender',
};

/** Monthly chance that an estate rises: only a powerful estate that has been pushed far enough. */
export function revoltRisk(state: GameState, c: Country, e: EstateId): number {
  const share = estateInfluence(state, c).share[e];
  if (share < 0.2 || !demandOf(c, e)) return 0;
  const loyal = estateLoyalty(state, c, e).total;
  if (loyal >= REVOLT_LOYALTY) return 0;
  return Math.min(0.25, ((REVOLT_LOYALTY - loyal) / 150) * (share / 0.25));
}

/** What an angry estate wants, or null if there is nothing left to give it. */
export function demandOf(c: Country, e: EstateId): Demand | 'throne' | null {
  const l = c.laws;
  switch (e) {
    case 'commons':
      if (l.taxation > 1) return 'lower_taxes';
      if (l.conscription > 1) return 'lower_conscription';
      return c.estates.commons.privileged ? null : 'privileges';
    case 'burghers':
      if (l.taxation > 1) return 'lower_taxes';
      return c.estates.burghers.privileged ? null : 'privileges';
    case 'clergy':
      return c.estates.clergy.privileged ? null : 'privileges';
    case 'nobles':
      if (c.legitimacy < 35 && l.succession !== 'republic') return 'throne';
      if (l.crown > 0) return 'lower_crown';
      return c.estates.nobles.privileged ? null : 'privileges';
  }
}

/** The crown gives way: the demand becomes law. */
export function concede(state: GameState, c: Country, e: EstateId, demand: Demand) {
  if (demand === 'nation') return;
  if (demand === 'lower_taxes') c.laws.taxation = Math.max(0, c.laws.taxation - 1);
  else if (demand === 'lower_conscription') c.laws.conscription = Math.max(0, c.laws.conscription - 1);
  else if (demand === 'lower_crown') c.laws.crown = Math.max(0, c.laws.crown - 1);
  else c.estates[e].privileged = true;
  c.estates[e].mood = Math.min(60, c.estates[e].mood + 30);
  c.legitimacy = Math.max(0, c.legitimacy - 10);
  invalidatePolitics(state);
}

/** A connected block of the realm's own land, away from the capital, where the estate is strong. */
function risingProvinces(state: GameState, world: SimWorld, c: Country, e: EstateId, count: number): number[] {
  const own = provincesOf(state, c.index).filter(
    (id) => id !== c.capital && state.provinces[id].controller === c.index && world.region(id).kind === 'land',
  );
  if (!own.length) return [];
  const weight = (id: number) => {
    const p = state.provinces[id];
    if (e === 'burghers') return 1 + (p.buildings.market ?? 0) * 3 + p.dev / 5;
    if (e === 'nobles') return 1 + (p.buildings.castle ?? 0) * 3;
    return 1 + p.dev / 4;
  };
  let total = 0;
  for (const id of own) total += weight(id);
  let r = random(state) * total,
    seed = own[0];
  for (const id of own) {
    r -= weight(id);
    if (r <= 0) {
      seed = id;
      break;
    }
  }
  const pool = new Set(own);
  const out = [seed];
  pool.delete(seed);
  for (let i = 0; i < out.length && out.length < count; i++)
    for (const [n] of world.region(out[i]).adj)
      if (pool.has(n) && out.length < count) {
        out.push(n);
        pool.delete(n);
      }
  // Where the crown's land is scattered among vassals, the rising spreads to the nearest of it.
  if (out.length < count) {
    const at = world.region(seed);
    const rest = [...pool].sort((a, b) => distanceKm(at, world.region(a)) - distanceKm(at, world.region(b)));
    out.push(...rest.slice(0, count - out.length));
  }
  return out;
}

function rebelName(c: Country, e: EstateId, pretender: string): { name: string; short: string } {
  switch (e) {
    case 'commons':
      return { name: `${c.adj} Peasant Revolt`, short: 'Peasant Revolt' };
    case 'burghers':
      return { name: `League of ${c.adj} Towns`, short: 'Town League' };
    case 'clergy':
      return { name: `${c.adj} Pious Revolt`, short: 'Pious Revolt' };
    default:
      return pretender
        ? { name: `Rebellion of ${pretender}`, short: 'Pretender' }
        : { name: `${c.adj} Barons’ Revolt`, short: 'Barons’ Revolt' };
  }
}

/** A slot for a new rebel realm: a long-dead rebel's, so the list of countries stays short. */
function rebelSlot(state: GameState): number {
  const i = state.countries.findIndex(
    (c) => c && !c.alive && c.rebel?.ended !== undefined && state.day - c.rebel.ended > 365,
  );
  return i > 0 ? i : state.countries.length;
}

/** Raises a rebel realm over the given provinces. */
export function createRebelRealm(
  state: GameState,
  world: SimWorld,
  c: Country,
  provinces: number[],
  e: EstateId,
  demand: Demand | 'throne',
): Country {
  const index = rebelSlot(state);
  const [r, g, b] = c.color;
  const color: [number, number, number] = [
    Math.round(r * 0.45 + 70),
    Math.round(g * 0.35 + 40),
    Math.round(b * 0.45 + 70),
  ];
  const rebel: Country = {
    index,
    tag: `R${state.nextId++}`,
    name: '',
    short: '',
    adj: 'Rebel',
    gov: c.gov,
    rank: 'duchy',
    color,
    colorHex: `#${color.map((v) => v.toString(16).padStart(2, '0')).join('')}`,
    liege: 0,
    overlord: 0,
    capital: provinces[0],
    culture: state.provinces[provinces[0]].culture ?? c.culture,
    religion: state.provinces[provinces[0]].religion ?? c.religion,
    alive: true,
    gold: 30,
    stability: 0,
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
    throneClaims: demand === 'throne' ? [c.index] : [],
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
    transports: 0,
    known: c.known,
    colonies: [],
    memories: {},
    modifiers: [],
    history: {},
    spies: {},
    spyTarget: 0,
    laws: { ...c.laws },
    lawChanged: state.day,
    legitimacy: 30,
    estates: defaultEstates(),
    tasks: defaultTasks(),
    rebel: { realm: c.index, estate: e, demand },
    ai: { nextWarCheck: Infinity, nextBuild: Infinity, nextDiplo: Infinity },
  };
  state.countries[index] = rebel;
  const leader = makeCharacter(state, world, rebel, {
    age: randInt(state, 22, 50),
    talent: 1,
    place: demand !== 'throne',
  });
  rebel.ruler = leader.id;
  const names = rebelName(c, e, demand === 'throne' ? leader.name : '');
  rebel.name = names.name;
  rebel.short = names.short;
  staffCourt(state, world, rebel, true);
  for (const id of provinces) {
    const p = state.provinces[id];
    p.owner = index;
    p.controller = index;
    p.siege = undefined;
  }
  state.mapVersion++;
  state.borderVersion++;
  state.diploVersion++;
  return rebel;
}

/** An estate rises. Small realms cannot be split, and simply give way. */
export function startRevolt(state: GameState, world: SimWorld, c: Country, e: EstateId): War | null {
  const demand = demandOf(c, e);
  if (!demand) return null;
  const own = provincesOf(state, c.index).length;
  const who = estateName(c, e);
  if (own < 3) {
    if (demand !== 'throne') {
      concede(state, c, e, demand);
      log(
        state,
        [c.index],
        'event',
        `The ${who.toLowerCase()} of ${c.name} force the crown to grant ${DEMAND_INFO[demand]}.`,
        {
          important: c.index === state.player,
        },
      );
    }
    return null;
  }
  const share = estateInfluence(state, c).share[e];
  const count = Math.max(1, Math.min(Math.floor(own / 3), Math.round(own * share * 0.6)));
  const provinces = risingProvinces(state, world, c, e, count);
  if (!provinces.length) return null;
  const rebel = createRebelRealm(state, world, c, provinces, e, demand);
  // The rising draws men from the whole realm, as far as the estate's power reaches.
  let levy = 0;
  for (const id of provinces) levy += provinceLevy(state.provinces[id]);
  levy = Math.max(levy * 1.2, maxManpower(state, c).total * share * 0.6);
  const round = (n: number) => Math.round(n / 50) * 50;
  const units: Units =
    e === 'nobles'
      ? { levy: round(levy * 1.2), knights: round(levy * 0.1), spearmen: round(levy * 0.2) }
      : e === 'burghers'
        ? { levy: round(levy), spearmen: round(levy * 0.3), archers: round(levy * 0.2) }
        : e === 'clergy'
          ? { levy: round(levy * 1.3), spearmen: round(levy * 0.1) }
          : { levy: round(levy * 1.6) };
  newArmy(state, rebel, provinces[0], units, rebel.ruler).name = `Host of the ${rebel.short}`;
  const war: War = {
    id: state.nextId++,
    name: rebel.name,
    cb: demand === 'throne' ? 'throne' : 'revolt',
    goal: demand === 'throne' ? c.index : 0,
    attacker: rebel.index,
    defender: c.index,
    attackers: [rebel.index],
    defenders: realmMembers(state, c.index),
    start: state.day,
    battleScore: 0,
    ticking: 0,
    ...(demand === 'throne' ? {} : { demand }),
  };
  state.wars.push(war);
  const text =
    demand === 'throne'
      ? `The ${who.toLowerCase()} of ${c.name} rise for a pretender, ${state.characters[rebel.ruler]?.name}, and claim the throne.`
      : `The ${who.toLowerCase()} of ${c.name} rise in revolt, demanding ${DEMAND_INFO[demand]}.`;
  log(state, [c.index], 'war', text, { important: c.index === state.player, province: provinces[0] });
  return war;
}

/** Each month, powerful estates that have been pushed too far may rise; one revolt at a time. */
export function monthlyRevolts(state: GameState, world: SimWorld) {
  const rising = new Set<number>();
  for (const c of state.countries) if (c?.alive && c.rebel) rising.add(c.rebel.realm);
  for (const c of state.countries) {
    if (!c?.alive || c.rebel || rising.has(c.index)) continue;
    let rose = false;
    for (const e of ESTATES) {
      const risk = revoltRisk(state, c, e);
      if (risk > 0 && chance(state, risk)) {
        startRevolt(state, world, c, e);
        rose = true;
        break;
      }
    }
    if (!rose) {
      const nation = nationalRisk(state, c);
      if (nation && chance(state, nation.risk)) startNationalRevolt(state, world, c, nation.culture, nation.provinces);
    }
  }
}

// ── Nations ───────────────────────────────────────────────────────

/**
 * In the age of nationalism a people that is neither the realm's own nor accepted by it wants a
 * state of its own: the more of them, and the angrier the commons, the likelier they rise.
 */
export function nationalRisk(
  state: GameState,
  c: Country,
): { culture: string; provinces: number[]; share: number; risk: number } | null {
  if (!nationalist(c)) return null;
  const groups = new Map<string, number[]>();
  const dev = new Map<string, number>();
  let total = 0;
  for (const id of provincesOf(state, c.index)) {
    const p = state.provinces[id];
    total += p.dev;
    if (!p.culture || id === c.capital || p.controller !== c.index || cultureStanding(c, p) !== 'foreign') continue;
    groups.set(p.culture, [...(groups.get(p.culture) ?? []), id]);
    dev.set(p.culture, (dev.get(p.culture) ?? 0) + p.dev);
  }
  let best: { culture: string; provinces: number[]; share: number; risk: number } | null = null;
  const commons = estateLoyalty(state, c, 'commons').total;
  for (const [culture, provinces] of groups) {
    const share = (dev.get(culture) ?? 0) / Math.max(1, total);
    if (provinces.length < 3 || share < 0.08) continue;
    const risk = Math.min(0.02, 0.002 * (share / 0.15) * (1 + Math.max(0, -commons) / 25));
    if (!best || risk > best.risk) best = { culture, provinces, share, risk };
  }
  return best;
}

/** A people rises for its own state. */
export function startNationalRevolt(
  state: GameState,
  world: SimWorld,
  c: Country,
  culture: string,
  provinces: number[],
): War {
  const rebel = createRebelRealm(state, world, c, provinces, 'commons', 'nation');
  rebel.name = `${cultureName(culture)} National Movement`;
  rebel.short = `${cultureName(culture)} nationalists`;
  rebel.adj = cultureName(culture);
  rebel.culture = culture;
  let levy = 0;
  for (const id of provinces) levy += provinceLevy(state.provinces[id]);
  const round = (n: number) => Math.round(n / 50) * 50;
  newArmy(state, rebel, provinces[0], { levy: round(levy * 1.8), spearmen: round(levy * 0.25) }, rebel.ruler).name =
    `${cultureName(culture)} Volunteers`;
  const war: War = {
    id: state.nextId++,
    name: `${cultureName(culture)} War of Independence`,
    cb: 'revolt',
    goal: 0,
    attacker: rebel.index,
    defender: c.index,
    attackers: [rebel.index],
    defenders: realmMembers(state, c.index),
    start: state.day,
    battleScore: 0,
    ticking: 0,
    demand: 'nation',
  };
  state.wars.push(war);
  log(state, 'all', 'war', `The ${cultureName(culture)} people of ${c.name} rise for a nation of their own.`, {
    important: c.index === state.player,
    province: provinces[0],
  });
  return war;
}

/** Rebels who won their nation: the rebel realm becomes a state in earnest. */
function becomeNation(state: GameState, world: SimWorld, rebel: Country) {
  const name = cultureName(rebel.culture);
  const own = provincesOf(state, rebel.index).length;
  rebel.rebel = undefined;
  rebel.name = `${name} Republic`;
  rebel.short = `${name} Republic`;
  rebel.adj = name;
  rebel.rank = own >= 6 ? 'kingdom' : 'duchy';
  rebel.gov = knowsId(rebel, 'popular_sovereignty')
    ? 'democracy'
    : knowsId(rebel, 'constitutionalism')
      ? 'constitutional'
      : 'feudal';
  rebel.laws.succession = rebel.gov === 'democracy' ? 'republic' : 'hereditary';
  if (rebel.laws.succession === 'republic') rebel.termEnds = state.day + 4 * 365;
  const hex = world.world.cultures[rebel.culture]?.color;
  if (hex) {
    rebel.colorHex = hex;
    rebel.color = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  }
  rebel.legitimacy = 60;
  rebel.ai = { nextWarCheck: state.day + 365 * 2, nextBuild: state.day, nextDiplo: state.day + 60 };
  state.mapVersion++;
  state.borderVersion++;
  state.diploVersion++;
  log(state, 'all', 'peace', `The ${name} have won their independence: the ${rebel.name} is born.`, {
    province: rebel.capital,
    important: true,
  });
}

/**
 * The revolt is over: the rebel land returns to the realm, and the demand is granted if they won; a
 * people that has won its war of independence keeps its land as a new nation.
 */
export function endRevolt(state: GameState, world: SimWorld, war: War, rebelsWon: boolean, terms: PeaceTerms) {
  const rebel = state.countries[war.attacker];
  if (!rebel?.rebel || rebel.rebel.realm !== war.defender) return;
  const realm = state.countries[rebel.rebel.realm];
  const info = rebel.rebel;
  info.ended = state.day;
  if (!rebel.alive) return; // the pretender took the throne
  if (rebelsWon && terms.demands && info.demand === 'nation') {
    becomeNation(state, world, rebel);
    realm.legitimacy = Math.max(0, realm.legitimacy - 15);
    return;
  }
  for (const p of state.provinces) {
    if (!p) continue;
    if (p.owner === rebel.index) {
      p.owner = realm.index;
      p.controller = realm.index;
      p.siege = undefined;
    } else if (p.controller === rebel.index) p.controller = p.owner;
  }
  destroyCountry(state, rebel);
  state.mapVersion++;
  if (rebelsWon && terms.demands && info.demand !== 'throne') concede(state, realm, info.estate, info.demand);
  else if (!rebelsWon) {
    realm.estates[info.estate].mood = Math.min(60, realm.estates[info.estate].mood + 20);
    realm.legitimacy = Math.min(100, realm.legitimacy + 5);
    invalidatePolitics(state);
  }
}

/** A realm whose ruler fell may leave its rebels on their own: they become a realm in earnest. */
export function orphanRebels(state: GameState) {
  for (const c of state.countries) {
    if (!c?.alive || !c.rebel) continue;
    if (!state.countries[c.rebel.realm]?.alive) {
      c.rebel = undefined;
      c.ai = { nextWarCheck: state.day + 365, nextBuild: state.day, nextDiplo: state.day + 90 };
    }
  }
}

// ── Factions ──────────────────────────────────────────────────────

/** Vassals whose loyalty is gone band together; when strong enough they demand their freedom. */
export function monthlyFactions(state: GameState, world: SimWorld) {
  for (const l of state.countries) {
    if (!l?.alive || l.rebel) continue;
    const vassals = vassalsOf(state, l.index);
    let f = state.factions.find((x) => x.realm === l.index);
    const disloyal = vassals.filter(
      (v) => v.index !== state.player && !atWar(state, v.index, l.index) && loyalty(state, world, v.index).total < 0,
    );
    if (!disloyal.length) {
      if (f) state.factions = state.factions.filter((x) => x !== f);
      continue;
    }
    if (!f) {
      state.factions.push((f = { id: state.nextId++, realm: l.index, members: [], since: state.day }));
      log(state, [l.index], 'diplomacy', `Discontented vassals of ${l.name} have formed a faction for independence.`);
    }
    f.members = disloyal.map((v) => v.index);
    const mine = f.members.reduce((n, m) => n + strengthOf(state, m), 0);
    const theirs = strengthOf(state, l.index) - mine;
    if (mine < theirs * 0.6 || f.members.some((m) => hasTruce(state, m, l.index)) || !chance(state, 0.2)) continue;
    if (state.offers.some((o) => o.kind === 'ultimatum' && o.to === l.index)) continue;
    const leader = [...f.members].sort((a, b) => strengthOf(state, b) - strengthOf(state, a))[0];
    if (l.index === state.player) {
      state.offers.push({
        id: state.nextId++,
        kind: 'ultimatum',
        from: leader,
        to: l.index,
        members: [...f.members],
        expires: state.day + 30,
      });
      log(state, [l.index], 'diplomacy', `Your vassals demand their independence, or they will take it.`, {
        important: true,
      });
    } else if (mine >= theirs * 0.9 && chance(state, 0.5)) grantFreedom(state, l.index, f.members);
    else factionWar(state, l.index, f.members, leader);
  }
}

/** The liege gives way: the faction's vassals go free. */
export function grantFreedom(state: GameState, liege: number, members: number[]) {
  const l = state.countries[liege];
  for (const m of members) {
    if (state.countries[m]?.liege !== liege) continue;
    release(state, m);
    remember(state, m, liege, 'freed_us', 30);
  }
  l.legitimacy = Math.max(0, l.legitimacy - 10);
  state.factions = state.factions.filter((f) => f.realm !== liege);
  log(state, [liege, ...members], 'diplomacy', `${l.name} grants its rebellious vassals their freedom.`, {
    important: liege === state.player,
  });
}

/** The faction goes to war together for its freedom. */
export function factionWar(state: GameState, liege: number, members: number[], leader: number): War {
  const l = state.countries[liege];
  const attackers: number[] = [];
  for (const m of members) for (const x of realmMembers(state, m)) if (!attackers.includes(x)) attackers.push(x);
  // The rebels quit the wars they were fighting for their liege.
  for (const w of state.wars) {
    w.attackers = w.attackers.filter((x) => !attackers.includes(x));
    w.defenders = w.defenders.filter((x) => !attackers.includes(x));
  }
  const war: War = {
    id: state.nextId++,
    name: `War of the ${l.adj} Vassals`,
    cb: 'independence',
    goal: 0,
    attacker: leader,
    defender: liege,
    attackers,
    defenders: realmMembers(state, liege).filter((x) => !attackers.includes(x)),
    start: state.day,
    battleScore: 0,
    ticking: 0,
  };
  state.wars.push(war);
  state.factions = state.factions.filter((f) => f.realm !== liege);
  state.diploVersion++;
  log(
    state,
    [liege, ...attackers],
    'war',
    `The vassals of ${l.name} rise together for their independence: ${war.name}.`,
    {
      important: liege === state.player || attackers.includes(state.player),
      province: l.capital,
    },
  );
  return war;
}
