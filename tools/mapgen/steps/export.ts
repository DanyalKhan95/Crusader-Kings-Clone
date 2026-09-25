/**
 * Final step: write the game's data files into public/data.
 *   map.ccmp            gzipped CCMP geometry (arcs, polygons, rivers)
 *   provinces.json      static region attributes
 *   world.json          cultures, religions, map size, terrain tiles
 *   scenario-1066.json  countries and province owners/cultures/religions
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { encodeMap, type MapGeometry } from '../../../src/shared/mapFormat.ts';
import type { RegionData, ScenarioData, WorldData } from '../../../src/shared/dataTypes.ts';
import { CULTURES, RELIGIONS } from '../curated/cultures.ts';
import { OUT_DIR } from '../lib/paths.ts';
import { MAP_H, MAP_W } from '../lib/projection.ts';
import { loadJSON } from '../lib/raster.ts';
import { readTopology } from '../lib/topology.ts';
import type { RegionAttrs } from './attributes.ts';
import type { Scenario } from './scenario.ts';
import { TERRAIN_TILE } from './terrain.ts';

const GROUP_HUE: Record<string, number> = {
  frankish: 215,
  iberian: 42,
  latin: 95,
  germanic: 355,
  norse: 200,
  celtic: 140,
  finno_ugric: 172,
  baltic: 62,
  west_slavic: 330,
  south_slavic: 295,
  east_slavic: 265,
  byzantine: 280,
  caucasian: 18,
  turkic: 35,
  iranian: 160,
  arabic: 120,
  berber: 30,
  east_african: 12,
  west_african: 26,
  bantu: 8,
  khoisan: 50,
  indo_aryan: 22,
  dravidian: 2,
  munda: 70,
  himalayan: 305,
  sinitic: 50,
  mongolic: 188,
  tungusic: 176,
  korean: 226,
  japonic: 350,
  austroasiatic: 82,
  tai: 100,
  austronesian: 184,
  papuan: 150,
  australian: 20,
  siberian: 205,
  eskimo: 212,
  na_dene: 30,
  algic: 120,
  iroquoian: 90,
  southeastern: 15,
  plains: 45,
  uto_aztecan: 25,
  penutian: 190,
  mayan: 150,
  oto_manguean: 330,
  chibchan: 60,
  andean: 280,
  arawakan: 110,
  cariban: 170,
  tupian: 130,
  macro_je: 75,
  patagonian: 200,
};

export async function buildExport(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const topo = readTopology();
  const attrs = loadJSON<RegionAttrs[]>('attributes.json');
  const rivers = loadJSON<{ w: number; pts: number[] }[]>('rivers.json');
  const scenario = loadJSON<Scenario>('scenario.json');

  const geometry: MapGeometry = {
    width: MAP_W,
    height: MAP_H,
    regionCount: attrs.length,
    arcLeft: topo.arcLeft,
    arcRight: topo.arcRight,
    lods: topo.lods,
    polygons: topo.polygons.map((polys) => polys.map((rings) => rings.map((ring) => Int32Array.from(ring)))),
    rivers: rivers.map((r) => ({ width: r.w, points: Float32Array.from(r.pts) })),
  };
  const raw = encodeMap(geometry);
  const gz = gzipSync(raw, { level: 9 });
  writeFileSync(join(OUT_DIR, 'map.ccmp'), gz);
  console.log(`  map.ccmp ${(raw.length / 1e6).toFixed(2)} MB raw, ${(gz.length / 1e6).toFixed(2)} MB gzipped`);

  const regions: RegionData[] = attrs.map((a) => {
    const r: RegionData = {
      id: a.id,
      kind: a.kind,
      name: a.name,
      label: [round(a.label[0]), round(a.label[1])],
      bbox: a.bbox,
      area: a.areaKm2,
      lon: a.lon,
      lat: a.lat,
      adj: a.neighbors.map((n) => [n.id, Math.round(n.km), (n.river ? 1 : 0) | (n.strait ? 2 : 0)]),
    };
    if (a.kind === 'land') {
      r.terrain = a.terrain;
      r.dev = a.dev;
      r.elev = a.elevation;
      if (a.coastal) r.coastal = true;
      if (a.impassable) r.impassable = true;
      if (a.adm0) r.modern = [a.adm0, a.admin1 ?? ''];
    }
    return r;
  });
  writeFileSync(join(OUT_DIR, 'provinces.json'), JSON.stringify(regions));

  const cultures: WorldData['cultures'] = {};
  const byGroup = new Map<string, string[]>();
  for (const [id, [, group]] of Object.entries(CULTURES)) {
    const list = byGroup.get(group);
    if (list) list.push(id);
    else byGroup.set(group, [id]);
  }
  for (const [id, [name, group, religion]] of Object.entries(CULTURES)) {
    const members = byGroup.get(group)!;
    const k = members.indexOf(id);
    const hue = (GROUP_HUE[group] ?? 0) + (k % 2 === 0 ? 1 : -1) * Math.floor(k / 2) * 9;
    const light = 0.42 + ((k * 0.13) % 0.26);
    cultures[id] = { name, group, religion, color: hsl(((hue % 360) + 360) % 360, 0.5, light) };
  }
  const world: WorldData = {
    width: MAP_W,
    height: MAP_H,
    terrainTiles: { size: TERRAIN_TILE, cols: MAP_W / TERRAIN_TILE, rows: MAP_H / TERRAIN_TILE },
    cultures,
    religions: RELIGIONS,
  };
  writeFileSync(join(OUT_DIR, 'world.json'), JSON.stringify(world));

  const sc: ScenarioData = {
    id: '1066',
    name: 'The Year of Three Kings',
    start: scenario.start,
    countries: scenario.countries,
    provinces: Object.fromEntries(scenario.provinces.map((p) => [p.id, [p.owner, p.culture, p.religion]])),
  };
  writeFileSync(join(OUT_DIR, 'scenario-1066.json'), JSON.stringify(sc));
  console.log(`  ${regions.length} regions, ${sc.countries.length} countries written`);
}

const round = (v: number) => Math.round(v * 4) / 4;

function hsl(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)]
    .map((v) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}
