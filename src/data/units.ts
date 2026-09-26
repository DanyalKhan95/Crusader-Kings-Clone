/**
 * Arms of the army. Stats are per 100 men, as fielded in the medieval era; `counters` lists the
 * types this one beats: a unit fighting an army full of its counters deals less damage. Each arm
 * keeps its role through the eras while its weapons change: `unitDef` gives its name and strength in
 * the era of a realm's military technology.
 */
import type { IconName } from '../assets/icons';
import type { UnitType } from '../sim/types';

export interface UnitDef {
  id: UnitType;
  name: string;
  icon: IconName;
  damage: number;
  toughness: number;
  pursuit: number;
  screen: number;
  /** siege power per 100 men */
  siege: number;
  /** gold to recruit 100 men (men-at-arms only) */
  cost: number;
  /** gold per month per 100 men in the field */
  upkeep: number;
  /** gold per month per 100 men kept at home */
  reserveUpkeep: number;
  counters: UnitType[];
  /** men per regiment when recruiting */
  regiment: number;
  blurb: string;
}

export const UNITS: Record<UnitType, UnitDef> = {
  levy: {
    id: 'levy',
    name: 'Levies',
    icon: 'meeple-group',
    damage: 10,
    toughness: 10,
    pursuit: 0,
    screen: 0,
    siege: 0,
    cost: 0,
    upkeep: 0.05,
    reserveUpkeep: 0,
    counters: [],
    regiment: 0,
    blurb: 'Peasants and freemen called up from the provinces. Cheap, numerous and fragile.',
  },
  spearmen: {
    id: 'spearmen',
    name: 'Spearmen',
    icon: 'pikeman',
    damage: 22,
    toughness: 26,
    pursuit: 0,
    screen: 10,
    siege: 0,
    cost: 30,
    upkeep: 0.5,
    reserveUpkeep: 0.15,
    counters: ['light_cavalry', 'knights'],
    regiment: 100,
    blurb: 'Professional infantry with long spears. A wall against horsemen.',
  },
  archers: {
    id: 'archers',
    name: 'Archers',
    icon: 'bowman',
    damage: 26,
    toughness: 12,
    pursuit: 0,
    screen: 10,
    siege: 0,
    cost: 30,
    upkeep: 0.5,
    reserveUpkeep: 0.15,
    counters: ['spearmen', 'levy'],
    regiment: 100,
    blurb: 'Bowmen who thin the enemy ranks before they close. Weak when caught by cavalry.',
  },
  light_cavalry: {
    id: 'light_cavalry',
    name: 'Light cavalry',
    icon: 'cavalry',
    damage: 24,
    toughness: 18,
    pursuit: 35,
    screen: 20,
    siege: 0,
    cost: 45,
    upkeep: 0.7,
    reserveUpkeep: 0.2,
    counters: ['archers', 'horse_archers', 'siege'],
    regiment: 100,
    blurb: 'Fast riders who hunt archers and run down a fleeing enemy.',
  },
  knights: {
    id: 'knights',
    name: 'Knights',
    icon: 'mounted-knight',
    damage: 70,
    toughness: 45,
    pursuit: 15,
    screen: 15,
    siege: 0,
    cost: 120,
    upkeep: 1.6,
    reserveUpkeep: 0.5,
    counters: ['levy', 'archers'],
    regiment: 100,
    blurb: 'Armoured horsemen. A charge of knights decides battles, at a ruinous price.',
  },
  horse_archers: {
    id: 'horse_archers',
    name: 'Horse archers',
    icon: 'horse-head',
    damage: 30,
    toughness: 14,
    pursuit: 30,
    screen: 25,
    siege: 0,
    cost: 50,
    upkeep: 0.75,
    reserveUpkeep: 0.22,
    counters: ['spearmen', 'levy'],
    regiment: 100,
    blurb: 'Steppe riders who shoot from the saddle and never stand still to be caught.',
  },
  siege: {
    id: 'siege',
    name: 'Siege engines',
    icon: 'trebuchet',
    damage: 3,
    toughness: 8,
    pursuit: 0,
    screen: 0,
    siege: 10,
    cost: 60,
    upkeep: 0.8,
    reserveUpkeep: 0.25,
    counters: [],
    regiment: 50,
    blurb: 'Rams, mangonels and the crews to work them. They shorten sieges greatly.',
  },
  air: {
    id: 'air',
    name: 'Air wings',
    icon: 'biplane',
    damage: 45,
    toughness: 20,
    pursuit: 40,
    screen: 30,
    siege: 3,
    cost: 110,
    upkeep: 1.6,
    reserveUpkeep: 0.5,
    counters: ['knights', 'siege', 'light_cavalry'],
    regiment: 50,
    blurb: 'Aircraft that scout, strafe and bomb. Deadly to armour and guns in the open.',
  },
};

