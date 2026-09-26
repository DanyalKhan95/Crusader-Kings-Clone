/**
 * War and peace: declaring war for a cause, who joins, the war score, peace deals and truces.
 * Throne wars end with the victor's ruler taking the loser's crown, and the victor's lands joining
 * that realm, as William's did in 1066.
 */
import { seatSkill } from './characters';
import { years } from './calendar';
import { income, type Breakdown } from './economy';
import { log } from './log';
import { atWar, hasTruce, isInRealm, provincesOf, realmProvinces, sideOf, topLiege } from './queries';
import type { CasusBelli, Country, GameState, PeaceOffer, PeaceTerms, War } from './types';
import type { SimWorld } from './world';

export const TRUCE_YEARS = 5;

export const CB_INFO: Record<CasusBelli, { name: string; blurb: string }> = {
  throne: {
    name: 'Claim on the throne',
    blurb: 'Press your claim to the crown. If you win, your ruler takes it and your lands join that kingdom.',
  },
  border: {
    name: 'Border conquest',
    blurb: 'Take a province on your border.',
  },
  conquest: {
    name: 'War of conquest',
    blurb: 'War without a just cause. It costs a point of stability.',
  },
};

/** Every living country in a realm: the ruler's own and all vassals below. */
export function realmMembers(state: GameState, index: number): number[] {
  return state.countries.filter((c) => c?.alive && isInRealm(state, c.index, index)).map((c) => c.index);
}

function borders(state: GameState, world: SimWorld, realm: number, province: number): boolean {
  const r = world.region(province);
  for (const [n] of r.adj) {
    const o = state.provinces[n]?.owner ?? 0;
    if (o && isInRealm(state, o, realm)) return true;
  }
  return false;
}

export type Check = { ok: true } | { ok: false; reason: string };

export function canDeclare(
  state: GameState,
  world: SimWorld,
  attacker: number,
  target: number,
  cb: CasusBelli,
  goal: number,
): Check {
  const a = state.countries[attacker];
  const t = state.countries[target];
  if (!a?.alive || !t?.alive) return { ok: false, reason: 'No such country' };
  // A vassal may press a claim to a foreign crown, as William did; other wars are for its liege.
  if (a.liege && cb !== 'throne') return { ok: false, reason: 'Vassals cannot declare wars of their own' };
  const defender = topLiege(state, target);
  if (defender === attacker || isInRealm(state, target, attacker))
    return { ok: false, reason: 'They are part of your realm' };
  if (atWar(state, attacker, defender)) return { ok: false, reason: 'Already at war' };
  if (hasTruce(state, attacker, defender)) return { ok: false, reason: 'A truce is in force' };
  if (cb === 'throne' && !a.throneClaims.includes(defender))
    return { ok: false, reason: 'You have no claim on their throne' };
  if (cb === 'border') {
    const p = state.provinces[goal];
    if (!p || !p.owner || !isInRealm(state, p.owner, defender))
      return { ok: false, reason: 'Pick one of their provinces' };
    if (!borders(state, world, attacker, goal)) return { ok: false, reason: 'The province must border your realm' };
  }
  return { ok: true };
}

/** Provinces a border war could target: theirs, touching our realm. */
export function borderTargets(state: GameState, world: SimWorld, attacker: number, target: number): number[] {
  const defender = topLiege(state, target);
  return realmProvinces(state, defender).filter((id) => borders(state, world, attacker, id));
}

export function warName(world: SimWorld, cb: CasusBelli, attacker: Country, defender: Country, goal: number): string {
  if (cb === 'throne') return `${attacker.adj} Claim on ${defender.short.replace(/^the /, 'the ')}`;
  if (cb === 'border') return `${attacker.adj}–${defender.adj} War over ${world.region(goal).name}`;
  return `${attacker.adj} Invasion of ${defender.short}`;
}

