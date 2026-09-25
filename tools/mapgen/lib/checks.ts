/**
 * Integrity checks for the generated game data (public/data). Pure functions, shared by
 * `npm run mapgen:validate` and the unit tests.
 */
import type { RegionData, ScenarioData, WorldData } from '../../../src/shared/dataTypes.ts';

export interface CheckResult {
  errors: string[];
  warnings: string[];
  stats: Record<string, number>;
}

export function checkData(world: WorldData, regions: RegionData[], scenario: ScenarioData): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const err = (m: string) => errors.length < 200 && errors.push(m);

  // World
  const t = world.terrainTiles;
  if (t.cols * t.size !== world.width || t.rows * t.size !== world.height)
    err(`terrain tiles ${t.cols}×${t.rows}×${t.size} do not cover ${world.width}×${world.height}`);

  // Regions
  const byId: RegionData[] = [];
  regions.forEach((r, i) => {
    if (r.id !== i + 1) err(`provinces.json entry ${i} has id ${r.id}, expected ${i + 1}`);
    byId[r.id] = r;
  });
  const count = { land: 0, sea: 0, lake: 0 };
  for (const r of regions) {
    count[r.kind]++;
    if (!r.name?.trim()) err(`region ${r.id} has no name`);
    if (!(r.area > 0)) err(`region ${r.id} (${r.name}) has no area`);
    const [x0, y0, x1, y1] = r.bbox;
    if (!(x1 >= x0 && y1 >= y0)) err(`region ${r.id} has an empty bbox`);
    const [lx, ly] = r.label;
    if (ly < y0 - 1 || ly > y1 + 1) err(`region ${r.id} (${r.name}) label lies outside its bbox`);
    if (r.kind === 'land') {
      if (!r.terrain) err(`land province ${r.id} (${r.name}) has no terrain`);
      if (!((r.dev ?? 0) >= 1)) err(`land province ${r.id} (${r.name}) has development < 1`);
    }
    if (!Number.isFinite(lx)) err(`region ${r.id} label is not finite`);
    for (const [n, km, flags] of r.adj) {
      const o = byId[n] ?? regions[n - 1];
      if (!o) {
        err(`region ${r.id} borders missing region ${n}`);
        continue;
      }
      if (n === r.id) err(`region ${r.id} borders itself`);
      const back = o.adj.find(([m]) => m === r.id);
      if (!back) err(`adjacency ${r.id}→${n} is not symmetric`);
      else if (back[2] !== flags || Math.abs(back[1] - km) > 0.11)
        err(`adjacency ${r.id}↔${n} disagrees (${km}/${flags} vs ${back[1]}/${back[2]})`);
    }
  }
  if (count.land < 2800 || count.land > 3200) err(`${count.land} land provinces (expected about 3000)`);
  if (count.sea < 300) err(`only ${count.sea} sea zones`);

  // Every region is reachable from every other across land, straits and sea.
  const seen = new Uint8Array(regions.length + 1);
  const stack = [1];
  seen[1] = 1;
  let reached = 0;
  while (stack.length) {
    const id = stack.pop()!;
    reached++;
    for (const [n] of byId[id]?.adj ?? [])
      if (!seen[n]) {
        seen[n] = 1;
        stack.push(n);
      }
  }
  if (reached !== regions.length) {
    const cut = regions.filter((r) => !seen[r.id]).map((r) => `${r.id} ${r.name}`);
    err(`${cut.length} regions are cut off from the rest of the world: ${cut.slice(0, 8).join(', ')}`);
  }

  // Names: duplicates are allowed but worth knowing about.
  const names = new Map<string, number>();
  for (const r of regions) if (r.kind === 'land') names.set(r.name, (names.get(r.name) ?? 0) + 1);
  const dupes = [...names].filter(([, c]) => c > 1).map(([n]) => n);
  if (dupes.length) warnings.push(`${dupes.length} land province names repeat: ${dupes.slice(0, 10).join(', ')}`);

  // Scenario
  const tags = new Map(scenario.countries.map((c) => [c.tag, c]));
  if (tags.size !== scenario.countries.length) err('duplicate country tags');
  const owned = new Map<string, number>();
  let natives = 0,
    empty = 0;
  for (const [key, [owner, culture, religion]] of Object.entries(scenario.provinces)) {
    const r = byId[Number(key)];
    if (!r || r.kind !== 'land') {
      err(`scenario lists ${key}, which is not a land province`);
      continue;
    }
    if (owner) {
      if (!tags.has(owner)) err(`province ${key} is owned by unknown country ${owner}`);
      owned.set(owner, (owned.get(owner) ?? 0) + 1);
      if (r.impassable) err(`impassable province ${key} (${r.name}) has an owner`);
    } else if (culture) natives++;
    else empty++;
    if (culture && !world.cultures[culture]) err(`province ${key} has unknown culture ${culture}`);
    if (religion && !world.religions[religion]) err(`province ${key} has unknown religion ${religion}`);
    if (owner && !culture) err(`owned province ${key} (${r.name}) has no culture`);
  }
  for (const r of regions)
    if (r.kind === 'land' && !scenario.provinces[r.id]) err(`land province ${r.id} is missing from the scenario`);
  for (const c of scenario.countries) {
    if (!owned.get(c.tag)) err(`${c.tag} (${c.name}) owns no province`);
    const cap = scenario.provinces[c.capital];
    if (!cap || cap[0] !== c.tag) err(`${c.tag} capital ${c.capital} is not one of its provinces`);
    if (!world.cultures[c.culture]) err(`${c.tag} has unknown culture ${c.culture}`);
    if (!world.religions[c.religion]) err(`${c.tag} has unknown religion ${c.religion}`);
    if (!/^#[0-9a-f]{6}$/i.test(c.color)) err(`${c.tag} colour ${c.color} is not #rrggbb`);
    if (c.liege) {
      if (!tags.has(c.liege)) err(`${c.tag} has unknown liege ${c.liege}`);
      const chain = new Set([c.tag]);
      for (let l: string | undefined = c.liege; l; l = tags.get(l)?.liege) {
        if (chain.has(l)) {
          err(`liege cycle through ${c.tag}`);
          break;
        }
        chain.add(l);
      }
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scenario.start)) err(`scenario start ${scenario.start} is not YYYY-MM-DD`);

  return {
    errors,
    warnings,
    stats: {
      land: count.land,
      sea: count.sea,
      lake: count.lake,
      countries: scenario.countries.length,
      ownedProvinces: [...owned.values()].reduce((a, b) => a + b, 0),
      nativeProvinces: natives,
      emptyProvinces: empty,
    },
  };
}
