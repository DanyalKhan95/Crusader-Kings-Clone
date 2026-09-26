import { describe, expect, it } from 'vitest';
import * as cmd from '../src/sim/commands';
import {
  addAggression,
  coalitionAgainst,
  dailyFabrication,
  hasPact,
  loyalty,
  mayEnter,
  memory,
  monthlyCoalitions,
  monthlyIntegration,
  monthlyMemories,
  opinion,
  remember,
  signPact,
  startIntegration,
} from '../src/sim/diplomacy';
import { income } from '../src/sim/economy';
import { newArmy, orderMove } from '../src/sim/military';
import { countryByTag, provincesOf, realmNeighbours } from '../src/sim/queries';
import { deserialize, serialize } from '../src/sim/save';
import { createGameState } from '../src/sim/setup';
import { advanceDay } from '../src/sim/tick';
import type { GameState } from '../src/sim/types';
import { declareWar, endWar, peaceCost } from '../src/sim/war';
import { makeSimWorld } from '../src/sim/world';
import { loadData } from './helpers';

const { world: worldData, regions, scenario } = loadData();
const world = makeSimWorld(worldData, regions);
const fresh = (seed?: number) => createGameState(world, scenario, seed ? { seed } : {});
const tag = (s: GameState, t: string) => countryByTag(s, t)!;
const named = (name: string) => regions.find((r) => r.name === name && r.kind === 'land')!.id;
const run = (s: GameState, days: number) => {
  for (let i = 0; i < days; i++) advanceDay(s, world);
};

/** A province of `b` that touches `a`'s land. */
function borderOf(s: GameState, a: number, b: number): number {
  const id = provincesOf(s, b).find((p) => world.region(p).adj.some(([n]) => s.provinces[n]?.owner === a));
  expect(id, `a border between ${a} and ${b}`).toBeTruthy();
  return id!;
}

describe('opinion', () => {
  it('likes a neighbour of its own faith better than one of another', () => {
    const s = fresh();
    const cas = tag(s, 'CAS').index;
    const leo = opinion(s, world, cas, tag(s, 'LEO').index);
    const tol = opinion(s, world, cas, tag(s, 'TOL').index);
    expect(leo.total).toBeGreaterThan(tol.total);
    expect(tol.parts.map((p) => p.label)).toContain('Another faith');
  });

  it('remembers gifts, and forgets them in time', () => {
    const s = fresh();
    const eng = tag(s, 'ENG'),
      sco = tag(s, 'SCO');
    s.player = eng.index;
    eng.gold = 1000;
    const before = opinion(s, world, sco.index, eng.index).total;
    expect(cmd.gift(s, sco.index).ok).toBe(true);
    expect(opinion(s, world, sco.index, eng.index).total).toBe(before + 25);
    for (let m = 0; m < 60; m++) monthlyMemories(s);
    expect(memory(s, sco.index, eng.index, 'gift')).toBe(0);
  });
});

