/**
 * Espionage. A spymaster set to build a network works agents into one foreign realm, month by month;
 * networks elsewhere wither. A network is spent on plots (see data/espionage.ts): forged claims,
 * stolen learning, sabotage, incited revolts and murder. The victim's own spymaster, watching the
 * realm, slows the work and catches more of it; a plot traced back is not forgotten.
 */
import { NETWORK_MAX, PLOT_ORDER, PLOTS, type PlotId } from '../data/espionage';
import { TECH_TRACKS, type TechTrack } from '../data/techs';
import { character, die, seatSkill } from './characters';
import { remember } from './diplomacy';
import { income, type Breakdown, type Part } from './economy';
import { log } from './log';
import { addModifier, modifierEffect } from './modifiers';
import { estateInfluence, estateLoyalty, estateName, invalidateRealm, taskSkill } from './politics';
import { isInRealm, realmNeighbours, topLiege, warsOf } from './queries';
import { revoltRisk, startRevolt } from './revolts';
import { chance, random } from './rng';
import { techCost } from './tech';
import { ESTATES, type Country, type EstateId, type GameState } from './types';
import { borderProvinces } from './war';
import { distanceKm, type SimWorld } from './world';

type Check = { ok: true } | { ok: false; reason: string };

/** Share of the next level's cost that stolen secrets are worth. */
const STOLEN = 0.4;
const yes: Check = { ok: true };
const no = (reason: string): Check => ({ ok: false, reason });

function breakdown(parts: Part[]): Breakdown {
  const kept = parts.filter((p) => Math.abs(p.value) >= 0.05);
  return { total: kept.reduce((s, p) => s + p.value, 0), parts: kept };
}

/** Strength of the realm's network in another, 0 … 100. */
export function network(c: Country | undefined, target: number): number {
  return c?.spies[target] ?? 0;
}

/** Can the realm spy on this one at all? */
export function canSpyOn(state: GameState, c: Country, target: number): Check {
  const t = state.countries[target];
  if (!t?.alive || target === c.index) return no('No such realm');
  if (t.rebel) return no('Rebels are watched by the crown they fight');
  if (isInRealm(state, target, topLiege(state, c.index)) || isInRealm(state, c.index, topLiege(state, target)))
    return no('They are part of your realm');
  return yes;
}

/** How much the network in `target` grows in a month while the spymaster builds it. */
export function networkGrowth(state: GameState, world: SimWorld, c: Country, target: number): Breakdown {
  const t = state.countries[target];
  const parts: Part[] = [
    { label: 'Agents at work', value: 2 },
    { label: 'Your spymaster', value: seatSkill(state, c, 'spymaster') * 0.3 },
  ];
  if (t) {
    if (realmNeighbours(state, world, c.index).has(topLiege(state, target)))
      parts.push({ label: 'A neighbour', value: 1 });
    else if (c.capital && t.capital && distanceKm(world.region(c.capital), world.region(t.capital)) > 2500)
      parts.push({ label: 'Far away', value: -1 });
    const watch = taskSkill(state, t, 'spymaster', 'watch');
    if (watch) parts.push({ label: 'Their spymaster watches', value: -watch * 0.15 });
  }
  const base = parts.reduce((s, p) => s + p.value, 0);
  const extra = modifierEffect(c, 'spies');
  if (extra) parts.push({ label: 'Intelligence', value: base * extra });
  const b = breakdown(parts);
  b.total = Math.max(0.5, b.total);
  return b;
}

