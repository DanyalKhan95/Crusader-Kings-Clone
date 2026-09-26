/**
 * Technology: three tracks of 33 levels, researched in order. Each level has a year: researching it
 * earlier costs more, later costs less, and neighbours who know it make it cheaper still. Effects add
 * up along each track; some levels unlock building levels, governments or a new arm of the army.
 */
import type { Government } from '../shared/dataTypes';
import type { BuildingType, UnitType } from '../sim/types';
import { MAX_TECH } from './eras';

export type TechTrack = 'economy' | 'military' | 'society';
export const TECH_TRACKS: TechTrack[] = ['economy', 'military', 'society'];

export const TRACK_INFO: Record<TechTrack, { name: string; blurb: string }> = {
  economy: { name: 'Economy', blurb: 'Farming, trade and industry: taxes, growth and the buildings that bring them.' },
  military: {
    name: 'Military',
    blurb: 'Weapons, fortifications and the art of war: every arm of the army modernises.',
  },
  society: { name: 'Society', blurb: 'Learning, law and government: legitimacy, the faith and new forms of rule.' },
};

export interface TechEffects {
  /** fraction added to taxes */
  tax?: number;
  /** fraction added to levies */
  levy?: number;
  /** fraction added to the chance of development growth */
  growth?: number;
  /** fraction taken off the interest on loans */
  interest?: number;
  /** fraction added to supply */
  supply?: number;
  /** fraction added to research */
  research?: number;
  /** fraction added to the damage armies deal */
  combat?: number;
  /** added to the monthly recovery of morale (fraction of full) */
  morale?: number;
  /** fraction added to siege progress */
  siege?: number;
  /** fraction taken off the upkeep of men-at-arms */
  upkeep?: number;
  /** points added to the legitimacy target */
  legitimacy?: number;
  /** fraction added to conversion */
  conversion?: number;
  /** fraction added to assimilation */
  assimilation?: number;
  /** cultures more that may be accepted */
  acceptSlots?: number;
  /** points added to the loyalty of the commons */
  commons?: number;
}

export type TechEffectKey = keyof TechEffects;

export interface TechDef {
  id: string;
  track: TechTrack;
  /** 1 … 33 */
  level: number;
  name: string;
  /** when history reached it */
  year: number;
  blurb: string;
  effects?: TechEffects;
  /** a building level it allows */
  building?: [BuildingType, number];
  /** a form of government it allows */
  government?: Government;
  /** a new arm of the army */
  unit?: UnitType;
  /** peoples who do not belong begin to want a state of their own */
  nationalism?: boolean;
}

type Row = [string, string, number, string, Omit<TechDef, 'id' | 'track' | 'level' | 'name' | 'year' | 'blurb'>?];

