/**
 * Modifiers a realm carries for a time: good harvests and famines, booms and depressions, reforms,
 * the fury of a horde, the burdens of total war. Events, world events and plots add them; each adds
 * its effects to the realm's figures, and the breakdowns name it.
 */
import type { IconName } from '../assets/icons';

export interface ModifierEffects {
  /** fraction added to taxes */
  tax?: number;
  /** fraction added to levies */
  levy?: number;
  /** fraction added to the chance of development growth */
  growth?: number;
  /** fraction added to research */
  research?: number;
  /** fraction added to the damage armies deal */
  combat?: number;
  /** added to the daily recovery of morale (fraction of full) */
  morale?: number;
  /** points added to the legitimacy target */
  legitimacy?: number;
  /** points added to the loyalty of the nobility */
  nobles?: number;
  /** points added to the loyalty of the clergy */
  clergy?: number;
  /** points added to the loyalty of the burghers */
  burghers?: number;
  /** points added to the loyalty of the commons */
  commons?: number;
  /** points added to what every other realm thinks of this one */
  opinion?: number;
  /** fraction taken off the chance that pestilence spreads into the realm */
  quarantine?: number;
  /** heresies die out this many times faster in the realm */
  heresyFade?: number;
  /** the AI looks for wars this much more eagerly (1 = twice as often) */
  aggression?: number;
  /** fraction added to the growth of the realm's spy networks */
  spies?: number;
}

export type ModifierEffectKey = keyof ModifierEffects;

export interface ModifierDef {
  name: string;
  icon: IconName;
  blurb: string;
  /** how long it lasts, in years, unless the event says otherwise */
  years: number;
  effects: ModifierEffects;
  /** a misfortune rather than a boon */
  bad?: boolean;
}

