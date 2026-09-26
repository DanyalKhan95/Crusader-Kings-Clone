/**
 * Faith: holy sites, heads of faith, great holy wars and heresies. Holy sites are named provinces of
 * the map; heresies are faiths the map data does not know, and so carry their own colours.
 */

/** Holy sites by faith, as province names on the map. */
export const HOLY_SITES: Record<string, string[]> = {
  catholic: ['Jerusalem', 'Rome', 'Santiago', 'Constantinople', 'Antioch'],
  orthodox: ['Jerusalem', 'Constantinople', 'Antioch', 'Alexandria', 'Kiev'],
  miaphysite: ['Jerusalem', 'Alexandria', 'Antioch'],
  nestorian: ['Jerusalem', 'Baghdad', 'Antioch'],
  sunni: ['Mecca', 'Medina', 'Jerusalem', 'Damascus', 'Baghdad'],
  shia: ['Mecca', 'Medina', 'Kufa', 'Jerusalem'],
  ismaili: ['Mecca', 'Medina', 'Cairo', 'Jerusalem'],
  ibadi: ['Mecca', 'Medina'],
  jewish: ['Jerusalem'],
  zoroastrian: ['South-East Yazd'],
  hindu: ['Varanasi', 'Dhara', 'Bhubaneswar'],
  jain: ['Dhara', 'Varanasi'],
  theravada: ['Anuradhapura', 'Pataliputra'],
  mahayana: ['Pataliputra', 'Taian'],
  vajrayana: ['Lhasa', 'Pataliputra'],
  shinto: ['Heian-kyō'],
  confucian: ['Taian'],
  norse: ['Uppsala'],
};

/** Heads of faith: the realm that holds the office. */
export const FAITH_HEADS: Record<string, { tag: string; title: string }> = {
  catholic: { tag: 'PAP', title: 'the Pope' },
  orthodox: { tag: 'BYZ', title: 'the Ecumenical Patriarch' },
  sunni: { tag: 'ABB', title: 'the Caliph' },
  ismaili: { tag: 'FAT', title: 'the Imam-Caliph' },
};

/** Faith families that wage holy wars on unbelievers. */
export const HOLY_WAR_FAMILIES = new Set(['christian', 'islamic']);

/** Families a pagan realm may convert to. */
export const MAJOR_FAMILIES = new Set(['christian', 'islamic', 'buddhist', 'dharmic']);

export interface GreatHolyWarDef {
  name: string;
  /** the faith whose head calls it */
  faith: string;
  /** faiths whose realms are called to join */
  called: string[];
  /** the holy site it aims to free */
  site: string;
  /** not before this year */
  from: number;
  /** nor after this one: the age of the great holy wars passes */
  until: number;
  /** monthly chance that the head calls it, once free to */
  chance: number;
  /** a realm founded in the land won; without one, the land goes to the leader */
  kingdom?: { tag: string; name: string; short: string; adj: string; color: string };
}

export const GREAT_HOLY_WARS: GreatHolyWarDef[] = [
  {
    name: 'Crusade',
    faith: 'catholic',
    called: ['catholic'],
    site: 'Jerusalem',
    from: 1090,
    // The last Holy League against the Turk made its peace at Karlowitz in 1699.
    until: 1700,
    chance: 1 / 36,
    kingdom: { tag: 'JER', name: 'Kingdom of Jerusalem', short: 'Jerusalem', adj: 'Jerusalemite', color: '#d8cfa8' },
  },
  { name: 'Jihad', faith: 'sunni', called: ['sunni'], site: 'Jerusalem', from: 1066, until: 1700, chance: 1 / 180 },
];
/** How far from the holy city the land won in a great holy war reaches, in km. */
export const HOLY_LAND_KM = 400;

/** Years between two great holy wars of one faith. */
export const HOLY_WAR_INTERVAL = 25;

export interface HeresyDef {
  name: string;
  parent: string;
  family: string;
  color: string;
  /** first year it may appear */
  from: number;
  /** where it may first appear: [lon, lat, radius in km] */
  cradle: [number, number, number];
  /** how many times faster than an ordinary heresy it spreads */
  vigour?: number;
  /** false for a faith that never rises by itself: a crown founds it (see data/events.ts) */
  spawn?: boolean;
  /** from this year it spreads no more across borders, only within realms that follow it */
  settles?: number;
}

export const HERESIES: Record<string, HeresyDef> = {
  bogomil: {
    name: 'Bogomil',
    parent: 'orthodox',
    family: 'christian',
    color: '#b68fd6',
    from: 1066,
    cradle: [24.5, 42.5, 450],
  },
  druze: {
    name: 'Druze',
    parent: 'ismaili',
    family: 'islamic',
    color: '#9ecfac',
    from: 1066,
    cradle: [35.7, 33.6, 250],
  },
  nizari: {
    name: 'Nizari',
    parent: 'ismaili',
    family: 'islamic',
    color: '#3d8f6a',
    from: 1094,
    cradle: [50.0, 36.3, 700],
  },
  cathar: {
    name: 'Cathar',
    parent: 'catholic',
    family: 'christian',
    color: '#efe3b0',
    from: 1140,
    cradle: [2.3, 43.5, 450],
  },
  waldensian: {
    name: 'Waldensian',
    parent: 'catholic',
    family: 'christian',
    color: '#c7ae6e',
    from: 1175,
    cradle: [6.0, 45.2, 450],
  },
  lollard: {
    name: 'Lollard',
    parent: 'catholic',
    family: 'christian',
    color: '#d6c47e',
    from: 1380,
    cradle: [-1.3, 52.2, 400],
  },
  hussite: {
    name: 'Hussite',
    parent: 'catholic',
    family: 'christian',
    color: '#b3934c',
    from: 1415,
    cradle: [14.4, 50.0, 350],
  },
  // The Reformation: Luther's theses at Wittenberg, Calvin's Geneva, and the King's Great Matter.
  protestant: {
    name: 'Protestant',
    parent: 'catholic',
    family: 'christian',
    color: '#6f93d6',
    from: 1517,
    cradle: [12.6, 51.9, 450],
    vigour: 2,
    // The Peace of Westphalia: the ruler's faith is the realm's.
    settles: 1648,
  },
  reformed: {
    name: 'Reformed',
    parent: 'catholic',
    family: 'christian',
    color: '#4d7a8c',
    from: 1536,
    cradle: [6.1, 46.2, 400],
    vigour: 1.5,
    settles: 1648,
  },
  anglican: {
    name: 'Anglican',
    parent: 'catholic',
    family: 'christian',
    color: '#c0566f',
    from: 1527,
    cradle: [-0.2, 51.5, 300],
    spawn: false,
    settles: 1648,
  },
};

/** Tax and levy penalties of a province of another faith, by religious policy: [sister faith, other family]. */
export const FAITH_PENALTY: [number, number][] = [
  [0.15, 0.35],
  [0.1, 0.25],
  [0.05, 0.12],
];
/** By religious policy: how much strife angers the commons, how fast conversion goes, what the clergy think. */
export const STRIFE = [1.5, 1, 0.5];
export const CONVERSION_SPEED = [1.5, 1, 0.5];
export const TOLERANCE_CLERGY = [10, 0, -15];
