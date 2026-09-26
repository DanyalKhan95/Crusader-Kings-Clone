import { describe, expect, it } from 'vitest';
import { shipDef } from '../src/data/ships';
import { canColonise, colonialNation, monthlyColonies, startColony } from '../src/sim/colonies';
import * as cmd from '../src/sim/commands';
import { accessSet, addPact, canIntegrate, loyalty } from '../src/sim/diplomacy';
import { income } from '../src/sim/economy';
import { knows, knowsWorld, learn, monthlyMaps, revealAround } from '../src/sim/exploration';
import { canReach, dailyMarch, newArmy } from '../src/sim/military';
import { findPath, isWater } from '../src/sim/movement';
import {
  availableShips,
  blockades,
  dailyInterception,
  dailyNavalBattles,
  fleetSize,
  mayDock,
  newFleet,
  shipLook,
  startNavalBattles,
  updateBlockades,
} from '../src/sim/naval';
import { armySize, countryByTag, provincesOf } from '../src/sim/queries';
import { deserialize, serialize } from '../src/sim/save';
import { createGameState } from '../src/sim/setup';
import { advanceDay } from '../src/sim/tick';
import type { Country, GameState } from '../src/sim/types';
import { declareWar } from '../src/sim/war';
import { makeSimWorld } from '../src/sim/world';
import { loadData } from './helpers';

const { world: worldData, regions, scenario } = loadData();
const world = makeSimWorld(worldData, regions);
const fresh = (seed?: number) => createGameState(world, scenario, seed ? { seed } : {});
const tag = (s: GameState, t: string) => countryByTag(s, t)!;
const named = (name: string) => regions.find((r) => r.name === name)!.id;
const labels = (b: { parts: { label: string }[] }) => b.parts.map((p) => p.label);
const setTech = (c: Country, level: number) => (c.tech = { economy: level, military: level, society: level });

const LONDON = named('London'),
  ROUEN = named('Rouen'),
  CHANNEL = named('Strait of Dover'),
  OCEAN = named('North Atlantic Ocean'),
  NEW_YORK = named('New York');

/** England at war with France (and so with Normandy, its vassal). */
function atWarWithFrance() {
  const s = fresh();
  const eng = tag(s, 'ENG'),
    fra = tag(s, 'FRA');
  s.player = eng.index;
  s.wars = [];
  declareWar(s, world, eng.index, fra.index, 'conquest', 0);
  s.armies = [];
  s.fleets = [];
  return { s, eng, fra, nrm: tag(s, 'NRM') };
}

describe('ships', () => {
  it('names the ships of each era, from war cogs to carriers', () => {
    const s = fresh();
    const eng = tag(s, 'ENG');
    const names: string[] = [];
    for (const level of [1, 7, 12, 18]) {
      setTech(eng, level);
      names.push(shipLook(eng, 'heavy').name);
    }
    eng.tech.economy = 20;
    names.push(shipLook(eng, 'heavy').name);
    for (const level of [24, 30]) {
      setTech(eng, level);
      names.push(shipLook(eng, 'heavy').name);
    }
    expect(names).toEqual([
      'War cogs',
      'Carracks',
      'Galleons',
      'Ships of the line',
      'Ironclads',
      'Dreadnoughts',
      'Carriers',
    ]);
    expect(shipLook(tag(s, 'NRW'), 'heavy').name).toBe('Longships');
    expect(availableShips(eng)).toContain('submarine');
    setTech(eng, 12);
    expect(availableShips(eng)).not.toContain('submarine');
    expect(shipDef('heavy', 4).attack).toBeGreaterThan(shipDef('heavy', 0).attack * 2);
  });

  it('gives the seafaring realms of 1066 fleets and transports, and landlocked ones none', () => {
    const s = fresh();
    const eng = tag(s, 'ENG');
    expect(s.fleets.some((f) => f.owner === eng.index && f.location === LONDON)).toBe(true);
    expect(eng.transports).toBeGreaterThan(50);
    const ven = s.fleets.find((f) => f.owner === tag(s, 'VEN').index)!;
    expect(fleetSize(ven)).toBeGreaterThanOrEqual(10);
    const inland = s.countries.find(
      (c) =>
        c?.alive &&
        provincesOf(s, c.index).length > 3 &&
        provincesOf(s, c.index).every((id) => !world.region(id).coastal),
    )!;
    expect(inland.transports).toBe(0);
    expect(s.fleets.some((f) => f.owner === inland.index)).toBe(false);
  });
});

