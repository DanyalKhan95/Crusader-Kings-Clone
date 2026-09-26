/**
 * Diplomacy: treaties, opinion, claims, aggressive expansion and coalitions, and subjects.
 * Opinion always comes with its reasons, so the UI can show why a realm likes or hates you, and the
 * AI answers proposals with the same breakdowns the player sees.
 */
import { CROWN_VASSALS, IDEOLOGY_CLASH, ideologyOf } from '../data/politics';
import { cultureGroup, faithFamily } from './beliefs';
import { rulerSkill, seatSkill } from './characters';
import type { Breakdown, Part } from './economy';
import { headOf, sitesHeldByUnbelievers } from './faith';
import { log } from './log';
import { taskSkill } from './politics';
import {
  atWar,
  hasTruce,
  isInRealm,
  lordOf,
  provincesOf,
  realmMembers,
  realmNeighbours,
  realmProvinces,
  strengthOf,
  topLiege,
  touchesRealm,
  tributariesOf,
  warsOf,
} from './queries';
import type { CasusBelli, Country, GameState, MemoryKind, Pact, PactKind } from './types';
import { distanceKm, type SimWorld } from './world';

export type Check = { ok: true } | { ok: false; reason: string };
const yes: Check = { ok: true };
const no = (reason: string): Check => ({ ok: false, reason });

