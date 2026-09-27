/**
 * The log: the news of the campaign, newest first, to search and to sift by kind. A line that names a
 * place flies there. What pops up and what pauses is set per kind in the settings.
 */
import { useMemo, useState } from 'react';
import { toDate } from '../../sim/calendar';
import type { MessageKind } from '../../sim/types';
import { flyToProvince, openSettings } from '../actions';
import { shortDate } from '../format';
import { useGame } from '../game';
import { Icon } from '../Icon';
import { KIND_ICON, logged, MESSAGE_KINDS } from '../messages';
import { useSettings } from '../settings';
import { useStore } from '../store';
import { Modal } from './Modal';

/** Lines shown at once; the search reaches the rest. */
const SHOWN = 400;

export function MessageLog() {
  const game = useGame();
  const tick = useStore(game.ui, (s) => s.tick);
  const rules = useSettings((s) => s.messages);
  const [query, setQuery] = useState('');
  const [kinds, setKinds] = useState<MessageKind[]>([]);
  // Newest first, without the kinds the player turned off.
  const all = useMemo(
    () => game.state.messages.filter(logged).reverse(),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the messages change with the tick
    [game, tick, rules],
  );
  const counts = new Map<MessageKind, number>();
  for (const m of all) counts.set(m.kind, (counts.get(m.kind) ?? 0) + 1);
  const q = query.trim().toLowerCase();
  const shown = all.filter(
    (m) => (!kinds.length || kinds.includes(m.kind)) && (!q || m.text.toLowerCase().includes(q)),
  );
  const toggle = (k: MessageKind) => setKinds((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]));
  return (
    <Modal title="News of the realm" kicker="The log" wide className="message-log">
      <div className="log-tools">
        <label className="field log-search">
          <Icon name="magnifying-glass" />
          <span className="sr-only">Search the news</span>
          <input type="search" value={query} placeholder="Search the news" onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="log-kinds" role="group" aria-label="Kinds of news">
          {MESSAGE_KINDS.filter((k) => counts.has(k.kind)).map((k) => (
            <button
              key={k.kind}
              className={`chip ${kinds.includes(k.kind) ? 'active' : ''}`}
              aria-pressed={kinds.includes(k.kind)}
              onClick={() => toggle(k.kind)}
            >
              <Icon name={k.icon} />
              {k.name}
              <span className="num">{counts.get(k.kind)}</span>
            </button>
          ))}
        </div>
      </div>
      {shown.length ? (
        <ol className="log-list">
          {shown.slice(0, SHOWN).map((m) => {
            const place = m.province;
            return (
              <li key={m.id} className={`log-line kind-${m.kind} ${m.important ? 'important' : ''}`}>
                <Icon name={KIND_ICON[m.kind]} />
                <span className="caps log-date">{shortDate(toDate(m.day))}</span>
                {place ? (
                  <button
                    className="log-text"
                    title={`Go to ${game.world.region(place).name}`}
                    onClick={() => {
                      game.ui.set({ modal: 'none' });
                      flyToProvince(game, place, 1.2);
                    }}
                  >
                    {m.text}
                  </button>
                ) : (
                  <span className="log-text">{m.text}</span>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="dim">{all.length ? 'Nothing in the log matches.' : 'No news yet.'}</p>
      )}
      <p className="dim small log-note">
        {shown.length > SHOWN ? `The newest ${SHOWN} of ${shown.length}; search for older news. ` : ''}
        What pops up, and what pauses the game, is set for each kind of news in the settings.
        <button className="btn ghost small" onClick={() => openSettings(game, 'news')}>
          Settings
        </button>
      </p>
    </Modal>
  );
}
