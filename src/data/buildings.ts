/** Province buildings. Each type has three levels; a province builds one thing at a time. */
import type { IconName } from '../assets/icons';
import type { BuildingType } from '../sim/types';

export interface BuildingEffects {
  /** fraction added to the province's taxes */
  tax?: number;
  /** fraction added to the province's levies */
  levy?: number;
  /** fort levels */
  fort?: number;
  /** fraction added to the chance of development growth */
  growth?: number;
  /** fraction added to supply */
  supply?: number;
}

export interface BuildingDef {
  id: BuildingType;
  name: string;
  levels: [string, string, string];
  icon: IconName;
  /** gold for level 1; later levels cost more */
  cost: number;
  /** days for level 1 */
  days: number;
  /** per level */
  effects: BuildingEffects;
  minDev?: number;
  coastal?: boolean;
  blurb: string;
}

export const MAX_LEVEL = 3;

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  farms: {
    id: 'farms',
    name: 'Farmland',
    levels: ['Cleared fields', 'Open fields', 'Manorial estates'],
    icon: 'wheat',
    cost: 75,
    days: 150,
    effects: { tax: 0.1, levy: 0.15, growth: 0.5, supply: 0.2 },
    blurb: 'More land under the plough: more hands for the levy, and a province that grows.',
  },
  market: {
    id: 'market',
    name: 'Market',
    levels: ['Market cross', 'Market town', 'Chartered fair'],
    icon: 'two-coins',
    cost: 90,
    days: 180,
    effects: { tax: 0.2 },
    blurb: 'Tolls, rents and fees. The surest way to fill a treasury.',
  },
  barracks: {
    id: 'barracks',
    name: 'Barracks',
    levels: ['Muster field', 'Barracks', 'Garrison town'],
    icon: 'barracks-tent',
    cost: 80,
    days: 150,
    effects: { levy: 0.3 },
    blurb: 'Drill yards and armouries that turn farmhands into soldiers.',
  },
  castle: {
    id: 'castle',
    name: 'Castle',
    levels: ['Motte and bailey', 'Stone keep', 'Concentric castle'],
    icon: 'castle',
    cost: 120,
    days: 240,
    effects: { fort: 1 },
    blurb: 'Every level of walls makes the province slower to besiege.',
  },
  workshop: {
    id: 'workshop',
    name: 'Workshops',
    levels: ['Craftsmen', 'Guild halls', 'Manufactories'],
    icon: 'anvil',
    cost: 100,
    days: 200,
    effects: { tax: 0.15, growth: 0.25 },
    minDev: 5,
    blurb: 'Smiths, weavers and tanners. They need a settled province to thrive.',
  },
  port: {
    id: 'port',
    name: 'Harbour',
    levels: ['Landing', 'Harbour', 'Great port'],
    icon: 'anchor',
    cost: 90,
    days: 200,
    effects: { tax: 0.15, supply: 0.2 },
    coastal: true,
    blurb: 'Trade by sea, and a safe landing for armies.',
  },
};

export const BUILDING_ORDER: BuildingType[] = ['farms', 'market', 'barracks', 'castle', 'workshop', 'port'];

/** Gold to build a level (1-based). */
export function buildingCost(type: BuildingType, level: number): number {
  const base = BUILDINGS[type].cost;
  return Math.round(base * [1, 2, 3.5][level - 1]);
}

export function buildingDays(type: BuildingType, level: number): number {
  return Math.round(BUILDINGS[type].days * [1, 1.3, 1.6][level - 1]);
}
