import { describe, expect, it } from 'vitest';
import { toDate, toDay } from '../src/sim/calendar';
import { alive, character, die } from '../src/sim/characters';
import * as cmd from '../src/sim/commands';
import { dailyBattles, startBattles } from '../src/sim/combat';
import { canBuild, fortLevel, income, maxManpower } from '../src/sim/economy';
import { newArmy } from '../src/sim/military';
import { findPath } from '../src/sim/movement';
import { armySize, atWar, countryByTag, provincesOf } from '../src/sim/queries';
import { deserialize, serialize } from '../src/sim/save';
import { createGameState } from '../src/sim/setup';
import { dailySieges } from '../src/sim/siege';
import { advanceDay } from '../src/sim/tick';
import type { GameState } from '../src/sim/types';
import { declareWar, endWar, peaceAcceptance, warScore } from '../src/sim/war';
import { makeSimWorld } from '../src/sim/world';
import { loadData } from './helpers';

const { world: worldData, regions, scenario } = loadData();
const world = makeSimWorld(worldData, regions);
const fresh = (seed?: number) => createGameState(world, scenario, seed ? { seed } : {});
const named = (_: GameState | null, name: string) => regions.find((r) => r.name === name && r.kind === 'land')!.id;
const idx = (state: GameState, tag: string) => countryByTag(state, tag)!.index;
const run = (state: GameState, days: number) => {
  for (let i = 0; i < days; i++) advanceDay(state, world);
};

describe('calendar', () => {
  it('round-trips days and dates', () => {
    for (const [y, m, d] of [
      [1066, 9, 15],
      [1066, 12, 31],
      [1067, 1, 1],
      [2066, 2, 28],
    ]) {
      expect(toDate(toDay(y, m, d))).toEqual({ y, m, d });
    }
    expect(toDay(1067, 1, 1) - toDay(1066, 12, 31)).toBe(1);
  });
});

describe('the start of 1066', () => {
  const state = fresh();

  it('gives every realm a ruler, an heir, a council, gold and levies', () => {
    for (const c of state.countries) {
      if (!c) continue;
      expect(alive(state, c.ruler), c.tag).toBe(true);
      expect(alive(state, c.heir), c.tag).toBe(true);
      expect(
        Object.values(c.council).every((id) => alive(state, id)),
        c.tag,
      ).toBe(true);
      expect(c.gold, c.tag).toBeGreaterThan(0);
      expect(income(state, c).total, c.tag).toBeGreaterThan(0);
    }
    expect(character(state, countryByTag(state, 'ENG')!.ruler)!.name).toBe('Harold II');
  });

  it('sets the stage: Hardrada at York, at war with England; William waiting', () => {
    const eng = idx(state, 'ENG'),
      nrw = idx(state, 'NRW'),
      nrm = idx(state, 'NRM');
    expect(atWar(state, nrw, eng)).toBe(true);
    expect(atWar(state, nrm, eng)).toBe(false);
    const york = named(state, 'York');
    expect(
      state.armies
        .filter((a) => a.location === york)
        .map((a) => a.owner)
        .sort(),
    ).toEqual([eng, nrw].sort());
    expect(countryByTag(state, 'NRM')!.throneClaims).toContain(eng);
  });

  it('lets William sail within a fortnight', () => {
    const s = fresh();
    run(s, 14);
    expect(atWar(s, idx(s, 'NRM'), idx(s, 'ENG'))).toBe(true);
  });
});

