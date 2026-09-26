/**
 * Coats of arms: a small blazon model (field division, ordinary, charges), curated arms for major
 * realms, deterministic generated arms for everyone else, and SVG rendering.
 */
import { ICONS, type IconName } from '../assets/icons.ts';

export type Tincture = 'or' | 'argent' | 'gules' | 'azure' | 'vert' | 'sable' | 'purpure';
export const TINCTURES: Record<Tincture, string> = {
  or: '#d8a93c',
  argent: '#ebe7dc',
  gules: '#b3272a',
  azure: '#24539e',
  vert: '#2e7b3d',
  sable: '#1f1c1b',
  purpure: '#6b2c79',
};
const METALS: Tincture[] = ['or', 'argent'];
const COLOURS: Tincture[] = ['gules', 'azure', 'vert', 'sable', 'purpure'];
export const isMetal = (t: Tincture) => t === 'or' || t === 'argent';

export type Division =
  | 'plain'
  | 'per_pale'
  | 'per_fess'
  | 'per_bend'
  | 'per_saltire'
  | 'quarterly'
  | 'paly'
  | 'barry'
  | 'bendy'
  | 'chequy'
  | 'gyronny';
export type Ordinary =
  'cross' | 'saltire' | 'bend' | 'chevron' | 'pale' | 'fess' | 'chief' | 'bordure' | 'nordic_cross';
export type Geometric = 'mullet' | 'roundel' | 'lozenge' | 'cross_pattee' | 'double_eagle';
export type ChargeKind = IconName | Geometric;

export interface CoA {
  div: Division;
  t1: Tincture;
  t2: Tincture;
  ordinary?: { type: Ordinary; t: Tincture };
  charge?: { kind: ChargeKind; t: Tincture; count: 1 | 2 | 3 | 4 | 6; inPale?: boolean; crossed?: boolean };
}

const C = (div: Division, t1: Tincture, t2: Tincture, extra: Partial<CoA> = {}): CoA => ({ div, t1, t2, ...extra });

