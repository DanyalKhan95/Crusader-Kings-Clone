/**
 * Ships. Warships sail in fleets and keep their role through the eras while the ships change, as the
 * arms of an army do: `shipDef` gives a role's strength in a military era and `shipLook` what a realm
 * calls it. Transports are not in fleets: every realm keeps a pool of them that carries its armies
 * over the sea (see sim/naval.ts). Stats are per ship, as built in the medieval era.
 */
import type { IconName } from '../assets/icons';
import type { ShipType } from '../sim/types';

export interface ShipDef {
  id: ShipType;
  /** damage dealt in a day of battle */
  attack: number;
  /** damage a ship takes before it sinks */
  hull: number;
  /** sailing speed, as a multiple of the speed of a medieval fleet */
  speed: number;
  /** strength against transports caught at sea, as a multiple of `attack` */
  raid: number;
  /** gold to build one */
  cost: number;
  /** gold per month at sea; half in port */
  upkeep: number;
  /** roles this one beats: a ship facing a fleet full of its counters deals less damage */
  counters: ShipType[];
}

export const SHIPS: Record<ShipType, ShipDef> = {
  heavy: { id: 'heavy', attack: 4, hull: 14, speed: 0.9, raid: 0.5, cost: 16, upkeep: 0.16, counters: ['light'] },
  light: { id: 'light', attack: 2, hull: 7, speed: 1.3, raid: 1, cost: 7, upkeep: 0.07, counters: ['submarine'] },
  submarine: {
    id: 'submarine',
    attack: 5,
    hull: 5,
    speed: 1,
    raid: 2,
    cost: 20,
    upkeep: 0.2,
    counters: ['heavy'],
  },
};

export const SHIP_ORDER: ShipType[] = ['heavy', 'light', 'submarine'];

/** The military era from which submarines can be built. */
export const SUBMARINE_ERA = 4;

export interface ShipLook {
  name: string;
  icon: IconName;
  blurb: string;
}

/** What each role is called in each era (medieval … contemporary); `steam` replaces the industrial look. */
export const SHIP_LINES: Record<ShipType | 'transport', ShipLook[]> = {
  heavy: [
    { name: 'War cogs', icon: 'caravel', blurb: 'Round ships with castles fore and aft, crowded with archers.' },
    { name: 'Carracks', icon: 'caravel', blurb: 'Great ships with high castles and the first guns.' },
    { name: 'Galleons', icon: 'galleon', blurb: 'Tall ships with broadsides of cannon.' },
    { name: 'Ships of the line', icon: 'galleon', blurb: 'Wooden walls of seventy guns and more.' },
    { name: 'Dreadnoughts', icon: 'battleship', blurb: 'Steel battleships with great guns in turrets.' },
    { name: 'Carriers', icon: 'carrier', blurb: 'Floating airfields that strike beyond the horizon.' },
  ],
  light: [
    { name: 'Galleys', icon: 'galley', blurb: 'Oared warships that ram and board.' },
    { name: 'Galleys', icon: 'galley', blurb: 'Swift oared warships with bow guns.' },
    { name: 'Frigates', icon: 'shooner-sailboat', blurb: 'Fast ships that scout, raid and escort.' },
    { name: 'Frigates', icon: 'shooner-sailboat', blurb: 'The eyes of the fleet, and hunters of merchantmen.' },
    { name: 'Destroyers', icon: 'ship-bow', blurb: 'Fast escorts that hunt submarines.' },
    { name: 'Frigates', icon: 'ship-bow', blurb: 'Missile escorts that guard against submarines and aircraft.' },
  ],
  submarine: [
    { name: 'Submarines', icon: 'submarine', blurb: 'Hidden hunters of battleships and merchantmen.' },
    { name: 'Submarines', icon: 'submarine', blurb: 'Hidden hunters of battleships and merchantmen.' },
    { name: 'Submarines', icon: 'submarine', blurb: 'Hidden hunters of battleships and merchantmen.' },
    { name: 'Submarines', icon: 'submarine', blurb: 'Hidden hunters of battleships and merchantmen.' },
    { name: 'Submarines', icon: 'submarine', blurb: 'Hidden hunters of battleships and merchantmen.' },
    { name: 'Nuclear submarines', icon: 'submarine', blurb: 'Submarines that stay under the sea for months.' },
  ],
  transport: [
    { name: 'Cogs', icon: 'sailboat', blurb: 'Merchant ships pressed into service to carry the host.' },
    { name: 'Hulks', icon: 'sailboat', blurb: 'Roomy merchant ships that carry men and horses.' },
    { name: 'Fluyts', icon: 'shooner-sailboat', blurb: 'Cheap, capacious cargo ships.' },
    { name: 'Merchantmen', icon: 'shooner-sailboat', blurb: 'Sailing ships hired to carry the army.' },
    { name: 'Troopships', icon: 'cargo-ship', blurb: 'Steamers that carry whole divisions.' },
    { name: 'Landing ships', icon: 'cargo-ship', blurb: 'Ships that put an army ashore on any beach.' },
  ],
};

