import { describe, expect, it } from 'vitest';
import { BUILDINGS, FREE_LEVELS, MAX_LEVEL } from '../src/data/buildings';
import { ERAS, eraOfLevel, MAX_TECH } from '../src/data/eras';
import { TECH_TRACKS, TECHS } from '../src/data/techs';
import { unitDef } from '../src/data/units';
import { emblemStyle, flagOf, flagSvg } from '../src/heraldry/flag';
import { generateCoA } from '../src/heraldry/coa';
import { cultureGroup } from '../src/sim/beliefs';
import * as cmd from '../src/sim/commands';
import { opinion } from '../src/sim/diplomacy';
import { canBuild, income } from '../src/sim/economy';
import { availableMaa, newArmy } from '../src/sim/military';
import { countryByTag, provincesOf, topLiege } from '../src/sim/queries';
import { nationalRisk, startNationalRevolt } from '../src/sim/revolts';
import { deserialize, serialize } from '../src/sim/save';
import { createGameState } from '../src/sim/setup';
import {
  buildingTech,
  canReform,
  eraOf,
  maxBuildingLevel,
  militaryEra,
  monthlyResearch,
  reformOptions,
  techCost,
  techEffect,
} from '../src/sim/tech';
import { advanceDay } from '../src/sim/tick';
import type { Country, GameState } from '../src/sim/types';
import { declareWar, endWar } from '../src/sim/war';
import { makeSimWorld } from '../src/sim/world';
import { loadData } from './helpers';

const { world: worldData, regions, scenario } = loadData();
const world = makeSimWorld(worldData, regions);
const fresh = (seed?: number) => createGameState(world, scenario, seed ? { seed } : {});
const tag = (s: GameState, t: string) => countryByTag(s, t)!;
const labels = (b: { parts: { label: string }[] }) => b.parts.map((p) => p.label);
const setTech = (c: Country, level: number) => (c.tech = { economy: level, military: level, society: level });

describe('technology data', () => {
  it('has 33 levels in each track, in the order history found them', () => {
    for (const track of TECH_TRACKS) {
      expect(TECHS[track]).toHaveLength(MAX_TECH);
      for (let i = 1; i < MAX_TECH; i++)
        expect(TECHS[track][i].year, TECHS[track][i].id).toBeGreaterThanOrEqual(TECHS[track][i - 1].year);
    }
    expect(eraOfLevel(0)).toBe(0);
    expect(eraOfLevel(6)).toBe(0);
    expect(eraOfLevel(7)).toBe(1);
    expect(eraOfLevel(33)).toBe(ERAS.length - 1);
  });

  it('gives every building level beyond the first three, and every university, a technology', () => {
    for (const type of Object.keys(BUILDINGS) as (keyof typeof BUILDINGS)[])
      for (let level = 1; level <= MAX_LEVEL; level++) {
        const needs = type === 'university' || level > FREE_LEVELS;
        expect(!!buildingTech(type, level), `${type} ${level}`).toBe(needs);
      }
  });

  it('opens every new government and the air arm through some technology', () => {
    const govs = TECHS.society.flatMap((t) => (t.government ? [t.government] : []));
    expect(govs.sort()).toEqual(['absolute', 'communist', 'constitutional', 'democracy', 'dictatorship']);
    expect(TECHS.military.some((t) => t.unit === 'air')).toBe(true);
  });
});

