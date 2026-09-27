/**
 * Modifiers a realm carries for a time: good harvests and famines, booms and depressions, reforms,
 * the fury of a horde, the burdens of total war. Events, world events and plots add them; each adds
 * its effects to the realm's figures, and the breakdowns name it.
 */
import { ICONS, type IconName } from '../assets/icons';
import modifiers from '../content/modifiers.json';
import { defineContent } from '../content/registry';
import { bool, num, obj, oneOf, opt, rec, str, type Optional, type Schema } from '../shared/schema';

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

// The content is read last: its schema takes the effects' keys from MODIFIER_TEXT, which must name them all.
const schema: Schema<Record<string, ModifierDef>> = rec(
  obj({
    name: str({ nonEmpty: true }),
    icon: oneOf(Object.keys(ICONS) as IconName[], 'an icon of the game'),
    blurb: str({ nonEmpty: true }),
    years: num({ min: 0 }),
    effects: obj(
      Object.fromEntries(Object.keys(MODIFIER_TEXT).map((k) => [k, opt(num())])) as Record<
        ModifierEffectKey,
        Optional<number>
      >,
    ),
    bad: opt(bool),
  }),
  str({ nonEmpty: true }),
);

/** The modifiers, from src/content/modifiers.json. */
export const MODIFIERS: Record<string, ModifierDef> = defineContent('modifiers', schema, modifiers);