/** Networks grow where the spymaster works and wither everywhere else. */
export function monthlyEspionage(state: GameState, world: SimWorld) {
  for (const c of state.countries) {
    if (!c?.alive || c.rebel) continue;
    if (c.spyTarget && !canSpyOn(state, c, c.spyTarget).ok) c.spyTarget = 0;
    const working = c.tasks.spymaster === 'network' ? c.spyTarget : 0;
    for (const key of Object.keys(c.spies)) {
      const t = Number(key);
      if (t === working) continue;
      const left = c.spies[t] - 2;
      if (left > 0 && state.countries[t]?.alive) c.spies[t] = left;
      else delete c.spies[t];
    }
    if (working && network(c, working) < NETWORK_MAX)
      c.spies[working] = Math.min(NETWORK_MAX, network(c, working) + networkGrowth(state, world, c, working).total);
  }
}

// ── Plots ─────────────────────────────────────────────────────────

export function plotGold(state: GameState, c: Country, plot: PlotId): number {
  return Math.max(10, Math.round(PLOTS[plot].gold * Math.max(5, income(state, c).total)));
}

/** Chance of success in percent, and why. */
export function plotOdds(state: GameState, c: Country, target: number, plot: PlotId): Breakdown {
  const def = PLOTS[plot];
  const t = state.countries[target];
  const parts: Part[] = [{ label: def.name, value: def.odds }];
  const spare = network(c, target) - def.network;
  if (spare > 0) parts.push({ label: 'A network to spare', value: spare / 3 });
  const ours = seatSkill(state, c, 'spymaster');
  const theirs = t ? seatSkill(state, t, 'spymaster') : 0;
  if (ours !== theirs) parts.push({ label: 'Spymasters compared', value: (ours - theirs) * 2 });
  const watch = t ? taskSkill(state, t, 'spymaster', 'watch') : 0;
  if (watch) parts.push({ label: 'Their spymaster watches', value: -watch });
  const b = breakdown(parts);
  b.total = Math.max(5, Math.min(95, b.total));
  return b;
}

/** Chance in percent that the victim learns who was behind a plot (twice that if it fails). */
export function plotExposure(state: GameState, target: number, plot: PlotId): number {
  const t = state.countries[target];
  const watch = t ? taskSkill(state, t, 'spymaster', 'watch') : 0;
  return Math.min(90, PLOTS[plot].exposure * (1 + watch * 0.05));
}

/** Their province by our border that a forged claim would name: the richest not yet claimed. */
function claimTarget(state: GameState, world: SimWorld, c: Country, target: number): number {
  const land = borderProvinces(state, world, c.index, target).filter(
    (id) => !c.claims.includes(id) && state.provinces[id].owner,
  );
  return land.length ? land.reduce((a, b) => (state.provinces[b].dev > state.provinces[a].dev ? b : a)) : 0;
}

/** The track in which they are furthest ahead of us, if any. */
function stealTrack(c: Country, t: Country): TechTrack | null {
  let best: TechTrack | null = null;
  for (const track of TECH_TRACKS)
    if (t.tech[track] > c.tech[track] && (!best || t.tech[track] - c.tech[track] > t.tech[best] - c.tech[best]))
      best = track;
  return best;
}

/** The estate of theirs most ready to rise: powerful enough, and the least loyal. */
function restlessEstate(state: GameState, t: Country): EstateId {
  const share = estateInfluence(state, t).share;
  let best: EstateId = 'commons',
    low = Infinity;
  for (const e of ESTATES) {
    if (share[e] < 0.15) continue;
    const l = estateLoyalty(state, t, e).total;
    if (l < low) {
      low = l;
      best = e;
    }
  }
  return best;
}

export function canPlot(state: GameState, world: SimWorld, c: Country, target: number, plot: PlotId): Check {
  const spy = canSpyOn(state, c, target);
  if (!spy.ok) return spy;
  const def = PLOTS[plot];
  const t = state.countries[target];
  if (network(c, target) < def.network) return no(`It needs a network of ${def.network}`);
  const gold = plotGold(state, c, plot);
  if (c.gold < gold) return no(`It needs ${gold} gold`);
  if (plot === 'claim' && !claimTarget(state, world, c, target)) return no('No land of theirs borders yours');
  if (plot === 'steal' && !stealTrack(c, t)) return no('They know nothing you do not');
  if (plot === 'assassinate' && !character(state, t.ruler)) return no('They have no ruler');
  if (plot === 'revolt' && state.countries.some((x) => x?.alive && x.rebel?.realm === target))
    return no('They are already in revolt');
  return yes;
}

