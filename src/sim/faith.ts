/**
 * Faith and culture in the provinces: what a province of another faith or people costs its ruler,
 * conversion and assimilation, accepted cultures, heresies, heads of faith and holy sites, and the
 * conversion of pagan crowns. Great holy wars live in `holywars.ts`.
 */
import { CONVERSION_SPEED, FAITH_HEADS, FAITH_PENALTY, HERESIES, MAJOR_FAMILIES } from '../data/faiths';
import { toDate } from './calendar';
import { cultureGroup, cultureName, faithFamily, faithName, holySites } from './beliefs';
import { rulerSkill, seatSkill } from './characters';
import type { Part } from './economy';
import { log } from './log';
import { countryByTag, provincesOf, realmNeighbours, topLiege } from './queries';
import { chance, pick } from './rng';
import { nationalist, techEffect } from './tech';
import type { Country, GameState, ProvinceState } from './types';
import { distanceKm, type SimWorld } from './world';

type Check = { ok: true } | { ok: false; reason: string };
const yes: Check = { ok: true };
const no = (reason: string): Check => ({ ok: false, reason });

// ── Provinces of other faiths and peoples ─────────────────────────

export type FaithStanding = 'same' | 'sister' | 'heathen';
export type CultureStanding = 'own' | 'accepted' | 'kin' | 'foreign';

export function faithStanding(c: Country, p: ProvinceState): FaithStanding {
  if (!p.religion || p.religion === c.religion) return 'same';
  return faithFamily(p.religion) === faithFamily(c.religion) ? 'sister' : 'heathen';
}

export function cultureStanding(c: Country, p: ProvinceState): CultureStanding {
  if (!p.culture || p.culture === c.culture) return 'own';
  if (c.accepted.includes(p.culture)) return 'accepted';
  return cultureGroup(p.culture) === cultureGroup(c.culture) ? 'kin' : 'foreign';
}

const CULTURE_PENALTY: Record<CultureStanding, number> = { own: 0, accepted: 0, kin: 0.05, foreign: 0.15 };

/** Tax and levy of a province for its ruler, as a multiplier, with the reasons. */
/** What a province of another people withholds; nationalism makes a foreign people resist harder. */
function culturePenalty(c: Country, s: CultureStanding): number {
  return s === 'foreign' && nationalist(c) ? 0.25 : CULTURE_PENALTY[s];
}

export function provinceFactor(c: Country, p: ProvinceState): { value: number; parts: Part[] } {
  const parts: Part[] = [];
  const f = faithStanding(c, p);
  if (f !== 'same')
    parts.push({
      label: f === 'sister' ? `A sister faith (${faithName(p.religion)})` : `Unbelievers (${faithName(p.religion)})`,
      value: -FAITH_PENALTY[c.laws.tolerance][f === 'sister' ? 0 : 1],
    });
  const s = cultureStanding(c, p);
  const pen = culturePenalty(c, s);
  if (pen)
    parts.push({
      label: s === 'kin' ? 'A kindred people' : nationalist(c) ? 'A foreign nation' : 'A foreign people',
      value: -pen,
    });
  return { value: 1 + parts.reduce((n, x) => n + x.value, 0), parts };
}

/** The same multiplier without the reasons, for the sums over every province. */
export function provinceMultiplier(c: Country, p: ProvinceState): number {
  let v = 1;
  const f = faithStanding(c, p);
  if (f !== 'same') v -= FAITH_PENALTY[c.laws.tolerance][f === 'sister' ? 0 : 1];
  return v - culturePenalty(c, cultureStanding(c, p));
}

export interface Diversity {
  sister: number;
  heathen: number;
  foreign: number;
}

const diversityCache = new WeakMap<GameState, { day: number; map: Map<number, Diversity> }>();

/** Shares of the realm's own development held by other faiths and peoples, worked out once a day. */
export function diversity(state: GameState, c: Country): Diversity {
  let cache = diversityCache.get(state);
  if (!cache || cache.day !== state.day) diversityCache.set(state, (cache = { day: state.day, map: new Map() }));
  let hit = cache.map.get(c.index);
  if (!hit) cache.map.set(c.index, (hit = computeDiversity(state, c)));
  return hit;
}