/** Arms for major realms (partly legendary or anachronistic — chosen to be recognisable). */
export const CURATED: Record<string, CoA> = {
  ENG: C('plain', 'gules', 'gules', { charge: { kind: 'lion', t: 'or', count: 3, inPale: true } }),
  NRM: C('plain', 'gules', 'gules', { charge: { kind: 'lion', t: 'or', count: 2, inPale: true } }),
  FRA: C('plain', 'azure', 'azure', { charge: { kind: 'fleur-de-lys', t: 'or', count: 3 } }),
  HRE: C('plain', 'or', 'or', { charge: { kind: 'eagle-emblem', t: 'sable', count: 1 } }),
  BYZ: C('plain', 'purpure', 'purpure', { charge: { kind: 'double_eagle', t: 'or', count: 1 } }),
  // Gold on silver, the famous exception to the rule of tincture.
  JER: C('plain', 'argent', 'argent', { ordinary: { type: 'cross', t: 'or' } }),
  SEL: C('plain', 'azure', 'azure', { charge: { kind: 'double_eagle', t: 'or', count: 1 } }),
  SCO: C('plain', 'or', 'or', {
    ordinary: { type: 'bordure', t: 'gules' },
    charge: { kind: 'lion', t: 'gules', count: 1 },
  }),
  WAL: C('quarterly', 'or', 'gules', { charge: { kind: 'lion', t: 'sable', count: 1 } }),
  GWY: C('quarterly', 'or', 'gules', { charge: { kind: 'lion', t: 'sable', count: 1 } }),
  DEH: C('plain', 'gules', 'gules', {
    charge: { kind: 'lion', t: 'or', count: 1 },
    ordinary: { type: 'bordure', t: 'or' },
  }),
  LEI: C('plain', 'vert', 'vert', { charge: { kind: 'flower-emblem', t: 'or', count: 1 } }),
  MUN: C('plain', 'azure', 'azure', { charge: { kind: 'crown', t: 'or', count: 3 } }),
  CON: C('per_pale', 'argent', 'azure', { charge: { kind: 'eagle-emblem', t: 'sable', count: 1 } }),
  CAS: C('plain', 'gules', 'gules', { charge: { kind: 'stone-tower', t: 'or', count: 1 } }),
  LEO: C('plain', 'argent', 'argent', { charge: { kind: 'lion', t: 'purpure', count: 1 } }),
  GAL: C('plain', 'azure', 'azure', {
    charge: { kind: 'crown', t: 'or', count: 1 },
    ordinary: { type: 'bordure', t: 'argent' },
  }),
  ARA: C('paly', 'or', 'gules'),
  BAR: C('paly', 'or', 'gules', { ordinary: { type: 'bordure', t: 'argent' } }),
  NAV: C('plain', 'gules', 'gules', { ordinary: { type: 'saltire', t: 'or' } }),
  DEN: C('plain', 'or', 'or', { charge: { kind: 'lion', t: 'azure', count: 3, inPale: true } }),
  NRW: C('plain', 'gules', 'gules', { charge: { kind: 'lion', t: 'or', count: 1 } }),
  SWE: C('plain', 'azure', 'azure', { charge: { kind: 'crown', t: 'or', count: 3 } }),
  ICE: C('plain', 'azure', 'azure', { charge: { kind: 'raven', t: 'argent', count: 1 } }),
  ORK: C('plain', 'azure', 'azure', { charge: { kind: 'anchor', t: 'or', count: 1 } }),
  POL: C('plain', 'gules', 'gules', { charge: { kind: 'eagle-emblem', t: 'argent', count: 1 } }),
  HUN: C('barry', 'gules', 'argent'),
  BOH: C('plain', 'gules', 'gules', { charge: { kind: 'lion', t: 'argent', count: 1 } }),
  CRO: C('chequy', 'gules', 'argent'),
  DUK: C('plain', 'gules', 'gules', { charge: { kind: 'eagle-emblem', t: 'or', count: 1 } }),
  RUS: C('plain', 'gules', 'gules', { charge: { kind: 'trident', t: 'or', count: 1 } }),
  CHE: C('plain', 'azure', 'azure', { charge: { kind: 'trident', t: 'or', count: 1 } }),
  PER: C('plain', 'vert', 'vert', { charge: { kind: 'trident', t: 'or', count: 1 } }),
  PLT: C('plain', 'gules', 'gules', { charge: { kind: 'mounted-knight' as IconName, t: 'argent', count: 1 } }),
  VEN: C('plain', 'azure', 'azure', { charge: { kind: 'griffin-symbol', t: 'or', count: 1 } }),
  PAP: C('plain', 'gules', 'gules', { charge: { kind: 'key', t: 'or', count: 2, crossed: true } }),
  GEO: C('plain', 'argent', 'argent', { ordinary: { type: 'cross', t: 'gules' } }),
  SAX: C('plain', 'gules', 'gules', { charge: { kind: 'horse-head', t: 'argent', count: 1 } }),
  BAV: C('chequy', 'argent', 'azure'),
  SWA: C('plain', 'or', 'or', { charge: { kind: 'lion', t: 'sable', count: 3, inPale: true } }),
  CAR: C('per_pale', 'or', 'gules', { charge: { kind: 'lion', t: 'sable', count: 1 } }),
  ULO: C('plain', 'or', 'or', { ordinary: { type: 'bend', t: 'gules' } }),
  LLO: C('plain', 'sable', 'sable', { charge: { kind: 'lion', t: 'or', count: 1 } }),
  TUS: C('per_fess', 'argent', 'gules', { charge: { kind: 'flower-emblem', t: 'or', count: 1 } }),
  FLA: C('plain', 'or', 'or', { charge: { kind: 'lion', t: 'sable', count: 1 } }),
  AQU: C('plain', 'gules', 'gules', { charge: { kind: 'lion', t: 'or', count: 1 } }),
  TOU: C('plain', 'gules', 'gules', { charge: { kind: 'cross_pattee', t: 'or', count: 1 } }),
  BRI: C('plain', 'argent', 'argent', { charge: { kind: 'lozenge', t: 'sable', count: 6 } }),
  BRG: C('bendy', 'or', 'azure', { ordinary: { type: 'bordure', t: 'gules' } }),
  BLO: C('plain', 'azure', 'azure', { ordinary: { type: 'bend', t: 'argent' } }),
  ANJ: C('plain', 'gules', 'gules', {
    ordinary: { type: 'chief', t: 'or' },
    charge: { kind: 'lion', t: 'or', count: 1 },
  }),
  APU: C('plain', 'azure', 'azure', { ordinary: { type: 'bend', t: 'argent' } }),
  SIC: C('plain', 'vert', 'vert', { charge: { kind: 'moon', t: 'or', count: 1 } }),
  SRD: C('plain', 'argent', 'argent', { ordinary: { type: 'cross', t: 'gules' } }),
  FAT: C('plain', 'vert', 'vert', { charge: { kind: 'moon', t: 'argent', count: 1 } }),
  ABB: C('plain', 'sable', 'sable', {
    ordinary: { type: 'bordure', t: 'or' },
    charge: { kind: 'mullet', t: 'or', count: 1 },
  }),
  MRB: C('plain', 'sable', 'sable', { charge: { kind: 'mullet', t: 'argent', count: 3 } }),
  GHZ: C('plain', 'vert', 'vert', { charge: { kind: 'lion', t: 'or', count: 1 } }),
  SNG: C('plain', 'gules', 'gules', { charge: { kind: 'dragon-head', t: 'or', count: 1 } }),
  LIA: C('plain', 'azure', 'azure', { charge: { kind: 'heraldic-sun', t: 'argent', count: 1 } }),
  XIA: C('plain', 'sable', 'sable', { charge: { kind: 'tiger-head', t: 'or', count: 1 } }),
  GOR: C('plain', 'argent', 'argent', { charge: { kind: 'yin-yang', t: 'azure', count: 1 } }),
  JAP: C('plain', 'argent', 'argent', { charge: { kind: 'roundel', t: 'gules', count: 1 } }),
  DAI: C('plain', 'gules', 'gules', { charge: { kind: 'mullet', t: 'or', count: 1 } }),
  KHM: C('plain', 'azure', 'azure', { charge: { kind: 'pagoda', t: 'or', count: 1 } }),
  PAG: C('plain', 'gules', 'gules', { charge: { kind: 'pagoda', t: 'or', count: 1 } }),
  CHO: C('plain', 'gules', 'gules', { charge: { kind: 'tiger-head', t: 'or', count: 1 } }),
  CLK: C('plain', 'or', 'or', { charge: { kind: 'boar', t: 'gules', count: 1 } }),
  PAL: C('plain', 'azure', 'azure', { charge: { kind: 'lotus', t: 'or', count: 1 } }),
  GHA: C('plain', 'or', 'or', { charge: { kind: 'elephant', t: 'sable', count: 1 } }),
  TLT: C('plain', 'vert', 'vert', { charge: { kind: 'wyvern', t: 'or', count: 1 } }),
  MAY: C('plain', 'vert', 'vert', { charge: { kind: 'heraldic-sun', t: 'or', count: 1 } }),
  CUM: C('plain', 'azure', 'azure', { charge: { kind: 'wolf-head', t: 'or', count: 1 } }),
  MON: C('plain', 'azure', 'azure', { charge: { kind: 'heraldic-sun', t: 'or', count: 1 } }),
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(r: () => number, arr: readonly T[]): T => arr[Math.floor(r() * arr.length)];

function nearestTincture(rgb: [number, number, number]): Tincture {
  let best: Tincture = 'gules',
    bd = Infinity;
  for (const [t, hex] of Object.entries(TINCTURES) as [Tincture, string][]) {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const d = (c[0] - rgb[0]) ** 2 + (c[1] - rgb[1]) ** 2 + (c[2] - rgb[2]) ** 2;
    if (d < bd) {
      bd = d;
      best = t;
    }
  }
  return best;
}

/** Charge pools by culture group / religion family, so arms feel local. */
const POOLS: Record<string, ChargeKind[]> = {
  christian: [
    'lion',
    'eagle-emblem',
    'fleur-de-lys',
    'stone-tower',
    'key',
    'cross_pattee',
    'mullet',
    'boar',
    'deer',
    'bear-head',
    'griffin-symbol',
    'rose',
    'crown',
    'wolf-head',
    'raven',
    'lozenge',
    'roundel',
  ],
  islamic: [
    'moon',
    'mullet',
    'lozenge',
    'heraldic-sun',
    'stone-tower',
    'horse-head',
    'camel',
    'lion',
    'flower-emblem',
    'roundel',
  ],
  dharmic: ['lotus', 'elephant', 'heraldic-sun', 'tiger-head', 'crown', 'boar', 'bull', 'moon', 'flower-emblem'],
  buddhist: ['lotus', 'pagoda', 'heraldic-sun', 'elephant', 'dragon-head', 'flower-emblem', 'roundel'],
  east_asian: ['dragon-head', 'tiger-head', 'heraldic-sun', 'pagoda', 'yin-yang', 'flower-emblem', 'dove'],
  pagan: ['raven', 'wolf-head', 'bear-head', 'boar', 'deer', 'heraldic-sun', 'moon', 'horse-head', 'bull'],
  african: ['lion', 'elephant', 'heraldic-sun', 'bull', 'moon', 'crossed-swords', 'crown'],
  american: ['heraldic-sun', 'wyvern', 'deer', 'bear-head', 'wolf-head', 'dove', 'moon', 'flower-emblem'],
  oceanic: ['heraldic-sun', 'moon', 'dove', 'anchor', 'flower-emblem', 'mullet'],
};

export function generateCoA(tag: string, color: [number, number, number], religionFamily: string): CoA {
  const curated = CURATED[tag];
  if (curated) return curated;
  const r = rng(hash(tag));
  const t1 = nearestTincture(color);
  const metalField = isMetal(t1);
  const contrast = (): Tincture => (metalField ? pick(r, COLOURS) : pick(r, METALS));
  const roll = r();
  let div: Division = 'plain';
  let t2: Tincture = t1;
  if (roll > 0.62) {
    div = pick(r, [
      'per_pale',
      'per_fess',
      'per_bend',
      'quarterly',
      'paly',
      'barry',
      'bendy',
      'chequy',
      'per_saltire',
      'gyronny',
    ] as Division[]);
    t2 = contrast();
  }
  const coa: CoA = { div, t1, t2 };
  const complex = div !== 'plain' && ['paly', 'barry', 'bendy', 'chequy', 'gyronny'].includes(div);
  if (!complex && r() < 0.45) {
    coa.ordinary = {
      type: pick(r, ['cross', 'saltire', 'bend', 'chevron', 'pale', 'fess', 'chief', 'bordure'] as Ordinary[]),
      t: contrast(),
    };
    if (div !== 'plain') coa.ordinary.t = isMetal(t1) && isMetal(t2) ? 'sable' : pick(r, METALS);
  }
  if (!complex && (r() < 0.7 || (!coa.ordinary && div === 'plain'))) {
    const pool = POOLS[religionFamily] ?? POOLS.christian;
    const counts: (1 | 2 | 3)[] = [1, 1, 1, 2, 3];
    let t: Tincture = contrast();
    if (div !== 'plain') t = isMetal(t1) && isMetal(t2) ? 'sable' : pick(r, METALS);
    if (coa.ordinary && coa.ordinary.type !== 'chief' && coa.ordinary.type !== 'bordure') {
      // keep charges off busy ordinaries: small count
      coa.charge = { kind: pick(r, pool), t, count: 1 };
      if (coa.ordinary.type === 'cross' || coa.ordinary.type === 'saltire') delete coa.charge;
    } else coa.charge = { kind: pick(r, pool), t, count: pick(r, counts) };
  }
  return coa;
}

// ── SVG rendering (viewBox 0 0 100 120, heater shield)

export const SHIELD_PATH = 'M4 4 H96 V52 C96 86 74 106 50 116 C26 106 4 86 4 52 Z';

let uid = 0;

function divisionSvg(c: CoA): string {
  const a = TINCTURES[c.t1],
    b = TINCTURES[c.t2];
  switch (c.div) {
    case 'plain':
      return `<rect width="100" height="120" fill="${a}"/>`;
    case 'per_pale':
      return `<rect width="100" height="120" fill="${a}"/><rect x="50" width="50" height="120" fill="${b}"/>`;
    case 'per_fess':
      return `<rect width="100" height="120" fill="${a}"/><rect y="56" width="100" height="64" fill="${b}"/>`;
    case 'per_bend':
      return `<rect width="100" height="120" fill="${a}"/><path d="M0 0 L100 120 L0 120 Z" fill="${b}"/>`;
    case 'per_saltire':
      return `<rect width="100" height="120" fill="${a}"/><path d="M0 0 L50 60 L0 120 Z M100 0 L50 60 L100 120 Z" fill="${b}"/>`;
    case 'quarterly':
      return `<rect width="100" height="120" fill="${a}"/><rect x="50" width="50" height="56" fill="${b}"/><rect y="56" width="50" height="64" fill="${b}"/>`;
    case 'gyronny':
      return `<rect width="100" height="120" fill="${a}"/><path d="M50 56 L50 0 L100 0 Z M50 56 L100 56 L100 120 Z M50 56 L50 120 L0 120 Z M50 56 L0 56 L0 0 Z" fill="${b}"/>`;
    case 'paly':
      return `<rect width="100" height="120" fill="${a}"/>${[1, 3, 5, 7].map((i) => `<rect x="${i * 12.5}" width="12.5" height="120" fill="${b}"/>`).join('')}`;
    case 'barry':
      return `<rect width="100" height="120" fill="${a}"/>${[1, 3, 5, 7].map((i) => `<rect y="${i * 15}" width="100" height="15" fill="${b}"/>`).join('')}`;
    case 'bendy':
      return `<rect width="100" height="120" fill="${a}"/><g transform="rotate(40 50 60)">${[-3, -1, 1, 3].map((i) => `<rect x="-60" y="${60 + i * 14}" width="220" height="14" fill="${b}"/>`).join('')}</g>`;
    case 'chequy': {
      let s = `<rect width="100" height="120" fill="${a}"/>`;
      for (let y = 0; y < 6; y++)
        for (let x = 0; x < 5; x++)
          if ((x + y) % 2) s += `<rect x="${x * 20}" y="${y * 20}" width="20" height="20" fill="${b}"/>`;
      return s;
    }
  }
}

function ordinarySvg(o: NonNullable<CoA['ordinary']>): string {
  const f = TINCTURES[o.t];
  switch (o.type) {
    case 'cross':
      return `<rect x="40" width="20" height="120" fill="${f}"/><rect y="40" width="100" height="20" fill="${f}"/>`;
    case 'nordic_cross':
      return `<rect x="28" width="18" height="120" fill="${f}"/><rect y="42" width="100" height="18" fill="${f}"/>`;
    case 'saltire':
      return `<g fill="${f}"><path d="M-6 6 L6 -6 L106 114 L94 126 Z"/><path d="M106 6 L94 -6 L-6 114 L6 126 Z"/></g>`;
    case 'bend':
      return `<path d="M-4 10 L10 -4 L104 110 L90 124 Z" fill="${f}"/>`;
    case 'chevron':
      return `<path d="M0 86 L50 36 L100 86 L100 106 L50 56 L0 106 Z" fill="${f}"/>`;
    case 'pale':
      return `<rect x="36" width="28" height="120" fill="${f}"/>`;
    case 'fess':
      return `<rect y="42" width="100" height="26" fill="${f}"/>`;
    case 'chief':
      return `<rect width="100" height="30" fill="${f}"/>`;
    case 'bordure':
      return `<path d="${SHIELD_PATH}" fill="none" stroke="${f}" stroke-width="14"/>`;
  }
}

function geometric(kind: Geometric, fill: string, id: string): string {
  switch (kind) {
    case 'mullet': {
      const pts: string[] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 === 0 ? 240 : 100;
        pts.push(`${(256 + r * Math.cos(a)).toFixed(1)},${(270 + r * Math.sin(a)).toFixed(1)}`);
      }
      return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`;
    }
    case 'roundel':
      return `<circle cx="256" cy="256" r="190" fill="${fill}"/>`;
    case 'lozenge':
      return `<path d="M256 40 L420 256 L256 472 L92 256 Z" fill="${fill}"/>`;
    case 'cross_pattee':
      return `<path fill="${fill}" d="M206 60 H306 L286 206 L452 186 V326 L286 306 L306 452 H206 L226 306 L60 326 V186 L226 206 Z"/>`;
    case 'double_eagle':
      return `<defs><clipPath id="${id}h"><rect width="256" height="512"/></clipPath></defs><g fill="${fill}"><g clip-path="url(#${id}h)">${ICONS['eagle-emblem']}</g><g transform="translate(512 0) scale(-1 1)" clip-path="url(#${id}h)">${ICONS['eagle-emblem']}</g></g>`;
  }
}

function chargeGlyph(kind: ChargeKind, fill: string, id: string): string {
  if (kind in ICONS) return `<g fill="${fill}">${ICONS[kind as IconName]}</g>`;
  return geometric(kind as Geometric, fill, id);
}

function chargesSvg(ch: NonNullable<CoA['charge']>, ordinary: CoA['ordinary'], id: string): string {
  const fill = TINCTURES[ch.t];
  const g = chargeGlyph(ch.kind, fill, id);
  const top = ordinary?.type === 'chief' ? 34 : 8;
  // Some glyphs are drawn diagonally in the source set; stand them upright.
  const baseRot = ch.kind === 'trident' ? -135 : 0;
  const place = (cx: number, cy: number, size: number, rot = 0) =>
    `<g transform="translate(${cx - size / 2} ${cy - size / 2}) rotate(${rot + baseRot} ${size / 2} ${size / 2}) scale(${size / 512})">${g}</g>`;
  if (ch.crossed) return place(50, 58, 62, -32) + place(50, 58, 62, 32);
  switch (ch.count) {
    case 1:
      return place(
        50,
        top + (108 - top) / 2 - 2,
        ordinary && ordinary.type !== 'chief' && ordinary.type !== 'bordure' ? 44 : 70,
      );
    case 2:
      return ch.inPale ? place(50, 34, 38) + place(50, 74, 38) : place(30, 54, 36) + place(70, 54, 36);
    case 3:
      return ch.inPale
        ? place(50, 24, 30) + place(50, 56, 30) + place(50, 88, 30)
        : place(29, top + 22, 32) + place(71, top + 22, 32) + place(50, top + 62, 32);
    case 4:
      return place(29, 32, 30) + place(71, 32, 30) + place(29, 72, 30) + place(71, 72, 30);
    case 6:
      return [
        [22, 24],
        [50, 24],
        [78, 24],
        [33, 54],
        [67, 54],
        [50, 84],
      ]
        .map(([x, y]) => place(x, y, 22))
        .join('');
  }
}

/** The field, ordinary and charges of a coat of arms, in the 100×120 shield box. */
export function armsBody(c: CoA, id: string): string {
  return (
    divisionSvg(c) +
    (c.ordinary ? ordinarySvg(c.ordinary) : '') +
    (c.charge ? chargesSvg(c.charge, c.ordinary, id) : '')
  );
}

/** A charge drawn in a box of the given size centred on (cx, cy). */
export function chargeAt(kind: ChargeKind, fill: string, cx: number, cy: number, size: number, id: string): string {
  const g = chargeGlyph(kind, fill, id);
  const rot = kind === 'trident' ? -135 : 0;
  return `<g transform="translate(${cx - size / 2} ${cy - size / 2}) rotate(${rot} ${size / 2} ${size / 2}) scale(${size / 512})">${g}</g>`;
}

export function nextId(prefix: string): string {
  return `${prefix}${++uid}`;
}

/** Full SVG markup for a coat of arms on a heater shield. */
export function coaSvg(c: CoA, size = 64): string {
  const id = `coa${++uid}`;
  const body = armsBody(c, id);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120" width="${size}" height="${size * 1.2}">
<defs><clipPath id="${id}"><path d="${SHIELD_PATH}"/></clipPath>
<linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.28"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.3"/></linearGradient></defs>
<g clip-path="url(#${id})">${body}<rect width="100" height="120" fill="url(#${id}g)"/></g>
<path d="${SHIELD_PATH}" fill="none" stroke="#2a2018" stroke-width="3"/>
<path d="${SHIELD_PATH}" fill="none" stroke="#e3c27a" stroke-opacity="0.45" stroke-width="1" transform="translate(50 60) scale(0.93) translate(-50 -60)"/>
</svg>`;
}
