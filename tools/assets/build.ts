/**
 * Checks and builds the game's art and sound from art/manifest.json into public/art:
 *   npm run assets           check, then build
 *   npm run assets -- --check   only check
 * Pictures are resized to their kind's largest size and kept as WebP; units and map symbols are packed
 * into an atlas per kind and era; sounds are copied. public/art/index.json tells the game what there
 * is, with the credit line of each. Nothing may ship without its source, author and licence.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import sharp from 'sharp';
import {
  ATLAS_KINDS,
  checkManifest,
  creditLine,
  IMAGE_KINDS,
  MAX_SIZE,
  packShelves,
  type AssetEntry,
  type AssetIndex,
  type AssetSource,
} from '../../src/shared/assets.ts';

const SOUNDS = new Set(['.ogg', '.opus', '.mp3', '.wav', '.flac']);
const ATLAS_WIDTH = 1024;

export interface BuildResult {
  problems: string[];
  index: AssetIndex | null;
}

/** Reads, checks and (unless `checkOnly`) builds the art; the output folder is rebuilt from nothing. */
export async function buildArt(artDir: string, outDir: string, checkOnly = false): Promise<BuildResult> {
  const manifestPath = join(artDir, 'manifest.json');
  const assets = JSON.parse(readFileSync(manifestPath, 'utf8')) as AssetSource[];
  const problems = checkManifest(assets, (file) => existsSync(join(artDir, file)));
  for (const a of assets ?? []) {
    const ext = extname(a.file ?? '').toLowerCase();
    const sound = !IMAGE_KINDS.includes(a.kind);
    if (sound && !SOUNDS.has(ext)) problems.push(`Asset "${a.id}": a sound must be ${[...SOUNDS].join(', ')}.`);
    if (!sound && SOUNDS.has(ext)) problems.push(`Asset "${a.id}": a ${a.kind} must be a picture.`);
  }
  if (problems.length || checkOnly) return { problems, index: null };

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const entries: AssetEntry[] = [];
  const base = (a: AssetSource) => ({
    id: a.id,
    kind: a.kind,
    ...(a.era ? { era: a.era } : {}),
    ...(a.region ? { region: a.region } : {}),
    ...(a.type ? { type: a.type } : {}),
    credit: creditLine(a),
    generated: !!a.generated,
  });

  // Pictures on their own, and sounds.
  for (const a of assets) {
    if (ATLAS_KINDS.includes(a.kind)) continue;
    if (!IMAGE_KINDS.includes(a.kind)) {
      const url = `${a.id}${extname(a.file).toLowerCase()}`;
      copyFileSync(join(artDir, a.file), join(outDir, url));
      entries.push({ ...base(a), url, width: 0, height: 0 });
      continue;
    }
    const [mw, mh] = MAX_SIZE[a.kind];
    const url = `${a.id}.webp`;
    const info = await sharp(join(artDir, a.file))
      .resize(mw, mh, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82, effort: 5 })
      .toFile(join(outDir, url));
    entries.push({ ...base(a), url, width: info.width, height: info.height });
  }

  // Sprites packed by kind and era.
  const groups = new Map<string, AssetSource[]>();
  for (const a of assets)
    if (ATLAS_KINDS.includes(a.kind)) {
      const key = `${a.kind}-${a.era ?? 'any'}`;
      groups.set(key, [...(groups.get(key) ?? []), a]);
    }
  for (const [key, list] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const sprites = await Promise.all(
      list.map(async (a) => {
        const [mw, mh] = MAX_SIZE[a.kind];
        const { data, info } = await sharp(join(artDir, a.file))
          .resize(mw, mh, { fit: 'inside', withoutEnlargement: true })
          .png()
          .toBuffer({ resolveWithObject: true });
        return { a, data, width: info.width, height: info.height };
      }),
    );
    const { rects, height } = packShelves(
      sprites.map((s) => [s.width, s.height]),
      ATLAS_WIDTH,
    );
    const url = `atlas-${key}.webp`;
    await sharp({ create: { width: ATLAS_WIDTH, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite(sprites.map((s, i) => ({ input: s.data, left: rects[i][0], top: rects[i][1] })))
      .webp({ lossless: true, effort: 5 })
      .toFile(join(outDir, url));
    sprites.forEach((s, i) => entries.push({ ...base(s.a), url, width: ATLAS_WIDTH, height, rect: rects[i] }));
  }

  entries.sort((a, b) => a.id.localeCompare(b.id));
  const index: AssetIndex = { version: 1, assets: entries };
  writeFileSync(join(outDir, 'index.json'), JSON.stringify(index, null, 1) + '\n');
  return { problems, index };
}

// Run from the command line.
if (process.argv[1]?.endsWith('build.ts')) {
  const checkOnly = process.argv.includes('--check');
  const { problems, index } = await buildArt('art', join('public', 'art'), checkOnly);
  if (problems.length) {
    for (const p of problems) console.error(p);
    process.exit(1);
  }
  if (index) {
    const files = readdirSync(join('public', 'art')).length;
    const generated = index.assets.filter((a) => a.generated).length;
    console.log(`public/art: ${index.assets.length} assets in ${files} files (${generated} generated)`);
  } else console.log('art/manifest.json is sound');
}
