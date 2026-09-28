import { describe, expect, it } from 'vitest';
import * as cmd from '../src/sim/commands';
import { addPact, alliesOf, memory } from '../src/sim/diplomacy';
import { income } from '../src/sim/economy';
import { newFleet, updateBlockades } from '../src/sim/naval';
import { countryByTag, isInRealm, provincesOf } from '../src/sim/queries';
import { releasable } from '../src/sim/revolts';
import { deserialize, SAVE_VERSION, serialize } from '../src/sim/save';
import { createGameState } from '../src/sim/setup';
import { advanceDay } from '../src/sim/tick';
import type { GameState, War } from '../src/sim/types';
import {
  allowedTerms,
  BATTLE_CAP,
  claimsToRenounce,
  declareWar,
  endWar,
  GOAL_CAP,
  goalScore,
  HUMILIATION,
  monthlyWars,
  peaceAcceptance,
  peaceCost,
  recordBattle,
  scoreFor,
  warScore,
} from '../src/sim/war';
import { isWater } from '../src/sim/movement';
import { makeSimWorld } from '../src/sim/world';
import { loadData } from './helpers';

const { world: worldData, regions, scenario } = loadData();
const world = makeSimWorld(worldData, regions);
const fresh = () => createGameState(world, scenario);
const tag = (s: GameState, t: string) => countryByTag(s, t)!;
const labels = (b: { parts: { label: string }[] }) => b.parts.map((p) => p.label);
const part = (b: { parts: { label: string; value: number }[] }, prefix: string) =>
  b.parts.find((p) => p.label.startsWith(prefix))?.value ?? 0;

/** A war of conquest between two realms of 1066, with no one else drawn in. */
function war(attacker: string, defender: string): { s: GameState; w: War; a: number; d: number } {
  const s = fresh();
  s.wars = [];
  s.pacts = [];
  const a = tag(s, attacker).index,
    d = tag(s, defender).index;
  const w = declareWar(s, world, a, d, 'conquest', 0)!;
  expect(w).toBeTruthy();
  return { s, w, a, d };
}

describe('the war score', () => {
  it('shows each share from either side', () => {
    const { s, w, a, d } = war('HUN', 'POL');
    const land = provincesOf(s, d).slice(0, 3);
    for (const id of land) s.provinces[id].controller = a;
    recordBattle(w, true, 12);
    recordBattle(w, false, 4);
    const theirs = warScore(s, w, 'attacker');
    const ours = warScore(s, w, 'defender');
    expect(labels(theirs)).toEqual(expect.arrayContaining(['Enemy land we hold', 'Battles we won', 'Battles we lost']));
    expect(labels(ours)).toEqual(expect.arrayContaining(['Our land they hold', 'Battles we won', 'Battles we lost']));
    expect(ours.total).toBeCloseTo(-theirs.total);
    expect(part(theirs, 'Battles we won')).toBe(12 - 4 * 0.5);
    expect(part(theirs, 'Battles we lost')).toBe(-4);
    expect(scoreFor(s, w, d)).toBeCloseTo(-scoreFor(s, w, a));
  });

  it('caps each side’s battles, and lets victories wear down the enemy’s', () => {
    const { w } = war('HUN', 'POL');
    for (let i = 0; i < 10; i++) recordBattle(w, true, 12);
    expect(w.battleGain).toBe(BATTLE_CAP);
    recordBattle(w, false, 10);
    expect(w.battleLoss).toBe(10);
    expect(w.battleGain).toBe(BATTLE_CAP - 5);
    for (let i = 0; i < 4; i++) recordBattle(w, true, 10);
    expect(w.battleLoss).toBe(0);
  });

  it('counts the war goal for more the longer it is held, and lets it drain away once lost', () => {
    for (let m = 1; m < 30; m++) expect(goalScore(m)).toBeGreaterThanOrEqual(goalScore(m - 1));
    expect(goalScore(12) - goalScore(11)).toBeGreaterThan(goalScore(2) - goalScore(1));
    expect(goalScore(100)).toBe(GOAL_CAP);
    const { s, w, a, d } = war('HUN', 'POL');
    w.cb = 'claim';
    w.goal = provincesOf(s, d)[0];
    s.provinces[w.goal].controller = a;
    for (let i = 0; i < 6; i++) monthlyWars(s, world);
    expect(w.ticking).toBe(6);
    const held = part(warScore(s, w), 'War goal held');
    expect(held).toBeGreaterThan(goalScore(6));
    s.provinces[w.goal].controller = d;
    monthlyWars(s, world);
    expect(w.ticking).toBe(3);
    monthlyWars(s, world);
    expect(w.ticking).toBe(0);
    expect(labels(warScore(s, w)).some((l) => l.startsWith('War goal held'))).toBe(false);
  });

  it('rewards defenders who hold out without losing land', () => {
    const { s, w } = war('HUN', 'POL');
    s.day += 400;
    for (let i = 0; i < 5; i++) monthlyWars(s, world);
    expect(w.ticking).toBe(-5);
    expect(part(warScore(s, w, 'defender'), 'We hold out')).toBeGreaterThan(0);
    expect(part(warScore(s, w, 'attacker'), 'They hold out')).toBeLessThan(0);
  });

  it('counts blockaded coasts', () => {
    const { s, w, a, d } = war('ENG', 'FRA');
    const coast = provincesOf(s, d).find((id) => world.region(id).coastal)!;
    const sea = world.region(coast).adj.find(([n]) => isWater(world.region(n)))![0];
    newFleet(s, world, s.countries[a], sea, { heavy: 4 });
    updateBlockades(s, world);
    expect(part(warScore(s, w), 'Enemy coasts blockaded')).toBeGreaterThan(0);
    expect(part(warScore(s, w, 'defender'), 'Our coasts blockaded')).toBeLessThan(0);
  });
});

