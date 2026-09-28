/**
 * Period names for the provinces the pipeline could only name after a modern admin region, told
 * apart by compass points ("North-West Aktobe", "West Inner Mongolia VII"). Each is named instead
 * after what lies in it, from Natural Earth: a river that runs through it ("Upper Irtysh"), a range,
 * desert, plateau or basin that covers it ("Ordos"), or else after a named neighbour and its ground
 * ("Kashgar Steppe"). Names chosen by hand in `curated/periodNames.ts` come first. The names go
 * into src/content/places.json as `period`, which this rewrites (the rules by era and culture there,
 * `names`, are written by hand and kept).
 *
 *   npm run mapgen:names
 *
 * It reads the exported map (public/data) and the downloaded sources (npm run mapgen:download).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { format, resolveConfig } from 'prettier';
import type { RegionData } from '../../src/shared/dataTypes.ts';
import { decodeMap, mapFilePayload, ringCoordinates } from '../../src/shared/mapFormat.ts';
import { linesOf, loadFeatures, projectPath, projectPolygons } from './lib/geo.ts';
import { CACHE_DIR, OUT_DIR, ROOT } from './lib/paths.ts';
import { MAP_H, MAP_W } from './lib/projection.ts';
import { fillRings } from './lib/rasterize.ts';
import { PERIOD_NAMES } from './curated/periodNames.ts';

const K = 4; // map units a pixel of the working raster
const W = MAP_W / K,
  H = MAP_H / K;
const PLACES = join(ROOT, 'src', 'content', 'places.json');

const DIRS = /^(North|South|East|West|North-East|North-West|South-East|South-West|Central) /;
const ROMAN = / (II|III|IV|V|VI|VII|VIII|IX|X)$/;

/** Kinds of Natural Earth region worth a name, and how much each counts. */
const CLASS_WEIGHT: Record<string, number> = {
  'Range/mtn': 1,
  Desert: 1,
  Plateau: 0.95,
  Basin: 0.95,
  Depression: 0.9,
  Plain: 0.85,
  Lowland: 0.8,
  Valley: 0.9,
  Wetlands: 0.85,
  Delta: 0.9,
  Tundra: 0.7,
  Foothills: 0.8,
  Peninsula: 0.75,
  'Pen/cape': 0.7,
  Isthmus: 0.7,
  Island: 1,
  'Island group': 0.8,
  Coast: 0.5,
  Geoarea: 0.6,
};

/** Regions too broad to name a province after, or wrong for one. */
const TOO_BROAD = new Set([
  'Indian subcontinent',
  'Mainland Southeast Asia',
  'Malay Archipelago',
  'Greater Sunda Islands',
  'Melanesia',
  'Iberian Peninsula',
  'Arabian Peninsula',
  'Anatolia',
  'Siberia',
  'East Siberia',
  'West Siberia',
  'South Siberia',
  'North European Plain',
]);

/** Natural Earth's own slips of spelling. */
const SPELLING: Record<string, string> = {
  'Ro Grande de Matagalpa': 'Río Grande de Matagalpa',
  'Ro Grande de Santiago': 'Río Grande de Santiago',
  'Mahäna Nadï': 'Mahanadi',
  'Di’er Songhua': 'Upper Songhua',
  Huang: 'Huang He',
  Black: 'Black River',
};

/** The noun for a province's ground, when it is named after a neighbour. */
const GROUND: Record<string, string> = {
  desert: 'Desert',
  drylands: 'Wastes',
  steppe: 'Steppe',
  plains: 'Plain',
  farmland: 'Fields',
  hills: 'Hills',
  mountains: 'Mountains',
  forest: 'Forest',
  taiga: 'Taiga',
  jungle: 'Jungle',
  wetlands: 'Marshes',
  tundra: 'Tundra',
  ice: 'Ice',
};

