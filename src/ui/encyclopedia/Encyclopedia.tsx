/**
 * The encyclopedia: every rule of the game with its numbers, and everything its data holds, searchable
 * and linked. Opened with its key, from How to play and the game menu, and from the words in tooltips
 * and screens that lead here; Back goes through the pages read, Esc closes it.
 */
import { useEffect, useRef, useState } from 'react';
import { closeEncyclopedia, encyclopediaBack, openEncyclopedia } from '../actions';
import { Modal } from '../dialogs/Modal';
import { useGame, type Game } from '../game';
import { Icon } from '../Icon';
import { useStore } from '../store';
import { encyclopedia } from './index';
import { CATEGORIES, CATEGORY, search, type CategoryId, type Entry } from './model';
import { RULE_GROUPS } from './rules';

export function Encyclopedia() {
  const game = useGame();
  const page = useStore(game.ui, (s) => s.encyclopedia);
  const trail = useStore(game.ui, (s) => s.encyclopediaTrail);
  const phase = useStore(game.ui, (s) => s.phase);
  useStore(game.ui, (s) => s.tick);
  const { entries, byId } = encyclopedia();
  const [query, setQuery] = useState('');
  const body = useRef<HTMLDivElement>(null);
  const entry = byId.get(page);
  const category = page.startsWith('cat:') ? (page.slice(4) as CategoryId) : entry?.category;
  // A new page is read from its top, and holds the focus (not the link that led to it, perhaps in a tooltip).
  useEffect(() => {
    body.current?.scrollTo(0, 0);
  }, [page, query]);
  useEffect(() => {
    body.current?.focus({ preventScroll: true });
  }, [page]);
  const go = (to: string) => {
    setQuery('');
    openEncyclopedia(game, to);
  };
  return (
    <Modal
      title="Encyclopedia"
      kicker="Crowns & Centuries"
      wide
      className="encyclopedia"
      onClose={() => closeEncyclopedia(game)}
    >
      <div className="enc-layout">
        <nav className="enc-nav" aria-label="Contents">
          <label className="enc-search">
            <Icon name="magnifying-glass" />
            <span className="sr-only">Search the encyclopedia</span>
            <input
              type="search"
              value={query}
              placeholder="Search"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Escape') return;
                e.stopPropagation();
                if (query) setQuery('');
                else closeEncyclopedia(game);
              }}
            />
          </label>
          <button className={`help-topic ${!page && !query ? 'active' : ''}`} onClick={() => go('')}>
            <Icon name="book-cover" />
            <span>Contents</span>
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              className={`help-topic ${category === c.id && !query ? 'active' : ''}`}
              aria-current={category === c.id && !query ? 'true' : undefined}
              onClick={() => go(`cat:${c.id}`)}
            >
              <Icon name={c.icon} />
              <span>{c.name}</span>
            </button>
          ))}
        </nav>
        <div className="enc-page" ref={body} tabIndex={-1}>
          <div className="enc-bar">
            <button className="btn small ghost" disabled={!trail.length} onClick={() => encyclopediaBack(game)}>
              <Icon name="return-arrow" /> Back
            </button>
            {!query && category && (
              <p className="enc-crumbs caps small">
                <button className="link-like" onClick={() => go('')}>
                  Contents
                </button>{' '}
                ›{' '}
                <button className="link-like" onClick={() => go(`cat:${category}`)}>
                  {CATEGORY[category].name}
                </button>
                {entry?.group && <span className="dim"> › {entry.group}</span>}
              </p>
            )}
          </div>
          {query ? (
            <Results entries={search(entries, query)} query={query} go={go} />
          ) : entry ? (
            <Article entry={entry} game={game} playing={phase === 'playing'} go={go} />
          ) : category ? (
            <CategoryPage id={category} entries={entries} go={go} />
          ) : (
            <Contents entries={entries} go={go} />
          )}
        </div>
      </div>
    </Modal>
  );
}