/** Looks that replace the industrial era's once a realm has steamships. */
export const STEAM_LOOKS: Partial<Record<ShipType | 'transport', ShipLook>> = {
  heavy: { name: 'Ironclads', icon: 'iron-hulled-warship', blurb: 'Armoured steamships with rifled guns.' },
  light: { name: 'Cruisers', icon: 'iron-hulled-warship', blurb: 'Fast steam cruisers that patrol the sea lanes.' },
  transport: { name: 'Steamers', icon: 'cargo-ship', blurb: 'Steamships that keep to a timetable in any wind.' },
};

/** The ships of the north in the medieval era. */
export const LONGSHIPS: ShipLook = {
  name: 'Longships',
  icon: 'drakkar',
  blurb: 'Fast clinker-built ships that carry warriors up rivers and across seas.',
};

/** Strength of a role in each era, and its price (as for the arms of an army). */
const POWER = [1, 1.35, 1.8, 2.4, 3.2, 4.2];
const PRICE = [1, 1.25, 1.55, 1.9, 2.3, 2.8];
/** Sailing speed by era, before steam; steam makes the industrial era's ships faster. */
const SPEED = [1, 1.1, 1.2, 1.3, 2, 2.4];
export const STEAM_SPEED = 1.7;

const byEra = new Map<string, ShipDef>();

/** A role as built by a realm of the given military era (0 = medieval). */
export function shipDef(t: ShipType, era: number): ShipDef {
  const key = `${t}:${era}`;
  let d = byEra.get(key);
  if (!d) {
    const base = SHIPS[t];
    d = {
      ...base,
      attack: base.attack * POWER[era],
      hull: base.hull * POWER[era],
      speed: base.speed * SPEED[era],
      cost: Math.round(base.cost * PRICE[era]),
      upkeep: base.upkeep * PRICE[era],
    };
    byEra.set(key, d);
  }
  return d;
}

/** Men one transport carries, by era. */
export const TRANSPORT_CAPACITY = [30, 40, 60, 100, 250, 400];
/** Gold to build one transport in the medieval era; later ones cost more (`PRICE`). */
const TRANSPORT_COST = 2;
/** Gold a month for one transport. */
const TRANSPORT_UPKEEP = 0.012;

export function transportCost(era: number): number {
  return Math.round(TRANSPORT_COST * PRICE[era] * 10) / 10;
}

export function transportUpkeep(era: number): number {
  return TRANSPORT_UPKEEP * PRICE[era];
}

/** Speed of the realm's ships, by era (steam counts in the industrial era). */
export function sailSpeed(era: number, steam: boolean): number {
  return era === 3 && steam ? STEAM_SPEED : SPEED[era];
}