function computeDiversity(state: GameState, c: Country): Diversity {
  let total = 0,
    sister = 0,
    heathen = 0,
    foreign = 0;
  for (const id of provincesOf(state, c.index)) {
    const p = state.provinces[id];
    total += p.dev;
    const f = faithStanding(c, p);
    if (f === 'sister') sister += p.dev;
    else if (f === 'heathen') heathen += p.dev;
    const s = cultureStanding(c, p);
    if (s === 'foreign') foreign += p.dev;
  }
  const t = Math.max(1, total);
  return { sister: sister / t, heathen: heathen / t, foreign: foreign / t };
}

// ── Accepted cultures ─────────────────────────────────────────────

const RANK_SLOTS: Record<string, number> = { county: 0, duchy: 1, kingdom: 2, empire: 3 };

export function acceptSlots(c: Country): number {
  return (RANK_SLOTS[c.rank] ?? 1) + techEffect(c, 'acceptSlots');
}

/** Cultures of the realm and the share of its development each holds. */
export function cultureShares(state: GameState, c: Country): { culture: string; share: number }[] {
  const dev = new Map<string, number>();
  let total = 0;
  for (const id of provincesOf(state, c.index)) {
    const p = state.provinces[id];
    total += p.dev;
    if (p.culture) dev.set(p.culture, (dev.get(p.culture) ?? 0) + p.dev);
  }
  return [...dev].map(([culture, d]) => ({ culture, share: d / Math.max(1, total) })).sort((a, b) => b.share - a.share);
}

export function canAcceptCulture(state: GameState, c: Country, culture: string): Check {
  if (culture === c.culture || c.accepted.includes(culture)) return no('Already accepted');
  if (c.accepted.length >= acceptSlots(c))
    return no(`A ${c.rank} can accept ${acceptSlots(c)} other culture${acceptSlots(c) === 1 ? '' : 's'}`);
  const share = cultureShares(state, c).find((x) => x.culture === culture)?.share ?? 0;
  if (share < 0.1) return no('They must be a tenth of the realm or more');
  if (c.legitimacy < 10) return no('It needs 10 legitimacy');
  return yes;
}

export function acceptCulture(state: GameState, c: Country, culture: string): boolean {
  if (!canAcceptCulture(state, c, culture).ok) return false;
  c.accepted.push(culture);
  c.legitimacy -= 10;
  return true;
}

export function unacceptCulture(c: Country, culture: string): boolean {
  if (!c.accepted.includes(culture)) return false;
  c.accepted = c.accepted.filter((x) => x !== culture);
  return true;
}

// ── Conversion and assimilation ───────────────────────────────────

export function conversionNeeded(p: ProvinceState): number {
  return 60 + p.dev * 12;
}

/** Monthly progress of the court chaplain's mission. */
export function conversionSpeed(state: GameState, c: Country, p: ProvinceState): number {
  const sister = faithStanding(c, p) === 'sister' ? 1.5 : 1;
  return (
    (3 + seatSkill(state, c, 'chaplain') * 0.6) *
    CONVERSION_SPEED[c.laws.tolerance] *
    sister *
    (1 + techEffect(c, 'conversion'))
  );
}

/** The province a mission would go to next: the richest of another faith. */
export function nextToConvert(state: GameState, c: Country): number {
  let best = 0,
    bestDev = -1;
  for (const id of provincesOf(state, c.index)) {
    const p = state.provinces[id];
    if (p.religion && p.religion !== c.religion && p.controller === c.index && p.dev > bestDev) {
      bestDev = p.dev;
      best = id;
    }
  }
  return best;
}

export function canConvert(state: GameState, c: Country, province: number): Check {
  const p = state.provinces[province];
  if (!p || p.owner !== c.index) return no('Only your own provinces');
  if (!p.religion || p.religion === c.religion) return no('They already share your faith');
  if (p.controller !== c.index) return no('The province is occupied');
  return yes;
}