describe('research', () => {
  it('starts the realms of 1066 in the medieval era, the tribes behind', () => {
    const s = fresh();
    expect(tag(s, 'FRA').tech).toEqual({ economy: 3, military: 3, society: 3 });
    for (const c of s.countries) if (c) expect(eraOf(c)).toBe(0);
    const tribal = s.countries.find((c) => c?.gov === 'tribal')!;
    expect(tribal.tech.economy).toBeLessThan(3);
  });

  it('costs more ahead of its time, and less once the neighbours know it', () => {
    const s = fresh();
    const fra = tag(s, 'FRA');
    const now = techCost(s, world, fra, 'economy').total;
    expect(techCost(s, world, fra, 'economy', 1150).total).toBeLessThan(now);
    expect(labels(techCost(s, world, fra, 'economy'))[1]).toMatch(/Ahead of its time/);
    for (const c of s.countries) if (c && c.index !== fra.index) c.tech.economy = 4;
    const known = techCost(s, world, fra, 'economy');
    expect(known.total).toBeLessThan(now);
    expect(labels(known).some((l) => l.startsWith('Known to'))).toBe(true);
  });

  it('learns a level when the points are gathered, and tells the player', () => {
    const s = fresh();
    const eng = tag(s, 'ENG');
    s.player = eng.index;
    eng.research.military = techCost(s, world, eng, 'military').total;
    monthlyResearch(s, world);
    expect(eng.tech.military).toBe(4);
    expect(eng.research.military).toBe(0);
    expect(s.messages.at(-1)?.text).toMatch(/Chivalry/);
  });
});

describe('what technology brings', () => {
  it('raises taxes and opens later buildings', () => {
    const s = fresh();
    const fra = tag(s, 'FRA');
    const id = provincesOf(s, fra.index).find((x) => s.provinces[x].dev >= 8)!;
    const before = income(s, fra).total;
    setTech(fra, 12);
    expect(techEffect(fra, 'tax')).toBeGreaterThan(0.2);
    expect(income(s, fra).total).toBeGreaterThan(before);
    fra.gold = 100000;
    s.provinces[id].buildings.farms = 3;
    setTech(fra, 10);
    expect(maxBuildingLevel(fra, 'farms')).toBe(3);
    expect(canBuild(s, world, fra.index, id, 'farms').ok).toBe(false);
    setTech(fra, 11);
    expect(maxBuildingLevel(fra, 'farms')).toBe(4);
    expect(canBuild(s, world, fra.index, id, 'farms').ok).toBe(true);
  });

  it('modernises every arm of the army, and adds aircraft', () => {
    expect(unitDef('spearmen', 0).name).toBe('Spearmen');
    expect(unitDef('spearmen', 3).name).toBe('Line infantry');
    expect(unitDef('knights', 4).name).toBe('Tanks');
    expect(unitDef('knights', 4).damage).toBeGreaterThan(unitDef('knights', 0).damage * 2);
    const s = fresh();
    const eng = tag(s, 'ENG');
    expect(availableMaa(eng)).not.toContain('air');
    setTech(eng, 25);
    expect(militaryEra(eng)).toBe(4);
    expect(availableMaa(eng)).toContain('air');
  });

  it('lets a modern army beat a medieval one of the same size', () => {
    const s = fresh();
    const fra = tag(s, 'FRA'),
      hre = tag(s, 'HRE');
    declareWar(s, world, fra.index, hre.index, 'conquest', 0);
    s.armies = [];
    const field = provincesOf(s, hre.index)[0];
    fra.tech.military = 20;
    const a = newArmy(s, fra, field, { spearmen: 3000, archers: 1000 });
    const b = newArmy(s, hre, field, { spearmen: 3000, archers: 1000 });
    for (let d = 0; d < 40 && s.armies.includes(a) && s.armies.includes(b) && !a.retreating && !b.retreating; d++)
      advanceDay(s, world);
    expect(b.retreating || !s.armies.includes(b)).toBe(true);
    expect(a.retreating).toBeFalsy();
  });
});