describe('peace', () => {
  it('shows the enemy’s answer and its reasons', () => {
    const { s, w, a, d } = war('HUN', 'POL');
    const province = provincesOf(s, d)[0];
    const terms = { provinces: [province], gold: 0 };
    let answer = peaceAcceptance(s, world, w, a, terms);
    expect(answer.accept).toBe(false);
    expect(labels(answer.why)).toEqual(expect.arrayContaining(['What you ask']));
    expect(answer.why.total).toBeLessThan(0);
    w.battleGain = BATTLE_CAP;
    for (const id of provincesOf(s, d).slice(0, 4)) s.provinces[id].controller = a;
    answer = peaceAcceptance(s, world, w, a, terms);
    expect(answer.accept).toBe(true);
    expect(answer.why.total).toBeGreaterThanOrEqual(0);
    expect(labels(answer.why)).toEqual(expect.arrayContaining(['War score', 'What you ask']));
    // A white peace weighs the score, their weariness and the war's length.
    const white = peaceAcceptance(s, world, w, d, { provinces: [], gold: 0, white: true });
    expect(white.accept).toBe(false);
    s.countries[a].warExhaustion = 20;
    s.day += 365 * 5;
    expect(peaceAcceptance(s, world, w, d, { provinces: [], gold: 0, white: true }).accept).toBe(true);
  });

  it('sets peoples free as nations of their own', () => {
    const { s, w, a, d } = war('HUN', 'BYZ');
    const byz = s.countries[d];
    const people = releasable(s, byz).find((g) => g.culture === 'bulgarian')!;
    expect(people.provinces.length).toBeGreaterThan(2);
    expect(allowedTerms(s, w, 'attacker').release).toBe(true);
    const terms = { provinces: [], gold: 0, release: ['bulgarian'] };
    expect(peaceCost(s, world, w, 'attacker', terms)).toBeGreaterThan(8);
    endWar(s, world, w, 'attacker', terms);
    const nation = s.countries[s.provinces[people.provinces[0]].owner];
    expect(nation.index).not.toBe(d);
    expect(nation.culture).toBe('bulgarian');
    expect(nation.rebel).toBeUndefined();
    expect(nation.liege).toBe(0);
    expect(provincesOf(s, nation.index).length).toBe(people.provinces.length);
    expect(provincesOf(s, d).some((id) => s.provinces[id].culture === 'bulgarian')).toBe(false);
    expect(memory(s, nation.index, a, 'freed_us')).toBeGreaterThan(0);
    for (let i = 0; i < 40; i++) advanceDay(s, world);
    expect(nation.alive).toBe(true);
  });

  it('makes a beaten realm a vassal, if it is small enough', () => {
    const { s, w, a, d } = war('HRE', 'POL');
    expect(allowedTerms(s, w, 'attacker').vassal).toBe(true);
    // Poland could not make the Empire its vassal.
    expect(allowedTerms(s, w, 'defender').vassal).toBe(false);
    const other = declareWar(s, world, d, tag(s, 'HUN').index, 'conquest', 0)!;
    expect(other).toBeTruthy();
    endWar(s, world, w, 'attacker', { provinces: [], gold: 0, vassal: true });
    expect(s.countries[d].liege).toBe(a);
    expect(isInRealm(s, d, a)).toBe(true);
    // Its own war ends with its freedom.
    expect(s.wars).not.toContain(other);
    for (let i = 0; i < 40; i++) advanceDay(s, world);
  });

  it('forces a change of faith, humbles the crown, and breaks its alliances', () => {
    const { s, w, a, d } = war('HUN', 'BYZ');
    const byz = s.countries[d],
      hun = s.countries[a];
    addPact(s, 'alliance', d, tag(s, 'RUS').index);
    const allowed = allowedTerms(s, w, 'attacker');
    expect(allowed.convert && allowed.humiliate && allowed.breakAlliances).toBe(true);
    const legit = byz.legitimacy,
      ours = hun.legitimacy;
    endWar(s, world, w, 'attacker', {
      provinces: [],
      gold: 0,
      convert: true,
      humiliate: true,
      breakAlliances: true,
    });
    expect(byz.religion).toBe(hun.religion);
    expect(byz.legitimacy).toBe(Math.max(0, legit - HUMILIATION.loser));
    expect(hun.legitimacy).toBe(Math.min(100, ours + HUMILIATION.winner));
    expect(memory(s, d, a, 'humiliated')).toBeLessThan(0);
    expect(alliesOf(s, d)).toEqual([]);
    // Converting a realm of the same faith is not a term at all.
    const again = war('HUN', 'POL');
    expect(allowedTerms(again.s, again.w, 'attacker').convert).toBe(false);
  });

  it('makes the loser pay reparations over the years', () => {
    const { s, w, a, d } = war('HUN', 'POL');
    endWar(s, world, w, 'attacker', { provinces: [], gold: 0, reparations: 5 });
    expect(s.countries[d].reparations).toEqual([{ to: a, until: expect.any(Number) }]);
    expect(labels(income(s, s.countries[a]))).toContain('Reparations owed to us');
    expect(labels(income(s, s.countries[d]))).toContain('Reparations we pay');
    const paid = income(s, s.countries[a]).parts.find((p) => p.label === 'Reparations owed to us')!.value;
    expect(paid).toBeCloseTo(-income(s, s.countries[d]).parts.find((p) => p.label === 'Reparations we pay')!.value);
    // They end with their term.
    s.day += 365 * 5 + 1;
    monthlyWars(s, world);
    expect(s.countries[d].reparations).toEqual([]);
  });

  it('makes the loser renounce its claims on the winners', () => {
    const { s, w, a, d } = war('HUN', 'POL');
    const hunLand = provincesOf(s, a).slice(0, 3);
    s.countries[d].claims.push(...hunLand);
    expect(claimsToRenounce(s, w, 'attacker').provinces).toEqual(hunLand);
    expect(allowedTerms(s, w, 'attacker').renounce).toBe(true);
    endWar(s, world, w, 'attacker', { provinces: [], gold: 0, renounce: true });
    expect(s.countries[d].claims.filter((id) => hunLand.includes(id))).toEqual([]);
  });

  it('refuses terms that cannot go together', () => {
    const { s, w, a } = war('HRE', 'POL');
    w.battleGain = BATTLE_CAP;
    const answer = peaceAcceptance(s, world, w, a, { provinces: [], gold: 0, vassal: true, tributary: true });
    expect(answer.accept).toBe(false);
    expect(answer.reason).toMatch(/vassal/);
  });

  it('lets the player offer the new terms', () => {
    const { s, w, a, d } = war('HUN', 'POL');
    s.player = a;
    for (const id of provincesOf(s, d)) s.provinces[id].controller = a;
    w.battleGain = BATTLE_CAP;
    expect(cmd.offerPeace(s, world, w.id, { provinces: [], gold: 0, humiliate: true, reparations: 10 }).ok).toBe(true);
    expect(s.wars).not.toContain(w);
    expect(s.countries[d].reparations).toHaveLength(1);
  });
});

describe('saves', () => {
  it('bring a war from milestone 12 up to date', () => {
    const { s } = war('HUN', 'POL');
    const raw = JSON.parse(serialize(s));
    raw.version = 9;
    raw.state.version = 9;
    for (const w of raw.state.wars) {
      delete w.battleGain;
      delete w.battleLoss;
      w.battleScore = -12;
      w.ticking = 25;
    }
    for (const c of raw.state.countries) if (c) delete c.reparations;
    const back = deserialize(JSON.stringify(raw), world);
    expect(back.version).toBe(SAVE_VERSION);
    expect(back.wars[0].battleGain).toBe(0);
    expect(back.wars[0].battleLoss).toBe(12);
    expect('battleScore' in back.wars[0]).toBe(false);
    expect(back.countries[1].reparations).toEqual([]);
    for (let i = 0; i < 40; i++) advanceDay(back, world);
  });
});
