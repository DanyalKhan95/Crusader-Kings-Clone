import { beforeAll, describe, expect, it } from 'vitest';
import { layoutLabel, realmNameStrength, REALM_FADE_FROM, REALM_FADE_TO } from '../src/render/labels';
import { gather } from '../src/render/units';
import { unitLayerOf } from '../src/game/mapModes';
import { countryByTag } from '../src/sim/queries';
import { buildMeshBundle, type MeshBundle } from '../src/render/meshBuilder';
import { Picker } from '../src/render/picking';
import { Camera } from '../src/render/camera';
import { provincesOf } from '../src/sim/queries';
import { gameState, loadData, loadGeometry, regionKinds, staticWorld } from './helpers';

let bundle: MeshBundle;

beforeAll(() => {
  bundle = buildMeshBundle(loadGeometry(), regionKinds());
});

describe('map meshes', () => {
  it('triangulates every land province at full detail', () => {
    const { regions } = loadData();
    const fill = bundle.fills[0];
    const seen = new Set<number>();
    const [start, count] = fill.landRange;
    for (let i = start; i < start + count; i++) seen.add(fill.regions[fill.indices[i]]);
    const missing = regions.filter((r) => r.kind === 'land' && !seen.has(r.id)).map((r) => r.name);
    expect(missing).toEqual([]);
  });

  it('builds all three levels of detail, each coarser than the last', () => {
    const sizes = bundle.fills.map((f) => f.indices.length);
    expect(sizes[0]).toBeGreaterThan(sizes[1]);
    expect(sizes[1]).toBeGreaterThan(sizes[2]);
    expect(bundle.borders.every((b) => b.indices.length > 0)).toBe(true);
    expect(bundle.rivers.indices.length).toBeGreaterThan(0);
  });
});

describe('picking', () => {
  it('finds a province at its own label point', () => {
    const { world, regions } = loadData();
    const picker = new Picker(bundle.picking, regions.length, world.width, world.height);
    let hits = 0,
      tried = 0;
    for (const r of regions) {
      if (r.kind !== 'land' || r.area < 2000) continue;
      tried++;
      if (picker.pick(r.label[0], r.label[1]) === r.id) hits++;
    }
    expect(tried).toBeGreaterThan(2000);
    expect(hits / tried).toBeGreaterThan(0.99);
  });

  it('wraps around the date line', () => {
    const { world, regions } = loadData();
    const picker = new Picker(bundle.picking, regions.length, world.width, world.height);
    const r = regions.find((x) => x.kind === 'land' && x.area > 20000)!;
    expect(picker.pick(r.label[0] + world.width, r.label[1])).toBe(picker.pick(r.label[0], r.label[1]));
  });
});

describe('camera', () => {
  it('maps screen to map and back', () => {
    const cam = new Camera(16384, 8192);
    cam.resize(1600, 900, 2);
    cam.zoom = 0.8;
    cam.clamp();
    const [mx, my] = cam.screenToMap(300, 200);
    const [sx, sy] = cam.mapToScreen(mx, my);
    expect(sx).toBeCloseTo(300, 6);
    expect(sy).toBeCloseTo(200, 6);
  });

  it('keeps the map height on screen and wraps longitude', () => {
    const cam = new Camera(16384, 8192);
    cam.resize(1600, 900, 1);
    cam.zoom = 0.001;
    cam.clamp();
    expect(cam.zoom).toBeCloseTo(900 / 8192, 9);
    cam.x = -100;
    cam.clamp();
    expect(cam.x).toBeCloseTo(16284, 6);
  });
});

describe('realm labels', () => {
  it('lays out a readable name for every country', () => {
    const world = staticWorld();
    const state = gameState();
    for (const c of state.countries) {
      if (!c) continue;
      const l = layoutLabel(c.short, provincesOf(state, c.index), world.region, world.world.width);
      expect(l, c.tag).not.toBeNull();
      for (const v of [l!.cx, l!.cy, l!.ux, l!.uy, l!.b, l!.c, l!.size]) expect(Number.isFinite(v), c.tag).toBe(true);
      expect(l!.size, c.tag).toBeGreaterThan(0);
      expect(Math.abs(Math.atan2(l!.uy, l!.ux)), c.tag).toBeLessThanOrEqual((42 * Math.PI) / 180 + 1e-9);
    }
  });
});

describe('a map less crowded', () => {
  it('lets realm names give way to the provinces as the camera closes in', () => {
    expect(realmNameStrength(0.2)).toBe(1);
    expect(realmNameStrength(REALM_FADE_FROM)).toBe(1);
    expect(realmNameStrength((REALM_FADE_FROM + REALM_FADE_TO) / 2)).toBeCloseTo(0.5, 9);
    expect(realmNameStrength(REALM_FADE_TO)).toBe(0);
    expect(realmNameStrength(2)).toBe(0);
  });

  it("sorts a realm's armies into the layers the player can hide", () => {
    const state = gameState();
    const eng = countryByTag(state, 'ENG')!.index;
    const nrw = countryByTag(state, 'NRW')!.index;
    const gwy = state.provinces[regionsByName('Powys')].owner;
    expect(unitLayerOf(state, eng, eng)).toBe('own');
    expect(unitLayerOf(state, eng, nrw)).toBe('enemies');
    expect(unitLayerOf(state, eng, gwy)).toBe('others');
    state.pacts.push({ kind: 'alliance', a: eng, b: gwy, since: state.day });
    state.diploVersion++;
    expect(unitLayerOf(state, eng, gwy)).toBe('allies');
    // Before a realm is chosen, everyone is someone else.
    expect(unitLayerOf(state, 0, eng)).toBe('others');
  });

  it("gathers a realm's armies close together far out, and nothing close in", () => {
    const army = (id: number, owner: number) => ({ id, owner });
    const list = [
      { item: army(1, 5), size: 1000, realm: 5, sx: 100, sy: 100, alone: false },
      { item: army(2, 6), size: 4000, realm: 5, sx: 120, sy: 105, alone: false },
      { item: army(3, 7), size: 2000, realm: 7, sx: 110, sy: 100, alone: false },
      { item: army(4, 5), size: 500, realm: 5, sx: 900, sy: 100, alone: false },
      { item: army(5, 5), size: 300, realm: 5, sx: 105, sy: 102, alone: true },
    ];
    const far = gather(list, true, 110, 44);
    const at = far.find((m) => m.owner === 5 && m.count === 2)!;
    // The largest leads, where it stands; the realm's arms, and all the men.
    expect(at).toMatchObject({ lead: { id: 2 }, total: 5000, sx: 120, sy: 105 });
    expect(far.map((m) => m.lead.id).sort()).toEqual([2, 3, 4, 5]);
    // A selected army stands alone, under its own arms.
    expect(far.find((m) => m.lead.id === 5)).toMatchObject({ owner: 5, count: 1, total: 300 });
    expect(gather(list, false, 110, 44)).toHaveLength(5);
  });
});

function regionsByName(name: string): number {
  return loadData().regions.find((r) => r.name === name)!.id;
}
