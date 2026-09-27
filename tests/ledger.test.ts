import { describe, expect, it } from 'vitest';
import { GREAT_HOLY_WARS } from '../src/data/faiths';
import { toDay } from '../src/sim/calendar';
import { character, die, pruneCharacters, regnalName, staffCourt } from '../src/sim/characters';
import { agree, theName, TheName } from '../src/sim/chronicle';
import * as cmd from '../src/sim/commands';
import {
  canDevelop,
  devCap,
  develop,
  developCost,
  expenses,
  IDLE_WASTE,
  IDLE_YEARS,
  idleWaste,
  income,
} from '../src/sim/economy';
import { monthlyHeresies } from '../src/sim/faith';
import { canCallHolyWar, holyWarLeader } from '../src/sim/holywars';
import { greatPowers, monthlyWorldEvents } from '../src/sim/worldEvents';
import { countryByTag, provincesOf } from '../src/sim/queries';
import { deserialize, serialize } from '../src/sim/save';
import { END_DAY, ranking, rankOf, standing, yearlyScore } from '../src/sim/score';
import { createGameState } from '../src/sim/setup';
import { advanceDay } from '../src/sim/tick';
import type { Country, GameState } from '../src/sim/types';
import { destroyCountry, inheritThrone } from '../src/sim/war';
import { makeSimWorld } from '../src/sim/world';
import { loadData } from './helpers';

const { world: worldData, regions, scenario } = loadData();
const world = makeSimWorld(worldData, regions);
const fresh = (seed?: number) => createGameState(world, scenario, seed ? { seed } : {});
const tag = (s: GameState, t: string) => countryByTag(s, t)!;
const labels = (b: { parts: { label: string }[] }) => b.parts.map((p) => p.label);

describe('the standing of nations', () => {
  it('scores independent realms each New Year, the great more than the small', () => {
    const s = fresh();
    const song = tag(s, 'SNG'),
      eng = tag(s, 'ENG'),
      nrm = tag(s, 'NRM');
    expect(labels(standing(s, song))).toContain('Lands and peoples');
    expect(standing(s, song).total).toBeGreaterThan(standing(s, eng).total);
    s.day = toDay(1067, 1, 1);
    yearlyScore(s);
    expect(song.score).toBeGreaterThan(eng.score);
    expect(eng.score).toBeGreaterThan(0);
    // Vassals do not score for themselves.
    expect(nrm.score).toBe(0);
    expect(ranking(s)[0]).toBe(song);
    expect(rankOf(s, eng.index)).toBeGreaterThan(1);
    expect(rankOf(s, nrm.index)).toBe(0);
  });

  it('keeps a ledger every ten years, from the first year of the game', () => {
    const s = fresh();
    expect(s.ledger).toHaveLength(1);
    expect(s.ledger[0].year).toBe(1066);
    expect(s.ledger[0].rows.length).toBeGreaterThanOrEqual(12);
    s.day = toDay(1070, 1, 1);
    yearlyScore(s);
    expect(s.ledger.map((l) => l.year)).toEqual([1066, 1070]);
    s.day = toDay(1071, 1, 1);
    yearlyScore(s);
    expect(s.ledger).toHaveLength(2);
    // The player is always in it, however small.
    const least = s.countries
      .filter((c) => c?.alive && !c.liege && !c.rebel)
      .reduce((a, b) => (provincesOf(s, b!.index).length < provincesOf(s, a!.index).length ? b : a))!;
    s.player = least.index;
    s.day = toDay(1080, 1, 1);
    yearlyScore(s);
    expect(s.ledger.at(-1)!.rows.some((r) => r[0] === least.index)).toBe(true);
  });

  it('ends the age on 1 January 2066, once, and lets the game go on', () => {
    const s = fresh();
    s.day = END_DAY - 1;
    advanceDay(s, world);
    expect(s.day).toBe(END_DAY);
    expect(s.happened.end).toBe(END_DAY);
    expect(s.chronicle.at(-1)!.text).toContain('The age ends');
    expect(s.messages.at(-1)!.important).toBe(true);
    expect(cmd.playOnAfterTheAge(s).ok).toBe(true);
    expect(s.happened.end_seen).toBe(END_DAY);
    for (let i = 0; i < 40; i++) advanceDay(s, world);
    expect(s.chronicle.filter((e) => e.text.includes('The age ends'))).toHaveLength(1);
  });
});

