/**
 * Nations that a realm may proclaim once it holds their heartland: Spain, Great Britain, Italy,
 * Germany and Russia, and the Roman Empire restored. Provinces are named as on the map; a realm
 * needs `need` of them, held by itself or its vassals.
 */
import type { IconName } from '../assets/icons';
import type { Rank } from '../shared/dataTypes';

export interface NationDef {
  id: string;
  tag: string;
  name: string;
  short: string;
  adj: string;
  rank: Rank;
  icon: IconName;
  blurb: string;
  /** cultures whose realms may proclaim it (any, if not given) */
  cultures?: string[];
  /** faith families whose realms may proclaim it (any, if not given) */
  families?: string[];
  /** the heartland, by province name */
  provinces: string[];
  /** how many of them must be held */
  need: number;
  /** not before this year */
  from?: number;
  /** nor before the realm knows this */
  tech?: string;
  /** the rest of the nation: land of its cultures within this circle is claimed ([lon, lat, km]) */
  lands?: [number, number, number];
}

export const NATIONS: NationDef[] = [
  {
    id: 'spain',
    tag: 'ESP',
    name: 'Kingdom of Spain',
    short: 'Spain',
    adj: 'Spanish',
    rank: 'kingdom',
    icon: 'stone-tower',
    blurb: 'The crowns of Castile, León and Aragon united in one monarchy, from the Pyrenees to Gibraltar.',
    cultures: ['castilian', 'leonese', 'galician', 'aragonese', 'catalan', 'basque'],
    provinces: [
      'Toledo',
      'Burgos',
      'León',
      'Zaragoza',
      'Seville',
      'Valencia',
      'Córdoba',
      'Granada',
      'Barcelona',
      'Murcia',
    ],
    need: 7,
    from: 1450,
    lands: [-4, 40, 620],
  },
  {
    id: 'britain',
    tag: 'GBR',
    name: 'Kingdom of Great Britain',
    short: 'Great Britain',
    adj: 'British',
    rank: 'kingdom',
    icon: 'crown',
    blurb: 'England and Scotland joined under one crown and one parliament: the whole island of Britain.',
    cultures: ['english', 'scottish', 'welsh', 'cornish', 'norman'],
    provinces: ['London', 'York', 'Bristol', 'Norwich', 'Edinburgh', 'Glasgow', 'Aberdeen', 'Inverness', 'Cardiff'],
    need: 7,
    from: 1600,
    lands: [-3, 54.5, 520],
  },
  {
    id: 'italy',
    tag: 'ITA',
    name: 'Kingdom of Italy',
    short: 'Italy',
    adj: 'Italian',
    rank: 'kingdom',
    icon: 'laurel-crown',
    blurb: 'The peoples of the peninsula, divided since the fall of Rome, made one nation at last.',
    cultures: ['italian', 'lombard', 'sardinian'],
    provinces: ['Rome', 'Milan', 'Venice', 'Naples', 'Turin', 'Genoa', 'Bologna', 'Pisa', 'Palermo', 'Bari', 'Ancona'],
    need: 8,
    tech: 'nationalism',
    lands: [12.5, 42.5, 650],
  },
  {
    id: 'germany',
    tag: 'DEU',
    name: 'German Empire',
    short: 'Germany',
    adj: 'German',
    rank: 'empire',
    icon: 'eagle-emblem',
    blurb: 'The German lands bound into one empire, by blood and iron or by the will of the people.',
    cultures: ['german', 'saxon', 'frisian'],
    provinces: ['Frankfurt', 'Munich', 'Hamburg', 'Stuttgart', 'Leipzig', 'Berlin', 'Cologne'],
    need: 6,
    tech: 'nationalism',
    lands: [10.5, 51, 480],
  },
  {
    id: 'russia',
    tag: 'TSR',
    name: 'Tsardom of Russia',
    short: 'Russia',
    adj: 'Russian',
    rank: 'empire',
    icon: 'bear-head',
    blurb: 'The lands of the Rus gathered under one Tsar, heir of Byzantium: the Third Rome.',
    cultures: ['russian', 'ruthenian'],
    provinces: ['Moscow', 'Novgorod', 'Smolensk', 'Tver', 'Ryazan', 'Pskov', 'Yaroslavl', 'Rostov', 'Kiev'],
    need: 7,
    from: 1450,
    lands: [37, 56, 900],
  },
  {
    id: 'rome',
    tag: 'ROM',
    name: 'Roman Empire',
    short: 'Rome',
    adj: 'Roman',
    rank: 'empire',
    icon: 'imperial-crown',
    blurb: 'The empire of the Caesars restored: Rome and Constantinople, and the shores of the middle sea.',
    families: ['christian'],
    provinces: [
      'Rome',
      'Constantinople',
      'Alexandria',
      'Antioch',
      'Jerusalem',
      'Athens',
      'Tunis',
      'Ravenna',
      'Thessaloniki',
      'Marseille',
    ],
    need: 8,
  },
];

export const NATION_BY_ID: Record<string, NationDef> = Object.fromEntries(NATIONS.map((n) => [n.id, n]));
