/**
 * Holy wars. A realm of a warlike faith (Christian or Muslim) may wage holy war on a neighbour of
 * another family of faiths, for a province on its border or a holy site of its own faith. Once in a
 * generation the head of a faith may call a great holy war, a crusade or a jihad, to free a holy
 * city: every realm of the faith is called to arms, and victory wins the land around the city, for a
 * new crusader kingdom or for the leader of the jihad.
 */
import {
  FAITH_HEADS,
  GREAT_HOLY_WARS,
  HOLY_LAND_KM,
  HOLY_WAR_FAMILIES,
  HOLY_WAR_INTERVAL,
  type GreatHolyWarDef,
} from '../data/faiths';
import { cultureGroup, faithFamily, provinceNamed } from './beliefs';
import { toDate, years } from './calendar';
import { makeCharacter, staffCourt } from './characters';
import { alliesOf, guarantorsOf, remember } from './diplomacy';
import { maxManpower } from './economy';
import { headOf, sitesHeldByUnbelievers } from './faith';
import { log } from './log';
import { defaultEstates, defaultTasks, initialLaws } from './politics';
import { armySize, atWar, realmMembers, realmProvinces, strengthOf, topLiege, touchesRealm } from './queries';
import { chance, randInt } from './rng';
import { hexToRgb } from './setup';
import type { Country, GameState, War } from './types';
import { callToArms, endWar } from './war';
import { distanceKm, type SimWorld } from './world';

type Check = { ok: true } | { ok: false; reason: string };
const yes: Check = { ok: true };
const no = (reason: string): Check => ({ ok: false, reason });

const ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];

/** 11th, 21st, 22nd, 23rd … */
function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
}

// ── Holy wars of one realm ────────────────────────────────────────

/** Does this realm's faith wage holy wars? */
export function wagesHolyWar(c: Country | undefined): boolean {
  return !!c && HOLY_WAR_FAMILIES.has(faithFamily(c.religion));
}

/** Is the realm of `b` of another family of faiths than `a`? */
export function unbelievers(state: GameState, a: number, b: number): boolean {
  const x = state.countries[a],
    y = state.countries[topLiege(state, b)];
  return !!x && !!y && faithFamily(x.religion) !== faithFamily(y.religion);
}

/** Provinces a holy war on `target` may be fought for: its land on our border, and our holy sites it holds. */
export function holyWarGoals(state: GameState, world: SimWorld, attacker: number, target: number): number[] {
  const a = state.countries[attacker];
  const defender = topLiege(state, target);
  if (!wagesHolyWar(a) || !unbelievers(state, attacker, defender)) return [];
  const out = new Set(realmProvinces(state, defender).filter((id) => touchesRealm(state, world, attacker, id)));
  for (const id of sitesHeldByUnbelievers(state, a.religion, defender)) out.add(id);
  return [...out];
}

// ── Great holy wars ───────────────────────────────────────────────

export function greatHolyWarOf(faith: string | undefined): GreatHolyWarDef | undefined {
  return GREAT_HOLY_WARS.find((d) => d.faith === faith);
}

/** Who calls and leads a great holy war: the head of the faith, or the realm the head belongs to. */
export function holyWarLeader(state: GameState, def: GreatHolyWarDef): Country | null {
  const head = headOf(state, def.faith);
  if (!head) return null;
  const top = state.countries[topLiege(state, head.index)];
  return top?.alive && !top.rebel && top.religion === def.faith ? top : null;
}

/** The holy city and the realm that holds it, if unbelievers do. */
export function greatHolyWarTarget(state: GameState, def: GreatHolyWarDef): { site: number; defender: number } | null {
  const site = provinceNamed(def.site);
  const owner = state.provinces[site]?.owner ?? 0;
  if (!owner) return null;
  const defender = topLiege(state, owner);
  const d = state.countries[defender];
  if (!d?.alive || d.rebel || faithFamily(d.religion) === faithFamily(def.faith)) return null;
  return { site, defender };
}

/** The great holy war of a faith being fought now. */
export function activeHolyWar(state: GameState, faith: string): War | undefined {
  return state.wars.find((w) => w.cb === 'crusade' && w.faith === faith);
}

/** The first year the faith may call its next great holy war. */
export function nextHolyWarYear(state: GameState, def: GreatHolyWarDef): number {
  const last = state.holyWars[def.faith];
  return last ? toDate(last.last + years(HOLY_WAR_INTERVAL)).y : def.from;
}