const ECONOMY: Row[] = [
  ['heavy_plough', 'Heavy plough', 800, 'Iron shares turn the heavy northern soils.', { effects: { growth: 0.1 } }],
  [
    'three_field',
    'Three-field rotation',
    900,
    'A third of the land rests each year, and the rest bears more.',
    { effects: { tax: 0.05 } },
  ],
  ['water_mills', 'Water mills', 1000, 'Rivers grind the grain and full the cloth.', { effects: { growth: 0.1 } }],
  [
    'guilds',
    'Guilds',
    1150,
    'Craftsmen band together to set standards, prices and apprenticeships.',
    { effects: { tax: 0.05 } },
  ],
  [
    'bills_of_exchange',
    'Bills of exchange',
    1250,
    'Paper that travels in place of silver.',
    { effects: { interest: 0.1 } },
  ],
  [
    'double_entry',
    'Double-entry bookkeeping',
    1340,
    'Every debit has its credit, and the ledgers balance.',
    { effects: { tax: 0.05 } },
  ],
  [
    'banking_houses',
    'Banking houses',
    1450,
    'Great families lend to kings and popes.',
    { effects: { interest: 0.1 }, building: ['market', 4] },
  ],
  [
    'blast_furnaces',
    'Blast furnaces',
    1480,
    'Cast iron in quantity: tools, pots and cannon.',
    { effects: { tax: 0.05 }, building: ['workshop', 4] },
  ],
  [
    'mercantilism',
    'Mercantilism',
    1520,
    'Sell more than you buy, and keep the gold at home.',
    { effects: { tax: 0.1 } },
  ],
  [
    'joint_stock',
    'Joint-stock companies',
    1570,
    'Many investors share the risk of a voyage, and its profits.',
    { effects: { tax: 0.05 }, building: ['port', 4] },
  ],
  [
    'enclosure',
    'Enclosure',
    1600,
    'Common fields are fenced into farms worked for profit.',
    { effects: { growth: 0.1 }, building: ['farms', 4] },
  ],
  [
    'central_bank',
    'Central banking',
    1665,
    'A bank of the realm lends to the crown at honest rates.',
    { effects: { interest: 0.15 } },
  ],
  [
    'agricultural_revolution',
    'Agricultural revolution',
    1700,
    'New crops, new rotations and bigger herds feed more mouths.',
    { effects: { growth: 0.15, levy: 0.05 } },
  ],
  [
    'canals',
    'Canals',
    1720,
    'Barges carry coal and grain where no river runs.',
    { effects: { tax: 0.05, supply: 0.1 } },
  ],
  ['stock_exchanges', 'Stock exchanges', 1745, 'Shares and bonds change hands every day.', { effects: { tax: 0.05 } }],
  [
    'cottage_industry',
    'Cottage industry',
    1760,
    'Merchants put out wool to spinners in every village.',
    { effects: { tax: 0.05, growth: 0.05 } },
  ],
  ['spinning_jenny', 'Spinning jenny', 1775, 'One spinner works eight spindles.', { effects: { tax: 0.05 } }],
  [
    'steam_power',
    'Steam power',
    1790,
    'Engines that never tire drive the mills.',
    { effects: { tax: 0.1 }, building: ['workshop', 5] },
  ],
  [
    'railways',
    'Railways',
    1830,
    'Iron roads bind the country into one market.',
    { effects: { supply: 0.2 }, building: ['market', 5] },
  ],
  [
    'steamships',
    'Steamships',
    1840,
    'Ships that sail against wind and tide.',
    { effects: { tax: 0.05 }, building: ['port', 5] },
  ],
  [
    'fertilisers',
    'Fertilisers',
    1850,
    'Guano and chemistry double the harvest.',
    { effects: { growth: 0.1 }, building: ['farms', 5] },
  ],
  ['bessemer_steel', 'Bessemer steel', 1860, 'Cheap steel for rails, ships and bridges.', { effects: { tax: 0.1 } }],
  ['electricity', 'Electricity', 1885, 'Power by wire, light by night.', { effects: { tax: 0.1, research: 0.05 } }],
  [
    'assembly_line',
    'Assembly line',
    1910,
    'Each worker does one task, and the line never stops.',
    { effects: { tax: 0.05 }, building: ['workshop', 6] },
  ],
  ['oil_industry', 'Oil industry', 1915, 'Petroleum fuels engines, ships and armies.', { effects: { tax: 0.1 } }],
  [
    'mechanised_farming',
    'Mechanised farming',
    1930,
    'Tractors and combines: a few farmers feed many.',
    { effects: { growth: 0.1 }, building: ['farms', 6] },
  ],
  [
    'keynesian',
    'Managed economy',
    1940,
    'The state spends to keep the factories turning.',
    { effects: { tax: 0.05, interest: 0.1 } },
  ],
  ['motorways', 'Motorways', 1955, 'Lorries and cars on roads of concrete.', { effects: { supply: 0.2, tax: 0.05 } }],
  [
    'container_shipping',
    'Container shipping',
    1960,
    'Standard boxes move the world’s goods.',
    { effects: { tax: 0.05 }, building: ['port', 6] },
  ],
  [
    'computers',
    'Computers',
    1975,
    'Machines that calculate faster than any clerk.',
    { effects: { research: 0.1, tax: 0.05 } },
  ],
  [
    'financial_markets',
    'Global finance',
    1985,
    'Capital flows across every border at the speed of light.',
    { effects: { tax: 0.05 }, building: ['market', 6] },
  ],
  [
    'internet',
    'The Internet',
    1995,
    'Every library and market in every home.',
    { effects: { research: 0.1, tax: 0.1 } },
  ],
  [
    'green_energy',
    'Green energy',
    2020,
    'Sun and wind power a cleaner economy.',
    { effects: { tax: 0.1, growth: 0.1 } },
  ],
];

