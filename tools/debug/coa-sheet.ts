/** Debug: renders a sheet of coats of arms to tools/mapgen/debug/coa-sheet.png. */
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { coaSvg, generateCoA } from '../../src/heraldry/coa.ts';
import type { ScenarioData, WorldData } from '../../src/shared/dataTypes.ts';

const sc = JSON.parse(readFileSync('public/data/scenario-1066.json', 'utf8')) as ScenarioData;
const world = JSON.parse(readFileSync('public/data/world.json', 'utf8')) as WorldData;
const FEATURED = ['ENG', 'FRA', 'HRE', 'BYZ', 'NRM', 'SCO', 'CAS', 'LEO', 'ARA', 'DEN', 'NRW', 'SWE'];
const tags = [
  ...FEATURED,
  ...['POL', 'HUN', 'BOH', 'CRO', 'RUS', 'VEN', 'PAP', 'GEO', 'SEL', 'FAT', 'SNG', 'JAP', 'GOR', 'CHO'],
  ...['CLK', 'KHM', 'TLT', 'BRG', 'ULO', 'BRI', 'SAX', 'BAV', 'CUM', 'ICE'],
  ...sc.countries.slice(40, 76).map((c) => c.tag),
];
const cell = 90,
  cols = 12;
let body = '';
tags.forEach((t, i) => {
  const c = sc.countries.find((x) => x.tag === t);
  if (!c) return;
  const rgb = [1, 3, 5].map((k) => parseInt(c.color.slice(k, k + 2), 16)) as [number, number, number];
  const fam = world.religions[c.religion]?.family ?? 'christian';
  const svg = coaSvg(generateCoA(t, rgb, fam), 64)
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>$/, '');
  const x = (i % cols) * cell + 13,
    y = Math.floor(i / cols) * (cell + 20) + 6;
  body += `<g transform="translate(${x},${y}) scale(0.64)">${svg}</g><text x="${x + 32}" y="${y + 98}" font-size="10" text-anchor="middle" fill="#222">${t}</text>`;
});
const rows = Math.ceil(tags.length / cols);
const out = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * cell}" height="${rows * (cell + 20) + 10}"><rect width="100%" height="100%" fill="#d8cfbd"/>${body}</svg>`;
await sharp(Buffer.from(out)).png().toFile('tools/mapgen/debug/coa-sheet.png');
console.log('ok');
