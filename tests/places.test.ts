import { describe, expect, it } from 'vitest';
import { PLACES } from '../src/data/places';
import { placeName } from '../src/sim/places';
import { toDay } from '../src/sim/calendar';
import { gameState, loadData } from './helpers';

describe('place names', () => {
  const { world, regions } = loadData();
  // A new game registers the world, and with it the names of places.
  gameState();

  it('name provinces of the map, by cultures and groups that exist', () => {
    const land = new Map(regions.filter((r) => r.kind === 'land').map((r) => [r.mapName ?? r.name, r]));
    const groups = new Set(Object.values(world.cultures).map((c) => c.group));
    for (const [key, def] of Object.entries(PLACES)) {
      expect(land.has(key), key).toBe(true);
      for (const rule of def.names ?? []) {
        for (const g of rule.groups ?? []) expect(groups.has(g), `${key}: ${g}`).toBe(true);
        for (const c of rule.cultures ?? []) expect(world.cultures[c], `${key}: ${c}`).toBeTruthy();
        if (rule.from !== undefined && rule.until !== undefined) expect(rule.from).toBeLessThan(rule.until);
      }
    }
  });

  it('give the admin-style provinces period names, each its own', () => {
    const names = regions.filter((r) => r.kind === 'land').map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
    const aktobe = regions.find((r) => r.mapName === 'North-West Aktobe');
    expect(aktobe?.name).toBe('Ilek');
    const splits = regions.filter((r) => r.kind === 'land' && / (II|III|IV|V|VI|VII)$/.test(r.name));
    expect(splits.length).toBeLessThan(5);
  });

  it('follow the owner and the year', () => {
    const s = gameState();
    const id = (name: string) => regions.find((r) => (r.mapName ?? r.name) === name)!.id;
    const konstantinopolis = id('Constantinople');
    expect(placeName(s, konstantinopolis)).toBe('Constantinople');
    const turk = s.countries.find((c) => c?.alive && world.cultures[c.culture]?.group === 'turkic')!;
    s.provinces[konstantinopolis].owner = turk.index;
    expect(placeName(s, konstantinopolis)).toBe('Istanbul');

    const konigsberg = id('Kaliningrad');
    expect(placeName(s, konigsberg)).toBe('Tuwangste');
    s.day = toDay(1400, 1, 1);
    expect(placeName(s, konigsberg)).toBe('Königsberg');
    const rus = s.countries.find((c) => c?.alive && c.culture === 'russian')!;
    s.provinces[konigsberg].owner = rus.index;
    expect(placeName(s, konigsberg)).toBe('Königsberg');
    s.day = toDay(1950, 1, 1);
    expect(placeName(s, konigsberg)).toBe('Kaliningrad');
  });
});