const MILITARY: Row[] = [
  [
    'stirrups',
    'Stirrups',
    800,
    'A rider who cannot be unhorsed can charge with a lance.',
    { effects: { combat: 0.05 } },
  ],
  ['mail', 'Mail armour', 900, 'Coats of iron rings for every man who can afford one.', { effects: { combat: 0.05 } }],
  [
    'crossbows',
    'Crossbows',
    1050,
    'A bolt that pierces mail, in the hands of any townsman.',
    { effects: { combat: 0.05 } },
  ],
  [
    'chivalry',
    'Chivalry',
    1150,
    'Knightly orders and a code of honour stiffen the ranks.',
    { effects: { morale: 0.02 } },
  ],
  [
    'trebuchets',
    'Counterweight trebuchets',
    1200,
    'Engines that hurl stones the weight of a man.',
    { effects: { siege: 0.25 } },
  ],
  ['plate_armour', 'Plate armour', 1350, 'Steel from head to foot.', { effects: { combat: 0.1 } }],
  ['bombards', 'Bombards', 1450, 'Great guns that bring down walls in days.', { effects: { siege: 0.25 } }],
  [
    'pike_squares',
    'Pike squares',
    1480,
    'Hedgehogs of pikes that no horseman can break.',
    { effects: { combat: 0.05 } },
  ],
  ['arquebus', 'Arquebus', 1500, 'Hand guns in massed ranks.', { effects: { combat: 0.1 } }],
  [
    'trace_italienne',
    'Trace italienne',
    1530,
    'Low, angled bastions that shrug off cannon.',
    { building: ['castle', 4] },
  ],
  [
    'military_revolution',
    'Military revolution',
    1580,
    'Drill, volley fire and armies of a new size.',
    { effects: { morale: 0.02, levy: 0.05 } },
  ],
  ['flintlock', 'Flintlock musket', 1650, 'A lock that fires in the rain.', { effects: { combat: 0.1 } }],
  ['socket_bayonet', 'Socket bayonet', 1690, 'Every musketeer is also a pikeman.', { effects: { combat: 0.05 } }],
  [
    'standing_armies',
    'Standing armies',
    1700,
    'Regiments paid all year round, housed in barracks.',
    { effects: { upkeep: 0.1 }, building: ['barracks', 4] },
  ],
  ['field_artillery', 'Field artillery', 1720, 'Light guns that keep up with the march.', { effects: { siege: 0.25 } }],
  ['drill', 'Drill and discipline', 1740, 'Soldiers who hold their ranks under fire.', { effects: { morale: 0.02 } }],
  ['light_infantry', 'Light infantry', 1770, 'Skirmishers who fight in open order.', { effects: { combat: 0.05 } }],
  [
    'levee_en_masse',
    'Levée en masse',
    1795,
    'Every citizen a soldier.',
    { effects: { levy: 0.25 }, building: ['barracks', 5] },
  ],
  ['rifled_muskets', 'Rifled muskets', 1840, 'Accurate at four hundred paces.', { effects: { combat: 0.1 } }],
  ['railway_logistics', 'Railway logistics', 1855, 'Armies travel and are fed by train.', { effects: { supply: 0.2 } }],
  [
    'breech_loaders',
    'Breech-loaders',
    1865,
    'Reload lying down, fire six times a minute.',
    { effects: { combat: 0.1 } },
  ],
  [
    'polygonal_forts',
    'Polygonal forts',
    1870,
    'Forts of earth and concrete, far apart and hard to reach.',
    { building: ['castle', 5] },
  ],
  ['general_staff', 'General staff', 1885, 'Plans for every war, drawn up in peace.', { effects: { morale: 0.02 } }],
  [
    'machine_guns',
    'Machine guns',
    1905,
    'One gun, the fire of a company.',
    { effects: { combat: 0.1 }, building: ['castle', 6] },
  ],
  ['aircraft', 'Military aircraft', 1915, 'Scouts and bombers over the front.', { unit: 'air' }],
  ['tanks', 'Tanks', 1917, 'Armour that crosses the trenches.', { effects: { combat: 0.1 } }],
  [
    'combined_arms',
    'Combined arms',
    1935,
    'Tanks, infantry, guns and aircraft fighting as one.',
    { effects: { morale: 0.02 }, building: ['barracks', 6] },
  ],
  ['radar', 'Radar', 1940, 'Eyes that see through cloud and darkness.', { effects: { combat: 0.05 } }],
  ['jet_engines', 'Jet engines', 1950, 'Aircraft faster than sound.', { effects: { combat: 0.1 } }],
  [
    'guided_missiles',
    'Guided missiles',
    1970,
    'Weapons that find their target.',
    { effects: { siege: 0.25, combat: 0.05 } },
  ],
  ['precision_munitions', 'Precision munitions', 1985, 'One bomb, one target.', { effects: { combat: 0.1 } }],
  ['network_warfare', 'Network warfare', 2000, 'Every unit sees what every other sees.', { effects: { morale: 0.02 } }],
  ['drones', 'Drones', 2015, 'Aircraft without pilots.', { effects: { combat: 0.1 } }],
];