export interface PlotResult {
  success: boolean;
  exposed: boolean;
  /** what happened, from the plotter's side */
  text: string;
}

/** Carries out a plot: pays for it, rolls for success and exposure, and does the deed. */
export function carryOut(
  state: GameState,
  world: SimWorld,
  c: Country,
  target: number,
  plot: PlotId,
): PlotResult | null {
  if (!canPlot(state, world, c, target, plot).ok) return null;
  const def = PLOTS[plot];
  const t = state.countries[target];
  c.gold -= plotGold(state, c, plot);
  c.spies[target] = network(c, target) - def.network;
  const success = chance(state, plotOdds(state, c, target, plot).total / 100);
  const exposed = chance(state, Math.min(95, plotExposure(state, target, plot) * (success ? 1 : 2)) / 100);
  let deed = '';
  let theirNews = '';
  if (success) {
    switch (plot) {
      case 'claim': {
        const id = claimTarget(state, world, c, target);
        c.claims.push(id);
        deed = `Forged charters give ${c.name} a claim on ${world.region(id).name}.`;
        break;
      }
      case 'steal': {
        const track = stealTrack(c, t)!;
        c.research[track] += techCost(state, world, c, track).total * STOLEN;
        deed = `Agents have copied the ${track === 'military' ? 'military' : track === 'economy' ? 'economic' : 'learned'} secrets of ${t.name}.`;
        theirNews = `Papers have gone missing from the ministries of ${t.name}.`;
        break;
      }
      case 'sabotage': {
        addModifier(state, t, 'sabotaged');
        let burnt = '';
        for (const [id, p] of state.provinces.entries())
          if (p?.owner === target && p.construction) {
            p.construction = undefined;
            burnt = world.region(id).name;
            break;
          }
        deed = `Fires rage in the workshops of ${t.name}${burnt ? `, and the works at ${burnt} have burnt down` : ''}.`;
        theirNews = deed;
        break;
      }
      case 'revolt': {
        const e = restlessEstate(state, t);
        t.estates[e].mood = Math.max(-60, t.estates[e].mood - 35);
        invalidateRealm(state, target);
        const rose = revoltRisk(state, t, e) > 0 && startRevolt(state, world, t, e);
        deed = rose
          ? `Our agitators have roused the ${estateName(t, e).toLowerCase()} of ${t.name} to revolt.`
          : `Our agitators have turned the ${estateName(t, e).toLowerCase()} of ${t.name} against their crown.`;
        theirNews = `Agitators are stirring up the ${estateName(t, e).toLowerCase()} of ${t.name}.`;
        break;
      }
      case 'assassinate': {
        const ruler = character(state, t.ruler)!;
        deed = `${ruler.name} of ${t.name} is dead: the work of our agents.`;
        theirNews = `${ruler.name} has been murdered.`;
        die(state, world, ruler);
        break;
      }
    }
  }
  if (exposed) {
    remember(state, target, c.index, 'plotted', -def.anger);
    c.spies[target] = Math.floor(network(c, target) / 2);
    // Where the crowns keep other realms in mind, word of a murder gets about.
    if (plot === 'assassinate')
      for (const o of state.countries)
        if (o?.alive && o.index !== target && o.index !== c.index && realmNeighbours(state, world, target).has(o.index))
          remember(state, o.index, c.index, 'plotted', -20);
  }
  if (!c.spies[target]) delete c.spies[target];
  const text = success
    ? `${deed}${exposed ? ` But ${t.name} knows who was behind it.` : ''}`
    : `The plot against ${t.name} has failed${exposed ? ', and they know who was behind it' : ''}.`;
  if (c.index === state.player) log(state, [c.index], 'intrigue', text, { important: !success || exposed });
  if (target === state.player) {
    const who = `${c.name} was behind it.`;
    if (exposed)
      log(
        state,
        [target],
        'intrigue',
        success
          ? `${theirNews || deed} ${who}`
          : `Our spymaster has uncovered a plot by ${c.name}: ${PLOTS[plot].name.toLowerCase()}.`,
        { important: true },
      );
    else if (success && theirNews) log(state, [target], 'intrigue', theirNews, { important: plot === 'revolt' });
  }
  return { success, exposed, text };
}