describe('the chronicle', () => {
  it('opens with 1066 and remembers the fall of kingdoms and their conquerors', () => {
    const s = fresh();
    expect(s.chronicle[0].text).toContain('Harald Hardrada');
    const nav = tag(s, 'NAV'),
      cas = tag(s, 'CAS');
    for (const id of provincesOf(s, nav.index)) {
      s.provinces[id].owner = cas.index;
      s.provinces[id].controller = cas.index;
    }
    s.mapVersion++;
    destroyCountry(s, nav);
    expect(s.chronicle.at(-1)!.text).toBe('The Kingdom of Navarre falls to the Kingdom of Castile.');
  });

  it('gives realms their article only where English would', () => {
    expect(theName('Kingdom of Aragon')).toBe('the Kingdom of Aragon');
    expect(theName('Almoravid Emirate')).toBe('the Almoravid Emirate');
    expect(theName('Srivijaya')).toBe('Srivijaya');
    expect(TheName('Song Empire')).toBe('The Song Empire');
    expect(theName('Sámi Siidas')).toBe('the Sámi Siidas');
    expect(agree('Jurchen Tribes', 'falls', 'fall')).toBe('fall');
    expect(agree('County of Flanders', 'falls', 'fall')).toBe('falls');
    expect(agree('Paramaras of Malwa', 'falls', 'fall')).toBe('fall');
    expect(agree('Emirate of Tiflis', 'falls', 'fall')).toBe('falls');
  });

  it('remembers each heresy the first time it is preached, and lets none rise again after 1700', () => {
    const s = fresh(5);
    s.day = toDay(1520, 1, 1);
    const preached = () => s.chronicle.filter((e) => e.text.startsWith('The Protestant faith')).length;
    for (let m = 0; m < 60 && !preached(); m++) monthlyHeresies(s, world);
    expect(preached()).toBe(1);
    // Stamped out, it rises again, but the chronicle does not repeat itself.
    const wipe = () => s.provinces.forEach((p) => p?.religion === 'protestant' && (p.religion = 'catholic'));
    wipe();
    for (let m = 0; m < 60 && !s.provinces.some((p) => p?.religion === 'protestant'); m++) monthlyHeresies(s, world);
    expect(s.provinces.some((p) => p?.religion === 'protestant')).toBe(true);
    expect(preached()).toBe(1);
    wipe();
    s.provinces.forEach((p) => p?.religion === 'cathar' && (p.religion = 'catholic'));
    s.day = toDay(1750, 1, 1);
    for (let m = 0; m < 120; m++) monthlyHeresies(s, world);
    expect(s.provinces.some((p) => p?.religion === 'protestant' || p?.religion === 'cathar')).toBe(false);
  });

  it('keeps the first realm of each new age', () => {
    const s = fresh(3);
    const eng = tag(s, 'ENG');
    eng.tech = { economy: 6, military: 6, society: 6 };
    eng.research = { economy: 1e12, military: 1e12, society: 1e12 };
    // Research is done on the fifth of the month.
    s.day = toDay(1067, 2, 1) - 1;
    for (let i = 0; i < 5; i++) advanceDay(s, world);
    expect(s.chronicle.some((e) => e.text.includes('first realm to enter the renaissance era'))).toBe(true);
  });
});

describe('the end of the crusades', () => {
  it('lets no great holy war be called after 1700', () => {
    const s = fresh();
    const def = GREAT_HOLY_WARS.find((d) => d.faith === 'catholic')!;
    const pope = holyWarLeader(s, def)!;
    s.day = toDay(1701, 1, 1);
    expect(canCallHolyWar(s, def, pope.index)).toEqual({
      ok: false,
      reason: 'The age of the great holy wars has passed',
    });
  });
});

describe('crises between great powers', () => {
  it('set two rival neighbours at war in the modern age, the player never striking first', () => {
    const s = fresh(9);
    s.player = tag(s, 'FRA').index;
    for (const c of s.countries) if (c) c.tech = { economy: 26, military: 26, society: 26 };
    s.day = toDay(1950, 1, 1);
    const powers = greatPowers(s);
    expect(powers.length).toBeGreaterThanOrEqual(3);
    const crisis = () =>
      s.wars.find((w) => w.cb === 'conquest' && powers.includes(w.attacker) && powers.includes(w.defender));
    for (let m = 0; m < 1200 && !crisis(); m++) {
      monthlyWorldEvents(s, world);
      s.day += 30;
    }
    expect(crisis()).toBeDefined();
    expect(crisis()!.attacker).not.toBe(s.player);
    expect(s.messages.some((m) => m.text.startsWith('A crisis between'))).toBe(true);
  });

  it('do not break out before 1905', () => {
    const s = fresh(9);
    for (const c of s.countries) if (c) c.tech = { economy: 26, military: 26, society: 26 };
    s.day = toDay(1850, 1, 1);
    const wars = s.wars.length;
    for (let m = 0; m < 400; m++) {
      monthlyWorldEvents(s, world);
      s.day += 1;
    }
    expect(s.wars.length).toBe(wars);
  });
});

describe('investing in the land', () => {
  it('buys development for gold, dearer the more developed, up to what the age allows', () => {
    const s = fresh();
    const eng = tag(s, 'ENG');
    s.player = eng.index;
    const york = regions.find((r) => r.name === 'York')!.id;
    const p = s.provinces[york];
    const cost = developCost(eng, p);
    eng.gold = 10_000;
    const before = p.dev;
    expect(cmd.developProvince(s, world, york).ok).toBe(true);
    expect(p.dev).toBe(before + 1);
    expect(eng.gold).toBe(10_000 - cost);
    expect(developCost(eng, p)).toBeGreaterThanOrEqual(cost);
    while (canDevelop(s, world, eng.index, york).ok) develop(s, world, eng.index, york);
    expect(p.dev).toBe(devCap(world, eng, york));
    const check = canDevelop(s, world, eng.index, york);
    expect(check.ok).toBe(false);
    // Not another realm's land.
    const paris = regions.find((r) => r.name === 'Paris')!.id;
    expect(cmd.developProvince(s, world, paris).ok).toBe(false);
  });
});

