/** The six eras of the game, and which levels of each technology track belong to them. */

export type EraId = 'medieval' | 'renaissance' | 'early_modern' | 'industrial' | 'modern' | 'contemporary';

export interface EraDef {
  id: EraId;
  name: string;
  /** the year the era begins in history */
  from: number;
  /** the first technology level of the era, in every track */
  firstLevel: number;
  blurb: string;
}

export const ERAS: EraDef[] = [
  {
    id: 'medieval',
    name: 'Medieval',
    from: 1066,
    firstLevel: 1,
    blurb: 'Castles and knights, manors and guilds, cathedrals and crusades.',
  },
  {
    id: 'renaissance',
    name: 'Renaissance',
    from: 1450,
    firstLevel: 7,
    blurb: 'Printing and banking, pike and shot, and princes who patronise the arts.',
  },
  {
    id: 'early_modern',
    name: 'Early modern',
    from: 1600,
    firstLevel: 12,
    blurb: 'Standing armies, absolute kings, stock exchanges and the new sciences.',
  },
  {
    id: 'industrial',
    name: 'Industrial',
    from: 1780,
    firstLevel: 18,
    blurb: 'Steam and railways, factories and rifles, nations and mass schooling.',
  },
  {
    id: 'modern',
    name: 'Modern',
    from: 1900,
    firstLevel: 24,
    blurb: 'Machine guns and tanks, aircraft and radio, mass politics and total war.',
  },
  {
    id: 'contemporary',
    name: 'Contemporary',
    from: 1970,
    firstLevel: 30,
    blurb: 'Computers and missiles, global markets and the information age.',
  },
];

/** Levels in each technology track. */
export const MAX_TECH = 33;

/** The era a technology level belongs to, as an index into ERAS (level 0 counts as medieval). */
export function eraOfLevel(level: number): number {
  let e = 0;
  for (let i = 0; i < ERAS.length; i++) if (level >= ERAS[i].firstLevel) e = i;
  return e;
}
