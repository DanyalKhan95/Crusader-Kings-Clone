import { describe, expect, it } from 'vitest';
import { character, die, makeCharacter } from '../src/sim/characters';
import * as cmd from '../src/sim/commands';
import { loyalty, remember } from '../src/sim/diplomacy';
import { income, taxMultiplier } from '../src/sim/economy';
import { estateLoyalty, lawCooldown, monthlyElections } from '../src/sim/politics';
import { countryByTag, provincesOf } from '../src/sim/queries';
import { factionWar, grantFreedom, monthlyFactions, startRevolt } from '../src/sim/revolts';
import { deserialize, serialize } from '../src/sim/save';
import { createGameState } from '../src/sim/setup';
import { advanceDay } from '../src/sim/tick';
import type { GameState } from '../src/sim/types';
import { endWar } from '../src/sim/war';
import { makeSimWorld } from '../src/sim/world';
import { loadData } from './helpers';

const { world: worldData, regions, scenario } = loadData();
const world = makeSimWorld(worldData, regions);
const fresh = (seed?: number) => createGameState(world, scenario, seed ? { seed } : {});
const tag = (s: GameState, t: string) => countryByTag(s, t)!;
const labels = (b: { parts: { label: string }[] }) => b.parts.map((p) => p.label);

describe('laws', () => {
  it('starts the Empire elective, Venice a republic and England hereditary', () => {
    const s = fresh();
    expect(tag(s, 'HRE').laws.succession).toBe('elective');
    expect(tag(s, 'VEN').laws.succession).toBe('republic');
    expect(tag(s, 'ENG').laws.succession).toBe('hereditary');
    expect(tag(s, 'SCO').laws.succession).toBe('elective');
  });

  it('raises taxes at a price, and not again for five years', () => {
    const s = fresh();
    const fra = tag(s, 'FRA');
    s.player = fra.index;
    const before = income(s, fra).total;
    const commons = estateLoyalty(s, fra, 'commons').total;
    const legit = fra.legitimacy;
    expect(cmd.setLaw(s, 'taxation', 2).ok).toBe(true);
    expect(income(s, fra).total).toBeGreaterThan(before);
    expect(labels(taxMultiplier(s, fra))).toContain('Taxation law');
    expect(estateLoyalty(s, fra, 'commons').total).toBeLessThan(commons);
    expect(fra.legitimacy).toBe(legit - 5);
    expect(lawCooldown(s, fra)).toBeGreaterThan(0);
    expect(cmd.setLaw(s, 'conscription', 2).ok).toBe(false);
    expect(cmd.setLaw(s, 'taxation', 0).ok).toBe(false);
  });

  it('lets a republic keep only its own succession', () => {
    const s = fresh();
    s.player = tag(s, 'VEN').index;
    expect(cmd.setLaw(s, 'succession', 'hereditary').ok).toBe(false);
  });
});

describe('council and estates', () => {
  it('moves the steward from taxes to the land', () => {
    const s = fresh();
    const eng = tag(s, 'ENG');
    s.player = eng.index;
    expect(labels(taxMultiplier(s, eng))).toContain('Steward');
    expect(cmd.councilTask(s, 'steward', 'develop').ok).toBe(true);
    expect(labels(taxMultiplier(s, eng))).not.toContain('Steward');
    expect(cmd.councilTask(s, 'steward', 'drill').ok).toBe(false);
  });

  it('buys an estate’s loyalty with privileges, and loses more by taking them back', () => {
    const s = fresh();
    const eng = tag(s, 'ENG');
    s.player = eng.index;
    const before = estateLoyalty(s, eng, 'clergy').total;
    const taxes = taxMultiplier(s, eng).total;
    expect(cmd.privilege(s, 'clergy', true).ok).toBe(true);
    expect(estateLoyalty(s, eng, 'clergy').total).toBeGreaterThan(before + 20);
    expect(taxMultiplier(s, eng).total).toBeLessThan(taxes);
    expect(cmd.privilege(s, 'clergy', false).ok).toBe(true);
    expect(estateLoyalty(s, eng, 'clergy').total).toBeLessThan(before);
  });
});

