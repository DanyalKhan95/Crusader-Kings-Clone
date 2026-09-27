/**
 * The encyclopedia's shape: its categories, what an entry holds, and search. The entries themselves
 * are the rules of the game, written out (rules.tsx), and the game's own data (data.tsx).
 */
import type { ReactNode } from 'react';
import type { IconName } from '../../assets/icons';
import type { Game } from '../game';

export type CategoryId =
  | 'rules'
  | 'technologies'
  | 'eras'
  | 'arms'
  | 'ships'
  | 'buildings'
  | 'laws'
  | 'governments'
  | 'court'
  | 'war'
  | 'faiths'
  | 'nations'
  | 'events'
  | 'modifiers'
  | 'traits'
  | 'plots'
  | 'plagues';

export interface Category {
  id: CategoryId;
  name: string;
  icon: IconName;
  blurb: string;
}

export const CATEGORIES: Category[] = [
  { id: 'rules', name: 'How the world works', icon: 'scroll-quill', blurb: 'Every mechanic, with its numbers.' },
  { id: 'technologies', name: 'Technologies', icon: 'graduate-cap', blurb: 'Three tracks of 33 levels each.' },
  { id: 'eras', name: 'Eras', icon: 'hourglass', blurb: 'Six ages, from the medieval to the contemporary.' },
  { id: 'arms', name: 'Arms of the army', icon: 'crossed-swords', blurb: 'Levies and men-at-arms, age by age.' },
  { id: 'ships', name: 'Ships', icon: 'galleon', blurb: 'Warships by role, and the transports.' },
  { id: 'buildings', name: 'Buildings', icon: 'castle', blurb: 'Seven kinds, six levels each.' },
  { id: 'laws', name: 'Laws', icon: 'scales', blurb: 'Succession, crown authority, taxes, levies and faith.' },
  { id: 'governments', name: 'Governments', icon: 'stone-throne', blurb: 'From tribal chiefdoms to democracies.' },
  {
    id: 'court',
    name: 'Estates and council',
    icon: 'meeple-group',
    blurb: 'The powers of the realm and the crown’s servants.',
  },
  { id: 'war', name: 'War and treaties', icon: 'shaking-hands', blurb: 'Causes for war, and the treaties of peace.' },
  { id: 'faiths', name: 'Faiths', icon: 'church', blurb: 'The faiths of the world and their heresies.' },
  { id: 'nations', name: 'Nations', icon: 'stone-tower', blurb: 'Great nations a realm may proclaim.' },
  { id: 'events', name: 'Events', icon: 'scroll-quill', blurb: 'What may befall a realm, and the choices.' },
  { id: 'modifiers', name: 'Modifiers', icon: 'hourglass', blurb: 'Boons and misfortunes that last for years.' },
  { id: 'traits', name: 'Traits', icon: 'crown', blurb: 'What rulers and councillors are like.' },
  { id: 'plots', name: 'Plots', icon: 'spy', blurb: 'What a spy network can be spent on.' },
  {
    id: 'plagues',
    name: 'Plagues',
    icon: 'plague-doctor-profile',
    blurb: 'The great pestilences, and when they come.',
  },
];

export const CATEGORY = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<CategoryId, Category>;

export interface Entry {
  /** `rule:taxes`, `tech:guilds`, `unit:knights` … */
  id: string;
  category: CategoryId;
  /** the heading it is listed under within its category */
  group?: string;
  title: string;
  icon?: IconName;
  /** one line: for lists, search and the head of the entry */
  summary: string;
  body: (game: Game) => ReactNode;
  /** the realm's own figures, while a campaign is played */
  live?: (game: Game) => ReactNode;
  see?: string[];
  /** more words it is found by */
  terms?: string[];
}

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Entries that match every word of the query, best first: a title that begins with it, then a title
 * that holds it, then the rest (summary, heading and search words).
 */
export function search(entries: Entry[], query: string, limit = 60): Entry[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const scored: { e: Entry; score: number }[] = [];
  for (const e of entries) {
    const title = fold(e.title);
    const rest = fold([e.summary, e.group ?? '', ...(e.terms ?? [])].join(' '));
    let score = 0;
    let all = true;
    for (const w of words) {
      if (title.startsWith(w)) score += 6;
      else if (title.split(/[\s(–-]+/).some((t) => t.startsWith(w))) score += 4;
      else if (title.includes(w)) score += 3;
      else if (rest.includes(w)) score += 1;
      else {
        all = false;
        break;
      }
    }
    // The rules come first among equals: they explain, the data lists.
    if (all) scored.push({ e, score: score + (e.category === 'rules' ? 0.5 : 0) });
  }
  scored.sort((a, b) => b.score - a.score || a.e.title.localeCompare(b.e.title));
  return scored.slice(0, limit).map((x) => x.e);
}