describe('treaties', () => {
  it('signs an alliance the other side wants, and not one it does not', () => {
    const s = fresh();
    const eng = tag(s, 'ENG'),
      sco = tag(s, 'SCO');
    s.player = eng.index;
    remember(s, sco.index, eng.index, 'gift', 50);
    expect(cmd.proposePact(s, world, 'alliance', sco.index).ok).toBe(true);
    expect(hasPact(s, 'alliance', sco.index, eng.index)).toBe(true);
    expect(cmd.proposePact(s, world, 'alliance', tag(s, 'SNG').index).ok).toBe(false);
  });

  it('calls allies to war; an ally that refuses loses the alliance', () => {
    const s = fresh();
    const pol = tag(s, 'POL').index,
      hun = tag(s, 'HUN').index,
      pom = tag(s, 'POM').index;
    signPact(s, 'alliance', pol, hun);
    remember(s, hun, pol, 'gift', 50);
    const war = declareWar(s, world, pom, pol, 'conquest')!;
    expect(war.defenders).toContain(hun);

    const s2 = fresh();
    signPact(s2, 'alliance', pol, hun);
    remember(s2, hun, pol, 'betrayed', -100);
    tag(s2, 'HUN').warExhaustion = 20;
    const war2 = declareWar(s2, world, pom, pol, 'conquest')!;
    expect(war2.defenders).not.toContain(hun);
    expect(hasPact(s2, 'alliance', pol, hun)).toBe(false);
    expect(memory(s2, pol, hun, 'betrayed')).toBeLessThan(0);
  });

  it('asks the player to answer a call to arms', () => {
    const s = fresh();
    const pol = tag(s, 'POL').index,
      hun = tag(s, 'HUN').index,
      pom = tag(s, 'POM').index;
    s.player = hun;
    signPact(s, 'alliance', pol, hun);
    const war = declareWar(s, world, pom, pol, 'conquest')!;
    const call = s.offers.find((o) => o.kind === 'call' && o.to === hun);
    expect(call).toBeTruthy();
    expect(war.defenders).not.toContain(hun);
    expect(cmd.answerOffer(s, world, call!.id, true).ok).toBe(true);
    expect(war.defenders).toContain(hun);
  });

  it('treats an unanswered call as a refusal', () => {
    const s = fresh();
    const pol = tag(s, 'POL').index,
      hun = tag(s, 'HUN').index,
      pom = tag(s, 'POM').index;
    s.player = hun;
    signPact(s, 'alliance', pol, hun);
    declareWar(s, world, pom, pol, 'conquest');
    run(s, 62);
    expect(s.offers.some((o) => o.kind === 'call')).toBe(false);
    expect(hasPact(s, 'alliance', pol, hun)).toBe(false);
  });

  it('forbids war on allies and on pact partners', () => {
    const s = fresh();
    const eng = tag(s, 'ENG').index,
      sco = tag(s, 'SCO').index,
      gwy = tag(s, 'GWY').index;
    s.player = eng;
    signPact(s, 'nap', eng, sco);
    signPact(s, 'alliance', eng, gwy);
    expect(cmd.declare(s, world, sco, 'conquest', 0).ok).toBe(false);
    expect(cmd.declare(s, world, gwy, 'conquest', 0).ok).toBe(false);
    expect(cmd.cancelTreaty(s, 'nap', sco).ok).toBe(true);
    expect(memory(s, sco, eng, 'broke_pact')).toBeLessThan(0);
    expect(cmd.declare(s, world, sco, 'conquest', 0).ok).toBe(true);
  });

  it('brings the guarantor and the overlord to the defence', () => {
    const s = fresh();
    const eng = tag(s, 'ENG').index,
      sco = tag(s, 'SCO').index,
      gwy = tag(s, 'GWY').index,
      deh = tag(s, 'DEH').index;
    signPact(s, 'guarantee', eng, gwy);
    remember(s, eng, gwy, 'gift', 50);
    const war = declareWar(s, world, deh, gwy, 'conquest')!;
    expect(war.defenders).toContain(eng);
    tag(s, 'SCO').overlord = eng;
    remember(s, eng, sco, 'gift', 50);
    const war2 = declareWar(s, world, tag(s, 'ORK').liege, sco, 'conquest')!;
    expect(war2.defenders).toContain(eng);
  });
});

describe('military access', () => {
  it('keeps armies out of foreign land unless they are let in', () => {
    const s = fresh();
    const eng = tag(s, 'ENG'),
      fra = tag(s, 'FRA');
    const paris = named('Paris');
    expect(mayEnter(s, eng.index, paris)).toBe(false);
    const army = newArmy(s, eng, named('London'), { levy: 1000 });
    expect(orderMove(s, world, army, paris)).toBe(false);
    signPact(s, 'access', eng.index, fra.index);
    expect(mayEnter(s, eng.index, paris)).toBe(true);
    expect(orderMove(s, world, army, paris)).toBe(true);
  });

  it('opens the enemy’s land in war', () => {
    const s = fresh();
    const eng = tag(s, 'ENG'),
      fra = tag(s, 'FRA');
    declareWar(s, world, eng.index, fra.index, 'conquest');
    const army = newArmy(s, eng, named('London'), { levy: 1000 });
    expect(orderMove(s, world, army, named('Paris'))).toBe(true);
  });

  it('sends home armies left abroad when a war ends', () => {
    const s = fresh();
    const eng = tag(s, 'ENG'),
      fra = tag(s, 'FRA');
    const war = declareWar(s, world, eng.index, fra.index, 'conquest')!;
    const army = newArmy(s, eng, named('Paris'), { levy: 1000 });
    endWar(s, world, war, null, { provinces: [], gold: 0, white: true });
    run(s, 40);
    expect(army.location === named('Paris') && !army.path.length).toBe(false);
  });
});

