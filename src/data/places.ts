/**
 * Place names by age and by culture (src/content/places.json), keyed by a province's name in the map
 * data. `period` replaces a name the map pipeline could only take from a modern admin region ("North-
 * West Aktobe"), for good. `names` are tried in order, and the first whose conditions all hold names
 * the province: from a year, until a year, or while its owner is of one of some cultures or culture
 * groups. When none holds, the province keeps its name.
 */
import places from '../content/places.json';
import { defineContent } from '../content/registry';
import { arr, num, obj, opt, rec, str, type Schema } from '../shared/schema';

export interface PlaceRule {
  name: string;
  /** from this year on */
  from?: number;
  /** before this year */
  until?: number;
  /** while the owner is of one of these culture groups */
  groups?: string[];
  /** while the owner is of one of these cultures */
  cultures?: string[];
}

export interface PlaceDef {
  period?: string;
  names?: PlaceRule[];
}

const schema: Schema<Record<string, PlaceDef>> = rec(
  obj({
    period: opt(str({ nonEmpty: true })),
    names: opt(
      arr(
        obj({
          name: str({ nonEmpty: true }),
          from: opt(num({ int: true })),
          until: opt(num({ int: true })),
          groups: opt(arr(str({ nonEmpty: true }))),
          cultures: opt(arr(str({ nonEmpty: true }))),
        }),
      ),
    ),
  }),
  str({ nonEmpty: true }),
);

/** Names of places, from src/content/places.json. */
export const PLACES: Record<string, PlaceDef> = defineContent('places', schema, places);
