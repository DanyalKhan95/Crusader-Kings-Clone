import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';
import {
  checkManifest,
  creditLine,
  packShelves,
  pickAsset,
  type AssetEntry,
  type AssetSource,
} from '../src/shared/assets';
import { buildArt } from '../tools/assets/build';

const good: AssetSource = {
  id: 'event.tournament',
  file: 'events/tournament.png',
  kind: 'event',
  era: 'medieval',
  source: 'https://commons.wikimedia.org/wiki/File:Codex_Manesse.jpg',
  author: 'Codex Manesse, c. 1300',
  licence: 'Public domain',
};

describe('the art manifest', () => {
  const all = () => true;

  it('accepts an asset with its source, author and licence', () => {
    expect(checkManifest([good], all)).toEqual([]);
    expect(creditLine(good)).toBe('Codex Manesse, c. 1300 (Public domain), from commons.wikimedia.org');
  });

  it('refuses what the game may not ship or cannot credit', () => {
    const problems = checkManifest(
      [
        { ...good, licence: 'CC BY-NC 4.0' },
        { ...good, id: 'event.feast', author: '' },
        { ...good, id: 'event.fire', licence: 'Generated' },
        { ...good, id: 'Event Two' },
        { ...good, id: 'unit.knight', kind: 'unit', region: 'narnia' },
        { ...good, id: 'event.flood', file: '../secret.png' },
      ],
      all,
    );
    expect(problems.join('\n')).toMatch(/licence "CC BY-NC 4.0" is not one the game may ship/);
    expect(problems.join('\n')).toMatch(/does not name its author/);
    expect(problems.join('\n')).toMatch(/generated but does not name the tool/);
    expect(problems.join('\n')).toMatch(/lower-case words joined by dots/);
    expect(problems.join('\n')).toMatch(/unknown region "narnia"/);
    expect(problems.join('\n')).toMatch(/must lie under art/);
  });

  it('finds missing files and ids listed twice', () => {
    const problems = checkManifest([good, good], () => false);
    expect(problems).toContain('Asset "event.tournament" is listed twice.');
    expect(problems).toContain('Asset "event.tournament": art/events/tournament.png is missing.');
  });
});

describe('picking art', () => {
  const entry = (id: string, extra: Partial<AssetEntry>): AssetEntry => ({
    id,
    kind: 'unit',
    url: `${id}.webp`,
    width: 64,
    height: 64,
    credit: '',
    generated: false,
    ...extra,
  });
  const index = [
    entry('unit.medieval_europe_cavalry', { era: 'medieval', region: 'europe', type: 'cavalry' }),
    entry('unit.medieval_cavalry', { era: 'medieval', type: 'cavalry' }),
    entry('unit.medieval_infantry', { era: 'medieval', type: 'infantry' }),
    entry('unit.modern_infantry', { era: 'modern', type: 'infantry' }),
    entry('event.fire_a', { kind: 'event' }),
    entry('event.fire_b', { kind: 'event' }),
  ];

  it('takes the most specific fit, giving up the region, then the type, then the era', () => {
    const pick = (w: Parameters<typeof pickAsset>[1]) => pickAsset(index, w)?.id;
    expect(pick({ kind: 'unit', era: 'medieval', region: 'europe', type: 'cavalry' })).toBe(
      'unit.medieval_europe_cavalry',
    );
    expect(pick({ kind: 'unit', era: 'medieval', region: 'steppe', type: 'cavalry' })).toBe(
      'unit.medieval_europe_cavalry',
    );
    expect(pick({ kind: 'unit', era: 'medieval', region: 'steppe', type: 'siege' })).toBe(
      'unit.medieval_europe_cavalry',
    );
    expect(pick({ kind: 'unit', era: 'renaissance', type: 'infantry' })).toBe('unit.medieval_infantry');
    expect(pick({ kind: 'unit', id: 'unit.modern_infantry', era: 'medieval' })).toBe('unit.modern_infantry');
    expect(pick({ kind: 'portrait' })).toBeUndefined();
  });

  it('varies among equals when asked', () => {
    expect(pickAsset(index, { kind: 'event', variety: 0 })?.id).toBe('event.fire_a');
    expect(pickAsset(index, { kind: 'event', variety: 1 })?.id).toBe('event.fire_b');
    expect(pickAsset(index, { kind: 'event', variety: 7 })?.id).toBe('event.fire_b');
  });
});

