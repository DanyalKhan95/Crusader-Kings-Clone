import { describe, expect, it } from 'vitest';
import { EVENTS, PLAGUES } from '../src/data/events';
import { MODIFIERS } from '../src/data/modifiers';
import { NATIONS } from '../src/data/nations';
import { PLOTS } from '../src/data/espionage';
import { toDay } from '../src/sim/calendar';
import * as cmd from '../src/sim/commands';
import { canForm, formNation, heartland } from '../src/sim/decisions';
import { memory } from '../src/sim/diplomacy';
import { income, levyMultiplier, taxMultiplier } from '../src/sim/economy';
import { canPlot, carryOut, monthlyEspionage, network } from '../src/sim/espionage';
import {
  answerEvent,
  applyEffects,
  canChoose,
  effectLines,
  eventText,
  fireEvent,
  monthlyEvents,
  playerEvent,
} from '../src/sim/events';
import { monthlyHeresies, provinceFactor } from '../src/sim/faith';
import { addModifier, dailyModifiers, hasModifier, modifierEffect } from '../src/sim/modifiers';
import { breakOut, monthlyPlague } from '../src/sim/plague';
import { countryByTag, provincesOf } from '../src/sim/queries';
import { deserialize, serialize } from '../src/sim/save';
import { createGameState } from '../src/sim/setup';
import { researchPoints } from '../src/sim/tech';
import { advanceDay } from '../src/sim/tick';
import type { Country, GameState } from '../src/sim/types';
import { declareWar } from '../src/sim/war';
import { greatPowers, monthlyWorldEvents } from '../src/sim/worldEvents';
import { makeSimWorld } from '../src/sim/world';
import { loadData } from './helpers';

const { world: worldData, regions, scenario } = loadData();
const world = makeSimWorld(worldData, regions);
const fresh = (seed?: number) => createGameState(world, scenario, seed ? { seed } : {});
const tag = (s: GameState, t: string) => countryByTag(s, t)!;
const labels = (b: { parts: { label: string }[] }) => b.parts.map((p) => p.label);
const setTech = (c: Country, level: number) => (c.tech = { economy: level, military: level, society: level });
/** Moves the calendar to the first of a month, keeping the state's day as the only clock. */
const setDate = (s: GameState, y: number, m = 1) => (s.day = toDay(y, m, 1));

