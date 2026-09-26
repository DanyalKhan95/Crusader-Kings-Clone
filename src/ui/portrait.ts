/**
 * Procedural portraits in the manner of a manuscript miniature: a head and shoulders under an arch,
 * drawn from the character's id, age, sex, culture, faith and office. The same character always
 * gets the same face; grey hair and lines come with the years.
 */
import type { Character, Country } from '../sim/types';

export type PortraitRole =
  'ruler' | 'heir' | 'chancellor' | 'marshal' | 'steward' | 'spymaster' | 'chaplain' | 'courtier' | 'commander';

export interface PortraitInput {
  c: Character;
  country: Country;
  age: number;
  role: PortraitRole;
  /** religion family, e.g. christian, islamic */
  faith: string;
  /** culture group, e.g. germanic, arabic */
  group: string;
}

const SKIN: Record<string, string[]> = {
  light: ['#f2d6bc', '#ebc8a8', '#e0b893', '#d6aa84'],
  olive: ['#dcac84', '#cf9a70', '#c28b62', '#b57d57'],
  brown: ['#b88560', '#a8754f', '#976643', '#86583a'],
  dark: ['#7b5036', '#6b442d', '#5c3924', '#4e2f1e'],
  east: ['#ecc9a0', '#e2bb8e', '#d6ac7f', '#c99d72'],
  americas: ['#c68d62', '#b77e54', '#a97048', '#9a633f'],
};

const HAIR: Record<string, string[]> = {
  light: ['#d9b56b', '#b98b4e', '#7a5230', '#4a3120', '#2b1d14', '#9c4f2a'],
  dark: ['#2a1d15', '#1c1410', '#3a2a1e', '#15100c'],
};

const GROUP_TONE: Record<string, keyof typeof SKIN> = {};
for (const g of [
  'frankish',
  'germanic',
  'norse',
  'celtic',
  'latin',
  'iberian',
  'west_slavic',
  'east_slavic',
  'south_slavic',
  'baltic',
  'finno_ugric',
])
  GROUP_TONE[g] = 'light';
for (const g of ['arabic', 'berber', 'iranian', 'turkic', 'caucasian', 'byzantine']) GROUP_TONE[g] = 'olive';
for (const g of ['indo_aryan', 'dravidian', 'munda', 'himalayan']) GROUP_TONE[g] = 'brown';
for (const g of ['west_african', 'east_african', 'bantu', 'khoisan', 'papuan', 'australian']) GROUP_TONE[g] = 'dark';
for (const g of [
  'sinitic',
  'japonic',
  'korean',
  'tungusic',
  'mongolic',
  'tai',
  'austroasiatic',
  'austronesian',
  'southeastern',
  'siberian',
])
  GROUP_TONE[g] = 'east';

const BEARDED = new Set([
  'norse',
  'germanic',
  'arabic',
  'iranian',
  'turkic',
  'berber',
  'byzantine',
  'east_slavic',
  'celtic',
]);

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function pick<T>(r: () => number, list: T[]): T {
  return list[Math.floor(r() * list.length)];
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) =>
    Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))))
      .toString(16)
      .padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

let serial = 0;

