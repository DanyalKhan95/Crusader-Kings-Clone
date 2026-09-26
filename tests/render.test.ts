import { beforeAll, describe, expect, it } from 'vitest';
import { layoutLabel } from '../src/render/labels';
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
