import { EVENT_BY_ID } from '../../data/events';
import { toDate } from '../../sim/calendar';
import * as cmd from '../../sim/commands';
import { canChoose, effectLines, eventContext, eventText, openOptions, playerEvent } from '../../sim/events';
import { flyToProvince, run } from '../actions';
import { CoatOfArms } from '../CoatOfArms';
import { formatDate } from '../format';
import { useGame } from '../game';
import { Icon } from '../Icon';
import { useStore } from '../store';
import { Modal } from './Modal';
import { placeName } from '../../sim/places';

/** Something has happened to the realm, and the crown must choose what to do about it. */
export function EventDialog() {
  const game = useGame();
  useStore(game.ui, (s) => s.tick);
  const state = game.state;
  const e = playerEvent(state);
  const def = e ? EVENT_BY_ID[e.event] : undefined;
  const c = e ? state.countries[e.country] : undefined;
  if (!e || !def || !c) return null;
  const { title, text } = eventText(state, e);
  const options = openOptions(eventContext(state, game.world, c), def);
  const scope = { province: e.province, other: e.other };
  const other = e.other ? state.countries[e.other] : undefined;
  const choose = (i: number) => {
    if (!run(game, cmd.chooseEventOption(state, game.world, e.id, i))) return;
    game.ui.set({ modal: 'none' });
    // Another event may be waiting.
    game.runner?.sync();
  };
  return (
    <Modal title={title} kicker={formatDate(toDate(e.day))} closable={false} className="event">
      <div className="event-plate" aria-hidden="true">
        <Icon name={def.icon} />
      </div>
      <p className="event-text">{text}</p>
      {(e.province > 0 || other) && (
        <div className="event-where">
          {other && (
            <span className="chip with-coa static">
              <CoatOfArms country={other} size={16} />
              {other.name}
            </span>
          )}
          {e.province > 0 && (
            <button className="chip" onClick={() => flyToProvince(game, e.province)}>
              <Icon name="flag-objective" /> {placeName(game.state, e.province)}
            </button>
          )}
        </div>
      )}
      <ul className="event-options">
        {options.map((i) => {
          const o = def.options[i];
          const check = canChoose(state, game.world, e, i);
          const lines = effectLines(state, c, o.effects, scope);
          return (
            <li key={i}>
              <button className="event-option" disabled={!check.ok} onClick={() => choose(i)}>
                <span className="event-option-text">{o.text}</span>
                {lines.length > 0 && (
                  <span className="event-effects">
                    {lines.map((l) => (
                      <span key={l.text} className={l.good ? 'good' : 'bad'}>
                        {l.text}
                      </span>
                    ))}
                  </span>
                )}
                {!check.ok && <span className="event-why">{check.reason}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
