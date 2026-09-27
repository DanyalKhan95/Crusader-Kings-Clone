/**
 * The council's counsel on the court and realm screens: each councillor's suggestion for what to do
 * next, weightiest first, with a click that does it. Counsel set aside stays away for a year.
 */
import { useMemo, useState } from 'react';
import { character, SEAT_INFO } from '../../sim/characters';
import type { Country } from '../../sim/types';
import { counsel } from '../advice';
import { Term } from '../encyclopedia/Term';
import { useGame } from '../game';
import { Icon } from '../Icon';
import { Portrait } from '../people';

/** Counsel set aside, until the day it may be given again. Kept for the session. */
const setAside = new Map<string, number>();

export function Advice({ c, limit = 5 }: { c: Country; limit?: number }) {
  const game = useGame();
  const state = game.state;
  const month = Math.floor(state.day / 30);
  // Weighed afresh each month, and after each thing the council's counsel does.
  const [acted, setActed] = useState(0);
  const all = useMemo(
    () => counsel(game),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- weighed monthly and after each deed
    [game, month, acted, c.index],
  );
  const shown = all.filter((x) => (setAside.get(x.id) ?? 0) <= state.day).slice(0, limit);
  return (
    <section className="affairs-card counsel" aria-label="Counsel">
      <h3 className="section-title">Counsel of the council</h3>
      {shown.length ? (
        <ul className="counsel-list">
          {shown.map((x) => {
            const who = character(state, c.council[x.seat]);
            return (
              <li key={x.id}>
                {who ? (
                  <Portrait c={who} role={x.seat} size={38} />
                ) : (
                  <span className="portrait empty" style={{ width: 38, height: 46 }} />
                )}
                <div className="counsel-body">
                  <span className="caps counsel-seat">{SEAT_INFO[x.seat].name}</span>
                  <p className="counsel-text">{x.text}</p>
                  <div className="counsel-actions">
                    {x.action && (
                      <button
                        className="btn small"
                        onClick={() => {
                          x.action!.run(game);
                          setActed((n) => n + 1);
                        }}
                      >
                        <Icon name={x.action.icon} /> {x.action.label}
                      </button>
                    )}
                    <button
                      className="btn small ghost"
                      title="Set this aside for a year"
                      onClick={() => {
                        setAside.set(x.id, state.day + 365);
                        setActed((n) => n + 1);
                      }}
                    >
                      Not now
                    </button>
                    {x.more && <Term to={x.more}>Why?</Term>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="dim small">The council has nothing to urge. All is as it should be.</p>
      )}
    </section>
  );
}
