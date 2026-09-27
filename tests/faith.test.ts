import { describe, expect, it } from 'vitest';
import { FAITH_HEADS, GREAT_HOLY_WARS, HERESIES, HOLY_SITES } from '../src/data/faiths';
import { faithFamily, faithName, holySites, holyTo, provinceNamed } from '../src/sim/beliefs';
import * as cmd from '../src/sim/commands';
import { opinion } from '../src/sim/diplomacy';
import { income, maxManpower } from '../src/sim/economy';
import {
  acceptCulture,
  canAcceptCulture,
  cultureStanding,
  faithStanding,
  headOf,
  heldHolySites,
  monthlyFaith,
  monthlyHeresies,
  provinceFactor,
  startAssimilation,
  startConversion,
} from '../src/sim/faith';
import {
  callHolyWar,
  canCallHolyWar,
  greatHolyWarOf,
  greatHolyWarTarget,
  holyLandOf,
  holyWarGoals,
  holyWarLeader,
} from '../src/sim/holywars';
import { canReach, routeFor } from '../src/sim/military';
import { canChangeLaw, estateLoyalty, lawCost, legitimacyTarget } from '../src/sim/politics';
import { countryByTag, provincesOf, realmNeighbours, topLiege } from '../src/sim/queries';
import { deserialize, serialize } from '../src/sim/save';
import { createGameState } from '../src/sim/setup';
import { advanceDay } from '../src/sim/tick';
import type { Country, GameState } from '../src/sim/types';
import { canDeclare, declareWar, endWar, peaceAcceptance, peaceCost } from '../src/sim/war';
import { makeSimWorld } from '../src/sim/world';
import { loadData } from './helpers';

const { world: worldData, regions, scenario } = loadData();
const world = makeSimWorld(worldData, regions);
const fresh = (seed?: number) => createGameState(world, scenario, seed ? { seed } : {});
const tag = (s: GameState, t: string) => countryByTag(s, t)!;
const labels = (b: { parts: { label: string }[] }) => b.parts.map((p) => p.label);
const YEAR = 365;

/** The richest province a realm holds of a faith other than its own. */
function otherFaith(s: GameState, c: Country): number {
  let best = 0,
    dev = -1;
  for (const id of provincesOf(s, c.index)) {
    const p = s.provinces[id];
    if (p.religion && p.religion !== c.religion && p.dev > dev) {
      dev = p.dev;
      best = id;
    }
  }
  return best;
}

describe('faith data', () => {
  it('finds every holy site, great holy war city and head of faith on the map', () => {
    for (const [faith, names] of Object.entries(HOLY_SITES)) {
      expect(holySites(faith).length, faith).toBe(names.length);
      for (const id of holySites(faith)) expect(world.region(id).kind).toBe('land');
    }
    for (const def of GREAT_HOLY_WARS) expect(provinceNamed(def.site), def.site).toBeGreaterThan(0);
    for (const { tag: t } of Object.values(FAITH_HEADS))
      expect(
        scenario.countries.some((c) => c.tag === t),
        t,
      ).toBe(true);
    expect(holyTo(provinceNamed('Jerusalem'))).toEqual(expect.arrayContaining(['catholic', 'sunni', 'jewish']));
  });

  it('knows the heresies as faiths of their parents’ family', () => {
    for (const [id, h] of Object.entries(HERESIES)) {
      expect(worldData.religions[h.parent], h.parent).toBeTruthy();
      expect(faithFamily(id)).toBe(faithFamily(h.parent));
      expect(faithName(id)).toBe(h.name);
    }
  });

  it('starts the Pope, the Patriarch and the Caliphs in office', () => {
    const s = fresh();
    expect(headOf(s, 'catholic')?.tag).toBe('PAP');
    expect(headOf(s, 'orthodox')?.tag).toBe('BYZ');
    expect(headOf(s, 'sunni')?.tag).toBe('ABB');
    // The Caliph is the Sultan's vassal: the Seljuks lead a jihad.
    expect(holyWarLeader(s, greatHolyWarOf('sunni')!)?.tag).toBe('SEL');
    expect(holyWarLeader(s, greatHolyWarOf('catholic')!)?.tag).toBe('PAP');
  });
});

