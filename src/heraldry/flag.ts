/**
 * From arms to flags. A realm shows its coat of arms on a shield until the early modern age, then as
 * a banner of arms, and from the industrial age on as a national flag, drawn from its arms and shaped
 * by its government: tricolours for republics, the red star for communists, a Nordic cross in the
 * north, the crescent in Muslim lands. A few great realms have the flags history gave them.
 */
import type { Government } from '../shared/dataTypes';
import { armsBody, chargeAt, isMetal, nextId, TINCTURES, type ChargeKind, type CoA, type Tincture } from './coa';

export type EmblemStyle = 'shield' | 'banner' | 'flag';

/** How a realm of an era shows itself. */
export function emblemStyle(era: number): EmblemStyle {
  return era >= 3 ? 'flag' : era === 2 ? 'banner' : 'shield';
}

export type FlagLayout =
  | 'plain'
  | 'tricolor_v'
  | 'tricolor_h'
  | 'bicolor_h'
  | 'bicolor_v'
  | 'cross'
  | 'saltire'
  | 'nordic'
  | 'canton'
  | 'union';

export interface FlagSpec {
  layout: FlagLayout;
  /** hex colours: the field (and stripes), then the cross or canton */
  colors: string[];
  /** a white or coloured border to a Nordic cross */
  fimbriation?: string;
  emblem?: { kind: ChargeKind; fill: string; disc?: string; size?: number };
}

const T = TINCTURES;
const RED = '#c8102e';
const GOLD = '#f2c230';