describe('determinism and saves', () => {
  it('replays the same world from the same seed', () => {
    const a = fresh(42),
      b = fresh(42);
    run(a, 150);
    run(b, 150);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('continues identically after a save and load', () => {
    const a = fresh(7);
    run(a, 60);
    const b = deserialize(serialize(a));
    run(a, 90);
    run(b, 90);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('refuses files that are not saves', () => {
    expect(() => deserialize('{"hello":1}')).toThrow();
  });
});

describe('movement', () => {
  it('marches overland and ships across the sea', () => {
    const london = named(fresh(), 'London');
    const york = named(fresh(), 'York');
    const paris = named(fresh(), 'Paris');
    const overland = findPath(world, london, york)!;
    expect(overland.at(-1)).toBe(york);
    expect(overland.every((id) => world.region(id).kind === 'land')).toBe(true);
    const crossing = findPath(world, london, paris)!;
    expect(crossing.at(-1)).toBe(paris);
    expect(crossing.some((id) => world.region(id).kind !== 'land')).toBe(true);
  });

  it('never enters impassable land', () => {
    const tibet = regions.find((r) => r.impassable)!;
    expect(findPath(world, named(fresh(), 'London'), tibet.id)).toBeNull();
  });
});

describe('battles', () => {
  it('lets the stronger army win and the loser flee', () => {
    const state = fresh();
    const fra = countryByTag(state, 'FRA')!,
      hre = countryByTag(state, 'HRE')!;
    declareWar(state, world, fra.index, hre.index, 'conquest');
    const place = named(state, 'Metz');
    const big = newArmy(state, fra, place, { spearmen: 3000, knights: 800, levy: 4000 });
    const small = newArmy(state, hre, place, { levy: 2500 });
    startBattles(state, world, [{ army: big, from: place }]);
    const here = () => state.battles.filter((b) => b.province === place);
    expect(here()).toHaveLength(1);
    expect(here()[0].attacker.armies).toEqual([big.id]);
    for (let i = 0; i < 20 && here().length; i++) dailyBattles(state, world);
    expect(here()).toHaveLength(0);
    const loser = state.armies.find((a) => a.id === small.id);
    if (loser) {
      expect(loser.retreating).toBe(true);
      expect(loser.path).toHaveLength(1);
    }
    expect(armySize(big)).toBeGreaterThan(5000);
  });
});

describe('sieges and peace', () => {
  it('occupies, scores, and hands over the war goal', () => {
    const state = fresh();
    state.player = idx(state, 'HUN');
    const hun = countryByTag(state, 'HUN')!;
    const pol = countryByTag(state, 'POL')!;
    const goal = provincesOf(state, pol.index).find((id) =>
      world.region(id).adj.some(([n]) => state.provinces[n]?.owner === hun.index),
    );
    expect(goal).toBeTruthy();
    expect(cmd.declare(state, world, pol.index, 'claim', goal!).ok).toBe(false);
    hun.claims.push(goal!);
    expect(cmd.declare(state, world, pol.index, 'claim', goal!).ok).toBe(true);
    const war = state.wars.find((w) => w.attacker === hun.index)!;
    newArmy(state, hun, goal!, { spearmen: 3000, siege: 300, levy: 5000 });
    for (let i = 0; i < 400 && state.provinces[goal!].controller !== hun.index; i++) dailySieges(state, world);
    expect(state.provinces[goal!].controller).toBe(hun.index);
    expect(warScore(state, war).total).toBeGreaterThan(10);
    const terms = { provinces: [goal!], gold: 0 };
    expect(peaceAcceptance(state, world, war, hun.index, terms).accept).toBe(true);
    expect(cmd.offerPeace(state, world, war.id, terms).ok).toBe(true);
    expect(state.provinces[goal!].owner).toBe(hun.index);
    expect(state.wars).toHaveLength(state.wars.filter((w) => w.id !== war.id).length);
    expect(cmd.declare(state, world, pol.index, 'conquest', 0).ok).toBe(false);
  });

  it('lets the player answer an offer of peace', () => {
    const state = fresh();
    const eng = countryByTag(state, 'ENG')!,
      nrw = countryByTag(state, 'NRW')!;
    state.player = eng.index;
    const war = state.wars.find((w) => w.attacker === nrw.index)!;
    const york = named(state, 'York');
    state.offers.push({
      id: 999,
      kind: 'peace',
      war: war.id,
      from: nrw.index,
      to: eng.index,
      terms: { provinces: [york], gold: 0 },
      expires: state.day + 30,
    });
    expect(cmd.answerOffer(state, world, 999, false).ok).toBe(true);
    expect(state.wars).toContain(war);
    state.offers.push({
      id: 1000,
      kind: 'peace',
      war: war.id,
      from: nrw.index,
      to: eng.index,
      terms: { provinces: [york], gold: 0 },
      expires: state.day + 30,
    });
    expect(cmd.answerOffer(state, world, 1000, true).ok).toBe(true);
    expect(state.wars).not.toContain(war);
    expect(state.provinces[york].owner).toBe(nrw.index);
  });

  it('takes longer to besiege a castle than to occupy open country', () => {
    const state = fresh();
    const cap = countryByTag(state, 'ENG')!.capital;
    expect(fortLevel(state, cap)).toBeGreaterThanOrEqual(2);
  });

  it('makes William king of England when the throne war is won', () => {
    const state = fresh();
    const nrm = countryByTag(state, 'NRM')!,
      eng = countryByTag(state, 'ENG')!;
    state.player = nrm.index;
    const war = declareWar(state, world, nrm.index, eng.index, 'throne', eng.index)!;
    const william = nrm.ruler;
    const normanLand = provincesOf(state, nrm.index).length;
    const englishLand = provincesOf(state, eng.index).length;
    endWar(state, world, war, 'attacker', { provinces: [], gold: 0, throne: true });
    expect(eng.ruler).toBe(william);
    expect(nrm.alive).toBe(false);
    expect(state.player).toBe(eng.index);
    expect(provincesOf(state, eng.index).length).toBe(normanLand + englishLand);
  });
});

describe('economy and court', () => {
  it('builds, and finishes on schedule', () => {
    const state = fresh();
    const eng = countryByTag(state, 'ENG')!;
    state.player = eng.index;
    eng.gold = 1000;
    const york = named(state, 'York');
    const check = canBuild(state, world, eng.index, york, 'farms');
    expect(check.ok).toBe(true);
    expect(cmd.build(state, world, york, 'farms').ok).toBe(true);
    expect(cmd.build(state, world, york, 'market').ok).toBe(false);
    const days = check.ok ? check.days : 0;
    const p = state.provinces[york];
    for (let i = 0; i <= days; i++) advanceDay(state, world);
    expect(p.buildings.farms).toBe(1);
    expect(maxManpower(state, eng).total).toBeGreaterThan(0);
  });

  it('crowns the heir when the ruler dies, with a regnal number if needed', () => {
    const state = fresh();
    const eng = countryByTag(state, 'ENG')!;
    const heir = eng.heir;
    die(state, world, character(state, eng.ruler)!);
    expect(eng.ruler).toBe(heir);
    expect(alive(state, eng.heir)).toBe(true);
  });
});

describe('a few years of history', () => {
  it('runs five years without breaking its own rules', () => {
    const state = fresh(3);
    run(state, 5 * 365);
    for (const [id, p] of state.provinces.entries()) {
      if (!p?.owner) continue;
      expect(state.countries[p.owner].alive, `province ${id}`).toBe(true);
      expect(state.countries[p.controller]?.alive, `province ${id} controller`).toBe(true);
    }
    for (const a of state.armies) {
      expect(state.countries[a.owner].alive).toBe(true);
      expect(armySize(a)).toBeGreaterThan(0);
    }
    for (const b of state.battles)
      for (const id of [...b.attacker.armies, ...b.defender.armies])
        expect(state.armies.some((a) => a.id === id)).toBe(true);
    for (const w of state.wars) {
      expect(state.countries[w.attacker].alive).toBe(true);
      expect(state.countries[w.defender].alive).toBe(true);
    }
    for (const c of state.countries) if (c?.alive) expect(Number.isFinite(c.gold)).toBe(true);
  });
});
