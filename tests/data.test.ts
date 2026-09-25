import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BOOKMARKS } from '../src/data/bookmarks';
import { ADJ_STRAIT } from '../src/shared/dataTypes';
import { checkData } from '../tools/mapgen/lib/checks.ts';
import { loadData, loadGeometry } from './helpers';

describe('generated game data', () => {
  it('passes the integrity checks', () => {
    const { world, regions, scenario } = loadData();
    const result = checkData(world, regions, scenario);
    expect(result.errors).toEqual([]);
    expect(result.stats.land).toBe(3000);
    expect(result.stats.sea).toBeGreaterThan(400);
    expect(result.stats.countries).toBeGreaterThan(150);
  });

  it('has no sliver provinces: anything tiny is an island of its own', () => {
    const { regions } = loadData();
    const hasLandBorder = (id: number) =>
      regions[id - 1].adj.some(([n, , flags]) => regions[n - 1].kind === 'land' && !(flags & ADJ_STRAIT));
    const slivers = regions.filter((r) => r.kind === 'land' && r.area < 300 && hasLandBorder(r.id));
    expect(slivers.map((r) => `${r.name} (${r.area} km²)`)).toEqual([]);
  });

  it('matches the binary map geometry', () => {
    const { regions } = loadData();
    const g = loadGeometry();
    expect(g.regionCount).toBe(regions.length);
    expect(g.width).toBe(16384);
    expect(g.height).toBe(8192);
    for (let r = 1; r <= g.regionCount; r++) expect(g.polygons[r].length, `region ${r}`).toBeGreaterThan(0);
  });

  it('ships every terrain tile', () => {
    const { world } = loadData();
    const { cols, rows } = world.terrainTiles;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++)
        expect(existsSync(new URL(`../public/data/terrain/hi-${x}-${y}.webp`, import.meta.url))).toBe(true);
    expect(existsSync(new URL('../public/data/terrain/lo.webp', import.meta.url))).toBe(true);
  });

  it('knows every featured realm', () => {
    const { scenario } = loadData();
    const tags = new Set(scenario.countries.map((c) => c.tag));
    for (const b of BOOKMARKS) expect(tags.has(b.tag), b.tag).toBe(true);
  });

  it('places the famous 1066 players', () => {
    const { regions, scenario } = loadData();
    const owner = (name: string) => {
      const r = regions.find((x) => x.name === name);
      return r ? scenario.provinces[r.id]?.[0] : undefined;
    };
    expect(owner('London')).toBe('ENG');
    expect(owner('Constantinople')).toBe('BYZ');
    expect(owner('Cairo')).toBe('FAT');
    expect(owner('Tabriz')).toBe('SEL');
    const nrm = scenario.countries.find((c) => c.tag === 'NRM');
    expect(nrm?.liege).toBe('FRA');
  });
});