describe('modifiers', () => {
  it('add to the figures of the realm, named in the breakdowns, and run out', () => {
    const s = fresh();
    const eng = tag(s, 'ENG');
    const before = taxMultiplier(s, eng).total;
    addModifier(s, eng, 'silver_mine', 3);
    expect(hasModifier(eng, 'silver_mine')).toBe(true);
    expect(taxMultiplier(s, eng).total).toBeCloseTo(before + 0.1, 5);
    expect(labels(taxMultiplier(s, eng))).toContain(MODIFIERS.silver_mine.name);
    addModifier(s, eng, 'famine');
    expect(labels(levyMultiplier(s, eng))).toContain('Famine');
    expect(modifierEffect(eng, 'growth')).toBeCloseTo(-0.5, 5);
    // Ten years on, both have run their course.
    s.day += 3650;
    dailyModifiers(s);
    expect(eng.modifiers).toEqual([]);
  });

  it('keep the later end when a realm gets the same one twice', () => {
    const s = fresh();
    const eng = tag(s, 'ENG');
    addModifier(s, eng, 'scholars', 10);
    addModifier(s, eng, 'scholars', 2);
    expect(eng.modifiers).toHaveLength(1);
    expect(eng.modifiers[0].until).toBe(s.day + 3650);
  });

  it('are all well formed, as are the events that give them', () => {
    for (const e of EVENTS) {
      expect(e.options.length, e.id).toBeGreaterThan(0);
      for (const o of e.options) if (o.effects.modifier) expect(MODIFIERS[o.effects.modifier], e.id).toBeDefined();
    }
    const ids = EVENTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('events', () => {
  it('ask the player, and do what the chosen option says', () => {
    const s = fresh();
    const eng = tag(s, 'ENG');
    s.player = eng.index;
    s.wars = [];
    expect(fireEvent(s, world, eng, 'tournament')).toBe(true);
    const e = playerEvent(s)!;
    expect(e.event).toBe('tournament');
    const { title, text } = eventText(s, e);
    expect(title).toBe('A Great Tournament');
    expect(text).toContain(`The knights of ${eng.short}`);
    expect(text).not.toContain('{');
    // Holding it costs two months of income and makes the lords keen for war.
    const cost = Math.round(2 * Math.max(5, income(s, eng).total));
    const lines = effectLines(s, eng, EVENTS.find((x) => x.id === 'tournament')!.options[0].effects, {});
    expect(lines.map((l) => l.text)).toContain(`−${cost} gold`);
    const gold = eng.gold;
    const nobles = eng.estates.nobles.mood;
    expect(answerEvent(s, world, e.id, 0).ok).toBe(true);
    expect(eng.gold).toBeCloseTo(gold - cost, 5);
    expect(eng.estates.nobles.mood).toBe(nobles + 10);
    expect(hasModifier(eng, 'martial_fervour')).toBe(true);
    expect(playerEvent(s)).toBeUndefined();
    // Once held, it will not come again for years.
    expect(fireEvent(s, world, eng, 'tournament')).toBe(false);
  });

  it('will not let the player choose what the treasury cannot pay for', () => {
    const s = fresh();
    const eng = tag(s, 'ENG');
    s.player = eng.index;
    fireEvent(s, world, eng, 'scholar');
    const e = playerEvent(s)!;
    eng.gold = 0;
    const check = canChoose(s, world, e, 0);
    expect(check.ok).toBe(false);
    expect(canChoose(s, world, e, 1).ok).toBe(true);
    expect(cmd.chooseEventOption(s, world, e.id, 0).ok).toBe(false);
  });

  it('happen to AI realms at once, and to every realm now and then', () => {
    const s = fresh(5);
    s.player = 0;
    let fired = 0;
    for (let m = 0; m < 120; m++) {
      const before = s.countries.reduce((n, c) => n + (c ? Object.keys(c.history).length : 0), 0);
      monthlyEvents(s, world);
      const after = s.countries.reduce((n, c) => n + (c ? Object.keys(c.history).length : 0), 0);
      fired += after - before;
      s.day += 30;
    }
    expect(s.events).toEqual([]);
    // Some hundred and fifty realms over ten years: dozens of first-time events at least.
    expect(fired).toBeGreaterThan(100);
  });

  it('are deterministic', () => {
    const run = () => {
      const s = fresh(9);
      for (let i = 0; i < 400; i++) advanceDay(s, world);
      return JSON.stringify(s.countries.map((c) => c && [c.history, c.modifiers, c.gold]));
    };
    expect(run()).toBe(run());
  });
});

describe('pestilence', () => {
  it('breaks out, halves what a province gives, spreads, kills, and passes', () => {
    const s = fresh(3);
    setDate(s, 1346, 7);
    const byz = tag(s, 'BYZ');
    const cap = byz.capital;
    const dev = s.provinces[cap].dev;
    breakOut(s, world, 'black_death', cap);
    expect(s.plague?.id).toBe('black_death');
    expect(s.provinces[cap].plague).toBeGreaterThan(s.day);
    expect(s.provinces[cap].dev).toBeLessThanOrEqual(dev);
    expect(labels(provinceFactor(byz, s.provinces[cap]))).toContain('Pestilence');
    // The news opens with a capital, whatever the name of the plague.
    s.player = byz.index;
    const e = { event: 'plague_arrives', country: byz.index, province: cap, other: 0 };
    expect(eventText(s, e).text.startsWith('The Black Death has reached')).toBe(true);
    expect(provinceFactor(byz, s.provinces[cap]).value).toBeLessThanOrEqual(0.5);
    // The realm hears of it once.
    expect(byz.history['plague:black_death']).toBe(s.day);
    let most = 1;
    for (let m = 0; m < 48; m++) {
      s.day += 30;
      monthlyPlague(s, world);
      most = Math.max(most, s.provinces.filter((p) => p?.plague !== undefined).length);
      if (!s.plague) break;
    }
    expect(most).toBeGreaterThan(20);
    // Where it has passed, the province is spared for years.
    expect(s.provinces[cap].immune).toBeGreaterThan(s.day);
  });

  it('is slowed by quarantine', () => {
    const spread = (quarantine: boolean) => {
      const s = fresh(4);
      setDate(s, 1346, 7);
      if (quarantine) for (const c of s.countries) if (c?.alive) addModifier(s, c, 'quarantine');
      breakOut(s, world, 'black_death', tag(s, 'BYZ').capital);
      for (let m = 0; m < 10; m++) {
        s.day += 30;
        monthlyPlague(s, world);
      }
      return s.provinces.filter((p) => p?.immune !== undefined).length;
    };
    expect(spread(true)).toBeLessThan(spread(false));
  });

  it('comes in its own time', () => {
    for (const p of PLAGUES) expect(p.from).toBeLessThan(p.to);
    const s = fresh(6);
    setDate(s, 1300);
    for (let m = 0; m < 12; m++) {
      monthlyPlague(s, world);
      s.day += 30;
    }
    expect(s.plague).toBeNull();
  });
});

describe('the Reformation', () => {
  it('rises in Saxony after 1517, and a Catholic crown may embrace it', () => {
    const s = fresh(2);
    setDate(s, 1520);
    let tries = 0;
    while (!s.provinces.some((p) => p?.religion === 'protestant') && tries++ < 200) monthlyHeresies(s, world);
    const first = s.provinces.findIndex((p) => p?.religion === 'protestant');
    expect(first).toBeGreaterThan(0);
    const owner = s.countries[s.provinces[first].owner];
    owner.religion = 'catholic';
    s.player = owner.index;
    expect(fireEvent(s, world, owner, 'reformation', { province: first })).toBe(true);
    const e = playerEvent(s)!;
    const gold = owner.gold;
    expect(answerEvent(s, world, e.id, 1).ok).toBe(true);
    expect(owner.religion).toBe('protestant');
    expect(owner.gold).toBeGreaterThan(gold);
    expect(hasModifier(owner, 'reformed_zeal')).toBe(true);
  });
});

describe('the Peace of Westphalia', () => {
  it('ends the spread of the reformed faiths into realms that keep the old one', () => {
    const s = fresh(2);
    setDate(s, 1700);
    const fra = tag(s, 'FRA');
    const seed = fra.capital;
    s.provinces[seed].religion = 'protestant';
    for (let m = 0; m < 120; m++) monthlyHeresies(s, world);
    expect(s.provinces.filter((p) => p?.religion === 'protestant').length).toBeLessThanOrEqual(1);
  });
});

describe('world events', () => {
  it('raise a Horde on the eastern steppe in the time of Genghis Khan', () => {
    const s = fresh(8);
    setDate(s, 1206);
    for (let m = 0; m < 120 && s.happened.horde === undefined; m++) {
      monthlyWorldEvents(s, world);
      s.day += 30;
    }
    expect(s.happened.horde).toBeDefined();
    const khan = s.countries.find((c) => c?.alive && hasModifier(c, 'horde'))!;
    expect(khan.name).toBe('Mongol Empire');
    expect(s.characters[khan.ruler].name).toBe('Genghis Khan');
  });

  it('turn a war of the great powers into a world war, with total war for all in it', () => {
    const s = fresh();
    setDate(s, 1914, 8);
    for (const c of s.countries) if (c?.alive) setTech(c, 20);
    const gp = greatPowers(s);
    expect(gp.length).toBe(8);
    s.wars = [];
    s.pacts = [];
    s.truces = [];
    const war = declareWar(s, world, gp[0], gp[1], 'conquest', 0)!;
    expect(war).toBeTruthy();
    // Two great powers at war are not yet a world war.
    monthlyWorldEvents(s, world);
    expect(war.world).toBeUndefined();
    // A third joins the defence.
    war.defenders.push(gp[2]);
    monthlyWorldEvents(s, world);
    expect(war.world).toBe(1);
    expect(war.name).toBe('The Great War');
    expect(hasModifier(s.countries[gp[0]], 'total_war')).toBe(true);
    expect(s.happened.world_wars).toBe(1);
    // Another war of the great powers so soon after is not a world war.
    const next = declareWar(s, world, gp[3], gp[4], 'conquest', 0)!;
    next.defenders.push(gp[5]);
    monthlyWorldEvents(s, world);
    expect(next.world).toBeUndefined();
  });
});

describe('nations', () => {
  it('are well formed', () => {
    for (const n of NATIONS) {
      expect(n.need, n.id).toBeLessThanOrEqual(n.provinces.length);
      for (const p of n.provinces)
        expect(
          regions.some((r) => r.name === p && r.kind === 'land'),
          `${n.id}: ${p}`,
        ).toBe(true);
    }
  });

  it('may be proclaimed by a realm that holds the heartland, and claim the rest', () => {
    const s = fresh();
    const cas = tag(s, 'CAS');
    const spain = NATIONS.find((n) => n.id === 'spain')!;
    expect(canForm(s, cas, spain).ok).toBe(false);
    setDate(s, 1480);
    for (const p of heartland(s, cas, spain).slice(0, 7)) {
      s.provinces[p.id].owner = cas.index;
      s.provinces[p.id].controller = cas.index;
    }
    s.mapVersion++;
    s.borderVersion++;
    expect(canForm(s, cas, spain).ok).toBe(true);
    expect(formNation(s, world, cas, spain)).toBe(true);
    expect(cas.name).toBe('Kingdom of Spain');
    expect(countryByTag(s, 'ESP')).toBe(cas);
    // The old name still answers.
    expect(countryByTag(s, 'CAS')).toBe(cas);
    expect(cas.claims.length).toBeGreaterThan(0);
    expect(canForm(s, cas, spain).ok).toBe(false);
  });
});

describe('espionage', () => {
  it('builds a network while the spymaster works on it, and lets it wither otherwise', () => {
    const s = fresh();
    const eng = tag(s, 'ENG'),
      fra = tag(s, 'FRA');
    s.player = eng.index;
    expect(cmd.spyOn(s, fra.index).ok).toBe(true);
    expect(eng.tasks.spymaster).toBe('network');
    for (let m = 0; m < 6; m++) monthlyEspionage(s, world);
    const built = network(eng, fra.index);
    expect(built).toBeGreaterThan(10);
    expect(cmd.spyOn(s, 0).ok).toBe(true);
    monthlyEspionage(s, world);
    expect(network(eng, fra.index)).toBeLessThan(built);
    // Not in one's own realm.
    expect(cmd.spyOn(s, tag(s, 'ENG').index).ok).toBe(false);
  });

  it('spends the network on plots, which may be traced back', () => {
    const s = fresh(11);
    const eng = tag(s, 'ENG'),
      sco = tag(s, 'SCO');
    s.player = eng.index;
    expect(canPlot(s, world, eng, sco.index, 'claim').ok).toBe(false);
    let successes = 0,
      traced = 0;
    for (let i = 0; i < 30; i++) {
      eng.spies[sco.index] = 100;
      eng.gold = 1000;
      const r = carryOut(s, world, eng, sco.index, 'sabotage')!;
      expect(r).toBeTruthy();
      if (r.success) successes++;
      if (r.exposed) traced++;
    }
    expect(successes).toBeGreaterThan(10);
    expect(traced).toBeGreaterThan(0);
    expect(memory(s, sco.index, eng.index, 'plotted')).toBeLessThan(0);
    expect(hasModifier(sco, 'sabotaged')).toBe(true);
    // A forged claim names their land by our border.
    eng.spies[sco.index] = 100;
    for (let i = 0; i < 10 && !eng.claims.some((id) => provincesOf(s, sco.index).includes(id)); i++) {
      eng.spies[sco.index] = 100;
      carryOut(s, world, eng, sco.index, 'claim');
    }
    expect(eng.claims.some((id) => provincesOf(s, sco.index).includes(id))).toBe(true);
    expect(PLOTS.assassinate.network).toBeGreaterThan(PLOTS.claim.network);
  });

  it('can steal learning from a realm ahead', () => {
    const s = fresh();
    const eng = tag(s, 'ENG'),
      fra = tag(s, 'FRA');
    fra.tech.society = eng.tech.society + 2;
    eng.spies[fra.index] = 100;
    eng.gold = 1000;
    expect(canPlot(s, world, eng, fra.index, 'steal').ok).toBe(true);
    const before = eng.research.society;
    let r = carryOut(s, world, eng, fra.index, 'steal');
    for (let i = 0; i < 10 && !r?.success; i++) {
      eng.spies[fra.index] = 100;
      r = carryOut(s, world, eng, fra.index, 'steal');
    }
    expect(eng.research.society).toBeGreaterThan(before + researchPoints(s, eng, 'society').total * 5);
  });
});

describe('saves', () => {
  it('bring a save from before events up to date', () => {
    const s = fresh();
    const raw = JSON.parse(serialize(s));
    raw.version = 6;
    raw.state.version = 6;
    delete raw.state.events;
    delete raw.state.happened;
    delete raw.state.plague;
    for (const c of raw.state.countries) {
      if (!c) continue;
      delete c.modifiers;
      delete c.history;
      delete c.spies;
      delete c.spyTarget;
    }
    const back = deserialize(JSON.stringify(raw), world);
    expect(back.version).toBe(9);
    expect(back.events).toEqual([]);
    expect(back.plague).toBeNull();
    expect(back.countries[1].modifiers).toEqual([]);
    for (let i = 0; i < 40; i++) advanceDay(back, world);
  });

  it('keep events, modifiers and the pestilence', () => {
    const s = fresh();
    const eng = tag(s, 'ENG');
    s.player = eng.index;
    addModifier(s, eng, 'golden_age');
    fireEvent(s, world, eng, 'scholar');
    breakOut(s, world, 'black_death', eng.capital);
    applyEffects(s, world, eng, { mood: { burghers: 5 } }, {});
    const back = deserialize(serialize(s), world);
    expect(back.events).toEqual(s.events);
    expect(back.plague).toEqual(s.plague);
    expect(back.countries[eng.index].modifiers).toEqual(eng.modifiers);
    expect(back.provinces[eng.capital].plague).toBe(s.provinces[eng.capital].plague);
  });
});