describe('other faiths and peoples', () => {
  it('makes provinces of other faiths and peoples pay and serve less', () => {
    const s = fresh();
    const byz = tag(s, 'BYZ');
    const id = otherFaith(s, byz);
    const p = s.provinces[id];
    expect(faithStanding(byz, p)).not.toBe('same');
    const f = provinceFactor(byz, p);
    expect(f.value).toBeLessThan(1);
    expect(labels(income(s, byz))).toContain('Withheld by other faiths and peoples');
    expect(labels(maxManpower(s, byz))).toContain('Other faiths and peoples serve less');
    // Converted, the province pays in full (its people may still be foreign).
    const before = income(s, byz).total;
    p.religion = byz.religion;
    expect(income(s, byz).total).toBeGreaterThan(before);
  });

  it('stirs up the commons, less so under tolerance, which the clergy dislike', () => {
    const s = fresh();
    const byz = tag(s, 'BYZ');
    const strife = () => estateLoyalty(s, byz, 'commons').parts.find((x) => x.label === 'Religious strife')!.value;
    const clergy = estateLoyalty(s, byz, 'clergy').total;
    const harsh = strife();
    expect(harsh).toBeLessThan(0);
    byz.laws.tolerance = 2;
    expect(strife()).toBeGreaterThan(harsh);
    expect(estateLoyalty(s, byz, 'clergy').total).toBeLessThan(clergy);
  });

  it('treats religious policy as a law of three steps, persecution shaking the realm', () => {
    const s = fresh();
    const fra = tag(s, 'FRA');
    expect(canChangeLaw(s, fra, 'tolerance', 2).ok).toBe(true);
    expect(canChangeLaw(s, fra, 'tolerance', 3).ok).toBe(false);
    expect(lawCost(fra, 'tolerance', 0).stability).toBe(1);
    expect(lawCost(fra, 'tolerance', 2).stability).toBe(0);
  });

  it('converts a province with the court chaplain’s missionaries', () => {
    const s = fresh();
    const byz = tag(s, 'BYZ');
    const id = otherFaith(s, byz);
    expect(startConversion(s, byz, id)).toBe(true);
    expect(byz.tasks.chaplain).toBe('convert');
    for (let m = 0; m < 200 && s.provinces[id].religion !== byz.religion; m++) monthlyFaith(s, world);
    expect(s.provinces[id].religion).toBe(byz.religion);
    // The mission moves on to the next province.
    monthlyFaith(s, world);
    expect(byz.converting?.province ?? 0).not.toBe(id);
  });

  it('teaches a foreign province the ruler’s ways, and accepts great peoples of the realm', () => {
    const s = fresh();
    const byz = tag(s, 'BYZ');
    const id = provincesOf(s, byz.index).find((x) => cultureStanding(byz, s.provinces[x]) === 'foreign')!;
    expect(startAssimilation(s, byz, id)).toBe(true);
    for (let m = 0; m < 300 && s.provinces[id].culture !== byz.culture; m++) monthlyFaith(s, world);
    expect(s.provinces[id].culture).toBe(byz.culture);
    // Armenians are a sixth of the empire: they may be accepted, and then pay in full.
    const armenian = provincesOf(s, byz.index).find((x) => s.provinces[x].culture === 'armenian')!;
    expect(canAcceptCulture(s, byz, 'armenian').ok).toBe(true);
    expect(acceptCulture(s, byz, 'armenian')).toBe(true);
    expect(cultureStanding(byz, s.provinces[armenian])).toBe('accepted');
    expect(canAcceptCulture(s, byz, 'armenian').ok).toBe(false);
  });

  it('breaks with the old church when the people have turned to a heresy', () => {
    const s = fresh(3);
    const fra = tag(s, 'FRA');
    fra.laws.tolerance = 2;
    // Past the year the Cathars appear, most of France has turned.
    s.day += 100 * YEAR;
    for (const id of provincesOf(s, fra.index)) s.provinces[id].religion = 'cathar';
    for (let m = 0; m < 600 && fra.religion === 'catholic'; m++) monthlyHeresies(s, world);
    expect(fra.religion).toBe('cathar');
    expect(faithFamily(fra.religion)).toBe('christian');
  });
});