export function portraitSvg(p: PortraitInput, width = 64): string {
  const { c, country, age, role, faith, group } = p;
  const r = rng(c.id * 2654435761);
  const tone = GROUP_TONE[group] ?? 'americas';
  const skin = pick(r, SKIN[tone]);
  const skinShade = shade(skin, -0.18);
  let hair = pick(r, tone === 'light' ? HAIR.light : HAIR.dark);
  if (age >= 65) hair = '#e4e2dc';
  else if (age >= 50) hair = r() < 0.7 ? '#9d9892' : shade(hair, 0.25);
  const brow = age >= 60 ? '#bdb8b0' : shade(hair, -0.1);
  const robe = country.colorHex;
  const robeDark = shade(robe, -0.35);
  const gold = '#d9b457';
  const id = `pt${++serial}`;
  const islamic = faith === 'islamic';
  const male = !c.female;
  const smile = c.traits.includes('gregarious') || c.traits.includes('content');
  const stern = c.traits.includes('cruel') || c.traits.includes('brave');
  const face = 16 + r() * 2.5;
  const jaw = face + 3 + r() * 2;
  const parts: string[] = [];

  // Frame and ground
  const arch = 'M5 119 V40 A45 45 0 0 1 95 40 V119 Z';
  parts.push(
    `<defs><clipPath id="${id}c"><path d="${arch}"/></clipPath>` +
      `<radialGradient id="${id}g" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="#3a3024"/><stop offset="1" stop-color="#15100b"/></radialGradient></defs>`,
  );
  parts.push(`<path d="${arch}" fill="url(#${id}g)"/>`);
  parts.push(`<g clip-path="url(#${id}c)">`);

  // Long hair and veils fall behind the shoulders.
  const veiled = !male && (faith === 'christian' || islamic) && r() < 0.6;
  if (!male && !veiled)
    parts.push(
      `<path d="M${50 - face - 3} 50 C${50 - face - 6} 80 ${50 - face - 2} 98 42 100 L58 100 C${50 + face + 2} 98 ${50 + face + 6} 80 ${50 + face + 3} 50 Z" fill="${hair}"/>`,
    );
  if (veiled)
    parts.push(
      `<path d="M${50 - face - 7} 44 C${50 - face - 9} 84 ${50 - face - 6} 100 50 102 C${50 + face + 6} 100 ${50 + face + 9} 84 ${50 + face + 7} 44 Z" fill="${islamic ? '#e9e2d0' : '#efe9dc'}"/>`,
    );

  // Shoulders, robe and collar
  parts.push(`<path d="M6 120 C8 97 28 87 50 87 C72 87 92 97 94 120 Z" fill="${robe}"/>`);
  parts.push(`<path d="M6 120 C8 103 20 95 32 92 C28 102 27 112 28 120 Z" fill="${robeDark}" opacity="0.55"/>`);
  parts.push(`<path d="M94 120 C92 103 80 95 68 92 C72 102 73 112 72 120 Z" fill="${robeDark}" opacity="0.55"/>`);
  const trim = role === 'ruler' || role === 'heir' ? gold : shade(robe, 0.35);
  parts.push(`<path d="M37 89 Q50 101 63 89" fill="none" stroke="${trim}" stroke-width="3"/>`);
  if (role === 'ruler')
    parts.push(`<circle cx="50" cy="104" r="3.2" fill="${gold}"/><circle cx="50" cy="104" r="1.4" fill="#8f1f1f"/>`);

  // Neck, ears and head
  parts.push(`<path d="M43 74 H57 V90 Q50 94 43 90 Z" fill="${skinShade}"/>`);
  parts.push(
    `<ellipse cx="${50 - face}" cy="58" rx="2.6" ry="4.2" fill="${skinShade}"/><ellipse cx="${50 + face}" cy="58" rx="2.6" ry="4.2" fill="${skinShade}"/>`,
  );
  parts.push(
    `<path d="M${50 - face} 50 C${50 - face} 34 ${50 + face} 34 ${50 + face} 50 C${50 + face} 66 ${50 + jaw / 2} 80 50 80 C${50 - jaw / 2} 80 ${50 - face} 66 ${50 - face} 50 Z" fill="${skin}"/>`,
  );
  parts.push(
    `<path d="M${50 - face + 2} 62 C${50 - face + 4} 74 44 79 50 79" fill="none" stroke="${skinShade}" stroke-width="1.4" opacity="0.6"/>`,
  );

  // Eyes, brows, nose and mouth
  const eyeY = 56 + r() * 1.5;
  for (const x of [43, 57]) {
    parts.push(`<ellipse cx="${x}" cy="${eyeY}" rx="2.8" ry="1.7" fill="#f4efe6"/>`);
    parts.push(
      `<circle cx="${x + (r() - 0.5) * 0.6}" cy="${eyeY}" r="1.25" fill="${tone === 'light' && r() < 0.4 ? '#4c6a86' : '#2a1d14'}"/>`,
    );
  }
  const tilt = stern ? 1.6 : smile ? -0.6 : 0;
  parts.push(
    `<path d="M39.5 ${eyeY - 3.8 - tilt} L46 ${eyeY - 3.6 + tilt}" stroke="${brow}" stroke-width="1.6" stroke-linecap="round"/>`,
  );
  parts.push(
    `<path d="M60.5 ${eyeY - 3.8 - tilt} L54 ${eyeY - 3.6 + tilt}" stroke="${brow}" stroke-width="1.6" stroke-linecap="round"/>`,
  );
  parts.push(
    `<path d="M50 ${eyeY + 1} L${48.2 - r()} ${eyeY + 9} Q50 ${eyeY + 10.5} 51.6 ${eyeY + 9.3}" fill="none" stroke="${skinShade}" stroke-width="1.2" stroke-linecap="round"/>`,
  );
  const mouthY = eyeY + 14.5;
  parts.push(
    `<path d="M45.5 ${mouthY} Q50 ${mouthY + (smile ? 2.6 : stern ? -0.8 : 1)} 54.5 ${mouthY}" fill="none" stroke="#8a4a3a" stroke-width="1.4" stroke-linecap="round"/>`,
  );
  if (age >= 45)
    parts.push(
      `<path d="M42 ${eyeY - 8} Q50 ${eyeY - 9.5} 58 ${eyeY - 8}" fill="none" stroke="${skinShade}" stroke-width="0.9" opacity="0.7"/>`,
    );
  if (age >= 55)
    parts.push(
      `<path d="M${50 - face + 5} ${mouthY - 4} Q${50 - face + 7} ${mouthY} ${50 - face + 8} ${mouthY + 3}" fill="none" stroke="${skinShade}" stroke-width="0.9" opacity="0.7"/><path d="M${50 + face - 5} ${mouthY - 4} Q${50 + face - 7} ${mouthY} ${50 + face - 8} ${mouthY + 3}" fill="none" stroke="${skinShade}" stroke-width="0.9" opacity="0.7"/>`,
    );

  // Beards
  if (male && age >= 18) {
    const bearded = r() < (BEARDED.has(group) || islamic ? 0.85 : 0.5);
    if (bearded) {
      const long = age >= 40 && r() < 0.5;
      const bottom = long ? 92 : 84;
      parts.push(
        `<path d="M${50 - face + 1} 60 C${50 - face + 1} ${bottom - 8} 44 ${bottom} 50 ${bottom} C56 ${bottom} ${50 + face - 1} ${bottom - 8} ${50 + face - 1} 60 C${50 + face - 4} 72 56 ${mouthY + 1} 50 ${mouthY + 1.5} C44 ${mouthY + 1} ${50 - face + 4} 72 ${50 - face + 1} 60 Z" fill="${hair}"/>`,
      );
      parts.push(
        `<path d="M44 ${mouthY - 1.5} Q50 ${mouthY - 4} 56 ${mouthY - 1.5} Q50 ${mouthY - 0.5} 44 ${mouthY - 1.5} Z" fill="${hair}"/>`,
      );
    } else if (r() < 0.4) {
      parts.push(
        `<path d="M44 ${mouthY - 1.5} Q50 ${mouthY - 4} 56 ${mouthY - 1.5} Q50 ${mouthY - 0.5} 44 ${mouthY - 1.5} Z" fill="${hair}"/>`,
      );
    }
  }

  // Hair on top, unless something covers it
  const bald = male && age >= 45 && r() < 0.35;
  const hairTop = `<path d="M${50 - face - 1} 54 C${50 - face - 2} 30 ${50 + face + 2} 30 ${50 + face + 1} 54 C${50 + face - 2} 44 ${56} 40 50 40 C44 40 ${50 - face + 2} 44 ${50 - face - 1} 54 Z" fill="${hair}"/>`;
  const fringe = `<path d="M${50 - face - 1} 52 C${50 - face - 1} 40 ${50 + face + 1} 40 ${50 + face + 1} 52 C${50 + face - 4} 44 44 43 ${50 - face - 1} 52 Z" fill="${hair}"/>`;

  // Headwear by office and faith
  const wearCrown = role === 'ruler';
  const nomad = country.gov === 'nomadic' || country.gov === 'tribal';
  if (veiled) {
    parts.push(
      `<path d="M${50 - face - 3} 58 C${50 - face - 4} 30 ${50 + face + 4} 30 ${50 + face + 3} 58 C${50 + face - 1} 44 ${50 - face + 1} 44 ${50 - face - 3} 58 Z" fill="${islamic ? '#e9e2d0' : '#efe9dc'}"/>`,
    );
  } else if (islamic && male) {
    parts.push(
      `<path d="M${50 - face - 4} 46 C${50 - face - 5} 24 ${50 + face + 5} 24 ${50 + face + 4} 46 C${50 + face} 40 ${50 - face} 40 ${50 - face - 4} 46 Z" fill="${wearCrown ? '#f3ecd9' : pick(r, ['#efe7d4', '#d9cfb4', '#6e8a5a'])}"/>`,
    );
    parts.push(
      `<path d="M${50 - face - 3} 40 Q50 30 ${50 + face + 3} 40" fill="none" stroke="${shade('#d9cfb4', -0.25)}" stroke-width="1.2"/>`,
    );
    if (wearCrown) parts.push(`<circle cx="50" cy="35" r="2.6" fill="#b3262a" stroke="${gold}" stroke-width="1"/>`);
  } else if (role === 'chaplain' && faith === 'christian') {
    parts.push(bald ? '' : fringe);
    parts.push(
      `<path d="M${50 - face + 1} 40 L50 16 L${50 + face - 1} 40 Z" fill="#efe7d6" stroke="${gold}" stroke-width="1.2"/>`,
    );
    parts.push(`<path d="M50 20 V38 M45 29 H55" stroke="${gold}" stroke-width="1.4"/>`);
  } else if (role === 'marshal' || role === 'commander') {
    parts.push(
      `<path d="M${50 - face - 1} 50 C${50 - face - 1} 26 ${50 + face + 1} 26 ${50 + face + 1} 50 Z" fill="#8d918f"/>`,
    );
    parts.push(
      `<path d="M${50 - face - 1} 50 C${50 - face - 1} 32 ${50 - 4} 28 50 27" fill="none" stroke="#c7cbc7" stroke-width="1.4" opacity="0.6"/>`,
    );
    parts.push(`<rect x="48.6" y="44" width="2.8" height="13" rx="1" fill="#7a7e7c"/>`);
  } else if (role === 'spymaster') {
    parts.push(
      `<path d="M${50 - face - 5} 64 C${50 - face - 6} 26 ${50 + face + 6} 26 ${50 + face + 5} 64 C${50 + face} 46 ${50 - face} 46 ${50 - face - 5} 64 Z" fill="#2c2a30"/>`,
    );
  } else {
    if (!bald) parts.push(male ? hairTop : fringe);
    if (wearCrown) {
      if (country.gov === 'imperial') {
        parts.push(
          `<path d="M${50 - face + 1} 40 C${50 - face + 1} 22 ${50 + face - 1} 22 ${50 + face - 1} 40 Z" fill="${shade(robe, -0.2)}"/>`,
        );
        parts.push(`<rect x="${50 - face}" y="36" width="${face * 2}" height="6" rx="1" fill="${gold}"/>`);
        parts.push(
          `<path d="M50 22 V36 M${50 - face + 3} 30 Q50 20 ${50 + face - 3} 30" fill="none" stroke="${gold}" stroke-width="1.6"/>`,
        );
        parts.push(`<circle cx="50" cy="20" r="2" fill="${gold}"/>`);
      } else if (nomad) {
        parts.push(
          `<path d="M${50 - face - 2} 44 C${50 - face - 3} 26 ${50 + face + 3} 26 ${50 + face + 2} 44 Z" fill="#6b4a2c"/>`,
        );
        parts.push(`<rect x="${50 - face - 3}" y="40" width="${face * 2 + 6}" height="6" rx="3" fill="#a88a64"/>`);
        parts.push(`<circle cx="50" cy="36" r="2" fill="${gold}"/>`);
      } else {
        parts.push(
          `<path d="M${50 - face + 1} 42 L${50 - face + 1} 31 L${50 - face + 6} 36 L${50 - 5} 27 L50 34 L${50 + 5} 27 L${50 + face - 6} 36 L${50 + face - 1} 31 L${50 + face - 1} 42 Z" fill="${gold}" stroke="#8a6b24" stroke-width="0.8"/>`,
        );
        parts.push(
          `<circle cx="50" cy="39" r="1.7" fill="#b3262a"/><circle cx="${50 - 8}" cy="39" r="1.3" fill="#2c5aa0"/><circle cx="${50 + 8}" cy="39" r="1.3" fill="#2c5aa0"/>`,
        );
      }
    } else if (role === 'heir') {
      parts.push(`<rect x="${50 - face}" y="39" width="${face * 2}" height="3" rx="1.2" fill="${gold}"/>`);
    } else if (role === 'chancellor' || role === 'steward') {
      const hat = role === 'chancellor' ? shade(robe, -0.15) : '#4a3a2a';
      parts.push(
        `<path d="M${50 - face - 3} 44 C${50 - face - 4} 30 ${50 + face + 4} 26 ${50 + face + 6} 38 C${50 + face + 2} 42 ${50 - face} 42 ${50 - face - 3} 44 Z" fill="${hat}"/>`,
      );
    }
  }

  parts.push('</g>');
  parts.push(`<path d="${arch}" fill="none" stroke="${gold}" stroke-width="2" opacity="0.85"/>`);
  const height = Math.round(width * 1.2);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120" width="${width}" height="${height}" aria-hidden="true">${parts.join('')}</svg>`;
}
