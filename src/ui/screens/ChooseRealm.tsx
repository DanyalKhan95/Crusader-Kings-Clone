import { useEffect, useRef } from 'react';
import { BOOKMARKS, SCENARIO_INTRO, type Difficulty } from '../../data/bookmarks';
import { flyToRealm, startAs, toMenu } from '../actions';
import { CoatOfArms } from '../CoatOfArms';
import { capitalize, formatDate } from '../format';
import { useGame } from '../game';
import { Icon } from '../Icon';
import { CountryFacts, CountryHeader } from '../realm';
import { useMapInsets } from '../map/useMapInsets';
import { useStore } from '../store';

const DIFFICULTY_CLASS: Record<Difficulty, string> = {
  Easy: 'easy',
  Moderate: 'moderate',
  Hard: 'hard',
  'Very hard': 'very-hard',
};

export function ChooseRealm() {
  const game = useGame();
  const selected = useStore(game.ui, (s) => s.selectedCountry);
  const country = selected ? game.state.countries[selected] : null;
  const bookmark = country ? BOOKMARKS.find((b) => b.tag === country.tag) : undefined;

  const listRef = useRef<HTMLElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  useMapInsets([listRef, detailRef]);

  // Frame the opening realm once the panels are measured.
  useEffect(() => {
    const first = game.ui.get().selectedCountry;
    if (first) flyToRealm(game, first, 0.25, 0.9);
  }, [game]);

  const choose = (index: number) => {
    game.ui.set({ selectedCountry: index });
    flyToRealm(game, index, 0.25, 0.9);
  };

  return (
    <div className="choose">
      <aside ref={listRef} className="panel choose-list" aria-label="Featured realms">
        <div className="choose-intro">
          <button className="btn ghost back" onClick={() => toMenu(game)}>
            <span aria-hidden="true">‹</span> Main menu
          </button>
          <h1 className="display choose-title">{game.scenario.name}</h1>
          <p className="caps choose-date">{formatDate(game.state.date)}</p>
          <p className="choose-text">{SCENARIO_INTRO}</p>
        </div>
        <h2 className="section-title">Featured realms</h2>
        <ul className="bookmarks">
          {BOOKMARKS.map((b) => {
            const c = game.state.byTag.get(b.tag);
            if (!c) return null;
            return (
              <li key={b.tag}>
                <button
                  className={`bookmark ${selected === c.index ? 'active' : ''}`}
                  onClick={() => choose(c.index)}
                  aria-pressed={selected === c.index}
                >
                  <CoatOfArms country={c} size={30} />
                  <span className="bookmark-text">
                    <span className="bookmark-name">{capitalize(c.short)}</span>
                    <span className="bookmark-ruler">{c.ruler?.name ?? c.name}</span>
                  </span>
                  <span className={`difficulty ${DIFFICULTY_CLASS[b.difficulty]}`}>{b.difficulty}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="choose-hint">
          <Icon name="compass" /> Or click any realm on the map. Every one of them can be played.
        </p>
      </aside>

      {country && (
        <section ref={detailRef} className="panel choose-detail" aria-live="polite">
          <CountryHeader country={country} size={72} onLiege={choose} />
          {bookmark ? (
            <p className="blurb">{bookmark.blurb}</p>
          ) : (
            <p className="blurb dim">{genericBlurb(country.rank, country.liege !== 0)}</p>
          )}
          <CountryFacts country={country} />
          <div className="choose-actions">
            {bookmark && (
              <span className={`difficulty ${DIFFICULTY_CLASS[bookmark.difficulty]}`}>{bookmark.difficulty}</span>
            )}
            <button className="btn primary big" onClick={() => startAs(game, country.index)}>
              Play as {country.short}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function genericBlurb(rank: string, vassal: boolean): string {
  if (vassal)
    return 'A vassal realm, bound by oath to a greater lord. Serve loyally, or wait for the day to break free.';
  switch (rank) {
    case 'empire':
      return 'An empire of many peoples. Hold it together, and it can shape the whole age.';
    case 'kingdom':
      return 'A kingdom with its own crown and its own ambitions. Its neighbours are watching.';
    default:
      return 'A small realm in a dangerous world. Every province will have to be earned.';
  }
}
