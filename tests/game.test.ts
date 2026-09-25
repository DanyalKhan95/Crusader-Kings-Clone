import { describe, expect, it } from 'vitest';
import { applyMapMode, MAP_MODES } from '../src/game/mapModes';
import { isInRealm, provincesOf, realmProvinces, topLiege } from '../src/game/world';
import type { MapRenderer } from '../src/render/mapRenderer';
import { formatDate, ordinal, roman } from '../src/ui/format';
import { lonToX, latToY, xToLon, yToLat, MAP_H, MAP_W, LAT_BOT } from '../src/shared/projection';
import { gameState, staticWorld } from './helpers';

describe('1066 game state', () => {
  const state = gameState();
  const tag = (t: string) => state.byTag.get(t)!.index;

  it('starts on 15 September 1066', () => {
    expect(state.date).toEqual({ y: 1066, m: 9, d: 15 });
  });

  it('links vassals to their lieges', () => {
    expect(topLiege(state, tag('NRM'))).toBe(tag('FRA'));
    expect(topLiege(state, tag('SAX'))).toBe(tag('HRE'));
    expect(topLiege(state, tag('ENG'))).toBe(tag('ENG'));
    expect(isInRealm(state, tag('NRM'), tag('FRA'))).toBe(true);
    expect(isInRealm(state, tag('FRA'), tag('NRM'))).toBe(false);
  });

  it('counts vassal land in the realm but not in the demesne', () => {
    const own = provincesOf(state, tag('FRA'));
    const realm = realmProvinces(state, tag('FRA'));
    expect(realm.length).toBeGreaterThan(own.length);
    for (const id of provincesOf(state, tag('NRM'))) expect(realm).toContain(id);
  });

  it('colours every map mode without leaving land blank by accident', () => {
    const world = staticWorld();
    const fills = new Map<number, number[]>();
    const infos = new Map<number, number[]>();
    const fake = {
      infoData: new Uint16Array(64 * 64 * 4),
      setFill: (id: number, ...rgba: number[]) => fills.set(id, rgba),
      setInfo: (id: number, ...info: number[]) => infos.set(id, info),
      setCountryColor: () => {},
      markFillDirty: () => {},
    } as unknown as MapRenderer;
    for (const mode of MAP_MODES) {
      fills.clear();
      applyMapMode(fake, world, state, mode.id, tag('ENG'));
      const london = world.regions.find((r) => r.name === 'London')!;
      expect(fills.get(london.id)![3], mode.id).toBeGreaterThan(0);
      expect(infos.get(london.id)![0]).toBe(tag('ENG'));
      expect(infos.get(london.id)![3] & 64, 'player flag').toBe(64);
    }
  });
});

describe('formatting', () => {
  it('writes Roman numerals', () => {
    expect(roman(1066)).toBe('MLXVI');
    expect(roman(2066)).toBe('MMLXVI');
    expect(roman(1444)).toBe('MCDXLIV');
  });

  it('writes ordinals and dates', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '23rd',
      '101st',
      '111th',
    ]);
    expect(formatDate({ y: 1066, m: 9, d: 15 })).toBe('15th of September, 1066 AD');
  });
});

describe('projection', () => {
  it('spans the map exactly', () => {
    expect(lonToX(-180)).toBe(0);
    expect(lonToX(180)).toBe(MAP_W);
    expect(latToY(84)).toBeCloseTo(0, 6);
    expect(latToY(LAT_BOT)).toBeCloseTo(MAP_H, 3);
  });

  it('inverts', () => {
    for (const [lon, lat] of [
      [0, 51.5],
      [28.97, 41.01],
      [-77, -12],
      [151, -34],
    ]) {
      expect(xToLon(lonToX(lon))).toBeCloseTo(lon, 9);
      expect(yToLat(latToY(lat))).toBeCloseTo(lat, 9);
    }
  });
});