/** Flags history gave to a few great realms, by form of government. */
const CURATED: Record<string, { monarchy: FlagSpec; republic?: FlagSpec }> = {
  ENG: { monarchy: { layout: 'cross', colors: ['#ffffff', RED] } },
  SCO: { monarchy: { layout: 'saltire', colors: ['#005eb8', '#ffffff'] } },
  FRA: {
    monarchy: { layout: 'plain', colors: ['#ffffff'], emblem: { kind: 'fleur-de-lys', fill: '#c9a227', size: 46 } },
    republic: { layout: 'tricolor_v', colors: ['#0055a4', '#ffffff', '#ef4135'] },
  },
  HRE: { monarchy: { layout: 'tricolor_h', colors: ['#1a1a1a', '#dd0000', '#ffce00'] } },
  CAS: { monarchy: { layout: 'tricolor_h', colors: ['#aa151b', '#f1bf00', '#aa151b'] } },
  POL: { monarchy: { layout: 'bicolor_h', colors: ['#ffffff', '#dc143c'] } },
  HUN: { monarchy: { layout: 'tricolor_h', colors: ['#cd2a3e', '#ffffff', '#436f4d'] } },
  RUS: { monarchy: { layout: 'tricolor_h', colors: ['#ffffff', '#0039a6', '#d52b1e'] } },
  DEN: { monarchy: { layout: 'nordic', colors: ['#c8102e', '#ffffff'] } },
  SWE: { monarchy: { layout: 'nordic', colors: ['#006aa7', '#fecc00'] } },
  NRW: { monarchy: { layout: 'nordic', colors: ['#ba0c2f', '#00205b'], fimbriation: '#ffffff' } },
  VEN: { monarchy: { layout: 'plain', colors: ['#9b1b1f'], emblem: { kind: 'lion', fill: GOLD, size: 56 } } },
  PAP: { monarchy: { layout: 'bicolor_v', colors: ['#ffe000', '#ffffff'] } },
  BYZ: { monarchy: { layout: 'plain', colors: ['#5b2270'], emblem: { kind: 'double_eagle', fill: GOLD, size: 64 } } },
  // Nations proclaimed in the game (see data/nations.ts).
  ESP: { monarchy: { layout: 'tricolor_h', colors: ['#aa151b', '#f1bf00', '#aa151b'] } },
  GBR: { monarchy: { layout: 'union', colors: ['#012169', '#ffffff', RED] } },
  ITA: { monarchy: { layout: 'tricolor_v', colors: ['#009246', '#ffffff', '#ce2b37'] } },
  DEU: {
    monarchy: { layout: 'tricolor_h', colors: ['#1a1a1a', '#ffffff', '#dd0000'] },
    republic: { layout: 'tricolor_h', colors: ['#1a1a1a', '#dd0000', '#ffce00'] },
  },
  TSR: { monarchy: { layout: 'tricolor_h', colors: ['#ffffff', '#0039a6', '#d52b1e'] } },
  ROM: { monarchy: { layout: 'plain', colors: ['#5e1a2c'], emblem: { kind: 'eagle-emblem', fill: GOLD, size: 60 } } },
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const REPUBLICAN = new Set<Government>(['democracy', 'republic', 'constitutional']);

/** The third colour of a tricolour: a metal if the arms have none, else another colour. */
function third(coa: CoA, a: Tincture, b: Tincture): Tincture {
  const used = new Set([a, b]);
  const pool: Tincture[] = isMetal(a) || isMetal(b) ? ['gules', 'azure', 'vert', 'sable'] : ['argent', 'or'];
  const c = coa.charge?.t && !used.has(coa.charge.t) ? coa.charge.t : pool.find((t) => !used.has(t))!;
  return c;
}

/** A realm's national flag. */
export function flagOf(tag: string, coa: CoA, gov: Government, cultureGroup: string, faithFamily: string): FlagSpec {
  const curated = CURATED[tag];
  if (curated && gov !== 'communist')
    return (REPUBLICAN.has(gov) && gov !== 'constitutional' && curated.republic) || curated.monarchy;
  const h = hash(tag);
  const field = T[coa.t1];
  const metal: Tincture = coa.charge && isMetal(coa.charge.t) ? coa.charge.t : isMetal(coa.t1) ? 'sable' : 'argent';
  const emblem = coa.charge ? { kind: coa.charge.kind, fill: T[coa.charge.t] } : undefined;
  if (gov === 'communist') return { layout: 'canton', colors: [RED, GOLD], emblem: { kind: 'mullet', fill: GOLD } };
  if (gov === 'dictatorship')
    return {
      layout: 'plain',
      colors: [field],
      emblem: { kind: coa.charge?.kind ?? 'mullet', fill: '#1a1a1a', disc: '#ffffff', size: 40 },
    };
  if (cultureGroup === 'norse' || cultureGroup === 'finno_ugric')
    return { layout: 'nordic', colors: [field, T[metal]], fimbriation: h % 3 === 0 ? '#ffffff' : undefined };
  if (faithFamily === 'islamic')
    return {
      layout: 'plain',
      colors: [coa.t1 === 'vert' || h % 2 ? T.vert : RED],
      emblem: { kind: 'moon', fill: '#ffffff', size: 50 },
    };
  if (REPUBLICAN.has(gov)) {
    const a = coa.t1,
      b = coa.t2 !== coa.t1 ? coa.t2 : metal;
    const c = third(coa, a, b);
    const spec: FlagSpec = { layout: h % 2 ? 'tricolor_v' : 'tricolor_h', colors: [T[a], T[b], T[c]] };
    if (gov === 'constitutional' && emblem) spec.emblem = { ...emblem, fill: T[isMetal(b) ? 'sable' : 'or'], size: 34 };
    return spec;
  }
  // Monarchies fly their arms' colours with the charge at the centre.
  return {
    layout: h % 3 === 0 ? 'bicolor_h' : 'plain',
    colors: [field, T[coa.t2 !== coa.t1 ? coa.t2 : metal]],
    emblem: emblem && { ...emblem, size: 52 },
  };
}

/** SVG markup for a flag, 3:2, `width` px wide. */
export function flagSvg(f: FlagSpec, width = 60): string {
  const id = nextId('flag');
  const [a, b, c] = f.colors;
  let body = '';
  switch (f.layout) {
    case 'plain':
      body = `<rect width="150" height="100" fill="${a}"/>`;
      break;
    case 'tricolor_v':
      body = `<rect width="50" height="100" fill="${a}"/><rect x="50" width="50" height="100" fill="${b}"/><rect x="100" width="50" height="100" fill="${c}"/>`;
      break;
    case 'tricolor_h':
      body = `<rect width="150" height="34" fill="${a}"/><rect y="33" width="150" height="34" fill="${b}"/><rect y="66" width="150" height="34" fill="${c}"/>`;
      break;
    case 'bicolor_h':
      body = `<rect width="150" height="50" fill="${a}"/><rect y="50" width="150" height="50" fill="${b}"/>`;
      break;
    case 'bicolor_v':
      body = `<rect width="75" height="100" fill="${a}"/><rect x="75" width="75" height="100" fill="${b}"/>`;
      break;
    case 'cross':
      body = `<rect width="150" height="100" fill="${a}"/><rect x="63" width="24" height="100" fill="${b}"/><rect y="38" width="150" height="24" fill="${b}"/>`;
      break;
    case 'saltire':
      body = `<rect width="150" height="100" fill="${a}"/><g stroke="${b}" stroke-width="18"><path d="M0 0 L150 100 M150 0 L0 100"/></g>`;
      break;
    case 'nordic': {
      const cross = (w: number, fill: string) =>
        `<rect x="${55 - w / 2}" width="${w}" height="100" fill="${fill}"/><rect y="${50 - w / 2}" width="150" height="${w}" fill="${fill}"/>`;
      body = `<rect width="150" height="100" fill="${a}"/>${f.fimbriation ? cross(26, f.fimbriation) : ''}${cross(f.fimbriation ? 14 : 18, b)}`;
      break;
    }
    case 'canton':
      body = `<rect width="150" height="100" fill="${a}"/>`;
      break;
    case 'union':
      // Crosses of saints laid over one another: a white saltire, a red one, and a red cross fimbriated white.
      body =
        `<rect width="150" height="100" fill="${a}"/>` +
        `<g stroke="${b}" stroke-width="20"><path d="M0 0 L150 100 M150 0 L0 100"/></g>` +
        `<g stroke="${c}" stroke-width="7"><path d="M0 0 L150 100 M150 0 L0 100"/></g>` +
        `<rect x="58" width="34" height="100" fill="${b}"/><rect y="33" width="150" height="34" fill="${b}"/>` +
        `<rect x="64" width="22" height="100" fill="${c}"/><rect y="39" width="150" height="22" fill="${c}"/>`;
      break;
  }
  if (f.emblem) {
    const e = f.emblem;
    const inCanton = f.layout === 'canton';
    const [cx, cy, size] = inCanton ? [30, 26, 30] : [75, 50, e.size ?? 44];
    if (e.disc) body += `<circle cx="${cx}" cy="${cy}" r="${size * 0.62}" fill="${e.disc}"/>`;
    body += chargeAt(e.kind, e.fill, cx, cy, size, id);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 100" width="${width}" height="${(width * 2) / 3}">
<defs><clipPath id="${id}"><rect width="150" height="100" rx="3"/></clipPath>
<linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0.12"/><stop offset="0.35" stop-color="#000" stop-opacity="0.06"/><stop offset="0.7" stop-color="#fff" stop-opacity="0.1"/><stop offset="1" stop-color="#000" stop-opacity="0.18"/></linearGradient></defs>
<g clip-path="url(#${id})">${body}<rect width="150" height="100" fill="url(#${id}g)"/></g>
<rect x="0.75" y="0.75" width="148.5" height="98.5" rx="3" fill="none" stroke="#1a1410" stroke-opacity="0.7" stroke-width="1.5"/>
</svg>`;
}

/** The arms on a rectangular banner, as carried before a regiment. Same box as the shield. */
export function bannerSvg(coa: CoA, size = 64): string {
  const id = nextId('banner');
  const edge = 'M8 4 H92 V104 L50 116 L8 104 Z';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120" width="${size}" height="${size * 1.2}">
<defs><clipPath id="${id}"><path d="${edge}"/></clipPath>
<linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0.18"/><stop offset="0.5" stop-color="#000" stop-opacity="0.08"/><stop offset="1" stop-color="#000" stop-opacity="0.25"/></linearGradient></defs>
<g clip-path="url(#${id})">${armsBody(coa, id)}<rect width="100" height="120" fill="url(#${id}g)"/></g>
<path d="${edge}" fill="none" stroke="#2a2018" stroke-width="3"/>
<rect x="2" y="1" width="96" height="4" rx="2" fill="#c9a24e"/>
</svg>`;
}