// ── The AI ────────────────────────────────────────────────────────

/** The realm the AI's spymaster works against: its enemy at war, a realm it claims land of, or a rival. */
function spyTargetFor(state: GameState, world: SimWorld, c: Country): number {
  for (const w of warsOf(state, c.index)) {
    const enemy = w.attackers.includes(c.index) ? w.defender : w.attacker;
    if (canSpyOn(state, c, enemy).ok) return enemy;
  }
  for (const id of c.claims) {
    const o = state.provinces[id]?.owner;
    if (o && canSpyOn(state, c, topLiege(state, o)).ok) return topLiege(state, o);
  }
  // The strongest neighbour, whom it most needs to watch and to catch up with.
  let best = 0,
    most = 0;
  for (const n of realmNeighbours(state, world, c.index)) {
    const o = state.countries[n];
    if (!o || !canSpyOn(state, c, n).ok) continue;
    const lead = TECH_TRACKS.reduce((s, t) => s + Math.max(0, o.tech[t] - c.tech[t]), 0);
    const v = lead * 2 + Math.log2(1 + Math.max(0, o.tech.military));
    if (v > most) {
      most = v;
      best = n;
    }
  }
  return best;
}

/**
 * Once a month an AI realm keeps its spymaster busy and, when a network is ready, may use it:
 * learning it lacks, a claim to press, or harm to an enemy at war.
 */
export function espionageAI(state: GameState, world: SimWorld, c: Country) {
  if (c.rebel) return;
  // A realm looks about for someone to spy on now and then, not every month.
  const lost = !!c.spyTarget && !canSpyOn(state, c, c.spyTarget).ok;
  if (lost || (!c.spyTarget && chance(state, 0.15)) || chance(state, 0.03)) c.spyTarget = spyTargetFor(state, world, c);
  const t = c.spyTarget;
  if (!t || !chance(state, 0.03)) return;
  // A network is kept strong for the day it is needed: the AI spends only what it has to spare.
  const net = network(c, t);
  if (net < PLOTS.claim.network + 20) return;
  const other = state.countries[t];
  const atWar = warsOf(state, c.index).some((w) => w.attackers.includes(t) || w.defenders.includes(t));
  const cruel = !!character(state, c.ruler)?.traits.some((x) => x === 'cruel' || x === 'ambitious');
  const weights: Record<PlotId, number> = {
    claim: !atWar && !c.liege && c.claims.length < 2 ? 2 : 0,
    steal: stealTrack(c, other) ? 2 : 0,
    sabotage: atWar ? 2 : 0.1,
    revolt: atWar ? 1.5 : 0,
    assassinate: atWar && cruel ? 0.4 : 0,
  };
  let total = 0;
  for (const p of PLOT_ORDER) {
    if (net < Math.min(NETWORK_MAX, PLOTS[p].network + 20)) weights[p] = 0;
    total += weights[p];
  }
  if (total <= 0) return;
  let r = random(state) * total;
  for (const p of PLOT_ORDER) {
    r -= weights[p];
    if (r <= 0 && weights[p] > 0) {
      // The full checks, for the plot it has settled on.
      if (canPlot(state, world, c, t, p).ok) carryOut(state, world, c, t, p);
      return;
    }
  }
}
