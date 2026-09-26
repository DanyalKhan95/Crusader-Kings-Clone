/**
 * The simulation state. Everything here is plain JSON so a game can be saved and loaded as is;
 * derived lookups (provinces per owner, neighbours) are cached in `queries.ts` and rebuilt on demand.
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

// ── Politics ──────────────────────────────────────────────────────

/** How a ruler is chosen when the throne falls empty. */
export type Succession = 'hereditary' | 'elective' | 'republic' | 'theocratic';

/** Crown authority, conscription and taxation run from 0 (light) to 3 (harsh). */
export interface Laws {
  succession: Succession;
  crown: number;
  conscription: number;
  taxation: number;
  /** religious policy: 0 persecution, 1 an established church, 2 tolerance */
  tolerance: number;
}
export type LawId = keyof Laws;

export type EstateId = 'nobles' | 'clergy' | 'burghers' | 'commons';
export const ESTATES: EstateId[] = ['nobles', 'clergy', 'burghers', 'commons'];

export interface EstateState {
  /** privileges granted to this estate */
  privileged: boolean;
  /** how they remember recent dealings; fades each month */
  mood: number;
}

/** What a council seat spends its time on. */
export type TaskId =
  | 'negotiate'
  | 'embassies'
  | 'claims'
  | 'levies'
  | 'drill'
  | 'taxes'
  | 'develop'
  | 'sieges'
  | 'watch'
  | 'stability'
  | 'legitimacy'
  | 'convert'
  | 'assimilate';

/** A demand of rebels, enforced if they win. */
export type Demand = 'lower_taxes' | 'lower_conscription' | 'lower_crown' | 'privileges';

/** A temporary realm raised by a revolt; its land returns to the realm when the revolt ends. */
export interface RebelInfo {
  realm: number;
  estate: EstateId;
  /** what they want; a pretender wants the throne instead */
  demand: Demand | 'throne';
  /** the day the revolt ended; the slot may then be reused for a new revolt */
  ended?: number;
}

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

/** What one country remembers about another; the value fades month by month. */
export type MemoryKind =
  'ae' | 'took_land' | 'gift' | 'betrayed' | 'broke_pact' | 'fought_beside' | 'freed_us' | 'refused';

export interface Memory {
  kind: MemoryKind;
  value: number;
}

/** Work on one province: conversion or assimilation. */
export interface Mission {
  province: number;
  progress: number;
  needed: number;
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
  /** the realm this country is a vassal of (0 = none); vassals are part of their liege's realm */
  liege: number;
  /** the country this one pays tribute to (0 = none); tributaries keep their own realm */
  overlord: number;
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
  /** day the ruler came to the throne */
  rulerSince: number;
  /** republics: the day of the next election */
  termEnds: number;
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
  /** a claim being fabricated */
  fabricating: { province: number; start: number; done: number } | null;
  /** a vassal being integrated into the realm */
  integrating: { vassal: number; progress: number; needed: number } | null;
  /** cultures treated as the realm's own */
  accepted: string[];
  /** the court chaplain's mission to a province of another faith */
  converting: Mission | null;
  /** the steward's schools in a province of another people */
  assimilating: Mission | null;
  /** day of the last blessing from the head of the faith */
  blessed: number;
  /** memories of other countries, by country index */
  memories: Record<number, Memory[]>;

  laws: Laws;
  /** day of the last change of law; laws change at most once in five years */
  lawChanged: number;
  /** 0 … 100: the ruler's right to rule */
  legitimacy: number;
  estates: Record<EstateId, EstateState>;
  tasks: Record<CouncilSeat, TaskId>;
  /** set for a realm raised by a revolt */
  rebel?: RebelInfo;

  ai: { nextWarCheck: number; nextBuild: number; nextDiplo: number; nextHolyWar?: number };
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

export type CasusBelli = 'claim' | 'throne' | 'conquest' | 'independence' | 'coalition' | 'revolt' | 'holy' | 'crusade';

/**
 * Treaties between independent realms. Alliances and non-aggression pacts are mutual; with `access`
 * country `a` lets `b` march through its land; with `guarantee` country `a` defends `b`.
 */
export type PactKind = 'alliance' | 'nap' | 'access' | 'guarantee';

export interface Pact {
  kind: PactKind;
  a: number;
  b: number;
  since: number;
}

/** Countries that fear an aggressive neighbour and will fight it together. */
export interface Coalition {
  id: number;
  target: number;
  members: number[];
  since: number;
}

export interface War {
  id: number;
  name: string;
  cb: CasusBelli;
  /** a province for claim and holy wars and crusades, a country index for throne wars, 0 otherwise */
  goal: number;
  /** great holy wars: the faith that called it */
  faith?: string;
  attacker: number;
  defender: number;
  attackers: number[];
  defenders: number[];
  start: number;
  /** battle share of the war score, attacker's view, -40 … 40 */
  battleScore: number;
  /** months the war goal has been held, positive for the attacker */
  ticking: number;
  /** revolts: what the rebels want */
  demand?: Demand;
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
  /** the losing leader becomes the winner's tributary */
  tributary?: boolean;
  /** the rebels of an independence war go free */
  independence?: boolean;
  /** revolts: the rebels' demand is granted */
  demands?: boolean;
  /** revolts: the rebels lay down their arms */
  crush?: boolean;
  /** great holy wars: the land around the holy city is won for the faith */
  holyLand?: boolean;
  white?: boolean;
}

interface OfferBase {
  id: number;
  /** who proposes */
  from: number;
  to: number;
  expires: number;
}

/** Peace terms; `from` is the side that gains. */
export interface PeaceOffer extends OfferBase {
  kind: 'peace';
  war: number;
  terms: PeaceTerms;
}

/** An ally, guarantor or overlord is asked to join a war on `from`'s side. */
export interface CallOffer extends OfferBase {
  kind: 'call';
  war: number;
}

/** A proposed treaty. For `access`, `from` asks to march through `to`'s land. */
export interface PactOffer extends OfferBase {
  kind: 'pact';
  pact: PactKind;
}

/** Vassals united in a faction demand their freedom, or they will fight for it. */
export interface UltimatumOffer extends OfferBase {
  kind: 'ultimatum';
  /** every vassal in the faction; `from` leads them */
  members: number[];
}

export type Offer = PeaceOffer | CallOffer | PactOffer | UltimatumOffer;

/** Disloyal vassals of one realm who want to be free. */
export interface Faction {
  id: number;
  realm: number;
  members: number[];
  since: number;
}

export type MessageKind =
  'war' | 'peace' | 'battle' | 'siege' | 'death' | 'building' | 'economy' | 'army' | 'event' | 'diplomacy';

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
  version: 4;
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
  pacts: Pact[];
  coalitions: Coalition[];
  factions: Faction[];
  /** great holy wars by faith: how many were called, and when the last one began */
  holyWars: Record<string, { count: number; last: number }>;
  /** proposals waiting for the player's answer */
  offers: Offer[];
  /** no AI treaty proposal reaches the player before this day */
  proposalCooldown: number;
  messages: Message[];
  nextId: number;
  player: number;
  /** bumped whenever a province changes owner or controller */
  mapVersion: number;
  /** bumped whenever borders change (owners, lieges) */
  borderVersion: number;
  /** bumped whenever treaties, wars or subjects change, for the diplomacy map */
  diploVersion: number;
  /** one-off scripted happenings still to come */
  scheduled: { day: number; event: string }[];
}