export function startConversion(state: GameState, c: Country, province: number): boolean {
  if (!canConvert(state, c, province).ok) return false;
  c.converting = { province, progress: 0, needed: conversionNeeded(state.provinces[province]) };
  c.tasks.chaplain = 'convert';
  return true;
}

export function assimilationNeeded(p: ProvinceState): number {
  return 90 + p.dev * 15;
}

export function assimilationSpeed(state: GameState, c: Country): number {
  return (
    (3 + seatSkill(state, c, 'steward') * 0.5 + rulerSkill(state, c, 'dip') * 0.2) * (1 + techEffect(c, 'assimilation'))
  );
}

export function nextToAssimilate(state: GameState, c: Country): number {
  let best = 0,
    bestDev = -1;
  for (const id of provincesOf(state, c.index)) {
    const p = state.provinces[id];
    if (
      p.culture &&
      cultureStanding(c, p) !== 'own' &&
      !c.accepted.includes(p.culture) &&
      p.controller === c.index &&
      p.dev > bestDev
    ) {
      bestDev = p.dev;
      best = id;
    }
  }
  return best;
}

export function canAssimilate(state: GameState, c: Country, province: number): Check {
  const p = state.provinces[province];
  if (!p || p.owner !== c.index) return no('Only your own provinces');
  if (!p.culture || p.culture === c.culture) return no('They are already of your people');
  if (p.controller !== c.index) return no('The province is occupied');
  return yes;
}

export function startAssimilation(state: GameState, c: Country, province: number): boolean {
  if (!canAssimilate(state, c, province).ok) return false;
  c.assimilating = { province, progress: 0, needed: assimilationNeeded(state.provinces[province]) };
  c.tasks.steward = 'assimilate';
  return true;
}

/** Missions and schools do their work; people also drift slowly towards their rulers' ways. */
export function monthlyFaith(state: GameState, world: SimWorld) {
  for (const c of state.countries) {
    if (!c?.alive || c.rebel) continue;
    // Work on land that has changed hands is lost.
    if (c.converting && state.provinces[c.converting.province]?.owner !== c.index) c.converting = null;
    if (c.assimilating && state.provinces[c.assimilating.province]?.owner !== c.index) c.assimilating = null;
    // Conversion
    if (c.tasks.chaplain === 'convert') {
      if (!c.converting || state.provinces[c.converting.province]?.owner !== c.index) {
        const next = nextToConvert(state, c);
        c.converting = next ? { province: next, progress: 0, needed: conversionNeeded(state.provinces[next]) } : null;
      }
      const job = c.converting;
      if (job) {
        const p = state.provinces[job.province];
        if (p.religion === c.religion) c.converting = null;
        else if (p.controller === c.index) {
          job.progress += conversionSpeed(state, c, p);
          if (job.progress >= job.needed) {
            const old = p.religion;
            p.religion = c.religion;
            c.converting = null;
            state.mapVersion++;
            log(
              state,
              [c.index],
              'event',
              `${world.region(job.province).name} has turned from ${faithName(old)} to ${faithName(c.religion)}.`,
              {
                province: job.province,
              },
            );
          }
        }
      }
    }
    // Assimilation
    if (c.tasks.steward === 'assimilate') {
      if (!c.assimilating || state.provinces[c.assimilating.province]?.owner !== c.index) {
        const next = nextToAssimilate(state, c);
        c.assimilating = next
          ? { province: next, progress: 0, needed: assimilationNeeded(state.provinces[next]) }
          : null;
      }
      const job = c.assimilating;
      if (job) {
        const p = state.provinces[job.province];
        if (p.culture === c.culture) c.assimilating = null;
        else if (p.controller === c.index) {
          job.progress += assimilationSpeed(state, c);
          if (job.progress >= job.needed) {
            const old = p.culture;
            p.culture = c.culture;
            c.assimilating = null;
            state.mapVersion++;
            log(
              state,
              [c.index],
              'event',
              `The ${cultureName(old)} of ${world.region(job.province).name} have taken up ${cultureName(c.culture)} ways.`,
              {
                province: job.province,
              },
            );
          }
        }
      }
    }
  }
  // Slow drift: a foreign province among the ruler's own people takes up their tongue in time.
  state.provinces.forEach((p, id) => {
    if (!p?.owner || !p.culture) return;
    const c = state.countries[p.owner];
    if (!c?.alive || p.culture === c.culture || c.accepted.includes(p.culture) || !chance(state, 0.001)) return;
    const near = world
      .region(id)
      .adj.some(([n]) => state.provinces[n]?.owner === c.index && state.provinces[n].culture === c.culture);
    if (near) {
      p.culture = c.culture;
      state.mapVersion++;
    }
  });
}