describe('claims', () => {
  it('forges a claim that makes a just war possible, and makes the land cheap to take', () => {
    const s = fresh();
    const hun = tag(s, 'HUN'),
      pol = tag(s, 'POL');
    s.player = hun.index;
    hun.gold = 1000;
    const goal = borderOf(s, hun.index, pol.index);
    expect(cmd.declare(s, world, pol.index, 'claim', goal).ok).toBe(false);
    expect(cmd.fabricate(s, world, goal).ok).toBe(true);
    expect(cmd.fabricate(s, world, goal).ok).toBe(false);
    s.day = hun.fabricating!.done;
    dailyFabrication(s, world);
    expect(hun.claims).toContain(goal);
    expect(opinion(s, world, pol.index, hun.index).parts.map((p) => p.label)).toContain('Claims on our land');
    expect(cmd.declare(s, world, pol.index, 'claim', goal).ok).toBe(true);
    const war = s.wars.find((w) => w.attacker === hun.index)!;
    const claimed = peaceCost(s, world, war, 'attacker', { provinces: [goal], gold: 0 });
    hun.claims = [];
    expect(peaceCost(s, world, war, 'attacker', { provinces: [goal], gold: 0 })).toBeGreaterThan(claimed * 1.5);
  });
});

describe('aggressive expansion and coalitions', () => {
  it('alarms the neighbours and unites them against the aggressor', () => {
    const s = fresh();
    const byz = tag(s, 'BYZ');
    const neighbours = [...realmNeighbours(s, world, byz.index)];
    expect(neighbours.length).toBeGreaterThan(0);
    // The empire swallows a string of provinces.
    const eaten = neighbours.flatMap((n) => provincesOf(s, n).slice(0, 3));
    addAggression(s, world, byz.index, eaten, 1.25);
    const wary = neighbours.filter((n) => memory(s, n, byz.index, 'ae') <= -40);
    expect(wary.length).toBeGreaterThan(0);
    monthlyCoalitions(s);
    const co = coalitionAgainst(s, byz.index);
    expect(co?.members.length).toBeGreaterThan(0);
    expect(opinion(s, world, co!.members[0], byz.index).parts.map((p) => p.label)).toContain('Aggressive expansion');
  });
});

describe('subjects', () => {
  it('frees a vassal that wins its war of independence', () => {
    const s = fresh();
    const nrm = tag(s, 'NRM'),
      fra = tag(s, 'FRA');
    expect(loyalty(s, world, nrm.index).parts.length).toBeGreaterThan(0);
    const war = declareWar(s, world, nrm.index, fra.index, 'independence')!;
    expect(war.attackers).toEqual([nrm.index]);
    expect(war.defenders).toContain(fra.index);
    expect(war.defenders).not.toContain(nrm.index);
    endWar(s, world, war, 'attacker', { provinces: [], gold: 0, independence: true });
    expect(nrm.liege).toBe(0);
  });

  it('makes a beaten realm pay tribute', () => {
    const s = fresh();
    const eng = tag(s, 'ENG'),
      sco = tag(s, 'SCO');
    const war = declareWar(s, world, eng.index, sco.index, 'conquest')!;
    const before = income(s, eng).total;
    endWar(s, world, war, 'attacker', { provinces: [], gold: 0, tributary: true });
    expect(sco.overlord).toBe(eng.index);
    expect(income(s, eng).parts.map((p) => p.label)).toContain('Tribute from tributaries');
    expect(income(s, eng).total).toBeGreaterThan(before);
    expect(cmd.proposePact({ ...s, player: sco.index } as GameState, world, 'alliance', eng.index).ok).toBe(false);
  });

  it('integrates a loyal vassal', () => {
    const s = fresh();
    const fra = tag(s, 'FRA'),
      bar = tag(s, 'BAR');
    const land = provincesOf(s, bar.index);
    remember(s, bar.index, fra.index, 'gift', 50);
    remember(s, bar.index, fra.index, 'freed_us', 50);
    expect(startIntegration(s, world, fra.index, bar.index)).toBe(true);
    for (let m = 0; m < 200 && bar.alive; m++) monthlyIntegration(s);
    expect(bar.alive).toBe(false);
    for (const id of land) expect(s.provinces[id].owner).toBe(fra.index);
  });
});