export function declareWar(
  state: GameState,
  world: SimWorld,
  attacker: number,
  target: number,
  cb: CasusBelli,
  goal = 0,
): War | null {
  if (!canDeclare(state, world, attacker, target, cb, goal).ok) return null;
  const defender = topLiege(state, target);
  const a = state.countries[attacker],
    d = state.countries[defender];
  const war: War = {
    id: state.nextId++,
    name: warName(world, cb, a, d, goal),
    cb,
    goal: cb === 'throne' ? defender : goal,
    attacker,
    defender,
    attackers: realmMembers(state, attacker),
    defenders: realmMembers(state, defender),
    start: state.day,
    battleScore: 0,
    ticking: 0,
  };
  state.wars.push(war);
  if (cb === 'conquest') a.stability = Math.max(-3, a.stability - 1);
  log(state, [...war.attackers, ...war.defenders], 'war', `${a.name} has declared war on ${d.name}: ${war.name}.`, {
    important: war.defenders.includes(state.player),
    province: cb === 'border' ? goal : d.capital,
  });
  return war;
}

// ── War score ─────────────────────────────────────────────────────

function sideDev(state: GameState, members: number[]): number {
  let dev = 0;
  for (const m of members) for (const id of provincesOf(state, m)) dev += state.provinces[id].dev;
  return dev;
}

function occupiedDev(state: GameState, owners: number[], occupiers: number[]): number {
  let dev = 0;
  for (const m of owners)
    for (const id of provincesOf(state, m)) {
      const p = state.provinces[id];
      if (occupiers.includes(p.controller)) dev += p.dev;
    }
  return dev;
}

/** War score from the attacker's side, -100 … 100, with where it comes from. */
export function warScore(state: GameState, war: War): Breakdown {
  const occA = occupiedDev(state, war.defenders, war.attackers) / Math.max(1, sideDev(state, war.defenders));
  const occD = occupiedDev(state, war.attackers, war.defenders) / Math.max(1, sideDev(state, war.attackers));
  const parts = [
    { label: 'Occupied enemy land', value: occA * 70 },
    { label: 'Our land occupied', value: -occD * 70 },
    { label: 'Battles', value: war.battleScore },
    { label: war.ticking >= 0 ? 'War goal held' : 'Defenders holding out', value: war.ticking },
  ];
  if (war.cb === 'border' && war.attackers.includes(state.provinces[war.goal]?.controller ?? 0))
    parts.push({ label: 'War goal occupied', value: 15 });
  if (war.cb === 'throne') {
    const cap = state.countries[war.defender]?.capital ?? 0;
    if (war.attackers.includes(state.provinces[cap]?.controller ?? 0))
      parts.push({ label: 'Their capital taken', value: 20 });
  }
  const total = Math.max(
    -100,
    Math.min(
      100,
      parts.reduce((s, p) => s + p.value, 0),
    ),
  );
  return { total, parts: parts.filter((p) => Math.abs(p.value) > 0.05) };
}

/** War score seen from one country's side. */
export function scoreFor(state: GameState, war: War, country: number): number {
  const s = warScore(state, war).total;
  return sideOf(war, country) === 'defender' ? -s : s;
}

export function monthlyWars(state: GameState, world: SimWorld) {
  for (const war of [...state.wars]) {
    const a = state.countries[war.attacker],
      d = state.countries[war.defender];
    if (!a?.alive || !d?.alive) {
      endWar(state, world, war, null, { provinces: [], gold: 0, white: true });
      continue;
    }
    // Members that died or left drop out.
    war.attackers = war.attackers.filter((c) => state.countries[c]?.alive);
    war.defenders = war.defenders.filter((c) => state.countries[c]?.alive);
    const goalHeld =
      war.cb === 'border'
        ? war.attackers.includes(state.provinces[war.goal]?.controller ?? 0)
        : war.cb === 'throne'
          ? war.attackers.includes(state.provinces[d.capital]?.controller ?? 0)
          : false;
    const anyHeld = occupiedDev(state, war.defenders, war.attackers) > 0;
    if (goalHeld) war.ticking = Math.min(25, war.ticking + 1);
    else if (!anyHeld && state.day - war.start > years(1)) war.ticking = Math.max(-25, war.ticking - 1);
    for (const c of [...war.attackers, ...war.defenders]) {
      const country = state.countries[c];
      const slower = 1 - seatSkill(state, country, 'chancellor') * 0.02;
      country.warExhaustion = Math.min(20, country.warExhaustion + 0.3 * Math.max(0.4, slower));
    }
  }
  for (const c of state.countries) {
    if (!c?.alive) continue;
    if (!state.wars.some((w) => w.attackers.includes(c.index) || w.defenders.includes(c.index)))
      c.warExhaustion = Math.max(0, c.warExhaustion - 0.5);
  }
  state.truces = state.truces.filter((t) => t.until > state.day);
  state.offers = state.offers.filter((o) => o.expires > state.day && state.wars.some((w) => w.id === o.war));
}