// ── Heresies ──────────────────────────────────────────────────────

/**
 * Heresies appear in their cradle once their time has come and spread among the faithful, faster in
 * a realm that has taken them up; where the old faith rules they die out slowly, unless tolerated. A
 * crown whose capital and people have turned may break with the old faith: a schism.
 */
export function monthlyHeresies(state: GameState, world: SimWorld) {
  const year = toDate(state.day).y;
  for (const [id, h] of Object.entries(HERESIES)) {
    if (year < h.from) continue;
    const held: number[] = [];
    state.provinces.forEach((p, pid) => {
      if (p?.religion === id) held.push(pid);
    });
    if (!held.length) {
      // A preacher rises in the cradle of the heresy (about once in eight years).
      if (!chance(state, 0.01)) continue;
      const [lon, lat, km] = h.cradle;
      const centre = { lon, lat } as Parameters<typeof distanceKm>[0];
      const candidates = world.regions.filter(
        (r) =>
          r.kind === 'land' &&
          state.provinces[r.id]?.owner &&
          state.provinces[r.id].religion === h.parent &&
          distanceKm(centre, r) <= km,
      );
      if (!candidates.length) continue;
      const seed = pick(state, candidates).id;
      state.provinces[seed].religion = id;
      state.mapVersion++;
      log(state, 'all', 'event', `A ${h.name} heresy has taken hold in ${world.region(seed).name}.`, {
        province: seed,
        important: state.provinces[seed].owner === state.player,
      });
      continue;
    }
    for (const pid of held) {
      const p = state.provinces[pid];
      const owner = state.countries[p.owner];
      // Spread to a neighbour of the old faith.
      if (chance(state, owner?.religion === id ? 0.05 : 0.01)) {
        const next = world
          .region(pid)
          .adj.filter(([n]) => state.provinces[n]?.owner && state.provinces[n].religion === h.parent);
        if (next.length) {
          state.provinces[pick(state, next)[0]].religion = id;
          state.mapVersion++;
        }
      }
      // Where the old faith rules, the heresy fades, fast under persecution and not at all under tolerance.
      if (
        owner?.religion === h.parent &&
        owner.laws.tolerance < 2 &&
        chance(state, owner.laws.tolerance === 0 ? 0.015 : 0.005)
      ) {
        p.religion = h.parent;
        state.mapVersion++;
      }
    }
    // Schism: the crown of a realm that has largely turned takes up the new faith.
    for (const c of state.countries) {
      if (!c?.alive || c.rebel || c.religion !== h.parent || state.provinces[c.capital]?.religion !== id) continue;
      let dev = 0,
        turned = 0;
      for (const pid of provincesOf(state, c.index)) {
        dev += state.provinces[pid].dev;
        if (state.provinces[pid].religion === id) turned += state.provinces[pid].dev;
      }
      if (turned < dev * 0.5 || !chance(state, 0.02)) continue;
      c.religion = id;
      c.converting = null;
      c.stability = Math.max(-3, c.stability - 1);
      state.diploVersion++;
      state.mapVersion++;
      log(
        state,
        'all',
        'event',
        `${c.name} breaks with the ${faithName(h.parent)} church and embraces the ${h.name} faith.`,
        {
          province: c.capital,
          important: c.index === state.player,
        },
      );
    }
  }
}