describe('heads of faith and holy places', () => {
  it('has the faithful honour their head and resent unbelievers in their holy places', () => {
    const s = fresh();
    const fra = tag(s, 'FRA');
    expect(labels(opinion(s, world, fra.index, tag(s, 'PAP').index))).toContain('Head of our faith');
    expect(labels(opinion(s, world, fra.index, tag(s, 'FAT').index))).toContain('Holds our holy places');
  });

  it('lends legitimacy to those who hold holy places', () => {
    const s = fresh();
    const byz = tag(s, 'BYZ');
    expect(heldHolySites(s, byz).length).toBeGreaterThanOrEqual(2);
    expect(labels(legitimacyTarget(s, byz))).toContain('Holy sites held');
  });

  it('sells a blessing once in ten years', () => {
    const s = fresh();
    const eng = tag(s, 'ENG');
    s.player = eng.index;
    eng.gold = 1000;
    const legit = eng.legitimacy;
    expect(cmd.blessing(s).ok).toBe(true);
    expect(eng.legitimacy).toBe(Math.min(100, legit + 10));
    expect(cmd.blessing(s).ok).toBe(false);
  });
});

describe('holy wars', () => {
  it('lets Castile wage holy war on Toledo for a border province, not on León', () => {
    const s = fresh();
    const cas = tag(s, 'CAS'),
      tol = tag(s, 'TOL'),
      leo = tag(s, 'LEO');
    const goals = holyWarGoals(s, world, cas.index, tol.index);
    expect(goals.length).toBeGreaterThan(0);
    expect(canDeclare(s, world, cas.index, tol.index, 'holy', goals[0]).ok).toBe(true);
    expect(canDeclare(s, world, cas.index, leo.index, 'holy', goals[0]).ok).toBe(false);
    const far = provincesOf(s, tol.index).find((id) => !goals.includes(id));
    if (far) expect(canDeclare(s, world, cas.index, tol.index, 'holy', far).ok).toBe(false);
    const war = declareWar(s, world, cas.index, tol.index, 'holy', goals[0])!;
    expect(war.goal).toBe(goals[0]);
    // The goal costs half as much as other land.
    const other = provincesOf(s, tol.index).find(
      (id) => id !== goals[0] && s.provinces[id].dev === s.provinces[goals[0]].dev,
    );
    if (other)
      expect(peaceCost(s, world, war, 'attacker', { provinces: [goals[0]], gold: 0 })).toBeLessThan(
        peaceCost(s, world, war, 'attacker', { provinces: [other], gold: 0 }),
      );
  });

  it('calls a crusade once its time has come, and founds a kingdom in the Holy Land', () => {
    const s = fresh();
    const def = greatHolyWarOf('catholic')!;
    const pap = tag(s, 'PAP');
    expect(canCallHolyWar(s, def, pap.index).ok).toBe(false); // not before 1090
    s.day += 24 * YEAR;
    expect(greatHolyWarTarget(s, def)?.defender).toBe(tag(s, 'FAT').index);
    expect(canCallHolyWar(s, def, pap.index).ok).toBe(true);
    const war = callHolyWar(s, world, def)!;
    expect(war.cb).toBe('crusade');
    expect(war.name).toBe('The First Crusade');
    expect(war.attackers.length).toBeGreaterThan(10);
    expect(canCallHolyWar(s, def, pap.index).ok).toBe(false); // one at a time
    const land = holyLandOf(s, world, war);
    expect(land).toContain(provinceNamed('Jerusalem'));
    // Crusaders fight for the Holy Land, not for land of their own.
    expect(peaceAcceptance(s, world, war, pap.index, { provinces: [land[0]], gold: 0 }).accept).toBe(false);
    const legit = pap.legitimacy;
    endWar(s, world, war, 'attacker', { provinces: [], gold: 0, holyLand: true });
    const jer = s.countries.find((c) => c?.tag === 'JER' && c.alive)!;
    expect(jer).toBeTruthy();
    expect(jer.religion).toBe('catholic');
    expect(jer.capital).toBe(provinceNamed('Jerusalem'));
    for (const id of land) expect(s.provinces[id].owner).toBe(jer.index);
    expect(pap.legitimacy).toBeGreaterThan(legit);
    // The Seljuks may now call a jihad for Jerusalem.
    expect(greatHolyWarTarget(s, greatHolyWarOf('sunni')!)?.defender).toBe(jer.index);
    for (let d = 0; d < 60; d++) advanceDay(s, world);
    expect(jer.alive).toBe(true);
  });

  it('lets the Pope call the crusade when the player holds the office', () => {
    const s = fresh();
    s.player = tag(s, 'PAP').index;
    expect(cmd.greatHolyWar(s, world).ok).toBe(false);
    s.day += 24 * YEAR;
    const r = cmd.greatHolyWar(s, world);
    expect(r.ok).toBe(true);
    expect(s.wars.some((w) => w.cb === 'crusade' && w.attacker === s.player)).toBe(true);
  });
});