function Article({
  entry,
  game,
  playing,
  go,
}: {
  entry: Entry;
  game: Game;
  playing: boolean;
  go: (to: string) => void;
}) {
  const live = playing ? entry.live?.(game) : null;
  const { byId } = encyclopedia();
  const see = (entry.see ?? []).map((id) => (id.startsWith('cat:') ? id : byId.get(id) ? id : '')).filter(Boolean);
  return (
    <article className="enc-article" aria-labelledby="enc-title">
      <header className="enc-head">
        {entry.icon && <Icon name={entry.icon} />}
        <div>
          <h3 id="enc-title" className="display enc-title">
            {entry.title}
          </h3>
          <p className="enc-summary">{entry.summary}</p>
        </div>
      </header>
      <div className="enc-body">{entry.body(game)}</div>
      {live && (
        <section className="enc-live" aria-label="In your realm now">
          <h4 className="enc-sub">In your realm now</h4>
          {live}
        </section>
      )}
      {see.length > 0 && (
        <footer className="enc-see">
          <span className="caps small">See also</span>
          <ul className="chips">
            {see.map((id) => (
              <li key={id}>
                <button className="chip" onClick={() => go(id)}>
                  {id.startsWith('cat:') ? CATEGORY[id.slice(4) as CategoryId].name : byId.get(id)!.title}
                </button>
              </li>
            ))}
          </ul>
        </footer>
      )}
    </article>
  );
}

/** A list of entries, each with its line. */
function EntryList({
  list,
  go,
  showCategory = false,
}: {
  list: Entry[];
  go: (to: string) => void;
  showCategory?: boolean;
}) {
  return (
    <ul className="enc-list">
      {list.map((e) => (
        <li key={e.id}>
          <button className="enc-item" onClick={() => go(e.id)}>
            {e.icon && <Icon name={e.icon} />}
            <span className="enc-item-text">
              <span className="enc-item-title">
                {e.title}
                {showCategory && <span className="dim small"> · {CATEGORY[e.category].name}</span>}
              </span>
              <span className="dim small">{e.summary}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Results({ entries, query, go }: { entries: Entry[]; query: string; go: (to: string) => void }) {
  return (
    <section aria-label="Search results">
      <h3 className="section-title">{entries.length ? `Found for “${query}”` : `Nothing found for “${query}”`}</h3>
      <EntryList list={entries} go={go} showCategory />
    </section>
  );
}

function CategoryPage({ id, entries, go }: { id: CategoryId; entries: Entry[]; go: (to: string) => void }) {
  const cat = CATEGORY[id];
  const list = entries.filter((e) => e.category === id);
  // Rules keep the order of their topics; the rest keep the data's order within each heading.
  const groups: string[] = id === 'rules' ? RULE_GROUPS : [...new Set(list.map((e) => e.group ?? ''))];
  return (
    <section aria-label={cat.name}>
      <header className="enc-head">
        <Icon name={cat.icon} />
        <div>
          <h3 className="display enc-title">{cat.name}</h3>
          <p className="enc-summary">
            {cat.blurb} {list.length} entries.
          </p>
        </div>
      </header>
      {groups.map((g) => {
        const inGroup = list.filter((e) => (e.group ?? '') === g);
        return inGroup.length ? (
          <div key={g} className="enc-group">
            {g && <h4 className="section-title">{g}</h4>}
            <EntryList list={inGroup} go={go} />
          </div>
        ) : null;
      })}
    </section>
  );
}

const START = [
  'rule:realm',
  'rule:development',
  'rule:taxes',
  'rule:stability',
  'rule:legitimacy',
  'rule:estates',
  'rule:casus-belli',
  'rule:war-score',
  'rule:battles',
  'rule:opinion',
  'rule:technology',
  'rule:standing',
];

function Contents({ entries, go }: { entries: Entry[]; go: (to: string) => void }) {
  const { byId } = encyclopedia();
  const count = (id: CategoryId) => entries.filter((e) => e.category === id).length;
  return (
    <section aria-label="Contents">
      <p className="enc-summary">
        Every rule of the game with its numbers, and all that its records hold: {entries.length} entries. Words in
        tooltips and screens that are{' '}
        <span className="term" aria-hidden="true">
          underlined like this
        </span>{' '}
        lead here.
      </p>
      <h4 className="section-title">Start here</h4>
      <ul className="chips enc-start">
        {START.filter((id) => byId.has(id)).map((id) => (
          <li key={id}>
            <button className="chip" onClick={() => go(id)}>
              {byId.get(id)!.title}
            </button>
          </li>
        ))}
      </ul>
      <h4 className="section-title">Sections</h4>
      <ul className="enc-cats">
        {CATEGORIES.map((c) => (
          <li key={c.id}>
            <button className="enc-item" onClick={() => go(`cat:${c.id}`)}>
              <Icon name={c.icon} />
              <span className="enc-item-text">
                <span className="enc-item-title">
                  {c.name} <span className="dim small num">{count(c.id)}</span>
                </span>
                <span className="dim small">{c.blurb}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