describe('saves', () => {
  it('loads a save from milestone 1', () => {
    const s = fresh();
    const file = JSON.parse(serialize(s));
    file.version = 1;
    const st = file.state;
    st.version = 1;
    delete st.pacts;
    delete st.coalitions;
    delete st.diploVersion;
    delete st.factions;
    delete st.holyWars;
    delete st.proposalCooldown;
    for (const c of st.countries) {
      if (!c) continue;
      delete c.overlord;
      delete c.fabricating;
      delete c.integrating;
      delete c.memories;
      delete c.rulerSince;
      delete c.ai.nextDiplo;
      delete c.laws;
      delete c.lawChanged;
      delete c.legitimacy;
      delete c.estates;
      delete c.tasks;
      delete c.termEnds;
      for (const k of ['accepted', 'converting', 'assimilating', 'blessed']) delete c[k];
    }
    const hun = st.countries.find((c: { tag: string } | null) => c?.tag === 'HUN');
    const pol = st.countries.find((c: { tag: string } | null) => c?.tag === 'POL');
    const goal = borderOf(s, hun.index, pol.index);
    st.wars.push({
      ...st.wars[0],
      id: 9999,
      cb: 'border',
      goal,
      attacker: hun.index,
      defender: pol.index,
      attackers: [hun.index],
      defenders: [pol.index],
    });
    const loaded = deserialize(JSON.stringify(file));
    expect(loaded.version).toBe(4);
    expect(loaded.pacts).toEqual([]);
    expect(loaded.countries[hun.index].laws.taxation).toBe(1);
    const war = loaded.wars.find((w) => w.id === 9999)!;
    expect(war.cb).toBe('claim');
    expect(loaded.countries[hun.index].claims).toContain(goal);
    run(loaded, 40);
  });
});

describe('years of diplomacy', () => {
  it('keeps treaties, subjects and wars consistent', () => {
    const s = fresh(5);
    run(s, 8 * 365);
    const independent = (i: number) => s.countries[i]?.alive && !s.countries[i].liege;
    const seen = new Set<string>();
    for (const p of s.pacts) {
      expect(independent(p.a) && independent(p.b), `${p.kind} ${p.a}-${p.b}`).toBe(true);
      if (p.kind === 'alliance') expect(s.countries[p.a].overlord || s.countries[p.b].overlord).toBeFalsy();
      const key = [p.kind, ...(p.kind === 'alliance' || p.kind === 'nap' ? [p.a, p.b].sort() : [p.a, p.b])].join(':');
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
    expect(s.pacts.length).toBeGreaterThan(0);
    for (const c of s.countries) {
      if (!c?.alive) continue;
      expect(c.liege && c.overlord).toBeFalsy();
      if (c.overlord) expect(independent(c.overlord)).toBe(true);
    }
    for (const w of s.wars) for (const a of w.attackers) expect(w.defenders).not.toContain(a);
    for (const co of s.coalitions) {
      expect(s.countries[co.target].alive).toBe(true);
      for (const m of co.members) expect(independent(m)).toBe(true);
    }
  });
});

describe('a player who never answers', () => {
  it('lets offers lapse instead of piling up', () => {
    const s = fresh(11);
    s.player = tag(s, 'ENG').index;
    let most = 0;
    for (let d = 0; d < 4 * 365; d++) {
      advanceDay(s, world);
      most = Math.max(most, s.offers.length);
      for (const o of s.offers) expect(o.expires).toBeGreaterThan(s.day - 1);
    }
    expect(most).toBeLessThan(6);
    for (const o of s.offers) expect(o.to).toBe(s.player);
  });
});