describe('revolts', () => {
  it('raises a rebel realm that returns its land when the revolt ends, with the demand granted', () => {
    const s = fresh();
    const fra = tag(s, 'FRA');
    fra.laws.taxation = 3;
    const own = provincesOf(s, fra.index).length;
    const war = startRevolt(s, world, fra, 'commons')!;
    expect(war.cb).toBe('revolt');
    expect(war.demand).toBe('lower_taxes');
    const rebels = s.countries[war.attacker];
    expect(rebels.rebel?.realm).toBe(fra.index);
    const theirs = provincesOf(s, rebels.index).length;
    expect(theirs).toBeGreaterThan(0);
    expect(provincesOf(s, fra.index).length).toBe(own - theirs);
    expect(s.armies.some((a) => a.owner === rebels.index)).toBe(true);
    endWar(s, world, war, 'attacker', { provinces: [], gold: 0, demands: true });
    expect(rebels.alive).toBe(false);
    expect(provincesOf(s, fra.index).length).toBe(own);
    expect(fra.laws.taxation).toBe(2);
  });

  it('lets nobles who doubt the crown fight for a pretender, who takes the throne if they win', () => {
    const s = fresh();
    const eng = tag(s, 'ENG');
    eng.legitimacy = 20;
    const war = startRevolt(s, world, eng, 'nobles')!;
    expect(war.cb).toBe('throne');
    const pretender = s.countries[war.attacker].ruler;
    endWar(s, world, war, 'attacker', { provinces: [], gold: 0, throne: true });
    expect(eng.ruler).toBe(pretender);
    expect(eng.alive).toBe(true);
  });

  it('keeps the realm whole when the rebels are crushed', () => {
    const s = fresh();
    const fra = tag(s, 'FRA');
    fra.laws.taxation = 3;
    const own = provincesOf(s, fra.index).length;
    const war = startRevolt(s, world, fra, 'commons')!;
    endWar(s, world, war, 'defender', { provinces: [], gold: 0, crush: true });
    expect(provincesOf(s, fra.index).length).toBe(own);
    expect(fra.laws.taxation).toBe(3);
  });
});

describe('factions', () => {
  it('unites disloyal vassals, who can win their freedom together', () => {
    const s = fresh();
    const fra = tag(s, 'FRA');
    const vassals = s.countries.filter((c) => c?.liege === fra.index);
    for (const v of vassals.slice(0, 3)) remember(s, v.index, fra.index, 'betrayed', -100);
    const rebels = vassals.slice(0, 3).map((v) => v.index);
    for (const r of rebels) expect(loyalty(s, world, r).total).toBeLessThan(0);
    monthlyFactions(s, world);
    const faction = s.factions.find((f) => f.realm === fra.index);
    if (faction) expect(faction.members).toEqual(expect.arrayContaining(rebels));
    const war = factionWar(s, fra.index, rebels, rebels[0]);
    expect(war.attackers).toEqual(expect.arrayContaining(rebels));
    expect(war.defenders).not.toContain(rebels[1]);
    endWar(s, world, war, 'attacker', { provinces: [], gold: 0, independence: true });
    for (const r of rebels) expect(s.countries[r].liege).toBe(0);
  });

  it('can be answered by granting freedom', () => {
    const s = fresh();
    const hre = tag(s, 'HRE');
    const v = s.countries.find((c) => c?.liege === hre.index)!;
    grantFreedom(s, hre.index, [v.index]);
    expect(v.liege).toBe(0);
  });
});

describe('succession', () => {
  it('elects the ablest candidate in an elective realm', () => {
    const s = fresh();
    const hre = tag(s, 'HRE');
    const star = makeCharacter(s, world, hre, { age: 40, talent: 12 });
    hre.courtiers.push(star.id);
    die(s, world, character(s, hre.ruler)!);
    expect(hre.ruler).toBe(star.id);
    expect(hre.legitimacy).toBe(55);
  });

  it('holds elections in a republic when the term ends', () => {
    const s = fresh();
    const ven = tag(s, 'VEN');
    const star = makeCharacter(s, world, ven, { age: 45, talent: 12 });
    ven.courtiers.push(star.id);
    ven.legitimacy = 0;
    ven.termEnds = s.day;
    monthlyElections(s);
    expect(ven.ruler).toBe(star.id);
    expect(ven.termEnds).toBeGreaterThan(s.day + 365 * 7);
  });
});

describe('saves and years of politics', () => {
  it('loads a save from milestone 2', () => {
    const s = fresh();
    const file = JSON.parse(serialize(s));
    file.version = 2;
    file.state.version = 2;
    delete file.state.factions;
    for (const c of file.state.countries) {
      if (!c) continue;
      for (const k of ['laws', 'lawChanged', 'legitimacy', 'estates', 'tasks', 'termEnds']) delete c[k];
    }
    const loaded = deserialize(JSON.stringify(file));
    expect(loaded.version).toBe(3);
    expect(loaded.countries[tag(s, 'ENG').index].tasks.steward).toBe('taxes');
    for (let d = 0; d < 40; d++) advanceDay(loaded, world);
  });

  it('keeps rebels and factions consistent over the years', () => {
    const s = fresh(9);
    // A harsh crown invites trouble.
    for (const c of s.countries) if (c && !c.liege) c.laws.taxation = 3;
    for (let d = 0; d < 6 * 365; d++) advanceDay(s, world);
    expect(s.countries.filter((c) => c?.rebel).length).toBeGreaterThan(0);
    for (const c of s.countries) {
      if (!c?.alive || !c.rebel) continue;
      expect(s.countries[c.rebel.realm].alive).toBe(true);
      expect(s.wars.some((w) => w.attacker === c.index)).toBe(true);
    }
    for (const f of s.factions) {
      expect(s.countries[f.realm].alive).toBe(true);
      for (const m of f.members) expect(s.countries[m].liege).toBe(f.realm);
    }
    for (const [id, p] of s.provinces.entries()) {
      if (!p?.owner) continue;
      expect(s.countries[p.owner].alive, `province ${id}`).toBe(true);
    }
  });
});