// ── Peace ─────────────────────────────────────────────────────────

/** War score a deal costs the side that gains from it. */
export function peaceCost(state: GameState, war: War, winner: 'attacker' | 'defender', terms: PeaceTerms): number {
  if (terms.white) return 0;
  const losers = winner === 'attacker' ? war.defenders : war.attackers;
  const loserDev = Math.max(1, sideDev(state, losers));
  let cost = 0;
  for (const id of terms.provinces) {
    const p = state.provinces[id];
    const base = (p.dev / loserDev) * 100 * 1.3 + 4;
    cost += war.cb === 'border' && id === war.goal && winner === 'attacker' ? base * 0.5 : base;
  }
  if (terms.gold > 0) {
    const leader = state.countries[winner === 'attacker' ? war.defender : war.attacker];
    cost += (terms.gold / Math.max(10, income(state, leader).total * 12)) * 25;
  }
  if (terms.throne) cost += 70;
  return Math.min(100, cost);
}

export interface PeaceCheck {
  accept: boolean;
  reason: string;
}

/** Would the other side accept? `from` is the side proposing (and gaining). */
export function peaceAcceptance(state: GameState, war: War, from: number, terms: PeaceTerms): PeaceCheck {
  const side = sideOf(war, from);
  if (!side) return { accept: false, reason: 'Not in this war' };
  const score = scoreFor(state, war, from);
  const other = state.countries[side === 'attacker' ? war.defender : war.attacker];
  if (terms.white) {
    if (score >= -10 || other.warExhaustion >= 12 || state.day - war.start > years(4))
      return { accept: true, reason: 'They are tired of this war' };
    return { accept: false, reason: 'They are winning' };
  }
  const proposer = state.countries[side === 'attacker' ? war.attacker : war.defender];
  const discount = 1 - Math.min(0.2, seatSkill(state, proposer, 'chancellor') * 0.01);
  const cost = peaceCost(state, war, side, terms) * discount;
  if (score >= cost || score >= 99)
    return { accept: true, reason: `War score ${Math.round(score)} covers the cost of ${Math.round(cost)}` };
  return { accept: false, reason: `Needs war score ${Math.round(cost)}; you have ${Math.round(score)}` };
}

/** Ends a war on terms. `winner` is null for a white peace. */
export function endWar(
  state: GameState,
  world: SimWorld,
  war: War,
  winner: 'attacker' | 'defender' | null,
  terms: PeaceTerms,
) {
  state.wars = state.wars.filter((w) => w !== war);
  const winLeader = winner ? state.countries[winner === 'attacker' ? war.attacker : war.defender] : null;
  const loseLeader = winner ? state.countries[winner === 'attacker' ? war.defender : war.attacker] : null;
  const participants = [...war.attackers, ...war.defenders];
  // Occupied land goes back to its owners.
  state.provinces.forEach((p) => {
    if (!p?.owner || !participants.includes(p.owner)) return;
    if (p.controller !== p.owner && participants.includes(p.controller) && !atWarAfter(state, p.owner, p.controller)) {
      p.controller = p.owner;
      p.siege = undefined;
    }
  });
  let changed = false;
  if (winLeader && loseLeader && !terms.white) {
    for (const id of terms.provinces) {
      const p = state.provinces[id];
      if (!p || !war.defenders.concat(war.attackers).includes(p.owner)) continue;
      p.owner = winLeader.index;
      p.controller = winLeader.index;
      p.siege = undefined;
      changed = true;
    }
    if (terms.gold > 0) {
      const g = Math.min(terms.gold, Math.max(0, loseLeader.gold));
      loseLeader.gold -= g;
      winLeader.gold += g;
    }
    winLeader.stability = Math.min(3, winLeader.stability + 1);
    loseLeader.stability = Math.max(-3, loseLeader.stability - 1);
  }
  state.truces.push({ a: war.attacker, b: war.defender, until: state.day + years(TRUCE_YEARS) });
  state.battles = state.battles.filter((b) => atWar(state, b.attacker.country, b.defender.country));
  state.mapVersion++;
  if (changed) state.borderVersion++;
  const names = terms.provinces.map((id) => world.region(id).name);
  const what = terms.white
    ? 'a white peace'
    : [
        terms.throne ? 'the crown' : '',
        names.length > 3 ? `${names.length} provinces` : names.join(' and '),
        terms.gold ? `${Math.round(terms.gold)} gold` : '',
      ]
        .filter(Boolean)
        .join(', ');
  const text = winLeader
    ? `${war.name} is over. ${winLeader.name} wins ${what || 'the war'}.`
    : `${war.name} is over: ${what}.`;
  log(state, participants, 'peace', text, { important: participants.includes(state.player) });
  if (winLeader && loseLeader && terms.throne) inheritThrone(state, winLeader, loseLeader);
  for (const c of [...state.countries]) if (c?.alive && !provincesOf(state, c.index).length) destroyCountry(state, c);
}