export const MODIFIERS: Record<string, ModifierDef> = {
  // ── The land ────────────────────────────────────────────────────
  bountiful_harvest: {
    name: 'Bountiful harvests',
    icon: 'wheat',
    blurb: 'Full barns and fat herds: the people multiply.',
    years: 5,
    effects: { growth: 0.25, tax: 0.05, commons: 5 },
  },
  famine: {
    name: 'Famine',
    icon: 'grain',
    blurb: 'The harvests failed. The hungry pay little and fight worse.',
    years: 3,
    effects: { tax: -0.1, levy: -0.15, growth: -0.5, commons: -10 },
    bad: true,
  },
  brigandage: {
    name: 'Brigandage',
    icon: 'bandit',
    blurb: 'Outlaws hold the roads, and the tax collectors ride in fear.',
    years: 3,
    effects: { tax: -0.1, growth: -0.1 },
    bad: true,
  },
  silver_mine: {
    name: 'A rich mine',
    icon: 'gold-mine',
    blurb: 'A new vein of silver pays into the treasury.',
    years: 30,
    effects: { tax: 0.1 },
  },
  trade_boom: {
    name: 'Trade boom',
    icon: 'caravan',
    blurb: 'Merchants crowd the markets and the tolls overflow.',
    years: 10,
    effects: { tax: 0.1, burghers: 5 },
  },
  quarantine: {
    name: 'Quarantine',
    icon: 'plague-doctor-profile',
    blurb: 'The gates are shut and ships wait offshore: trade suffers, but the pestilence is slowed.',
    years: 2,
    effects: { quarantine: 0.6, tax: -0.1, burghers: -5 },
  },
  mourning: {
    name: 'A realm in mourning',
    icon: 'coffin',
    blurb: 'The dead lie unburied, and the living have little to give.',
    years: 5,
    effects: { tax: -0.1, levy: -0.2, commons: -5 },
    bad: true,
  },
  // ── The court ───────────────────────────────────────────────────
  martial_fervour: {
    name: 'Martial fervour',
    icon: 'crossed-sabres',
    blurb: 'Tournaments and hunts have made warriors of the young lords.',
    years: 10,
    effects: { combat: 0.1, nobles: 5 },
  },
  scholars: {
    name: 'A gathering of scholars',
    icon: 'open-book',
    blurb: 'Learned men from abroad teach at the court.',
    years: 15,
    effects: { research: 0.1 },
  },
  good_omen: {
    name: 'A good omen',
    icon: 'comet-spark',
    blurb: 'Heaven has shown its favour to the crown.',
    years: 5,
    effects: { legitimacy: 5, commons: 5 },
  },
  ill_omen: {
    name: 'An ill omen',
    icon: 'comet-spark',
    blurb: 'The people whisper that heaven has turned against the crown.',
    years: 5,
    effects: { legitimacy: -5, commons: -5 },
    bad: true,
  },
  golden_age: {
    name: 'Golden age',
    icon: 'laurel-crown',
    blurb: 'Poets, painters and builders make the capital the wonder of its age.',
    years: 20,
    effects: { tax: 0.05, research: 0.05, legitimacy: 5, opinion: 10 },
  },
  corruption: {
    name: 'Corruption',
    icon: 'receive-money',
    blurb: 'Officials line their pockets and sell their offices.',
    years: 5,
    effects: { tax: -0.1, legitimacy: -5 },
    bad: true,
  },
  military_reforms: {
    name: 'Military reforms',
    icon: 'swords-emblem',
    blurb: 'New drill and new officers have remade the army.',
    years: 20,
    effects: { combat: 0.1, morale: 0.01 },
  },
  call_to_arms: {
    name: 'Call to arms',
    icon: 'rally-the-troops',
    blurb: 'Every village has sent its young men to the muster.',
    years: 5,
    effects: { levy: 0.25, commons: -5 },
  },
  // ── Faith ───────────────────────────────────────────────────────
  counter_reformation: {
    name: 'Counter-Reformation',
    icon: 'church',
    blurb: 'Preachers, schools and inquisitors hold the people to the old faith and win them back.',
    years: 50,
    effects: { heresyFade: 4, clergy: 10, burghers: -5 },
  },
  religious_peace: {
    name: 'Religious peace',
    icon: 'dove',
    blurb: 'Each may follow his conscience, and the realm is at peace with itself.',
    years: 30,
    effects: { commons: 5, burghers: 5, clergy: -10 },
  },
  reformed_zeal: {
    name: 'Reformed zeal',
    icon: 'book-cover',
    blurb: 'The Word in the people’s own tongue has kindled a new fervour.',
    years: 25,
    effects: { legitimacy: 5, research: 0.05, levy: 0.05 },
  },
  crusading_zeal: {
    name: 'Crusading zeal',
    icon: 'holy-grail',
    blurb: 'Preachers call the faithful to fight for the faith.',
    years: 10,
    effects: { combat: 0.05, clergy: 5, levy: 0.1 },
  },
  // ── Ideas and industry ──────────────────────────────────────────
  printing_presses: {
    name: 'Free presses',
    icon: 'book-cover',
    blurb: 'Presses in every town print books, pamphlets and heresies.',
    years: 30,
    effects: { research: 0.12, clergy: -5 },
  },
  licensed_presses: {
    name: 'Licensed presses',
    icon: 'tied-scroll',
    blurb: 'Only what the censors approve may be printed.',
    years: 30,
    effects: { research: 0.05, clergy: 5 },
  },
  enlightened_court: {
    name: 'Enlightened court',
    icon: 'telescope',
    blurb: 'Philosophers correspond with the crown and academies flourish.',
    years: 25,
    effects: { research: 0.15, burghers: 5, clergy: -5 },
  },
  industrial_boom: {
    name: 'Industrial boom',
    icon: 'factory',
    blurb: 'Mills and foundries rise in every town; the workers toil long hours.',
    years: 30,
    effects: { growth: 0.25, tax: 0.1, commons: -10, burghers: 10 },
  },
  factory_acts: {
    name: 'Factory acts',
    icon: 'scales',
    blurb: 'The law limits hours and bans child labour in the mills.',
    years: 30,
    effects: { growth: 0.1, commons: 10 },
  },
  railway_boom: {
    name: 'Railway boom',
    icon: 'steam-locomotive',
    blurb: 'State railways bind the country together.',
    years: 25,
    effects: { tax: 0.1, growth: 0.1 },
  },
  railway_speculation: {
    name: 'Railway speculation',
    icon: 'money-stack',
    blurb: 'Private companies race to lay track, and fortunes are made and lost.',
    years: 20,
    effects: { tax: 0.05, burghers: 10 },
  },
  trade_unions: {
    name: 'Trade unions',
    icon: 'fist',
    blurb: 'Workers bargain together for their wages.',
    years: 25,
    effects: { commons: 15, burghers: -5, tax: -0.05 },
  },
  repression: {
    name: 'Repression',
    icon: 'handcuffed',
    blurb: 'Agitators are jailed and newspapers closed.',
    years: 10,
    effects: { commons: -15, legitimacy: -5, burghers: -5 },
    bad: true,
  },
  national_awakening: {
    name: 'National awakening',
    icon: 'flying-flag',
    blurb: 'Poets and historians teach the people that they are one nation.',
    years: 20,
    effects: { legitimacy: 5, levy: 0.1, commons: 5 },
  },
  // ── The modern world ────────────────────────────────────────────
  depression: {
    name: 'Depression',
    icon: 'receive-money',
    blurb: 'Banks have failed and factories stand idle.',
    years: 5,
    effects: { tax: -0.2, growth: -0.3, commons: -10 },
    bad: true,
  },
  austerity: {
    name: 'Austerity',
    icon: 'scales',
    blurb: 'The government balances its books on the backs of the poor.',
    years: 5,
    effects: { tax: 0.05, commons: -15 },
  },
  public_works: {
    name: 'Public works',
    icon: 'hammer-nails',
    blurb: 'The state builds roads, dams and houses to put people to work.',
    years: 8,
    effects: { growth: 0.2, commons: 10 },
  },
  tariffs: {
    name: 'Tariff walls',
    icon: 'coins',
    blurb: 'Foreign goods pay heavy duties at the border.',
    years: 10,
    effects: { tax: 0.05, growth: -0.1, burghers: 10 },
  },
  total_war: {
    name: 'Total war',
    icon: 'trench-assault',
    blurb: 'The whole nation, its men, its factories and its wealth, serves the war.',
    years: 1,
    effects: { levy: 0.5, tax: 0.1, commons: -10, burghers: -5 },
  },
  space_age: {
    name: 'The space age',
    icon: 'rocket',
    blurb: 'The nation that reached for the stars leads the world in science.',
    years: 25,
    effects: { research: 0.1, legitimacy: 5, opinion: 10 },
  },
  // ── Enemies ─────────────────────────────────────────────────────
  horde: {
    name: 'The Horde',
    icon: 'bow-arrow',
    blurb: 'The tribes of the steppe ride as one under a conqueror, and the world trembles.',
    years: 60,
    effects: { combat: 0.35, levy: 1, morale: 0.02, aggression: 3, tax: -0.2 },
  },
  sabotaged: {
    name: 'Sabotage',
    icon: 'burning-embers',
    blurb: 'Fires in the workshops and poisoned wells: someone is working against the realm.',
    years: 2,
    effects: { tax: -0.1, growth: -0.2 },
    bad: true,
  },
};

