/** Featured starts on the choose-your-realm screen for 15 September 1066, from src/content/bookmarks.json. */
import bookmarks from '../content/bookmarks.json';
import { defineContent } from '../content/registry';
import { obj, oneOf, rec, str, type Schema } from '../shared/schema';

export const DIFFICULTIES = ['Easy', 'Moderate', 'Hard', 'Very hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export interface Bookmark {
  tag: string;
  difficulty: Difficulty;
  blurb: string;
}

export const SCENARIO_INTRO =
  'Edward the Confessor is dead, and three men claim the crown of England. Far to the east, Turkish horsemen ride against Byzantium, and the Song emperors rule the richest realm on earth.';

const schema: Schema<Record<string, Omit<Bookmark, 'tag'>>> = rec(
  obj({ difficulty: oneOf(DIFFICULTIES, 'a difficulty'), blurb: str({ nonEmpty: true }) }),
  str({ nonEmpty: true }),
);

/** The featured realms by tag, in the order the screen lists them. */
export const BOOKMARKS: Bookmark[] = Object.entries(defineContent('bookmarks', schema, bookmarks)).map(([tag, b]) => ({
  tag,
  ...b,
}));