function atWarAfter(state: GameState, a: number, b: number): boolean {
  return atWar(state, a, b);
}

/** The claimant's ruler takes the crown: the claimant's lands, vassals and armies join the target. */
export function inheritThrone(state: GameState, claimant: Country, target: Country) {
  const oldRuler = state.characters[target.ruler];
  if (oldRuler && oldRuler.died === undefined) oldRuler.died = state.day;
  const oldHeir = state.characters[target.heir];
  if (oldHeir && oldHeir.died === undefined) oldHeir.died = state.day;
  for (const c of Object.values(state.characters)) if (c.country === claimant.index) c.country = target.index;
  target.ruler = claimant.ruler;
  target.heir = claimant.heir;
  target.council = { ...claimant.council };
  target.courtiers = [
    ...claimant.courtiers,
    ...target.courtiers.filter((id) => state.characters[id]?.died === undefined),
  ];
  target.gold += claimant.gold;
  target.manpower += claimant.manpower;
  target.loans.push(...claimant.loans);
  for (const [t, n] of Object.entries(claimant.reserve))
    target.reserve[t as keyof typeof target.reserve] =
      (target.reserve[t as keyof typeof target.reserve] ?? 0) + (n ?? 0);
  target.throneClaims = claimant.throneClaims.filter((c) => c !== target.index);
  state.provinces.forEach((p) => {
    if (!p) return;
    if (p.owner === claimant.index) p.owner = target.index;
    if (p.controller === claimant.index) p.controller = target.index;
  });
  for (const c of state.countries) if (c?.liege === claimant.index) c.liege = target.index;
  for (const a of state.armies) if (a.owner === claimant.index) a.owner = target.index;
  target.stability = Math.max(-3, target.stability - 1);
  const wasPlayer = state.player === claimant.index;
  destroyCountry(state, claimant);
  if (wasPlayer) state.player = target.index;
  state.mapVersion++;
  state.borderVersion++;
  const ruler = state.characters[target.ruler];
  log(state, 'all', 'event', `${ruler?.name ?? 'The claimant'} is crowned: ${target.name} has a new ruler.`, {
    important: wasPlayer || target.index === state.player,
    province: target.capital,
  });
}

/** A country with nothing left leaves the game. */
export function destroyCountry(state: GameState, c: Country) {
  c.alive = false;
  c.liege = 0;
  for (const v of state.countries) if (v?.liege === c.index) v.liege = 0;
  state.armies = state.armies.filter((a) => a.owner !== c.index);
  for (const w of [...state.wars]) {
    w.attackers = w.attackers.filter((x) => x !== c.index);
    w.defenders = w.defenders.filter((x) => x !== c.index);
  }
  state.borderVersion++;
}

// ── Offers ────────────────────────────────────────────────────────

/** Records an AI peace proposal for the player to answer. */
export function proposeToPlayer(state: GameState, war: War, from: number, terms: PeaceTerms) {
  if (state.offers.some((o) => o.war === war.id)) return;
  const offer: PeaceOffer = {
    id: state.nextId++,
    war: war.id,
    from,
    to: state.player,
    terms,
    expires: state.day + 30,
  };
  state.offers.push(offer);
  log(state, [state.player], 'peace', `${state.countries[from].name} proposes peace in ${war.name}.`, {
    important: true,
  });
}

export function winnerSide(war: War, from: number): 'attacker' | 'defender' {
  return war.attackers.includes(from) ? 'attacker' : 'defender';
}