/** How a modifier's effects read, for tooltips. */
export const MODIFIER_TEXT: Record<ModifierEffectKey, (v: number) => string> = {
  tax: (v) => `Taxes ${pct(v)}`,
  levy: (v) => `Levies ${pct(v)}`,
  growth: (v) => `Growth ${pct(v)}`,
  research: (v) => `Research ${pct(v)}`,
  combat: (v) => `Damage in battle ${pct(v)}`,
  // Armies recover 3% of their morale a day.
  morale: (v) => `Morale recovery ${pct(v / 0.03)}`,
  legitimacy: (v) => `Legitimacy ${pts(v)}`,
  nobles: (v) => `Nobility ${pts(v)}`,
  clergy: (v) => `Clergy ${pts(v)}`,
  burghers: (v) => `Burghers ${pts(v)}`,
  commons: (v) => `Commons ${pts(v)}`,
  opinion: (v) => `Opinion of us ${pts(v)}`,
  quarantine: (v) => `Pestilence spreads ${pct(-v)} into the realm`,
  heresyFade: (v) => `Heresies die out ${v + 1}× as fast`,
  aggression: () => `Hungry for conquest`,
  spies: (v) => `Spy networks grow ${pct(v)}`,
};

function pct(v: number): string {
  return `${v > 0 ? '+' : '−'}${Math.abs(Math.round(v * 100))}%`;
}

function pts(v: number): string {
  return `${v > 0 ? '+' : '−'}${Math.abs(Math.round(v))}`;
}
