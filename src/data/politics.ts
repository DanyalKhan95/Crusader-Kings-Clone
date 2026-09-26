/** Laws, estates, council tasks and governments: names, blurbs and the numbers behind them. */
import type { Government } from '../shared/dataTypes';
import type { CouncilSeat, EstateId, Succession, TaskId } from '../sim/types';

export const SUCCESSION_INFO: Record<Succession, { name: string; blurb: string }> = {
  hereditary: {
    name: 'Hereditary',
    blurb: 'The heir inherits the crown, and most of its legitimacy with it. The heir may be a fool.',
  },
  elective: {
    name: 'Elective',
    blurb: 'The great men of the realm elect the ablest candidate. The new ruler starts with less legitimacy.',
  },
  republic: {
    name: 'Republic',
    blurb: 'The council elects a ruler for eight years. Elections do not shake the realm.',
  },
  theocratic: {
    name: 'Theocratic',
    blurb: 'The clergy choose the most learned among them.',
  },
};

export type LevelLaw = 'crown' | 'conscription' | 'taxation' | 'tolerance';

export const LEVEL_LAWS: Record<LevelLaw, { name: string; blurb: string; levels: string[]; effects: string[] }> = {
  crown: {
    name: 'Crown authority',
    blurb: 'How much the crown may demand of its vassals.',
    levels: ['Autonomous vassals', 'Limited authority', 'High authority', 'Absolute authority'],
    effects: [
      'Vassals pay 15% of their taxes; they like it (+10 loyalty), and so do the nobles.',
      'Vassals pay 25% of their taxes.',
      'Vassals pay 35% of their taxes; they resent it (−10 loyalty), and so do the nobles.',
      'Vassals pay 45% of their taxes; they hate it (−20 loyalty), and so do the nobles.',
    ],
  },
  conscription: {
    name: 'Conscription',
    blurb: 'How many men the realm may call to arms.',
    levels: ['Light', 'Standard', 'Heavy', 'Total'],
    effects: [
      'Levies ×0.75. The commons are grateful.',
      'Levies as custom allows.',
      'Levies ×1.3, taxes −5%. The commons resent it.',
      'Levies ×1.6, taxes −10%. The commons are close to revolt.',
    ],
  },
  taxation: {
    name: 'Taxation',
    blurb: 'How hard the realm is taxed.',
    levels: ['Low', 'Standard', 'High', 'Crushing'],
    effects: [
      'Taxes ×0.8. Commons and burghers are grateful.',
      'Taxes as custom allows.',
      'Taxes ×1.2. Commons and burghers grumble.',
      'Taxes ×1.4. Commons and burghers are close to revolt.',
    ],
  },
  tolerance: {
    name: 'Religious policy',
    blurb: 'How the crown treats those of other faiths.',
    levels: ['Persecution', 'Established church', 'Tolerance'],
    effects: [
      'Other faiths are hunted: conversion is half again as fast, and the clergy approve (+10), but unbelievers pay and serve less and the commons suffer more strife.',
      'The state church is favoured and other faiths are suffered.',
      'All may worship in peace: other faiths pay and serve more and strife is halved, but conversion is slow and the clergy disapprove (−15).',
    ],
  },
};

export const CROWN_TRIBUTE = [0.15, 0.25, 0.35, 0.45];
export const CROWN_VASSALS = [10, 0, -10, -20];
export const CROWN_NOBLES = [15, 0, -15, -35];
export const CONSCRIPTION_LEVY = [0.75, 1, 1.3, 1.6];
export const CONSCRIPTION_TAX = [0, 0, -0.05, -0.1];
export const CONSCRIPTION_COMMONS = [5, 0, -15, -35];
export const TAXATION_TAX = [0.8, 1, 1.2, 1.4];
export const TAXATION_COMMONS = [10, 0, -15, -35];
export const TAXATION_BURGHERS = [10, 0, -20, -40];
/** Years between changes of law. */
export const LAW_COOLDOWN_YEARS = 5;

export const ESTATE_INFO: Record<
  EstateId,
  { name: string; tribal?: string; blurb: string; privilege: string; privilegeBlurb: string }
> = {
  nobles: {
    name: 'Nobility',
    tribal: 'Chieftains',
    blurb: 'Lords of the land and its castles. They lead the levies.',
    privilege: 'Noble exemptions',
    privilegeBlurb: 'The lords pay less: taxes −5%.',
  },
  clergy: {
    name: 'Clergy',
    blurb: 'Bishops and abbots. They lend the crown its sanctity.',
    privilege: 'Church immunities',
    privilegeBlurb: 'The church keeps its tithes: taxes −5%.',
  },
  burghers: {
    name: 'Burghers',
    blurb: 'Merchants and guildsmen of the towns. They fill the treasury.',
    privilege: 'Town charters',
    privilegeBlurb: 'The towns govern themselves: taxes −5%.',
  },
  commons: {
    name: 'Commons',
    blurb: 'Peasants and freemen: the backbone of the levies.',
    privilege: 'Common rights',
    privilegeBlurb: 'Customary rights to woods and fields: levies −10%.',
  },
};

