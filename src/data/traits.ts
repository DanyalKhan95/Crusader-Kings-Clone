/** Character traits: small skill changes plus a little behaviour for the AI. */
import type { Skill } from '../sim/types';

export interface TraitDef {
  name: string;
  skills?: Partial<Record<Skill, number>>;
  /** multiplies yearly mortality */
  mortality?: number;
  /** AI appetite for war, -1 … 1 */
  aggression?: number;
  kind: 'education' | 'personality' | 'nature';
  blurb: string;
}

export const TRAITS: Record<string, TraitDef> = {
  diplomat: { name: 'Diplomat', kind: 'education', skills: { dip: 4 }, blurb: 'Schooled in the art of the envoy.' },
  strategist: {
    name: 'Strategist',
    kind: 'education',
    skills: { mar: 4 },
    blurb: 'Raised in the saddle and the war camp.',
  },
  administrator: {
    name: 'Administrator',
    kind: 'education',
    skills: { stw: 4 },
    blurb: 'Knows every ledger and toll.',
  },
  schemer: { name: 'Schemer', kind: 'education', skills: { int: 4 }, blurb: 'Learned whispers before letters.' },
  scholar: { name: 'Scholar', kind: 'education', skills: { lrn: 4 }, blurb: 'Taught by monks and masters.' },
  brave: { name: 'Brave', kind: 'personality', skills: { mar: 2 }, aggression: 0.3, blurb: 'First into the breach.' },
  craven: { name: 'Craven', kind: 'personality', skills: { mar: -2 }, aggression: -0.3, blurb: 'Prefers the rear.' },
  ambitious: {
    name: 'Ambitious',
    kind: 'personality',
    skills: { dip: 1, mar: 1, stw: 1, int: 1, lrn: 1 },
    aggression: 0.4,
    blurb: 'Wants more, and will take it.',
  },
  content: {
    name: 'Content',
    kind: 'personality',
    skills: { int: -1 },
    aggression: -0.4,
    blurb: 'Asks little of the world.',
  },
  just: {
    name: 'Just',
    kind: 'personality',
    skills: { stw: 2, int: -1 },
    blurb: 'Judges fairly, and is known for it.',
  },
  cruel: { name: 'Cruel', kind: 'personality', skills: { int: 2, dip: -2 }, aggression: 0.2, blurb: 'Rules by fear.' },
  gregarious: {
    name: 'Gregarious',
    kind: 'personality',
    skills: { dip: 2 },
    blurb: 'Every hall falls silent to listen.',
  },
  shy: { name: 'Shy', kind: 'personality', skills: { dip: -2, lrn: 1 }, blurb: 'Happier among books than courtiers.' },
  pious: { name: 'Pious', kind: 'personality', skills: { lrn: 2 }, blurb: 'Devout in word and deed.' },
  cynical: {
    name: 'Cynical',
    kind: 'personality',
    skills: { int: 2, lrn: -2 },
    blurb: 'Believes in little but results.',
  },
  genius: {
    name: 'Genius',
    kind: 'nature',
    skills: { dip: 3, mar: 3, stw: 3, int: 3, lrn: 3 },
    blurb: 'A mind seen once in a generation.',
  },
  quick: { name: 'Quick', kind: 'nature', skills: { dip: 1, mar: 1, stw: 1, int: 1, lrn: 1 }, blurb: 'Sharp of wit.' },
  slow: {
    name: 'Slow',
    kind: 'nature',
    skills: { dip: -2, mar: -2, stw: -2, int: -2, lrn: -2 },
    blurb: 'Slow of wit.',
  },
  strong: { name: 'Strong', kind: 'nature', skills: { mar: 2 }, mortality: 0.6, blurb: 'Hale and powerfully built.' },
  frail: { name: 'Frail', kind: 'nature', skills: { mar: -1 }, mortality: 2, blurb: 'Often ill.' },
};

export const EDUCATION_BY_SKILL: Record<Skill, string> = {
  dip: 'diplomat',
  mar: 'strategist',
  stw: 'administrator',
  int: 'schemer',
  lrn: 'scholar',
};

export const PERSONALITY = [
  'brave',
  'craven',
  'ambitious',
  'content',
  'just',
  'cruel',
  'gregarious',
  'shy',
  'pious',
  'cynical',
];
/** Pairs that exclude each other. */
export const OPPOSITES: [string, string][] = [
  ['brave', 'craven'],
  ['ambitious', 'content'],
  ['just', 'cruel'],
  ['gregarious', 'shy'],
  ['pious', 'cynical'],
  ['genius', 'slow'],
  ['quick', 'slow'],
  ['strong', 'frail'],
];
