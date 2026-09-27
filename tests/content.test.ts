import { describe, expect, it } from 'vitest';
import { BOOKMARKS } from '../src/data/bookmarks';
import { MODIFIERS } from '../src/data/modifiers';
import { contentNames, extendContent } from '../src/content/registry';
import { arr, bool, num, obj, oneOf, opt, parse, problems, rec, str } from '../src/shared/schema';

describe('schemas', () => {
  const person = obj({
    name: str({ nonEmpty: true }),
    age: num({ min: 0, int: true }),
    title: opt(oneOf(['king', 'queen'] as const)),
    traits: arr(str()),
    alive: bool,
  });

  it('say where every problem lies', () => {
    expect(problems(person, { name: 'Harold', age: 44, traits: ['brave'], alive: true }, 'ruler')).toEqual([]);
    expect(
      problems(person, { name: '', age: 44.5, title: 'duke', traits: [3], alive: 'yes', crown: true }, 'ruler'),
    ).toEqual([
      'ruler.crown: is not a known key',
      'ruler.name: must not be empty',
      'ruler.age: must be a whole number',
      'ruler.title: "duke" is not one of the known values',
      'ruler.traits[0]: must be text',
      'ruler.alive: must be true or false',
    ]);
    expect(problems(person, { name: 'Harold' }, 'ruler')).toEqual([
      'ruler.age: is missing',
      'ruler.traits: is missing',
      'ruler.alive: is missing',
    ]);
    expect(problems(rec(num({ max: 3 })), { a: 1, b: 9 }, 'scores')).toEqual(['scores.b: must be at most 3']);
    expect(() => parse(person, null, 'ruler')).toThrow(/ruler does not fit its schema:\nruler: must be an object/);
  });
});

describe('the content registry', () => {
  it('holds the featured realms and the modifiers as they were', () => {
    expect(contentNames()).toEqual(expect.arrayContaining(['bookmarks', 'modifiers']));
    expect(BOOKMARKS).toHaveLength(14);
    expect(BOOKMARKS[0]).toMatchObject({ tag: 'ENG', difficulty: 'Hard' });
    expect(BOOKMARKS.at(-1)).toMatchObject({ tag: 'GHA', difficulty: 'Very hard' });
    expect(Object.keys(MODIFIERS)).toHaveLength(37);
    expect(MODIFIERS.famine).toMatchObject({
      name: 'Famine',
      icon: 'grain',
      years: 3,
      effects: { tax: -0.1, levy: -0.15, growth: -0.5, commons: -10 },
    });
  });

  it('lets a mod add or change entries, and refuses ones that do not fit', () => {
    const plague = {
      name: 'Murrain',
      icon: 'death-skull',
      blurb: 'The cattle die.',
      years: 2,
      effects: { tax: -0.05 },
    };
    expect(extendContent('modifiers', { murrain: plague })).toEqual([]);
    expect(MODIFIERS.murrain).toEqual(plague);
    expect(extendContent('modifiers', { blight: { ...plague, icon: 'unicorn-horn', effects: { luck: 1 } } })).toEqual([
      'modifiers.blight.icon: "unicorn-horn" is not an icon of the game',
      'modifiers.blight.effects.luck: is not a known key',
    ]);
    expect(MODIFIERS.blight).toBeUndefined();
    expect(extendContent('dragons', {})).toEqual(['There is no content called "dragons".']);
    delete MODIFIERS.murrain;
  });
});