describe('transports', () => {
  it('carry armies over the sea only when there is room on them', () => {
    const { s, eng } = atWarWithFrance();
    const army = newArmy(s, eng, LONDON, { spearmen: 2000 });
    eng.transports = 0;
    const refused = cmd.moveArmy(s, world, army.id, ROUEN);
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.reason).toMatch(/transports/);
    expect(canReach(s, world, eng.index, LONDON, ROUEN, false)).toBe(false);
    eng.transports = 100;
    expect(cmd.moveArmy(s, world, army.id, ROUEN).ok).toBe(true);
    expect(army.path.some((id) => isWater(world.region(id)))).toBe(true);
    // The ships were lost before it sailed: it waits on the shore.
    eng.transports = 0;
    for (let d = 0; d < 10 && army.path.length; d++) {
      s.day++;
      dailyMarch(s, world);
    }
    expect(army.path).toEqual([]);
    expect(world.region(army.location).kind).toBe('land');
  });

  it('know at once where an army could go, over land alone or over the sea too', () => {
    const { s, eng } = atWarWithFrance();
    const allowed = accessSet(s, eng.index);
    const penalty = (id: number) => {
      const o = s.provinces[id]?.owner ?? 0;
      return !o || allowed.has(o) ? 0 : Infinity;
    };
    const land = regions.filter((r) => r.kind === 'land').map((r) => r.id);
    for (let i = 0; i < 40; i++) {
      const a = land[(i * 7919) % land.length],
        b = land[(i * 104729 + 13) % land.length];
      for (const sea of [true, false])
        expect(canReach(s, world, eng.index, a, b, sea), `${a} → ${b} ${sea}`).toBe(
          a === b || !!findPath(world, a, b, { sea, penalty }),
        );
    }
  });

  it('are sunk with the men aboard when enemy warships catch them at sea', () => {
    const { s, eng, fra } = atWarWithFrance();
    newFleet(s, world, eng, CHANNEL, { light: 20 });
    fra.transports = 200;
    const army = newArmy(s, fra, CHANNEL, { spearmen: 3000 });
    dailyInterception(s, world);
    expect(armySize(army)).toBeLessThan(3000);
    expect(fra.transports).toBeLessThan(200);
    expect(s.messages.at(-1)?.text).toMatch(/caught at sea/);
  });
});

describe('fleets', () => {
  it('sail friendly waters and ports, and cross the ocean only with cartography', () => {
    const { s, eng, nrm } = atWarWithFrance();
    const f = newFleet(s, world, eng, LONDON, { heavy: 5 });
    expect(mayDock(s, eng.index, LONDON)).toBe(true);
    expect(mayDock(s, eng.index, ROUEN)).toBe(false);
    expect(nrm.alive).toBe(true);
    expect(cmd.moveFleet(s, world, f.id, ROUEN).ok).toBe(false);
    const ocean = cmd.moveFleet(s, world, f.id, OCEAN);
    expect(!ocean.ok && ocean.reason).toMatch(/open ocean/);
    eng.tech.society = 10;
    expect(cmd.moveFleet(s, world, f.id, OCEAN).ok).toBe(true);
    expect(f.path.at(-1)).toBe(OCEAN);
  });

  it('fight when they meet at sea: the stronger wins, the beaten make for port', () => {
    const { s, eng, fra } = atWarWithFrance();
    const a = newFleet(s, world, eng, CHANNEL, { heavy: 20, light: 10 });
    const b = newFleet(s, world, fra, CHANNEL, { light: 8 });
    startNavalBattles(s, world, [a]);
    expect(s.navalBattles).toHaveLength(1);
    for (let d = 0; d < 12 && s.navalBattles.length; d++) {
      s.day++;
      dailyNavalBattles(s, world);
    }
    expect(s.navalBattles).toHaveLength(0);
    expect(fleetSize(a)).toBeGreaterThan(20);
    expect(!s.fleets.includes(b) || b.retreating || fleetSize(b) < 8).toBe(true);
    expect(s.wars[0].battleScore).toBeGreaterThan(0);
  });

  it('blockade enemy coasts: taxes suffer', () => {
    const { s, eng, fra } = atWarWithFrance();
    const coast = provincesOf(s, fra.index).find((id) => world.region(id).coastal)!;
    const sea = world.region(coast).adj.find(([n]) => isWater(world.region(n)))![0];
    newFleet(s, world, eng, sea, { heavy: 4 });
    updateBlockades(s, world);
    expect(blockades(s).get(coast)).toBe(eng.index);
    expect(labels(income(s, fra))).toContain('Lost to enemy blockades');
    const port = cmd.buildWarships(s, world, coast, 'light', 1);
    expect(port.ok).toBe(false);
  });
});