function breakdown(parts: Part[]): Breakdown {
  const kept = parts.filter((p) => Math.abs(p.value) >= 0.5);
  return { total: kept.reduce((s, p) => s + p.value, 0), parts: kept };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ── Treaties ──────────────────────────────────────────────────────

export const PACT_INFO: Record<PactKind, { name: string; blurb: string }> = {
  alliance: {
    name: 'Alliance',
    blurb: 'Each defends the other, and may call the other into its wars. Allies march through each other’s land.',
  },
  nap: { name: 'Non-aggression pact', blurb: 'Neither may declare war on the other while the pact holds.' },
  access: { name: 'Military access', blurb: 'Armies may march through the land of the realm that grants it.' },
  guarantee: {
    name: 'Guarantee of independence',
    blurb: 'The guarantor comes to the defence of the guaranteed realm when it is attacked.',
  },
};

const MUTUAL: Record<PactKind, boolean> = { alliance: true, nap: true, access: false, guarantee: false };

interface PactIndex {
  version: number;
  count: number;
  byKey: Map<string, Pact>;
  byCountry: Map<number, Pact[]>;
}
const pactIndexes = new WeakMap<GameState, PactIndex>();

/** Treaties looked up by the pair and by country, rebuilt whenever they change. */
function pactIndex(state: GameState): PactIndex {
  let ix = pactIndexes.get(state);
  if (!ix || ix.version !== state.diploVersion || ix.count !== state.pacts.length) {
    ix = { version: state.diploVersion, count: state.pacts.length, byKey: new Map(), byCountry: new Map() };
    for (const p of state.pacts) {
      ix.byKey.set(`${p.kind}:${p.a}:${p.b}`, p);
      for (const c of [p.a, p.b]) {
        let list = ix.byCountry.get(c);
        if (!list) ix.byCountry.set(c, (list = []));
        list.push(p);
      }
    }
    pactIndexes.set(state, ix);
  }
  return ix;
}

export function findPact(state: GameState, kind: PactKind, a: number, b: number): Pact | undefined {
  const ix = pactIndex(state);
  return ix.byKey.get(`${kind}:${a}:${b}`) ?? (MUTUAL[kind] ? ix.byKey.get(`${kind}:${b}:${a}`) : undefined);
}

export function hasPact(state: GameState, kind: PactKind, a: number, b: number): boolean {
  return !!findPact(state, kind, a, b);
}

/** Every treaty a country is party to. The array is shared: do not modify it. */
export function pactsOf(state: GameState, index: number): Pact[] {
  return pactIndex(state).byCountry.get(index) ?? [];
}

export function alliesOf(state: GameState, index: number): number[] {
  const out: number[] = [];
  for (const p of pactsOf(state, index)) if (p.kind === 'alliance') out.push(p.a === index ? p.b : p.a);
  return out;
}

/** Realms that guarantee this one. */
export function guarantorsOf(state: GameState, index: number): number[] {
  return pactsOf(state, index)
    .filter((p) => p.kind === 'guarantee' && p.b === index)
    .map((p) => p.a);
}

export function addPact(state: GameState, kind: PactKind, a: number, b: number) {
  if (a === b || hasPact(state, kind, a, b)) return;
  state.pacts.push({ kind, a, b, since: state.day });
  state.diploVersion++;
}

export function removePact(state: GameState, kind: PactKind, a: number, b: number): boolean {
  const p = findPact(state, kind, a, b);
  if (!p) return false;
  state.pacts = state.pacts.filter((x) => x !== p);
  state.diploVersion++;
  return true;
}

/** Drops the treaties of a country that died or lost its independence. Tributaries keep all but alliances. */
export function dropPacts(
  state: GameState,
  index: number,
  kinds: PactKind[] = ['alliance', 'nap', 'access', 'guarantee'],
) {
  const before = state.pacts.length;
  state.pacts = state.pacts.filter((p) => !(kinds.includes(p.kind) && (p.a === index || p.b === index)));
  if (state.pacts.length !== before) state.diploVersion++;
}

/** Which treaties a country may sign at all: only independent realms have a foreign policy. */
export function canSign(state: GameState, kind: PactKind, index: number): Check {
  const c = state.countries[index];
  if (!c?.alive) return no('No such country');
  if (c.rebel) return no(`${c.name} is a revolt, not a realm`);
  if (c.liege) return no(`${c.name} is a vassal and has no foreign policy of its own`);
  if (kind === 'alliance' && c.overlord) return no(`${c.name} pays tribute and may not make alliances`);
  return yes;
}

// ── Military access ───────────────────────────────────────────────

interface AccessCache {
  key: string;
  sets: Map<number, Set<number>>;
}
const accessCache = new WeakMap<GameState, AccessCache>();

/**
 * Countries whose land an army of `owner` may enter: its own realm, its enemies, its allies and those
 * who grant it access, its overlord and its tributaries. Land nobody owns is always open.
 */
export function accessSet(state: GameState, owner: number): Set<number> {
  const key = `${state.day}:${state.diploVersion}:${state.borderVersion}`;
  let cache = accessCache.get(state);
  if (!cache || cache.key !== key) accessCache.set(state, (cache = { key, sets: new Map() }));
  const hit = cache.sets.get(owner);
  if (hit) return hit;
  const top = topLiege(state, owner);
  const set = new Set<number>(realmMembers(state, top));
  for (const w of warsOf(state, owner))
    for (const e of w.attackers.includes(owner) ? w.defenders : w.attackers) set.add(e);
  const friends: number[] = [];
  for (const p of pactsOf(state, top)) {
    if (p.kind === 'alliance') friends.push(p.a === top ? p.b : p.a);
    else if (p.kind === 'access' && p.b === top) friends.push(p.a);
  }
  const c = state.countries[top];
  if (c?.overlord) friends.push(c.overlord);
  for (const t of tributariesOf(state, top)) friends.push(t.index);
  for (const f of friends) for (const m of realmMembers(state, f)) set.add(m);
  cache.sets.set(owner, set);
  return set;
}

/** May an army of `owner` enter this region? */
export function mayEnter(state: GameState, owner: number, region: number): boolean {
  const o = state.provinces[region]?.owner ?? 0;
  return !o || accessSet(state, owner).has(o);
}

// ── Memories ──────────────────────────────────────────────────────

export const MEMORY: Record<MemoryKind, { label: string; decay: number; min: number; max: number }> = {
  ae: { label: 'Aggressive expansion', decay: 0.75, min: -200, max: 0 },
  took_land: { label: 'Took our land', decay: 0.5, min: -100, max: 0 },
  gift: { label: 'Gifts', decay: 0.5, min: 0, max: 50 },
  betrayed: { label: 'Abandoned us in war', decay: 0.5, min: -100, max: 0 },
  broke_pact: { label: 'Broke a treaty with us', decay: 0.5, min: -60, max: 0 },
  fought_beside: { label: 'Fought beside us', decay: 0.25, min: 0, max: 30 },
  freed_us: { label: 'Granted us independence', decay: 0.25, min: 0, max: 50 },
  refused: { label: 'Turned down our proposal', decay: 2, min: -20, max: 0 },
};

/** Adds to what `of` remembers about `about`. */
export function remember(state: GameState, of: number, about: number, kind: MemoryKind, value: number) {
  const c = state.countries[of];
  if (!c?.alive || !about || of === about) return;
  const list = (c.memories[about] ??= []);
  let m = list.find((x) => x.kind === kind);
  if (!m) list.push((m = { kind, value: 0 }));
  const d = MEMORY[kind];
  m.value = clamp(m.value + value, d.min, d.max);
}

export function memory(state: GameState, of: number, about: number, kind: MemoryKind): number {
  return state.countries[of]?.memories[about]?.find((m) => m.kind === kind)?.value ?? 0;
}

/** Memories fade; those of the dead are forgotten. */
export function monthlyMemories(state: GameState) {
  for (const c of state.countries) {
    if (!c?.alive) continue;
    for (const key of Object.keys(c.memories)) {
      const about = Number(key);
      const list = c.memories[about];
      if (!state.countries[about]?.alive) {
        delete c.memories[about];
        continue;
      }
      for (const m of list) {
        const d = MEMORY[m.kind].decay;
        m.value = m.value > 0 ? Math.max(0, m.value - d) : Math.min(0, m.value + d);
      }
      const kept = list.filter((m) => Math.abs(m.value) >= 0.5);
      if (kept.length) c.memories[about] = kept;
      else delete c.memories[about];
    }
  }
}

// ── Opinion ───────────────────────────────────────────────────────

/** What `of` thinks of `about`, and why. */
export function opinion(state: GameState, world: SimWorld, of: number, about: number): Breakdown {
  const a = state.countries[of],
    b = state.countries[about];
  const parts: Part[] = [];
  if (!a || !b || of === about) return { total: 0, parts };
  if (a.religion === b.religion) parts.push({ label: 'Same faith', value: 15 });
  else if (faithFamily(a.religion) === faithFamily(b.religion)) parts.push({ label: 'A sister faith', value: -5 });
  else parts.push({ label: 'Another faith', value: -15 });
  if (headOf(state, a.religion)?.index === about) parts.push({ label: 'Head of our faith', value: 15 });
  const ia = ideologyOf(a.gov),
    ib = ideologyOf(b.gov);
  if (ia === ib && ia !== 'traditional') parts.push({ label: 'Shared ideals', value: 15 });
  else if (IDEOLOGY_CLASH[ia][ib]) parts.push({ label: 'Rival ideologies', value: IDEOLOGY_CLASH[ia][ib]! });
  if (a.culture === b.culture) parts.push({ label: 'Same culture', value: 10 });
  else if (cultureGroup(a.culture) && cultureGroup(a.culture) === cultureGroup(b.culture))
    parts.push({ label: 'Kindred culture', value: 5 });

  if (hasPact(state, 'alliance', of, about)) parts.push({ label: 'Allies', value: 40 });
  if (hasPact(state, 'nap', of, about)) parts.push({ label: 'Non-aggression pact', value: 15 });
  if (hasPact(state, 'guarantee', about, of)) parts.push({ label: 'They protect us', value: 20 });
  if (hasPact(state, 'guarantee', of, about)) parts.push({ label: 'Under our protection', value: 10 });

  const topA = topLiege(state, of),
    topB = topLiege(state, about);
  if (about === topB && sitesHeldByUnbelievers(state, a.religion, topB).length)
    parts.push({ label: 'Holds our holy places', value: -10 });
  if (atWar(state, of, about)) parts.push({ label: 'At war', value: -100 });
  else if (topA !== topB && hasTruce(state, topA, topB)) parts.push({ label: 'Recent war', value: -20 });

  let claimed = 0;
  for (const id of b.claims) {
    const o = state.provinces[id]?.owner ?? 0;
    if (o && isInRealm(state, o, topA)) claimed++;
  }
  if (claimed) parts.push({ label: 'Claims on our land', value: -Math.min(40, claimed * 10) });
  if (b.throneClaims.includes(topA)) parts.push({ label: 'Claims our throne', value: -30 });

  if (topA !== topB && realmNeighbours(state, world, topA).has(topB)) {
    if (strengthOf(state, topB) > strengthOf(state, topA) * 1.5)
      parts.push({ label: 'A dangerous neighbour', value: -10 });
  }

  for (const m of a.memories[about] ?? []) parts.push({ label: MEMORY[m.kind].label, value: Math.round(m.value) });
  parts.push({ label: 'Their ruler’s diplomacy', value: Math.round(rulerSkill(state, b, 'dip') * 1.5) });
  const embassies = taskSkill(state, b, 'chancellor', 'embassies');
  if (embassies) parts.push({ label: 'Their embassies', value: Math.round(embassies / 2) });
  const out = breakdown(parts);
  out.total = clamp(out.total, -200, 200);
  return out;
}

export function opinionOf(state: GameState, world: SimWorld, of: number, about: number): number {
  return opinion(state, world, of, about).total;
}

// ── Subjects ──────────────────────────────────────────────────────

/**
 * How loyal a vassal is to its liege, or a tributary to its overlord. Below −25 a subject that feels
 * strong enough fights for its independence.
 */
export function loyalty(state: GameState, world: SimWorld, subject: number): Breakdown {
  const s = state.countries[subject];
  const lord = lordOf(state, subject);
  if (!s || !lord) return { total: 0, parts: [] };
  const l = state.countries[lord];
  const parts = opinion(state, world, subject, lord).parts.slice();
  parts.push(s.liege ? { label: 'Owes service', value: -5 } : { label: 'Pays tribute', value: -15 });
  if (s.liege) parts.push({ label: 'Crown authority', value: CROWN_VASSALS[l.laws.crown] });
  parts.push({ label: 'Legitimacy of the crown', value: Math.round((l.legitimacy - 50) * 0.4) });
  const watch = taskSkill(state, l, 'spymaster', 'watch');
  if (watch) parts.push({ label: 'A watchful spymaster', value: Math.round(watch / 2) });
  parts.push({ label: 'Stability of the crown', value: l.stability * 5 });
  const reign = state.day - l.rulerSince;
  if (reign < 5 * 365) parts.push({ label: 'A new ruler', value: -Math.round(20 * (1 - reign / (5 * 365))) });
  const traits = state.characters[s.ruler]?.traits ?? [];
  if (traits.includes('ambitious')) parts.push({ label: 'An ambitious ruler', value: -15 });
  else if (traits.includes('content')) parts.push({ label: 'A content ruler', value: 10 });
  if (cultureGroup(s.culture) !== cultureGroup(l.culture)) parts.push({ label: 'Foreign masters', value: -10 });
  const lordMight = strengthOf(state, lord) - (s.liege ? strengthOf(state, subject) : 0);
  const own = Math.max(1, strengthOf(state, subject));
  parts.push({
    label: 'Might of the crown',
    value: Math.round(clamp(12 * Math.log2(Math.max(0.05, lordMight / own)), -40, 30)),
  });
  if (l.integrating?.vassal === subject) parts.push({ label: 'Being integrated', value: -25 });
  if (l.warExhaustion >= 1) parts.push({ label: 'War weariness of the crown', value: -Math.round(l.warExhaustion) });
  return breakdown(parts);
}

export const REBEL_LOYALTY = -25;

/** Makes a country the tributary of another: it pays tribute and gives up its alliances. */
export function makeTributary(state: GameState, subject: number, overlord: number) {
  const s = state.countries[subject];
  if (!s?.alive || s.liege || subject === overlord) return;
  s.overlord = overlord;
  dropPacts(state, subject, ['alliance']);
  for (const t of tributariesOf(state, subject)) t.overlord = 0;
  state.diploVersion++;
}

/** Frees a vassal or tributary. */
export function release(state: GameState, subject: number) {
  const s = state.countries[subject];
  if (!s) return;
  const lord = lordOf(state, subject);
  if (s.liege) state.borderVersion++;
  s.liege = 0;
  s.overlord = 0;
  const l = state.countries[lord];
  if (l?.integrating?.vassal === subject) l.integrating = null;
  state.diploVersion++;
  state.mapVersion++;
}

/** Development points of work to integrate a vassal. */
export function integrationNeeded(state: GameState, vassal: number): number {
  let dev = 0;
  for (const id of realmProvinces(state, vassal)) dev += state.provinces[id].dev;
  return Math.max(40, dev * 8);
}

/** Monthly progress of an integration: the ruler's and chancellor's diplomacy. */
export function integrationSpeed(state: GameState, c: Country): number {
  return 4 + rulerSkill(state, c, 'dip') * 0.5 + seatSkill(state, c, 'chancellor') * 0.5;
}

export function canIntegrate(state: GameState, world: SimWorld, liege: number, vassal: number): Check {
  const l = state.countries[liege],
    v = state.countries[vassal];
  if (!l?.alive || !v?.alive || v.liege !== liege) return no('Not your vassal');
  if (l.integrating) return no(`You are already integrating ${state.countries[l.integrating.vassal]?.name}`);
  if (atWar(state, liege, vassal)) return no('You are at war with them');
  const loyal = loyalty(state, world, vassal).total;
  if (loyal < 0) return no(`Their loyalty must be at least 0 (it is ${Math.round(loyal)})`);
  return yes;
}

export function startIntegration(state: GameState, world: SimWorld, liege: number, vassal: number): boolean {
  if (!canIntegrate(state, world, liege, vassal).ok) return false;
  state.countries[liege].integrating = { vassal, progress: 0, needed: integrationNeeded(state, vassal) };
  state.diploVersion++;
  return true;
}

/** Integrations advance each month; a vassal that turns hostile or leaves stops the work. */
export function monthlyIntegration(state: GameState) {
  for (const l of state.countries) {
    if (!l?.alive || !l.integrating) continue;
    const v = state.countries[l.integrating.vassal];
    if (!v?.alive || v.liege !== l.index || atWar(state, l.index, v.index)) {
      l.integrating = null;
      continue;
    }
    l.integrating.progress += integrationSpeed(state, l);
    if (l.integrating.progress < l.integrating.needed) continue;
    l.integrating = null;
    // The vassal's land and vassals pass to the liege.
    state.provinces.forEach((p) => {
      if (!p) return;
      if (p.owner === v.index) p.owner = l.index;
      if (p.controller === v.index) p.controller = l.index;
    });
    for (const c of state.countries) if (c?.liege === v.index) c.liege = l.index;
    for (const a of state.armies) if (a.owner === v.index) a.owner = l.index;
    for (const id of Object.values(v.council)) {
      const ch = state.characters[id];
      if (ch && ch.died === undefined) {
        ch.country = l.index;
        l.courtiers.push(id);
      }
    }
    l.gold += Math.max(0, v.gold);
    for (const id of v.claims) if (!l.claims.includes(id)) l.claims.push(id);
    v.alive = false;
    v.liege = 0;
    state.mapVersion++;
    state.borderVersion++;
    state.diploVersion++;
    log(state, [l.index, v.index], 'diplomacy', `${v.name} has been integrated into ${l.name}.`, {
      province: v.capital,
      important: v.index === state.player,
    });
  }
}

// ── Claims ────────────────────────────────────────────────────────

export function fabricationCost(state: GameState, province: number): number {
  return Math.round(25 + (state.provinces[province]?.dev ?? 1) * 3);
}

/** Days to forge a claim: about ten months, quicker with a skilled chancellor set to the task. */
export function fabricationDays(state: GameState, c: Country): number {
  const base = 300 * (1 - seatSkill(state, c, 'chancellor') * 0.02);
  return Math.max(90, Math.round(base * (c.tasks.chancellor === 'claims' ? 0.67 : 1)));
}

export function canFabricate(state: GameState, world: SimWorld, index: number, province: number): Check {
  const c = state.countries[index];
  const p = state.provinces[province];
  if (!c?.alive) return no('No such country');
  if (c.liege) return no('Vassals cannot press claims of their own');
  if (!p?.owner || world.region(province).kind !== 'land') return no('Only settled land can be claimed');
  if (isInRealm(state, p.owner, topLiege(state, index))) return no('It is already part of your realm');
  if (c.claims.includes(province)) return no('You already claim it');
  if (c.fabricating)
    return no(`Your chancellor is already forging a claim on ${world.region(c.fabricating.province).name}`);
  if (!touchesRealm(state, world, index, province)) return no('It must border your realm');
  const cost = fabricationCost(state, province);
  if (c.gold < cost) return no(`It costs ${cost} gold`);
  return yes;
}

export function startFabrication(state: GameState, world: SimWorld, index: number, province: number): boolean {
  if (!canFabricate(state, world, index, province).ok) return false;
  const c = state.countries[index];
  c.gold -= fabricationCost(state, province);
  c.fabricating = { province, start: state.day, done: state.day + fabricationDays(state, c) };
  return true;
}

export function dailyFabrication(state: GameState, world: SimWorld) {
  for (const c of state.countries) {
    if (!c?.alive || !c.fabricating || c.fabricating.done > state.day) continue;
    const id = c.fabricating.province;
    c.fabricating = null;
    const p = state.provinces[id];
    if (!p?.owner || isInRealm(state, p.owner, topLiege(state, c.index)) || c.claims.includes(id)) continue;
    c.claims.push(id);
    state.diploVersion++;
    log(
      state,
      [c.index, topLiege(state, p.owner)],
      'diplomacy',
      `${c.name} now holds a claim on ${world.region(id).name}.`,
      {
        province: id,
        important: c.index === state.player,
      },
    );
  }
}

/** Claims on land a realm already holds are fulfilled; claims on empty land lapse. */
export function pruneClaims(state: GameState) {
  for (const c of state.countries) {
    if (!c?.alive || !c.claims.length) continue;
    const top = topLiege(state, c.index);
    c.claims = c.claims.filter((id) => {
      const o = state.provinces[id]?.owner ?? 0;
      return o && !isInRealm(state, o, top);
    });
  }
}

/** Claims `claimant` holds on provinces of `realm`. */
export function claimsOn(state: GameState, claimant: number, realm: number): number[] {
  const top = topLiege(state, realm);
  return (state.countries[claimant]?.claims ?? []).filter((id) => {
    const o = state.provinces[id]?.owner ?? 0;
    return o && topLiege(state, o) === top;
  });
}

// ── Aggressive expansion and coalitions ───────────────────────────

const AE_NEAR_KM = 300;
const AE_RANGE_KM = 1200;
/** How much each cause for war alarms the neighbours. */
export const AE_FACTOR: Record<CasusBelli, number> = {
  claim: 0.75,
  throne: 0.3,
  conquest: 1.25,
  independence: 0,
  coalition: 0.5,
  revolt: 0,
  holy: 0.5,
  crusade: 0,
};
export const COALITION_AE = -40;
const LEAVE_AE = -25;

/** Neighbours of conquered land grow wary of the conqueror. */
export function addAggression(
  state: GameState,
  world: SimWorld,
  conqueror: number,
  provinces: number[],
  factor: number,
) {
  if (factor <= 0 || !provinces.length) return;
  const top = topLiege(state, conqueror);
  for (const c of state.countries) {
    if (!c?.alive || c.liege || c.rebel || c.index === top || !c.capital) continue;
    const cap = world.region(c.capital);
    let total = 0;
    for (const id of provinces) {
      const km = distanceKm(cap, world.region(id));
      const w = km <= AE_NEAR_KM ? 1 : Math.max(0, 1 - (km - AE_NEAR_KM) / (AE_RANGE_KM - AE_NEAR_KM));
      if (w > 0) total += ((state.provinces[id]?.dev ?? 1) * 1.5 + 4) * w;
    }
    if (total >= 0.5) remember(state, c.index, top, 'ae', -total * factor);
  }
}

/** Which realms a country may join a coalition against, and why not. */
export function canJoinCoalition(state: GameState, index: number, target: number): Check {
  const c = state.countries[index],
    t = state.countries[target];
  if (!c?.alive || !t?.alive) return no('No such country');
  if (c.liege) return no('Vassals follow their liege');
  if (t.liege) return no('Coalitions are formed against independent realms');
  if (index === target) return no('Not against yourself');
  if (lordOf(state, index) === target || lordOf(state, target) === index) return no('You are bound to them');
  if (hasPact(state, 'alliance', index, target)) return no('You are allies');
  if (memory(state, index, target, 'ae') > LEAVE_AE)
    return no(`Their conquests do not threaten you enough (aggressive expansion must reach ${LEAVE_AE})`);
  return yes;
}

export function coalitionAgainst(state: GameState, target: number) {
  return state.coalitions.find((c) => c.target === target);
}

export function coalitionOf(state: GameState, member: number) {
  return state.coalitions.filter((c) => c.members.includes(member));
}

export function joinCoalition(state: GameState, index: number, target: number) {
  let co = coalitionAgainst(state, target);
  if (!co) state.coalitions.push((co = { id: state.nextId++, target, members: [], since: state.day }));
  if (!co.members.includes(index)) co.members.push(index);
  state.diploVersion++;
}

export function leaveCoalition(state: GameState, index: number, target: number) {
  const co = coalitionAgainst(state, target);
  if (!co) return;
  co.members = co.members.filter((m) => m !== index);
  if (!co.members.length) state.coalitions = state.coalitions.filter((x) => x !== co);
  state.diploVersion++;
}

/**
 * AI realms join coalitions against those they fear and leave once the fear fades. The player's
 * memberships are the player's choice, but lapse with the grievance.
 */
export function monthlyCoalitions(state: GameState) {
  for (const co of [...state.coalitions]) {
    const t = state.countries[co.target];
    co.members = co.members.filter((m) => {
      const c = state.countries[m];
      return (
        c?.alive &&
        !c.liege &&
        memory(state, m, co.target, 'ae') <= LEAVE_AE &&
        !hasPact(state, 'alliance', m, co.target)
      );
    });
    if (!t?.alive || t.liege || !co.members.length) {
      state.coalitions = state.coalitions.filter((x) => x !== co);
      state.diploVersion++;
    }
  }
  for (const c of state.countries) {
    if (!c?.alive || c.liege || c.rebel || c.index === state.player) continue;
    for (const key of Object.keys(c.memories)) {
      const target = Number(key);
      if (memory(state, c.index, target, 'ae') > COALITION_AE) continue;
      if (coalitionAgainst(state, target)?.members.includes(c.index)) continue;
      if (!canJoinCoalition(state, c.index, target).ok) continue;
      // Only a realm that could hurt us is worth uniting against.
      if (strengthOf(state, target) < strengthOf(state, c.index) * 0.75) continue;
      joinCoalition(state, c.index, target);
      log(
        state,
        [c.index, target],
        'diplomacy',
        `${c.name} joins the coalition against ${state.countries[target].name}.`,
        {
          important: target === state.player && coalitionAgainst(state, target)!.members.length === 1,
        },
      );
    }
  }
}

/** Men the coalition could muster, and men the target and its allies could. */
export function coalitionBalance(state: GameState, target: number): { coalition: number; target: number } {
  const co = coalitionAgainst(state, target);
  let ours = 0;
  for (const m of co?.members ?? []) ours += strengthOf(state, m);
  let theirs = strengthOf(state, target);
  for (const a of alliesOf(state, target)) if (!co?.members.includes(a)) theirs += strengthOf(state, a) * 0.6;
  return { coalition: ours, target: theirs };
}

// ── Proposals ─────────────────────────────────────────────────────

function capitalKm(state: GameState, world: SimWorld, a: number, b: number): number {
  const ca = state.countries[a]?.capital,
    cb = state.countries[b]?.capital;
  return ca && cb ? distanceKm(world.region(ca), world.region(cb)) : 5000;
}

interface ThreatCache {
  key: string;
  byCountry: Map<number, number[]>;
}
const threatCache = new WeakMap<GameState, ThreatCache>();

/** Stronger realms that border `index` and are not its friends. The array is shared. */
export function threatsTo(state: GameState, world: SimWorld, index: number): number[] {
  const key = `${state.day}:${state.diploVersion}:${state.borderVersion}`;
  let cache = threatCache.get(state);
  if (!cache || cache.key !== key) threatCache.set(state, (cache = { key, byCountry: new Map() }));
  const hit = cache.byCountry.get(index);
  if (hit) return hit;
  const mine = strengthOf(state, index);
  const out: number[] = [];
  for (const n of realmNeighbours(state, world, index)) {
    if (hasPact(state, 'alliance', index, n)) continue;
    if (strengthOf(state, n) > mine * 1.3) out.push(n);
  }
  cache.byCountry.set(index, out);
  return out;
}

/**
 * How willing `of` is to sign a treaty with `with_`. Zero or more means yes. The same numbers drive the
 * AI's own proposals and its answers to the player.
 */
export function pactWillingness(
  state: GameState,
  world: SimWorld,
  kind: PactKind,
  of: number,
  with_: number,
): Breakdown {
  const parts: Part[] = [];
  const op = opinionOf(state, world, of, with_);
  const km = capitalKm(state, world, of, with_);
  const ratio = Math.max(1, strengthOf(state, with_)) / Math.max(1, strengthOf(state, of));
  if (kind === 'alliance') {
    parts.push({ label: 'Reluctance to be bound', value: -20 });
    parts.push({ label: 'Opinion', value: Math.round(op * 0.5) });
    const theirThreats = new Set(threatsTo(state, world, with_));
    if (threatsTo(state, world, of).some((t) => theirThreats.has(t) && t !== with_))
      parts.push({ label: 'A common threat', value: 25 });
    parts.push({ label: 'Their strength', value: Math.round(clamp(15 * Math.log2(ratio), -20, 25)) });
    parts.push({ label: 'Distance', value: -Math.round(Math.min(40, km / 60)) });
    const allies = alliesOf(state, of).length;
    if (allies >= 2) parts.push({ label: 'Allies enough already', value: -25 * (allies - 1) });
    if (atWar(state, of, with_)) parts.push({ label: 'At war with them', value: -1000 });
  } else if (kind === 'nap') {
    parts.push({ label: 'Keeping our options open', value: -10 });
    parts.push({ label: 'Opinion', value: Math.round(op * 0.5) });
    if (claimsOn(state, of, with_).length || state.countries[of]?.throneClaims.includes(topLiege(state, with_)))
      parts.push({ label: 'We have claims on them', value: -30 });
    if (ratio > 1.5) parts.push({ label: 'They are strong', value: 15 });
    else if (ratio < 0.7) parts.push({ label: 'They are weak', value: -25 });
    if (atWar(state, of, with_)) parts.push({ label: 'At war with them', value: -1000 });
  } else if (kind === 'access') {
    // `of` grants `with_` passage.
    parts.push({ label: 'Opinion', value: Math.round(op * 0.5) });
    parts.push({ label: 'Wary of foreign troops', value: -5 });
    for (const w of warsOf(state, with_)) {
      const enemies = w.attackers.includes(with_) ? w.defenders : w.attackers;
      if (enemies.some((e) => hasPact(state, 'alliance', of, e) || lordOf(state, e) === of))
        parts.push({ label: 'They fight our friends', value: -100 });
    }
    if (atWar(state, of, with_)) parts.push({ label: 'At war with them', value: -1000 });
  } else {
    // A guarantee needs no consent; this is the guarantor's own appetite for it.
    parts.push({ label: 'A costly promise', value: -15 });
    parts.push({ label: 'Opinion', value: Math.round(op * 0.5) });
    parts.push({ label: 'Their weakness', value: ratio < 0.5 ? 10 : -20 });
    parts.push({ label: 'Distance', value: -Math.round(Math.min(40, km / 40)) });
  }
  return breakdown(parts);
}

export function canPropose(state: GameState, kind: PactKind, from: number, to: number): Check {
  if (from === to) return no('Not with yourself');
  const own = canSign(state, kind, from);
  if (!own.ok) return own;
  const t = state.countries[to];
  if (!t?.alive) return no('No such country');
  if (t.liege) return no(`${t.name} is a vassal of ${state.countries[t.liege]?.name}; deal with its liege`);
  if (kind === 'alliance' && t.overlord) return no(`${t.name} pays tribute and may not make alliances`);
  if (kind === 'access' ? hasPact(state, 'access', to, from) : hasPact(state, kind, from, to))
    return no('That treaty is already in force');
  if (atWar(state, from, to)) return no('You are at war');
  if (lordOf(state, to) === from || lordOf(state, from) === to) return no('They are bound to you already');
  if (kind === 'guarantee' && strengthOf(state, from) < strengthOf(state, to))
    return no('Only a stronger realm can guarantee another');
  return yes;
}

/** Signs a treaty. For `access`, `from` is granted passage through `to`'s land. */
export function signPact(state: GameState, kind: PactKind, from: number, to: number) {
  if (kind === 'access') addPact(state, 'access', to, from);
  else if (kind === 'guarantee') addPact(state, 'guarantee', from, to);
  else addPact(state, kind, from, to);
}

/** Cancels a treaty. Breaking faith is remembered. */
export function cancelPact(state: GameState, kind: PactKind, from: number, to: number): boolean {
  let removed: boolean;
  if (kind === 'access') removed = removePact(state, 'access', from, to) || removePact(state, 'access', to, from);
  else if (kind === 'guarantee') removed = removePact(state, 'guarantee', from, to);
  else removed = removePact(state, kind, from, to);
  if (removed && kind !== 'access') remember(state, to, from, 'broke_pact', kind === 'alliance' ? -30 : -15);
  return removed;
}

// ── Gifts ─────────────────────────────────────────────────────────

/** A gift fit for the recipient: four months of its income, at least 20 gold. */
export function giftCost(recipientIncome: number): number {
  return Math.max(20, Math.round((recipientIncome * 4) / 5) * 5);
}

export function sendGift(state: GameState, from: number, to: number, cost: number): boolean {
  const f = state.countries[from];
  if (!f?.alive || !state.countries[to]?.alive || f.gold < cost) return false;
  f.gold -= cost;
  state.countries[to].gold += cost;
  remember(state, to, from, 'gift', 25);
  return true;
}

// ── Housekeeping ──────────────────────────────────────────────────

/** Treaties, coalitions and subjects that no longer make sense are dropped. */
export function cleanupDiplomacy(state: GameState) {
  const valid = (i: number) => {
    const c = state.countries[i];
    return !!c?.alive && !c.liege;
  };
  const before = state.pacts.length;
  state.pacts = state.pacts.filter(
    (p) =>
      valid(p.a) &&
      valid(p.b) &&
      !(p.kind === 'alliance' && (state.countries[p.a].overlord || state.countries[p.b].overlord)),
  );
  if (state.pacts.length !== before) state.diploVersion++;
  for (const c of state.countries) {
    if (!c?.alive) continue;
    if (c.overlord && (!state.countries[c.overlord]?.alive || c.liege || state.countries[c.overlord].liege)) {
      c.overlord = 0;
      state.diploVersion++;
    }
  }
}

/** Every province a realm and its vassals hold, with its development. */
export function realmDev(state: GameState, index: number): number {
  let dev = 0;
  for (const id of realmProvinces(state, index)) dev += state.provinces[id].dev;
  return dev;
}

export function ownDev(state: GameState, index: number): number {
  let dev = 0;
  for (const id of provincesOf(state, index)) dev += state.provinces[id].dev;
  return dev;
}
