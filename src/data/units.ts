/**
 * Unit types of the medieval era. Stats are per 100 men. `counters` lists the types this one beats:
 * a unit fighting an army full of its counters deals less damage.
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
};

export const MAA_TYPES: UnitType[] = ['spearmen', 'archers', 'light_cavalry', 'knights', 'horse_archers', 'siege'];
export const UNIT_ORDER: UnitType[] = ['levy', ...MAA_TYPES];