export const MAA_TYPES: UnitType[] = [
  'spearmen',
  'archers',
  'light_cavalry',
  'knights',
  'horse_archers',
  'siege',
  'air',
];
export const UNIT_ORDER: UnitType[] = ['levy', ...MAA_TYPES];

interface Look {
  name: string;
  icon: IconName;
  blurb: string;
}

/** What each arm is called and carries in each era (medieval … contemporary). */
export const UNIT_LINES: Record<UnitType, Look[]> = {
  levy: [
    { name: 'Levies', icon: 'meeple-group', blurb: UNITS.levy.blurb },
    { name: 'Militia', icon: 'meeple-group', blurb: 'Town and country militias with pike and bill.' },
    { name: 'Militia', icon: 'meeple-group', blurb: 'Local militias, drilled a few days a year.' },
    { name: 'Conscripts', icon: 'meeple-group', blurb: 'Young men called up for a few years of service.' },
    { name: 'Reservists', icon: 'brodie-helmet', blurb: 'Trained reserves called back to the colours.' },
    { name: 'Reservists', icon: 'brodie-helmet', blurb: 'Reserves with modern arms and a few weeks of training.' },
  ],
  spearmen: [
    { name: 'Spearmen', icon: 'pikeman', blurb: UNITS.spearmen.blurb },
    { name: 'Pikemen', icon: 'halberd', blurb: 'Squares of long pikes, the queens of the battlefield.' },
    { name: 'Pike and shot', icon: 'musket', blurb: 'Pikes to guard the musketeers, muskets to break the enemy.' },
    { name: 'Line infantry', icon: 'bayonet', blurb: 'Musket and bayonet, in lines that hold under fire.' },
    { name: 'Infantry', icon: 'rifle', blurb: 'Riflemen in trenches, with grenades and mortars.' },
    { name: 'Mechanised infantry', icon: 'truck', blurb: 'Infantry that rides to battle in armoured vehicles.' },
  ],
  archers: [
    { name: 'Archers', icon: 'bowman', blurb: UNITS.archers.blurb },
    { name: 'Arquebusiers', icon: 'musket', blurb: 'Early hand guns, slow to load and loud as thunder.' },
    { name: 'Musketeers', icon: 'musket', blurb: 'Volleys of musketry that thin the ranks before the charge.' },
    { name: 'Riflemen', icon: 'rifle', blurb: 'Marksmen who skirmish ahead of the line.' },
    { name: 'Machine gunners', icon: 'machine-gun', blurb: 'A handful of men with the firepower of a regiment.' },
    { name: 'Missile teams', icon: 'missile-launcher', blurb: 'Guided missiles against tanks and aircraft.' },
  ],
  light_cavalry: [
    { name: 'Light cavalry', icon: 'cavalry', blurb: UNITS.light_cavalry.blurb },
    { name: 'Light horse', icon: 'cavalry', blurb: 'Mounted scouts and raiders.' },
    { name: 'Dragoons', icon: 'crossed-pistols', blurb: 'Mounted infantry who ride to battle and fight on foot.' },
    { name: 'Hussars', icon: 'saber-and-pistol', blurb: 'Dashing light horsemen who scout and pursue.' },
    { name: 'Armoured cars', icon: 'truck', blurb: 'Fast wheeled vehicles for scouting.' },
    { name: 'Helicopters', icon: 'helicopter', blurb: 'Air cavalry that strikes anywhere.' },
  ],
  knights: [
    { name: 'Knights', icon: 'mounted-knight', blurb: UNITS.knights.blurb },
    { name: 'Gendarmes', icon: 'mounted-knight', blurb: 'Armoured lancers of the royal companies.' },
    { name: 'Cuirassiers', icon: 'saber-and-pistol', blurb: 'Heavy horse in breastplates, with pistol and sword.' },
    { name: 'Heavy cavalry', icon: 'cavalry', blurb: 'Big men on big horses, for the decisive charge.' },
    { name: 'Tanks', icon: 'great-war-tank', blurb: 'Armour that crosses trenches and breaks the line.' },
    { name: 'Main battle tanks', icon: 'battle-tank', blurb: 'Fast, heavily armoured and armed.' },
  ],
  horse_archers: [
    { name: 'Horse archers', icon: 'horse-head', blurb: UNITS.horse_archers.blurb },
    { name: 'Horse archers', icon: 'horse-head', blurb: 'Steppe riders who shoot from the saddle.' },
    { name: 'Cossacks', icon: 'horse-head', blurb: 'Free riders of the steppe frontier.' },
    { name: 'Irregular horse', icon: 'horse-head', blurb: 'Tribal and frontier horsemen.' },
    { name: 'Motorised infantry', icon: 'truck', blurb: 'Infantry on lorries, fast across open country.' },
    { name: 'Special forces', icon: 'trench-assault', blurb: 'Small elite units that strike behind the lines.' },
  ],
  siege: [
    { name: 'Siege engines', icon: 'trebuchet', blurb: UNITS.siege.blurb },
    { name: 'Bombards', icon: 'cannon', blurb: 'Great guns that bring down walls in days.' },
    { name: 'Siege artillery', icon: 'cannon', blurb: 'Batteries of cannon and mortars.' },
    { name: 'Artillery', icon: 'field-gun', blurb: 'Rifled guns that fire miles beyond the line.' },
    { name: 'Heavy artillery', icon: 'field-gun', blurb: 'Howitzers that smash forts and trenches.' },
    { name: 'Rocket artillery', icon: 'missile-launcher', blurb: 'Salvos of rockets over the horizon.' },
  ],
  air: [
    { name: 'Air wings', icon: 'biplane', blurb: UNITS.air.blurb },
    { name: 'Air wings', icon: 'biplane', blurb: UNITS.air.blurb },
    { name: 'Air wings', icon: 'biplane', blurb: UNITS.air.blurb },
    { name: 'Air wings', icon: 'biplane', blurb: UNITS.air.blurb },
    { name: 'Air wings', icon: 'biplane', blurb: 'Fighters and bombers over the battlefield.' },
    { name: 'Jet wings', icon: 'jet-fighter', blurb: 'Jet fighters and strike aircraft.' },
  ],
};

/** Strength of an arm in each era, and its price. */
const POWER = [1, 1.35, 1.8, 2.4, 3.2, 4.2];
const PRICE = [1, 1.25, 1.55, 1.9, 2.3, 2.8];

const byEra = new Map<string, UnitDef>();

/** An arm as fielded by a realm of the given military era (0 = medieval). */
export function unitDef(t: UnitType, era: number): UnitDef {
  const key = `${t}:${era}`;
  let d = byEra.get(key);
  if (!d) {
    const base = UNITS[t];
    const look = UNIT_LINES[t][era] ?? UNIT_LINES[t][0];
    d = {
      ...base,
      name: look.name,
      icon: look.icon,
      blurb: look.blurb,
      damage: base.damage * POWER[era],
      toughness: base.toughness * POWER[era],
      siege: base.siege * (1 + era * 0.35),
      cost: Math.round(base.cost * PRICE[era]),
      upkeep: base.upkeep * PRICE[era],
      reserveUpkeep: base.reserveUpkeep * PRICE[era],
    };
    byEra.set(key, d);
  }
  return d;
}