export function canCallHolyWar(state: GameState, def: GreatHolyWarDef, caller: number): Check {
  const leader = holyWarLeader(state, def);
  if (!leader)
    return no(`${capitalise(FAITH_HEADS[def.faith]?.title ?? 'the head of the faith')} is not free to call it`);
  if (leader.index !== caller) return no(`Only ${leader.name} can call the faithful to a ${def.name.toLowerCase()}`);
  if (activeHolyWar(state, def.faith)) return no(`A ${def.name.toLowerCase()} is being fought`);
  const year = toDate(state.day).y;
  const next = nextHolyWarYear(state, def);
  if (year < next) return no(`The faithful are not ready before ${next}`);
  const target = greatHolyWarTarget(state, def);
  if (!target) return no(`${def.site} is in the hands of the faithful`);
  if (atWar(state, caller, target.defender))
    return no(`You are already at war with ${state.countries[target.defender].name}`);
  return yes;
}

/** The head of the faith calls the faithful: every realm of the faith is asked to take the cross. */
export function callHolyWar(state: GameState, world: SimWorld, def: GreatHolyWarDef): War | null {
  const leader = holyWarLeader(state, def);
  if (!leader || !canCallHolyWar(state, def, leader.index).ok) return null;
  const target = greatHolyWarTarget(state, def)!;
  const record = (state.holyWars[def.faith] ??= { count: 0, last: 0 });
  record.count++;
  record.last = state.day;
  const d = state.countries[target.defender];
  const attackers = realmMembers(state, leader.index);
  const war: War = {
    id: state.nextId++,
    name: `The ${ORDINALS[record.count - 1] ?? ordinal(record.count)} ${def.name}`,
    cb: 'crusade',
    goal: target.site,
    faith: def.faith,
    attacker: leader.index,
    defender: d.index,
    attackers,
    defenders: realmMembers(state, d.index).filter((x) => !attackers.includes(x)),
    start: state.day,
    battleScore: 0,
    ticking: 0,
  };
  state.wars.push(war);
  state.diploVersion++;
  const head = headOf(state, def.faith);
  const player = state.countries[state.player];
  log(
    state,
    'all',
    'war',
    `${capitalise(FAITH_HEADS[def.faith]?.title ?? leader.name)} calls the faithful to ${war.name}: ${def.site} must be freed from ${d.name}.`,
    {
      province: target.site,
      important: !!player && (def.called.includes(player.religion) || war.defenders.includes(player.index)),
    },
  );
  if (head && head.index !== leader.index) remember(state, head.index, leader.index, 'fought_beside', 10);
  for (const c of state.countries)
    if (c?.alive && !c.liege && !c.rebel && def.called.includes(c.religion) && !war.attackers.includes(c.index))
      callToArms(state, world, war, c.index, 'attacker', 'crusade');
  // A faith that can call great holy wars of its own rallies to the defence.
  const defence = greatHolyWarOf(d.religion);
  if (defence && holyWarLeader(state, defence))
    for (const c of state.countries)
      if (c?.alive && !c.liege && !c.rebel && defence.called.includes(c.religion) && !war.defenders.includes(c.index))
        callToArms(state, world, war, c.index, 'defender', 'crusade');
  for (const ally of alliesOf(state, d.index)) callToArms(state, world, war, ally, 'defender', 'alliance');
  for (const g of guarantorsOf(state, d.index)) callToArms(state, world, war, g, 'defender', 'guarantee');
  if (d.overlord) callToArms(state, world, war, d.overlord, 'defender', 'overlord');
  return war;
}

/** Heads of faith call great holy wars when the time is right; one whose city changed hands ends. */
export function monthlyGreatHolyWars(state: GameState, world: SimWorld) {
  for (const def of GREAT_HOLY_WARS) {
    const war = activeHolyWar(state, def.faith);
    if (war) {
      const owner = state.provinces[war.goal]?.owner ?? 0;
      if (!war.defenders.includes(owner)) {
        log(state, [...war.attackers, ...war.defenders], 'war', `${def.site} has passed out of the enemy’s hands.`);
        endWar(state, world, war, null, { provinces: [], gold: 0, white: true });
      }
      continue;
    }
    const leader = holyWarLeader(state, def);
    if (!leader || leader.index === state.player || !canCallHolyWar(state, def, leader.index).ok) continue;
    if (chance(state, def.chance)) callHolyWar(state, world, def);
  }
}

// ── The Holy Land ─────────────────────────────────────────────────

/** The land a victorious great holy war wins: the enemy's provinces of the holy city's people around it. */
export function holyLandOf(state: GameState, world: SimWorld, war: War): number[] {
  const site = world.region(war.goal);
  const culture = state.provinces[war.goal]?.culture;
  const out: number[] = [];
  for (const m of war.defenders)
    for (const id of realmProvinces(state, m)) {
      if (state.provinces[id].owner !== m) continue;
      if (
        id === war.goal ||
        (state.provinces[id].culture === culture && distanceKm(site, world.region(id)) <= HOLY_LAND_KM)
      )
        out.push(id);
    }
  return [...new Set(out)];
}