describe('pagans, saves and the long run', () => {
  it('lets a pagan crown take up the faith of a neighbour', () => {
    const s = fresh();
    const pagan = s.countries.find(
      (c) =>
        c?.alive &&
        !c.liege &&
        faithFamily(c.religion) === 'pagan' &&
        [...realmNeighbours(s, world, c.index)].some((n) => faithFamily(s.countries[n].religion) === 'christian'),
    )!;
    expect(pagan).toBeTruthy();
    s.player = pagan.index;
    const faith = [...realmNeighbours(s, world, pagan.index)]
      .map((n) => s.countries[n].religion)
      .find((r) => faithFamily(r) === 'christian')!;
    expect(cmd.adopt(s, world, faith).ok).toBe(true);
    expect(pagan.religion).toBe(faith);
    expect(cmd.adopt(s, world, faith).ok).toBe(false);
  });

  it('finds no route into land an army may not enter, without searching the world', () => {
    const s = fresh();
    const eng = tag(s, 'ENG'),
      fra = tag(s, 'FRA');
    const paris = fra.capital;
    expect(canReach(s, world, eng.index, eng.capital, paris)).toBe(false);
    expect(routeFor(s, world, eng.index, eng.capital, paris)).toBeNull();
    declareWar(s, world, eng.index, fra.index, 'conquest', 0);
    expect(canReach(s, world, eng.index, eng.capital, paris)).toBe(true);
    expect(routeFor(s, world, eng.index, eng.capital, paris)?.at(-1)).toBe(paris);
  });

  it('loads a save from milestone 3', () => {
    const s = fresh();
    const file = JSON.parse(serialize(s));
    file.version = 3;
    file.state.version = 3;
    delete file.state.holyWars;
    delete file.state.fleets;
    delete file.state.navalBattles;
    for (const c of file.state.countries) {
      if (!c) continue;
      delete c.laws.tolerance;
      for (const k of [
        'accepted',
        'converting',
        'assimilating',
        'blessed',
        'tech',
        'research',
        'focus',
        'reformed',
        'transports',
        'known',
        'colonies',
      ])
        delete c[k];
    }
    const loaded = deserialize(JSON.stringify(file));
    expect(loaded.version).toBe(9);
    expect(loaded.holyWars).toEqual({});
    const fra = tag(loaded, 'FRA');
    expect(fra.laws.tolerance).toBe(1);
    expect(fra.accepted).toEqual([]);
    for (let d = 0; d < 40; d++) advanceDay(loaded, world);
  });

  it('keeps faith consistent over forty years', () => {
    const s = fresh(5);
    for (let d = 0; d < 40 * YEAR; d++) advanceDay(s, world);
    for (const c of s.countries) {
      if (!c?.alive) continue;
      expect(faithName(c.religion), c.tag).not.toBe('Unknown');
      if (c.converting) expect(s.provinces[c.converting.province].owner, c.tag).toBe(c.index);
      for (const a of c.accepted) expect(a).not.toBe(c.culture);
    }
    for (const p of s.provinces) if (p?.religion) expect(faithName(p.religion)).not.toBe('Unknown');
    for (const w of s.wars) if (w.cb === 'crusade') expect(topLiege(s, s.provinces[w.goal].owner)).toBe(w.defender);
    const round = deserialize(serialize(s));
    expect(round.holyWars).toEqual(s.holyWars);
  });
});