const SOCIETY: Row[] = [
  [
    'written_law',
    'Written law',
    800,
    'Customs set down in books that outlive their judges.',
    { effects: { legitimacy: 3 } },
  ],
  [
    'monastic_schools',
    'Monastic schools',
    900,
    'Monks teach letters and copy the books of the ancients.',
    { effects: { research: 0.05 }, building: ['university', 1] },
  ],
  ['canon_law', 'Canon law', 1050, 'The church’s own courts and laws.', { effects: { conversion: 0.1 } }],
  [
    'universities',
    'Universities',
    1150,
    'Guilds of masters and students in the great cities.',
    { effects: { research: 0.05 }, building: ['university', 2] },
  ],
  [
    'scholasticism',
    'Scholasticism',
    1250,
    'Faith and reason reconciled in great summae.',
    { effects: { research: 0.05 } },
  ],
  [
    'parliaments',
    'Parliaments',
    1300,
    'The estates meet to grant taxes and air grievances.',
    { effects: { commons: 5 } },
  ],
  [
    'humanism',
    'Humanism',
    1450,
    'The ancients rediscovered, and man the measure of things.',
    { effects: { research: 0.1 } },
  ],
  [
    'printing_press',
    'Printing press',
    1460,
    'Books by the thousand, ideas by the million.',
    { effects: { research: 0.1, conversion: 0.1 } },
  ],
  [
    'new_learning',
    'New learning',
    1500,
    'Colleges teach law, languages and mathematics.',
    { effects: { assimilation: 0.1 }, building: ['university', 3] },
  ],
  [
    'cartography',
    'Cartography',
    1520,
    'Maps of the world, with the new lands on them.',
    { effects: { research: 0.05 } },
  ],
  [
    'absolutism',
    'Absolutism',
    1600,
    'The king is the state: he answers to God alone.',
    { effects: { legitimacy: 5 }, government: 'absolute' },
  ],
  [
    'scientific_revolution',
    'Scientific revolution',
    1650,
    'Experiment and mathematics explain the heavens.',
    { effects: { research: 0.1 }, building: ['university', 4] },
  ],
  [
    'constitutionalism',
    'Constitutionalism',
    1690,
    'The crown governs under law, with a parliament.',
    { government: 'constitutional' },
  ],
  [
    'bureaucracy',
    'Bureaucracy',
    1700,
    'Salaried officials who keep records of everything.',
    { effects: { acceptSlots: 1, legitimacy: 3 } },
  ],
  [
    'enlightenment',
    'Enlightenment',
    1730,
    'Reason, tolerance and progress.',
    { effects: { research: 0.1, commons: 5 } },
  ],
  [
    'public_education',
    'Public education',
    1760,
    'Schools for the children of the people.',
    { effects: { assimilation: 0.2 } },
  ],
  [
    'popular_sovereignty',
    'Popular sovereignty',
    1776,
    'Power comes from the people, who may change their government.',
    { government: 'democracy' },
  ],
  [
    'nationalism',
    'Nationalism',
    1795,
    'One people, one nation, one state.',
    { nationalism: true, effects: { levy: 0.1 } },
  ],
  [
    'civil_service',
    'Civil service',
    1830,
    'Officials chosen by examination, not birth.',
    { effects: { legitimacy: 5, acceptSlots: 1 } },
  ],
  [
    'mass_schooling',
    'Mass schooling',
    1860,
    'Every child in school, every citizen literate.',
    { effects: { research: 0.1, assimilation: 0.2 }, building: ['university', 5] },
  ],
  ['socialism', 'Socialism', 1870, 'The workers organise, and demand their share.', { effects: { commons: 5 } }],
  ['public_health', 'Public health', 1880, 'Sewers, vaccines and clean water.', { effects: { growth: 0.1 } }],
  ['mass_press', 'Mass press', 1890, 'Newspapers read by millions.', { effects: { research: 0.05, legitimacy: 3 } }],
  [
    'mass_politics',
    'Mass politics',
    1910,
    'Parties, rallies and leaders who speak for the masses.',
    { government: 'dictatorship' },
  ],
  [
    'revolutionary_socialism',
    'Revolutionary socialism',
    1917,
    'The party seizes the state in the name of the workers.',
    { government: 'communist' },
  ],
  [
    'welfare_state',
    'Welfare state',
    1945,
    'Pensions, health care and insurance for all.',
    { effects: { commons: 10 } },
  ],
  [
    'decolonisation',
    'Self-determination',
    1955,
    'Every people has the right to govern itself.',
    { effects: { acceptSlots: 1 } },
  ],
  ['human_rights', 'Human rights', 1960, 'Freedoms no government may take away.', { effects: { legitimacy: 5 } }],
  [
    'big_science',
    'Big science',
    1965,
    'Great laboratories funded by the state.',
    { effects: { research: 0.1 }, building: ['university', 6] },
  ],
  [
    'globalisation',
    'Globalisation',
    1985,
    'Goods, people and ideas cross every border.',
    { effects: { research: 0.1, acceptSlots: 1 } },
  ],
  ['information_age', 'Information age', 1995, 'Knowledge doubles every few years.', { effects: { research: 0.1 } }],
  ['environmentalism', 'Environmentalism', 2005, 'Growth that the planet can bear.', { effects: { growth: 0.1 } }],
  ['artificial_intelligence', 'Artificial intelligence', 2025, 'Machines that learn.', { effects: { research: 0.2 } }],
];