// ── Heads of faith and holy sites ─────────────────────────────────

/** The realm that holds the headship of a faith, if it still stands and keeps that faith. */
export function headOf(state: GameState, faith: string): Country | null {
  const def = FAITH_HEADS[faith];
  if (!def) return null;
  const c = countryByTag(state, def.tag);
  return c?.alive && c.religion === faith ? c : null;
}

/** Holy sites of this realm's faith that its realm holds. */
export function heldHolySites(state: GameState, c: Country): number[] {
  const top = topLiege(state, c.index);
  return holySites(c.religion).filter((id) => {
    const o = state.provinces[id]?.owner ?? 0;
    return o && topLiege(state, o) === top;
  });
}

/** Holy sites of `faith` in the hands of `realm` (a top liege) when it follows another family of faiths. */
export function sitesHeldByUnbelievers(state: GameState, faith: string, realm: number): number[] {
  const holder = state.countries[realm];
  if (!holder || faithFamily(holder.religion) === faithFamily(faith)) return [];
  return holySites(faith).filter((id) => {
    const o = state.provinces[id]?.owner ?? 0;
    return o && topLiege(state, o) === realm;
  });
}

export function blessingCost(income: number): number {
  return Math.max(30, Math.round((income * 3) / 5) * 5);
}

export function canAskBlessing(state: GameState, c: Country, cost: number): Check {
  const head = headOf(state, c.religion);
  if (!head) return no('Your faith has no head to bless you');
  if (head.index === c.index) return no('You are the head of your faith');
  if (state.day - c.blessed < 3650) return no('You were blessed within the last ten years');
  if (c.gold < cost) return no(`A fitting donation is ${cost} gold`);
  return yes;
}

/** A donation to the head of the faith, for a blessing that strengthens the ruler's right. */
export function askBlessing(state: GameState, c: Country, cost: number): boolean {
  if (!canAskBlessing(state, c, cost).ok) return false;
  const head = headOf(state, c.religion)!;
  c.gold -= cost;
  head.gold += cost;
  c.legitimacy = Math.min(100, c.legitimacy + 10);
  c.blessed = state.day;
  return true;
}

// ── A new faith for a pagan crown ─────────────────────────────────

/** Major faiths of neighbouring realms that a pagan crown could take up. */
export function faithsToAdopt(state: GameState, world: SimWorld, c: Country): string[] {
  if (faithFamily(c.religion) !== 'pagan') return [];
  const out = new Set<string>();
  for (const n of realmNeighbours(state, world, c.index)) {
    const r = state.countries[n]?.religion;
    if (r && MAJOR_FAMILIES.has(faithFamily(r))) out.add(r);
  }
  return [...out];
}

export function canAdoptFaith(state: GameState, world: SimWorld, c: Country, faith: string): Check {
  if (faithFamily(c.religion) !== 'pagan') return no('Only a pagan crown may take up a new faith');
  if (!faithsToAdopt(state, world, c).includes(faith)) return no('No neighbour of that faith to learn it from');
  if (c.legitimacy < 20) return no('It needs 20 legitimacy');
  return yes;
}

/** The crown is baptised (or takes the shahada): the state faith changes, the people follow slowly. */
export function adoptFaith(state: GameState, world: SimWorld, c: Country, faith: string): boolean {
  if (!canAdoptFaith(state, world, c, faith).ok) return false;
  const old = c.religion;
  c.religion = faith;
  c.legitimacy -= 20;
  c.stability = Math.max(-3, c.stability - 2);
  c.converting = null;
  state.diploVersion++;
  log(state, 'all', 'event', `The ruler of ${c.name} forsakes ${faithName(old)} and embraces ${faithName(faith)}.`, {
    province: c.capital,
    important: c.index === state.player,
  });
  return true;
}

/** Legitimacy from holding the holy places of the realm's own faith. */
export function holySiteLegitimacy(state: GameState, c: Country): number {
  return Math.min(10, heldHolySites(state, c).length * 3);
}