describe('governments, nations and ideals', () => {
  it('opens absolutism to a feudal crown that knows it, once in twenty years', () => {
    const s = fresh();
    const fra = tag(s, 'FRA');
    s.player = fra.index;
    expect(reformOptions(fra)).not.toContain('absolute');
    setTech(fra, 11);
    expect(reformOptions(fra)).toContain('absolute');
    fra.legitimacy = 80;
    expect(cmd.reformGovernment(s, 'absolute').ok).toBe(true);
    expect(fra.gov).toBe('absolute');
    expect(fra.laws.succession).toBe('hereditary');
    expect(fra.legitimacy).toBe(60);
    setTech(fra, 17);
    expect(canReform(s, fra, 'democracy').ok).toBe(false);
    fra.reformed -= 21 * 365;
    expect(cmd.reformGovernment(s, 'democracy').ok).toBe(true);
    expect(fra.laws.succession).toBe('republic');
    expect(fra.termEnds - s.day).toBe(4 * 365);
  });

  it('sets liberals against communists, and democracies at ease with each other', () => {
    const s = fresh();
    const fra = tag(s, 'FRA'),
      eng = tag(s, 'ENG');
    fra.gov = 'democracy';
    eng.gov = 'communist';
    expect(labels(opinion(s, world, fra.index, eng.index))).toContain('Rival ideologies');
    eng.gov = 'democracy';
    expect(labels(opinion(s, world, fra.index, eng.index))).toContain('Shared ideals');
  });

  it('lets a foreign people of a nationalist realm rise, and win a nation of its own', () => {
    const s = fresh();
    const byz = tag(s, 'BYZ');
    expect(nationalRisk(s, byz)).toBeNull();
    setTech(byz, 18);
    const risk = nationalRisk(s, byz)!;
    expect(risk).toBeTruthy();
    expect(risk.provinces.length).toBeGreaterThanOrEqual(3);
    const war = startNationalRevolt(s, world, byz, risk.culture, risk.provinces);
    const rebel = s.countries[war.attacker];
    expect(rebel.rebel?.demand).toBe('nation');
    endWar(s, world, war, 'attacker', { provinces: [], gold: 0, demands: true });
    expect(rebel.alive).toBe(true);
    expect(rebel.rebel).toBeUndefined();
    expect(rebel.name).toMatch(/Republic$/);
    expect(provincesOf(s, rebel.index).length).toBe(risk.provinces.length);
    for (const id of risk.provinces) expect(topLiege(s, s.provinces[id].owner)).toBe(rebel.index);
  });
});

describe('emblems and saves', () => {
  it('turns arms into banners, then into flags shaped by the government', () => {
    expect(emblemStyle(0)).toBe('shield');
    expect(emblemStyle(2)).toBe('banner');
    expect(emblemStyle(4)).toBe('flag');
    const coa = generateCoA('FRA', [30, 60, 160], 'christian');
    expect(flagOf('FRA', coa, 'absolute', 'frankish', 'christian').layout).toBe('plain');
    expect(flagOf('FRA', coa, 'democracy', 'frankish', 'christian').layout).toBe('tricolor_v');
    expect(flagOf('XYZ', coa, 'communist', cultureGroup('french'), 'christian').layout).toBe('canton');
    expect(flagSvg(flagOf('SWE', coa, 'feudal', 'norse', 'christian'), 60)).toMatch(/^<svg[\s\S]*<\/svg>$/);
  });

  it('loads a save from milestone 4 with the realms of 1066’s technology', () => {
    const s = fresh();
    const file = JSON.parse(serialize(s));
    file.version = 4;
    file.state.version = 4;
    delete file.state.fleets;
    delete file.state.navalBattles;
    for (const c of file.state.countries)
      if (c) for (const k of ['tech', 'research', 'focus', 'reformed', 'transports', 'known', 'colonies']) delete c[k];
    const loaded = deserialize(JSON.stringify(file));
    expect(loaded.version).toBe(9);
    expect(tag(loaded, 'FRA').tech).toEqual({ economy: 3, military: 3, society: 3 });
    for (let d = 0; d < 40; d++) advanceDay(loaded, world);
  });

  it('advances the world’s learning over thirty years without going past the end', () => {
    const s = fresh(4);
    for (let d = 0; d < 30 * 365; d++) advanceDay(s, world);
    let gained = 0;
    for (const c of s.countries) {
      if (!c?.alive) continue;
      for (const t of TECH_TRACKS) {
        expect(c.tech[t]).toBeLessThanOrEqual(MAX_TECH);
        expect(c.research[t]).toBeGreaterThanOrEqual(0);
      }
      gained += c.tech.economy + c.tech.military + c.tech.society;
    }
    expect(gained).toBeGreaterThan(0);
  });
});