describe('atlases', () => {
  it('pack pictures without overlap, inside the sheet', () => {
    const sizes: [number, number][] = [
      [120, 100],
      [64, 64],
      [128, 128],
      [30, 90],
      [100, 20],
      [128, 64],
      [90, 90],
    ];
    const { rects, height } = packShelves(sizes, 256, 2);
    rects.forEach(([x, y, w, h], i) => {
      expect([w, h]).toEqual(sizes[i]);
      expect(x).toBeGreaterThanOrEqual(2);
      expect(x + w).toBeLessThanOrEqual(254);
      expect(y + h).toBeLessThanOrEqual(height - 2);
      for (let j = 0; j < i; j++) {
        const [x2, y2, w2, h2] = rects[j];
        expect(x < x2 + w2 && x2 < x + w && y < y2 + h2 && y2 < y + h).toBe(false);
      }
    });
    expect(() => packShelves([[300, 10]], 256)).toThrow(/wider than/);
  });
});

describe('building the art', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cc-art-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('resizes pictures, packs sprites by era, copies sound and credits every one', async () => {
    const art = join(dir, 'art'),
      out = join(dir, 'public-art');
    mkdirSync(join(art, 'units'), { recursive: true });
    const png = (w: number, h: number, r: number) =>
      sharp({ create: { width: w, height: h, channels: 4, background: { r, g: 90, b: 40, alpha: 1 } } })
        .png()
        .toBuffer();
    writeFileSync(join(art, 'feast.png'), await png(2000, 1000, 200));
    writeFileSync(join(art, 'units', 'knight.png'), await png(256, 256, 100));
    writeFileSync(join(art, 'units', 'archer.png'), await png(96, 128, 50));
    writeFileSync(join(art, 'bell.ogg'), Buffer.from('OggS fake'));
    const manifest: AssetSource[] = [
      { ...good, id: 'event.feast', file: 'feast.png' },
      {
        id: 'unit.knight',
        file: 'units/knight.png',
        kind: 'unit',
        era: 'medieval',
        type: 'cavalry',
        source: 'Made for the game',
        author: 'The authors',
        licence: 'Generated',
        generated: { tool: 'An image model', prompt: 'a mounted knight, manuscript miniature' },
      },
      {
        id: 'unit.archer',
        file: 'units/archer.png',
        kind: 'unit',
        era: 'medieval',
        type: 'ranged',
        source: 'Made for the game',
        author: 'The authors',
        licence: 'CC0',
      },
      { ...good, id: 'effect.bell', file: 'bell.ogg', kind: 'effect' },
    ];
    writeFileSync(join(art, 'manifest.json'), JSON.stringify(manifest));

    const { problems, index } = await buildArt(art, out);
    expect(problems).toEqual([]);
    const byId = new Map(index!.assets.map((a) => [a.id, a]));
    expect(byId.get('event.feast')).toMatchObject({ url: 'event.feast.webp', width: 1024, height: 512 });
    const knight = byId.get('unit.knight')!;
    const archer = byId.get('unit.archer')!;
    expect(knight.url).toBe('atlas-unit-medieval.webp');
    expect(archer.url).toBe(knight.url);
    expect(knight.rect!.slice(2)).toEqual([128, 128]);
    expect(archer.rect!.slice(2)).toEqual([96, 128]);
    expect(knight.generated).toBe(true);
    expect(knight.credit).toBe('The authors (Generated), generated with An image model');
    expect(byId.get('effect.bell')!.url).toBe('effect.bell.ogg');
    for (const f of ['index.json', 'event.feast.webp', 'atlas-unit-medieval.webp', 'effect.bell.ogg'])
      expect(existsSync(join(out, f)), f).toBe(true);
    const meta = await sharp(join(out, 'atlas-unit-medieval.webp')).metadata();
    expect(meta.width).toBe(1024);
    expect(meta.height).toBe(knight.height);
    expect(JSON.parse(readFileSync(join(out, 'index.json'), 'utf8')).assets).toHaveLength(4);
  });

  it('builds nothing from a manifest with problems', async () => {
    const art = join(dir, 'bad'),
      out = join(dir, 'bad-out');
    mkdirSync(art, { recursive: true });
    writeFileSync(join(art, 'manifest.json'), JSON.stringify([{ ...good, file: 'nowhere.png' }]));
    const { problems, index } = await buildArt(art, out);
    expect(problems).toHaveLength(1);
    expect(index).toBeNull();
    expect(existsSync(out)).toBe(false);
  });
});