describe('terra incognita', () => {
  it('shows each realm its own corner of the world, and grows with what it sees and is told', () => {
    const s = fresh();
    const eng = tag(s, 'ENG'),
      sng = tag(s, 'SNG');
    expect(knows(world, eng, LONDON)).toBe(true);
    expect(knows(world, eng, named('Paris'))).toBe(true);
    expect(knows(world, eng, NEW_YORK)).toBe(false);
    expect(knows(world, eng, sng.capital)).toBe(false);
    expect(revealAround(s, world, eng.index, NEW_YORK)).toBeGreaterThan(1);
    expect(knows(world, eng, NEW_YORK)).toBe(true);
    // Allies share their maps.
    addPact(s, 'alliance', eng.index, sng.index);
    monthlyMaps(s, world, false);
    expect(knows(world, eng, sng.capital)).toBe(true);
    // From the industrial era every realm knows the world.
    eng.tech.society = 18;
    monthlyMaps(s, world, false);
    expect(knowsWorld(eng)).toBe(true);
  });

  it('keeps what a realm knows in its save', () => {
    const s = fresh();
    const eng = tag(s, 'ENG');
    learn(world, eng, [NEW_YORK]);
    const loaded = deserialize(serialize(s), world);
    expect(knows(world, tag(loaded, 'ENG'), NEW_YORK)).toBe(true);
    // A save from milestone 5 learns the world around each realm.
    const file = JSON.parse(serialize(s));
    file.version = 5;
    file.state.version = 5;
    delete file.state.fleets;
    delete file.state.navalBattles;
    for (const c of file.state.countries) if (c) for (const k of ['transports', 'known', 'colonies']) delete c[k];
    const old = deserialize(JSON.stringify(file), world);
    expect(old.fleets).toEqual([]);
    expect(knows(world, tag(old, 'ENG'), LONDON)).toBe(true);
    expect(knows(world, tag(old, 'ENG'), NEW_YORK)).toBe(false);
  });
});

describe('colonies', () => {
  it('can be founded in known lands in reach, among natives only with the right learning', () => {
    const s = fresh();
    const eng = tag(s, 'ENG');
    s.player = eng.index;
    eng.gold = 1000;
    const reason = () => {
      const c = canColonise(s, world, eng, NEW_YORK);
      return c.ok ? 'ok' : c.reason;
    };
    expect(reason()).toBe('Unknown land');
    learn(world, eng, [NEW_YORK]);
    expect(reason()).toMatch(/Cartography/);
    eng.tech.society = 10;
    expect(reason()).toMatch(/Too far/);
    eng.tech.economy = 20;
    expect(reason()).toBe('ok');
    expect(cmd.colonise(s, world, NEW_YORK).ok).toBe(true);
    const job = eng.colonies[0];
    for (let m = 0; m < 400 && eng.colonies.length; m++) monthlyColonies(s, world);
    expect(s.provinces[NEW_YORK].owner).toBe(eng.index);
    expect(job.needed).toBeGreaterThan(12);
  });

  it('over the sea, are governed by a colonial nation that cannot be integrated', () => {
    const s = fresh();
    const eng = tag(s, 'ENG');
    setTech(eng, 20);
    eng.gold = 10000;
    const lands = ['New York', 'Pennsylvania', 'Michigan', 'Minnesota'].map(named);
    learn(world, eng, lands);
    for (const id of lands.slice(0, 3)) {
      expect(startColony(s, world, eng, id).ok).toBe(true);
      eng.colonies.at(-1)!.progress = 1000;
      monthlyColonies(s, world);
    }
    const nation = colonialNation(s, eng, 'north_america')!;
    expect(nation).toBeTruthy();
    expect(nation.name).toBe('New England');
    expect(nation.liege).toBe(eng.index);
    for (const id of lands.slice(0, 3)) expect(s.provinces[id].owner).toBe(nation.index);
    expect(canIntegrate(s, world, eng.index, nation.index).ok).toBe(false);
    expect(labels(loyalty(s, world, nation.index))).toContain('An ocean away');
    // The next colony there goes to the colonial nation.
    expect(startColony(s, world, eng, lands[3]).ok).toBe(true);
    eng.colonies.at(-1)!.progress = 1000;
    monthlyColonies(s, world);
    expect(s.provinces[lands[3]].owner).toBe(nation.index);
  });
});

describe('the world at sea', () => {
  it('runs a decade of navies, sea crossings and exploration without losing its way', () => {
    const s = fresh(6);
    for (let d = 0; d < 10 * 365; d++) advanceDay(s, world);
    for (const f of s.fleets) {
      expect(s.countries[f.owner]?.alive).toBe(true);
      expect(fleetSize(f)).toBeGreaterThanOrEqual(0.5);
      if (world.region(f.location).kind === 'land') expect(world.region(f.location).coastal).toBe(true);
    }
    for (const c of s.countries) if (c?.alive) expect(c.transports).toBeGreaterThanOrEqual(0);
    expect(s.fleets.length).toBeGreaterThan(20);
    JSON.parse(serialize(s));
  });
});