function build(track: TechTrack, rows: Row[]): TechDef[] {
  if (rows.length !== MAX_TECH) throw new Error(`${track}: ${rows.length} techs`);
  return rows.map(([id, name, year, blurb, extra], i) => ({ id, track, level: i + 1, name, year, blurb, ...extra }));
}

export const TECHS: Record<TechTrack, TechDef[]> = {
  economy: build('economy', ECONOMY),
  military: build('military', MILITARY),
  society: build('society', SOCIETY),
};

/** The technology at a level of a track (1-based), or undefined past the end. */
export function techAt(track: TechTrack, level: number): TechDef | undefined {
  return TECHS[track][level - 1];
}

/** Effects of every level up to and including each level: CUMULATIVE[track][level]. */
export const CUMULATIVE: Record<TechTrack, TechEffects[]> = {} as Record<TechTrack, TechEffects[]>;
for (const track of TECH_TRACKS) {
  const acc: TechEffects[] = [{}];
  for (const t of TECHS[track]) {
    const next: TechEffects = { ...acc[acc.length - 1] };
    for (const [k, v] of Object.entries(t.effects ?? {}) as [TechEffectKey, number][]) next[k] = (next[k] ?? 0) + v;
    acc.push(next);
  }
  CUMULATIVE[track] = acc;
}

export const EFFECT_TEXT: Record<TechEffectKey, (v: number) => string> = {
  tax: (v) => `taxes +${Math.round(v * 100)}%`,
  levy: (v) => `levies +${Math.round(v * 100)}%`,
  growth: (v) => `growth +${Math.round(v * 100)}%`,
  interest: (v) => `interest −${Math.round(v * 100)}%`,
  supply: (v) => `supply +${Math.round(v * 100)}%`,
  research: (v) => `research +${Math.round(v * 100)}%`,
  combat: (v) => `damage in battle +${Math.round(v * 100)}%`,
  morale: (v) => `morale recovery +${Math.round(v * 100)}%`,
  siege: (v) => `sieges +${Math.round(v * 100)}%`,
  upkeep: (v) => `men-at-arms upkeep −${Math.round(v * 100)}%`,
  legitimacy: (v) => `legitimacy +${v}`,
  conversion: (v) => `conversion +${Math.round(v * 100)}%`,
  assimilation: (v) => `assimilation +${Math.round(v * 100)}%`,
  acceptSlots: (v) => `${v} more accepted culture${v === 1 ? '' : 's'}`,
  commons: (v) => `commons’ loyalty +${v}`,
};
