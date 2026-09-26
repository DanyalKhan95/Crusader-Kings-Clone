/**
 * The simulation state. Everything here is plain JSON so a game can be saved and loaded as is;
 * derived lookups (by tag, provinces per owner) live in `derived.ts` and are rebuilt on load.
 */
import type { Government, Rank } from '../shared/dataTypes';

export type Skill = 'dip' | 'mar' | 'stw' | 'int' | 'lrn';
export const SKILLS: Skill[] = ['dip', 'mar', 'stw', 'int', 'lrn'];

export type CouncilSeat = 'chancellor' | 'marshal' | 'steward' | 'spymaster' | 'chaplain';
export const COUNCIL_SEATS: CouncilSeat[] = ['chancellor', 'marshal', 'steward', 'spymaster', 'chaplain'];

export type UnitType = 'levy' | 'spearmen' | 'archers' | 'light_cavalry' | 'knights' | 'horse_archers' | 'siege';
/** Men per unit type. */
export type Units = Partial<Record<UnitType, number>>;

export type BuildingType = 'farms' | 'market' | 'barracks' | 'castle' | 'workshop' | 'port';

export interface Character {
  id: number;
  name: string;
  female: boolean;
  /** day of birth (see calendar.ts) */
  born: number;
  country: number;
  skills: Record<Skill, number>;
  traits: string[];
  /** day of death, when dead */
  died?: number;
}

export interface Loan {
  amount: number;
  /** gold per month */
  interest: number;
}

export interface Country {
  /** 1-based index; 0 means none */
  index: number;
  tag: string;
  name: string;
  short: string;
  adj: string;
  gov: Government;
  rank: Rank;
  color: [number, number, number];
  colorHex: string;
  liege: number;
  capital: number;
  culture: string;
  religion: string;
  alive: boolean;

  gold: number;
  /** -3 … +3 */
  stability: number;
  /** 0 … 20 */
  warExhaustion: number;
  /** levies available to raise (men) */
  manpower: number;
  loans: Loan[];
  /** net gold of the last month, for display */
  lastBalance: number;

  ruler: number;
  heir: number;
  council: Record<CouncilSeat, number>;
  /** characters at court who can be appointed to the council or lead armies */
  courtiers: number[];

  /** men-at-arms at home, not in any army */
  reserve: Units;
  /** countries whose crown this one claims (throne wars) */
  throneClaims: number[];
  /** provinces this one claims */
  claims: number[];

  ai: { nextWarCheck: number; nextBuild: number };
}

export interface Construction {
  type: BuildingType;
  level: number;
  start: number;
  done: number;
}

export interface Siege {
  /** 0 … 1 */
  progress: number;
  /** country besieging */
  by: number;
  start: number;
}

export interface ProvinceState {
  owner: number;
  controller: number;
  culture: string | null;
  religion: string | null;
  /** land only */
  dev: number;
  buildings: Partial<Record<BuildingType, number>>;
  construction?: Construction;
  siege?: Siege;
}

export type ArmyStatus = 'idle' | 'moving' | 'battle' | 'siege';

export interface Army {
  id: number;
  owner: number;
  name: string;
  commander: number;
  /** region id: a land province, or a sea zone while shipped */
  location: number;
  units: Units;
  /** 0 … 1 */
  morale: number;
  /** remaining regions to move through */
  path: number[];
  /** days spent on the current step */
  progress: number;
  /** days the current step takes */
  stepDays: number;
  /** AI: day to re-plan */
  replan: number;
  /** where the AI sent it, or 0 */
  objective: number;
  /** fleeing a lost battle: cannot be caught or given orders until it arrives */
  retreating?: boolean;
}

export interface BattleSide {
  armies: number[];
  country: number;
  start: number;
  losses: number;
}

export interface Battle {
  id: number;
  province: number;
  day: number;
  /** the attackers crossed a river or strait to get here */
  crossing: boolean;
  attacker: BattleSide;
  defender: BattleSide;
}

export type CasusBelli = 'throne' | 'border' | 'conquest';

export interface War {
  id: number;
  name: string;
  cb: CasusBelli;
  /** province id for border wars, country index for throne wars, 0 otherwise */
  goal: number;
  attacker: number;
  defender: number;
  attackers: number[];
  defenders: number[];
  start: number;
  /** battle share of the war score, attacker's view, -40 … 40 */
  battleScore: number;
  /** months the war goal has been held, positive for the attacker */
  ticking: number;
}

export interface Truce {
  a: number;
  b: number;
  until: number;
}

export interface PeaceTerms {
  /** provinces the loser gives the winner */
  provinces: number[];
  gold: number;
  /** enforce the war goal of a throne war */
  throne?: boolean;
  white?: boolean;
}

export interface PeaceOffer {
  id: number;
  war: number;
  /** who proposes: the side that gains */
  from: number;
  to: number;
  terms: PeaceTerms;
  expires: number;
}

export type MessageKind = 'war' | 'peace' | 'battle' | 'siege' | 'death' | 'building' | 'economy' | 'army' | 'event';

export interface Message {
  id: number;
  day: number;
  kind: MessageKind;
  text: string;
  /** a place to look at */
  province?: number;
  /** player-relevant and worth pausing for */
  important?: boolean;
}

export interface GameState {
  version: 1;
  scenario: string;
  seed: number;
  rng: number;
  day: number;
  countries: Country[];
  /** indexed by region id; water regions keep owner 0 */
  provinces: ProvinceState[];
  characters: Record<number, Character>;
  armies: Army[];
  battles: Battle[];
  wars: War[];
  truces: Truce[];
  offers: PeaceOffer[];
  messages: Message[];
  nextId: number;
  player: number;
  /** bumped whenever a province changes owner or controller */
  mapVersion: number;
  /** bumped whenever borders change (owners, lieges) */
  borderVersion: number;
  /** one-off scripted happenings still to come */
  scheduled: { day: number; event: string }[];
}