describe('the treasury', () => {
  it('lets gold beyond three years of income go to waste', () => {
    const s = fresh();
    const eng = tag(s, 'ENG');
    const inc = income(s, eng).total;
    const keep = IDLE_YEARS * 12 * Math.max(10, inc);
    eng.gold = keep;
    expect(idleWaste(eng, inc)).toBe(0);
    expect(labels(expenses(s, eng))).not.toContain('Waste of an idle treasury');
    eng.gold = keep + 1000;
    expect(idleWaste(eng, inc)).toBeCloseTo(1000 * IDLE_WASTE);
    expect(labels(expenses(s, eng))).toContain('Waste of an idle treasury');
  });
});

describe('the records of a thousand years', () => {
  it('forget the dead a year on, but keep the past rulers that regnal numbers count', () => {
    const s = fresh();
    const eng = tag(s, 'ENG');
    const courtier = character(s, eng.courtiers[0])!;
    const king = character(s, eng.ruler)!;
    die(s, world, courtier);
    die(s, world, king);
    staffCourt(s, world, eng, true);
    pruneCharacters(s);
    expect(s.characters[courtier.id]).toBeDefined();
    s.day += 400;
    pruneCharacters(s);
    expect(s.characters[courtier.id]).toBeUndefined();
    expect(s.characters[king.id]).toBeDefined();
    expect(character(s, eng.ruler)?.died).toBeUndefined();
    for (const id of eng.courtiers) expect(character(s, id)).toBeDefined();
  });

  it('number rulers as the whole records would, through many reigns and a throne won in war', () => {
    const s = fresh();
    // Regnal numbers as they were counted before the records kept an index: every character, by id.
    const numeral = (n: number) =>
      'X'.repeat(Math.floor(n / 10)) + ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'][n % 10];
    const value = (r: string) => {
      const v: Record<string, number> = { I: 1, V: 5, X: 10 };
      let n = 0;
      for (let i = 0; i < r.length; i++) n += v[r[i]] < (v[r[i + 1]] ?? 0) ? -v[r[i]] : v[r[i]];
      return n;
    };
    const counted = (c: Country, given: string) => {
      const base = given.replace(/ of .*$/, '');
      let count = 0;
      for (const ch of Object.values(s.characters)) {
        if (ch.country !== c.index || !ch.traits.includes('_reigned')) continue;
        const m = /^(.*?)(?: ([IVX]+))?$/.exec(ch.name.replace(/ the .*$/, ''));
        if (m && m[1] === base) count = Math.max(count + 1, m[2] ? value(m[2]) : 1);
      }
      return count ? `${base} ${numeral(count + 1)}` : base;
    };
    const eng = tag(s, 'ENG'),
      nor = tag(s, 'NRW');
    const check = (c: Country) => {
      const names = new Set(['Harold', 'William', 'Harald', 'Olaf']);
      for (const ch of Object.values(s.characters))
        if (ch.country === c.index) names.add(ch.name.replace(/ (?:[IVX]+|the .*)$/, ''));
      for (const name of names) expect(regnalName(s, c, name)).toBe(counted(c, name));
    };
    for (let i = 0; i < 10; i++) {
      for (const c of [eng, nor]) {
        check(c);
        die(s, world, character(s, c.ruler)!);
      }
      s.day += 400;
      pruneCharacters(s);
    }
    // Norway's line takes the English crown: its past kings are counted in England now.
    inheritThrone(s, nor, eng);
    check(eng);
    die(s, world, character(s, eng.ruler)!);
    check(eng);
  });
});

describe('saves', () => {
  it('bring a save from milestone 7 up to date, with its world events in the chronicle', () => {
    const s = fresh();
    s.happened.black_death = toDay(1346, 7, 1);
    const raw = JSON.parse(serialize(s));
    raw.version = 7;
    raw.state.version = 7;
    delete raw.state.chronicle;
    delete raw.state.ledger;
    for (const c of raw.state.countries) if (c) delete c.score;
    const back = deserialize(JSON.stringify(raw), world);
    expect(back.version).toBe(8);
    expect(back.ledger).toEqual([]);
    expect(back.countries[1].score).toBe(0);
    expect(back.chronicle.map((e) => e.text)).toContain('The Black Death breaks out.');
    for (let i = 0; i < 40; i++) advanceDay(back, world);
  });

  it('keep the score, the ledger and the chronicle', () => {
    const s = fresh();
    s.day = toDay(1070, 1, 1);
    yearlyScore(s);
    const back = deserialize(serialize(s), world);
    expect(back.ledger).toEqual(s.ledger);
    expect(back.chronicle).toEqual(s.chronicle);
    expect(back.countries.map((c) => c?.score)).toEqual(s.countries.map((c) => c?.score));
  });
});
