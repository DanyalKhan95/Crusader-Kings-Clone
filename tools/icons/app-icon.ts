/**
 * The desktop app's icon: the game's crown on a crimson tile, drawn from the same game-icons glyph as
 * the interface and written to electron/build/icon.png, from which electron-builder makes each
 * system's icon. Runs with `npm run icons`.
 */
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';
import { ICONS } from '../../src/assets/icons.ts';

const SIZE = 1024;
/** The tile inside the canvas; the margin is the space macOS expects around an icon. */
const TILE = 864;
const GLYPH = 600;

const at = (SIZE - TILE) / 2;
const g = (SIZE - GLYPH) / 2;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="field" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8a2020"/>
      <stop offset="1" stop-color="#3b0b0b"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f6dc8c"/>
      <stop offset="1" stop-color="#b98a30"/>
    </linearGradient>
  </defs>
  <rect x="${at}" y="${at}" width="${TILE}" height="${TILE}" rx="190" fill="url(#field)"/>
  <rect x="${at + 30}" y="${at + 30}" width="${TILE - 60}" height="${TILE - 60}" rx="164" fill="none"
    stroke="#d4ae55" stroke-opacity="0.85" stroke-width="12"/>
  <g fill="url(#gold)" transform="translate(${g} ${g - 12}) scale(${GLYPH / 512})">${ICONS.crown}</g>
</svg>`;

mkdirSync('electron/build', { recursive: true });
await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile('electron/build/icon.png');
console.log('Wrote electron/build/icon.png');