function titleCase(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t !== t.toUpperCase()) return t;
  return t
    .toLowerCase()
    .replace(/(^|[\s\-'(])([a-zà-ÿ])/g, (_m, a: string, b: string) => a + b.toUpperCase())
    .replace(/\b(Of|The|And|De|La|Du|Des|Da|Del)\b/g, (m) => m.toLowerCase());
}

/** Natural Earth writes "Mts.", "Pl.", "Des."; the map spells them out, and capitalises its nouns. */
function tidy(raw: string): string {
  const name = SPELLING[raw.trim()] ?? raw.replace(/[’']$/, '');
  return titleCase(name)
    .replace(
      /\b(basin|plain|plateau|desert|steppe|mountains|range|lowlands?|uplands?|hills|delta|valley)\b/g,
      (w) => w[0].toUpperCase() + w.slice(1),
    )
    .replace(/\bMts?\.?$/, 'Mountains')
    .replace(/\bMts?\. /, 'Mountains ')
    .replace(/\bPl\.$/, 'Plain')
    .replace(/\bPlat\.$/, 'Plateau')
    .replace(/\bDes\.$/, 'Desert')
    .replace(/\bI\.$/, 'Island')
    .replace(/\bIs\.$/, 'Islands')
    .replace(/\bPen\.$/, 'Peninsula')
    .replace(/\bR\.$/, '')
    .trim();
}

interface Candidate {
  name: string;
  score: number;
  /** a river (qualified upstream and downstream) or an area (qualified by compass) */
  kind: 'river' | 'area';
}

async function main() {
  const regions = JSON.parse(readFileSync(join(OUT_DIR, 'provinces.json'), 'utf8')) as RegionData[];
  const byId: RegionData[] = [];
  for (const r of regions) byId[r.id] = r;
  const places = JSON.parse(readFileSync(PLACES, 'utf8')) as Record<string, { period?: string; names?: unknown[] }>;
  // The period names are this tool's to write: start afresh, keeping the rules written by hand.
  for (const [key, def] of Object.entries(places)) {
    delete def.period;
    if (!def.names?.length) delete places[key];
  }

  // The admin-style names: those the pipeline split with compass points and numerals.
  const baseOf = (name: string) => name.replace(ROMAN, '').replace(DIRS, '');
  const groups = new Map<string, RegionData[]>();
  for (const r of regions) {
    if (r.kind !== 'land') continue;
    const base = baseOf(r.name);
    const list = groups.get(base);
    if (list) list.push(r);
    else groups.set(base, [r]);
  }
  // Real admin names that begin with a compass point ("North Carolina") are not the pipeline's.
  const targets = regions.filter(
    (r) =>
      r.kind === 'land' &&
      (DIRS.test(r.name) || ROMAN.test(r.name)) &&
      (groups.get(baseOf(r.name))?.length ?? 0) > 1 &&
      r.modern?.[1] !== r.name,
  );
  const isTarget = new Set(targets.map((r) => r.id));
  console.log(`${targets.length} provinces with admin-style names`);

  console.log('rasterizing the map');
  const geom = decodeMap(gunzipSync(mapFilePayload(readFileSync(join(OUT_DIR, 'map.json'), 'utf8'))));
  const reg = new Uint16Array(W * H);
  const px = new Float64Array(geom.regionCount + 1);
  for (let r = 1; r <= geom.regionCount; r++) {
    const rings: Float64Array[] = [];
    for (const poly of geom.polygons[r])
      for (const ring of poly) rings.push(Float64Array.from(ringCoordinates(geom, 0, ring), (v) => v / K));
    fillRings(rings, W, H, (row, a, b) => {
      reg.fill(r, row * W + a, row * W + b + 1);
      px[r] += b - a + 1;
    });
  }

  const cands = new Map<number, Candidate[]>();
  const add = (id: number, c: Candidate) => {
    const list = cands.get(id);
    if (list) list.push(c);
    else cands.set(id, [c]);
  };

  console.log('regions of Natural Earth');
  const ne = (name: string) => join(CACHE_DIR, 'ne', `${name}.geojson`);
  const geo = loadFeatures<Record<string, string | number | null>>(ne('ne_10m_geography_regions_polys'));
  for (const f of geo) {
    const cls = String(f.properties.FEATURECLA ?? '');
    const weight = CLASS_WEIGHT[cls];
    const name = tidy(String(f.properties.NAME_EN ?? f.properties.NAME ?? ''));
    const rank = Number(f.properties.SCALERANK ?? 9);
    // Continents and oceans' worth of islands say nothing of a province.
    const broad = (cls === 'Pen/cape' || cls === 'Island group') && rank <= 1;
    if (!weight || !name || broad || TOO_BROAD.has(name)) continue;
    const counts = new Map<number, number>();
    const rings = projectPolygons(f.geometry).map((r) => r.map((v) => v / K));
    fillRings(rings, W, H, (row, a, b) => {
      for (let x = a; x <= b; x++) {
        const id = reg[row * W + x];
        if (isTarget.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    });
    for (const [id, n] of counts) {
      const share = n / Math.max(1, px[id]);
      if (share >= 0.3) add(id, { name, score: share * weight, kind: 'area' });
    }
  }

  console.log('rivers');
  const rivers = loadFeatures<Record<string, string | number | null>>(ne('ne_10m_rivers_lake_centerlines'));
  const riverLength = new Map<string, Map<number, number>>();
  for (const f of rivers) {
    if (f.properties.featurecla !== 'River') continue;
    const raw = tidy(String(f.properties.name_en ?? f.properties.name ?? ''));
    // A river of two or three letters reads better as its valley ("Han Valley").
    const name = raw.length <= 3 ? `${raw} Valley` : raw;
    if (!raw) continue;
    let m = riverLength.get(name);
    if (!m) riverLength.set(name, (m = new Map()));
    for (const line of linesOf(f.geometry)) {
      const p = projectPath(line);
      for (let i = 0; i + 3 < p.length; i += 2) {
        const x0 = p[i] / K,
          y0 = p[i + 1] / K,
          x1 = p[i + 2] / K,
          y1 = p[i + 3] / K;
        const len = Math.hypot(x1 - x0, y1 - y0);
        const steps = Math.max(1, Math.ceil(len));
        for (let s = 0; s < steps; s++) {
          const t = (s + 0.5) / steps;
          const x = ((Math.floor(x0 + (x1 - x0) * t) % W) + W) % W,
            y = Math.floor(y0 + (y1 - y0) * t);
          if (y < 0 || y >= H) continue;
          const id = reg[y * W + x];
          if (isTarget.has(id)) m.set(id, (m.get(id) ?? 0) + len / steps);
        }
      }
    }
  }
  for (const [name, m] of riverLength)
    for (const [id, len] of m) {
      const across = len / Math.sqrt(Math.max(1, px[id]));
      if (across >= 0.7) add(id, { name, score: Math.min(1.1, across / 1.6) + 0.05, kind: 'river' });
    }

  // Every name already on the map is taken, the admin-style ones aside; the chosen ones come first.
  const taken = new Set(regions.filter((r) => !isTarget.has(r.id)).map((r) => r.name));
  const out = new Map<number, string>();
  for (const [key, name] of Object.entries(PERIOD_NAMES)) {
    const r = regions.find((x) => x.name === key);
    if (!r) console.warn(`  curated: no province is called "${key}"`);
    else if (taken.has(name)) console.warn(`  curated: "${name}" (for ${key}) is taken`);
    else {
      taken.add(name);
      out.set(r.id, name);
    }
  }
  const order = targets
    .filter((r) => !out.has(r.id))
    .sort((a, b) => (cands.get(b.id)?.[0]?.score ?? 0) - (cands.get(a.id)?.[0]?.score ?? 0));

  /** A qualified name: rivers upstream and downstream by height, areas by compass from the others. */
  const qualify = (r: RegionData, c: Candidate, peers: RegionData[]): string[] => {
    if (c.kind === 'river') {
      const higher = peers.filter((p) => (p.elev ?? 0) > (r.elev ?? 0)).length;
      const lower = peers.length - higher;
      const first = higher <= lower ? 'Upper' : 'Lower';
      return [c.name, `${first} ${c.name}`, `${first === 'Upper' ? 'Lower' : 'Upper'} ${c.name}`, `Middle ${c.name}`];
    }
    // A name that already begins with a compass point takes no other.
    if (
      DIRS.test(`${c.name} `.replace(/^(Northern|Southern|Eastern|Western) /, 'North ')) ||
      /^(North|South|East|West)ern /.test(c.name)
    )
      return [c.name];
    const cx = peers.reduce((s, p) => s + p.lon, 0) / Math.max(1, peers.length);
    const cy = peers.reduce((s, p) => s + p.lat, 0) / Math.max(1, peers.length);
    const dx = r.lon - cx,
      dy = r.lat - cy;
    const ns = dy >= 0 ? 'North' : 'South',
      ew = dx >= 0 ? 'East' : 'West';
    const main = Math.abs(dy) >= Math.abs(dx) ? ns : ew;
    const other = main === ns ? ew : ns;
    return [c.name, `${main} ${c.name}`, `${other} ${c.name}`, `Central ${c.name}`];
  };
  const peersOf = new Map<string, RegionData[]>();
  for (const r of targets)
    for (const c of cands.get(r.id) ?? []) {
      const list = peersOf.get(c.name);
      if (list) list.push(r);
      else peersOf.set(c.name, [r]);
    }

  for (const r of order) {
    let name = '';
    const list = (cands.get(r.id) ?? []).sort((a, b) => b.score - a.score);
    for (const c of list) {
      name = qualify(r, c, peersOf.get(c.name) ?? [r]).find((n) => !taken.has(n)) ?? '';
      if (name) break;
    }
    if (!name) {
      // After a named neighbour and the lie of the land.
      const ground = GROUND[r.terrain ?? 'plains'] ?? 'Lands';
      const neighbours = r.adj
        .map(([n, km]) => ({ n: byId[n], km }))
        .filter(({ n }) => n?.kind === 'land' && !isTarget.has(n.id))
        .sort((a, b) => (b.n.dev ?? 0) * Math.sqrt(b.km) - (a.n.dev ?? 0) * Math.sqrt(a.km));
      for (const { n } of neighbours) {
        const base = n.mapName ?? n.name;
        const options = [`${base} ${ground}`, `${ground} of ${base}`];
        name = options.find((o) => !taken.has(o)) ?? '';
        if (name) break;
      }
    }
    if (!name) continue;
    taken.add(name);
    out.set(r.id, name);
  }

  for (const [id, name] of out) {
    const key = byId[id].name;
    places[key] = { ...places[key], period: name };
  }
  // Keys in map order, for a file that diffs well.
  const sorted = Object.fromEntries(Object.entries(places).sort(([a], [b]) => a.localeCompare(b)));
  // Written as the repository's formatter would write it.
  const options = (await resolveConfig(PLACES)) ?? {};
  writeFileSync(PLACES, await format(JSON.stringify(sorted), { ...options, parser: 'json' }));
  const kinds = { chosen: 0, river: 0, area: 0, neighbour: 0 };
  for (const [id, name] of out) {
    const c = cands.get(id)?.find((x) => name.includes(x.name));
    if (PERIOD_NAMES[byId[id].name] === name) kinds.chosen++;
    else if (!c) kinds.neighbour++;
    else kinds[c.kind]++;
  }
  console.log(
    `${out.size} period names: ${kinds.chosen} chosen by hand, ${kinds.river} after rivers, ${kinds.area} after regions, ${kinds.neighbour} after neighbours`,
  );
}

await main();