/** How power is shared between the estates, before buildings and privileges. */
export const ESTATE_WEIGHT: Record<Government, Record<EstateId, number>> = {
  feudal: { nobles: 40, clergy: 25, burghers: 15, commons: 20 },
  imperial: { nobles: 30, clergy: 25, burghers: 20, commons: 25 },
  clan: { nobles: 45, clergy: 20, burghers: 10, commons: 25 },
  tribal: { nobles: 50, clergy: 15, burghers: 5, commons: 30 },
  nomadic: { nobles: 60, clergy: 10, burghers: 5, commons: 25 },
  republic: { nobles: 15, clergy: 15, burghers: 50, commons: 20 },
  theocracy: { nobles: 20, clergy: 50, burghers: 10, commons: 20 },
};

export const GOVERNMENT_INFO: Record<Government, { name: string; tax: number; levy: number; blurb: string }> = {
  feudal: { name: 'Feudal monarchy', tax: 0, levy: 0, blurb: 'Lords hold land from the crown and owe it service.' },
  imperial: {
    name: 'Imperial administration',
    tax: 0.1,
    levy: 0,
    blurb: 'A salaried bureaucracy collects the taxes: +10%.',
  },
  clan: { name: 'Clan', tax: 0, levy: 0.1, blurb: 'Kinsmen rule the provinces and bring their men: levies +10%.' },
  tribal: {
    name: 'Tribal chiefdom',
    tax: -0.2,
    levy: 0.2,
    blurb: 'Every free man is a warrior, few pay taxes: levies +20%, taxes −20%.',
  },
  nomadic: {
    name: 'Nomadic horde',
    tax: -0.3,
    levy: 0.3,
    blurb: 'The whole people rides to war: levies +30%, taxes −30%.',
  },
  republic: {
    name: 'Merchant republic',
    tax: 0.2,
    levy: -0.2,
    blurb: 'Trade fills the coffers, mercenaries fill the ranks: taxes +20%, levies −20%.',
  },
  theocracy: {
    name: 'Theocracy',
    tax: 0,
    levy: 0,
    blurb: 'The church rules in God’s name: legitimacy +10.',
  },
};

export const TASK_INFO: Record<TaskId, { seat: CouncilSeat; name: string; blurb: string }> = {
  negotiate: { seat: 'chancellor', name: 'Negotiate', blurb: 'Better peace terms and slower war weariness.' },
  embassies: { seat: 'chancellor', name: 'Send embassies', blurb: 'Every realm thinks a little better of us.' },
  claims: { seat: 'chancellor', name: 'Search the archives', blurb: 'Claims are forged in two-thirds of the time.' },
  levies: { seat: 'marshal', name: 'Muster the levies', blurb: 'Larger levies.' },
  drill: { seat: 'marshal', name: 'Drill the troops', blurb: 'Armies recover their morale faster.' },
  taxes: { seat: 'steward', name: 'Collect taxes', blurb: 'Higher taxes.' },
  develop: { seat: 'steward', name: 'Develop the land', blurb: 'Provinces grow faster.' },
  sieges: { seat: 'spymaster', name: 'Undermine walls', blurb: 'Faster sieges.' },
  watch: { seat: 'spymaster', name: 'Watch the realm', blurb: 'Estates and vassals are more loyal.' },
  stability: { seat: 'chaplain', name: 'Preach obedience', blurb: 'Stability recovers faster.' },
  legitimacy: { seat: 'chaplain', name: 'Anoint the crown', blurb: 'Legitimacy grows towards a higher mark.' },
  convert: {
    seat: 'chaplain',
    name: 'Send missionaries',
    blurb: 'Provinces of other faiths turn to ours, one by one.',
  },
  assimilate: {
    seat: 'steward',
    name: 'Found schools',
    blurb: 'Provinces of other peoples take up our tongue and ways, one by one.',
  },
};

export const SEAT_TASKS: Record<CouncilSeat, TaskId[]> = {
  chancellor: ['negotiate', 'embassies', 'claims'],
  marshal: ['levies', 'drill'],
  steward: ['taxes', 'develop', 'assimilate'],
  spymaster: ['sieges', 'watch'],
  chaplain: ['stability', 'legitimacy', 'convert'],
};

export const DEFAULT_TASKS: Record<CouncilSeat, TaskId> = {
  chancellor: 'negotiate',
  marshal: 'levies',
  steward: 'taxes',
  spymaster: 'sieges',
  chaplain: 'stability',
};