/** The realm whose men stand nearest the holy city in the greatest numbers: its people settle the land. */
function crusaderRealm(state: GameState, world: SimWorld, war: War): Country {
  const site = world.region(war.goal);
  const men = new Map<number, number>();
  for (const a of state.armies) {
    if (!war.attackers.includes(a.owner) || distanceKm(site, world.region(a.location)) > 800) continue;
    const top = topLiege(state, a.owner);
    men.set(top, (men.get(top) ?? 0) + armySize(a));
  }
  let best = 0,
    most = 0;
  for (const [c, n] of men)
    if (n > most) {
      most = n;
      best = c;
    }
  if (!best) {
    const others = war.attackers.filter((x) => x !== war.attacker && !state.countries[x]?.liege);
    others.sort((a, b) => strengthOf(state, b) - strengthOf(state, a));
    best = others[0] ?? war.attacker;
  }
  return state.countries[best];
}

/** A new realm, independent and at peace, with a ruler and a court of its own. */
function foundKingdom(
  state: GameState,
  world: SimWorld,
  def: NonNullable<GreatHolyWarDef['kingdom']>,
  founders: Country,
  religion: string,
  capital: number,
): Country {
  const culture = founders.culture;
  const index = state.countries.length;
  const k: Country = {
    index,
    tag: def.tag,
    name: def.name,
    short: def.short,
    adj: def.adj,
    gov: 'feudal',
    rank: 'kingdom',
    color: hexToRgb(def.color),
    colorHex: def.color,
    liege: 0,
    overlord: 0,
    capital,
    culture,
    religion,
    alive: true,
    gold: 100,
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
    // The knights who stayed.
    reserve: { knights: 800, spearmen: 1600, archers: 800 },
    throneClaims: [],
    claims: [],
    fabricating: null,
    integrating: null,
    accepted: [],
    converting: null,
    assimilating: null,
    blessed: state.day,
    tech: { ...founders.tech },
    research: { economy: 0, military: 0, society: 0 },
    focus: null,
    reformed: state.day,
    transports: 0,
    known: founders.known,
    colonies: [],
    memories: {},
    modifiers: [],
    history: {},
    spies: {},
    spyTarget: 0,
    laws: initialLaws('feudal', def.tag, cultureGroup(culture)),
    lawChanged: state.day,
    legitimacy: 70,
    estates: defaultEstates(),
    tasks: defaultTasks(),
    ai: { nextWarCheck: state.day + 365, nextBuild: state.day + 30, nextDiplo: state.day + 60 },
  };
  state.countries.push(k);
  const ruler = makeCharacter(state, world, k, { age: randInt(state, 28, 48), talent: 2 });
  k.ruler = ruler.id;
  staffCourt(state, world, k, true);
  return k;
}

/** The faithful take the Holy Land: a crusader kingdom is founded, or the leader of a jihad takes it. */
export function grantHolyLand(state: GameState, world: SimWorld, war: War): Country | null {
  const def = greatHolyWarOf(war.faith);
  const land = holyLandOf(state, world, war);
  if (!def || !land.length) return null;
  let heir: Country = state.countries[war.attacker];
  let founded = false;
  if (def.kingdom) {
    const tag = def.kingdom.tag;
    const standing = state.countries.find((c) => c?.alive && c.tag === tag && c.religion === def.faith);
    if (standing) heir = standing;
    else {
      heir = foundKingdom(state, world, def.kingdom, crusaderRealm(state, world, war), def.faith, war.goal);
      founded = true;
    }
  }
  for (const id of land) {
    const p = state.provinces[id];
    remember(state, topLiege(state, p.owner), heir.index, 'took_land', -(p.dev * 2 + 5));
    p.owner = heir.index;
    p.controller = heir.index;
    p.siege = undefined;
  }
  if (founded) {
    heir.manpower = Math.round(maxManpower(state, heir).total);
    // The crusaders who founded it stand by it.
    for (const m of war.attackers) if (!state.countries[m]?.liege) remember(state, heir.index, m, 'fought_beside', 20);
  }
  state.mapVersion++;
  state.borderVersion++;
  state.diploVersion++;
  const where = world.region(war.goal).name;
  log(
    state,
    'all',
    'peace',
    founded
      ? `${where} has fallen. The ${heir.name} is founded in the Holy Land.`
      : `${where} and the land around it pass to ${heir.name}.`,
    { province: war.goal, important: true },
  );
  return heir;
}

/** Legitimacy for the realms that fought a holy war to victory. */
export function holyVictory(state: GameState, war: War, winner: 'attacker' | 'defender') {
  if (winner !== 'attacker') return;
  const gain = war.cb === 'crusade' ? 10 : 5;
  const realms = war.cb === 'crusade' ? war.attackers : [war.attacker];
  for (const m of realms) {
    const c = state.countries[m];
    if (c?.alive && !c.liege) c.legitimacy = Math.min(100, c.legitimacy + gain);
  }
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
