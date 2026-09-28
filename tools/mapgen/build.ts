/**
 * Map pipeline orchestrator.
 *   npm run mapgen                 run every step
 *   npm run mapgen -- land seas    run only the named steps (later steps reuse cached outputs)
 *   npm run mapgen -- --from seas  run from a step onwards
 */
import { buildLand } from './steps/land.ts';
import { buildElevation } from './steps/elevation.ts';
import { buildHistory } from './steps/history.ts';
import { buildProvinces } from './steps/provinces.ts';
import { buildSeas } from './steps/seas.ts';
import { buildVectorize } from './steps/vectorize.ts';
import { buildTerrain } from './steps/terrain.ts';
import { buildAttributes } from './steps/attributes.ts';
import { buildRealms } from './steps/realms.ts';
import { buildScenario } from './steps/scenario.ts';
import { buildExport } from './steps/export.ts';
import { buildDetails } from './steps/details.ts';

const STEPS: [string, () => Promise<void>][] = [
  ['land', buildLand],
  ['elevation', buildElevation],
  ['history', buildHistory],
  ['realms', buildRealms],
  ['provinces', buildProvinces],
  ['seas', buildSeas],
  ['vectorize', buildVectorize],
  ['attributes', buildAttributes],
  ['scenario', buildScenario],
  ['terrain', buildTerrain],
  ['export', buildExport],
  ['details', buildDetails],
];

async function main() {
  const args = process.argv.slice(2);
  const fromIdx = args.indexOf('--from');
  let selected: string[];
  if (fromIdx >= 0) {
    const start = STEPS.findIndex(([n]) => n === args[fromIdx + 1]);
    if (start < 0) throw new Error(`Unknown step ${args[fromIdx + 1]}`);
    selected = STEPS.slice(start).map(([n]) => n);
  } else selected = args.length ? args : STEPS.map(([n]) => n);
  for (const [name, fn] of STEPS) {
    if (!selected.includes(name)) continue;
    const t = Date.now();
    console.log(`▶ ${name}`);
    await fn();
    console.log(`✔ ${name} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
