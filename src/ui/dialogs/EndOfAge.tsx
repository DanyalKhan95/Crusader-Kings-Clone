import { toDate } from '../../sim/calendar';
import { TheName } from '../../sim/chronicle';
import * as cmd from '../../sim/commands';
import { ranking } from '../../sim/score';
import { run, toMenu } from '../actions';
import { CoatOfArms } from '../CoatOfArms';
import { formatDate, ordinal } from '../format';
import { useGame } from '../game';
import { Icon } from '../Icon';
import { Modal } from './Modal';

/** 1 January 2066: the thousand years are over, and the nations are ranked. */
export function EndOfAge() {
  const game = useGame();
  const state = game.state;
  const list = ranking(state);
  const mine = list.findIndex((c) => c.index === state.player);
  const me = state.countries[state.player];
  const playOn = () => {
    run(game, cmd.playOnAfterTheAge(state));
    game.ui.set({ modal: 'none' });
  };
  const top = list.slice(0, 10);
  return (
    <Modal
      title="The end of the age"
      kicker={formatDate(toDate(state.happened.end ?? state.day))}
      onClose={playOn}
      className="end-of-age"
    >
      <p className="end-text">
        A thousand years have passed since the autumn of Hastings and Stamford Bridge. Empires have risen and fallen,
        faiths have split and spread, and every shore of the world is known. The chroniclers weigh up the nations.
      </p>
      {me?.alive && mine >= 0 ? (
        <p className="end-verdict">
          <CoatOfArms country={me} size={40} />
          <span>
            {TheName(me.name)} stands <strong>{ordinal(mine + 1)}</strong> among {list.length} nations, with{' '}
            <strong className="num">{Math.round(me.score).toLocaleString('en-US')}</strong> points.
          </span>
        </p>
      ) : (
        <p className="end-verdict dim">Your realm did not live to see the end of the age.</p>
      )}
      <ol className="end-ranking">
        {top.map((c, i) => (
          <li key={c.index} className={c.index === state.player ? 'mine' : ''}>
            <span className="num dim">{i + 1}</span>
            <CoatOfArms country={c} size={24} />
            <span className="end-name">{c.name}</span>
            <span className="num">{Math.round(c.score).toLocaleString('en-US')}</span>
          </li>
        ))}
      </ol>
      <div className="modal-actions">
        <button className="btn ghost" onClick={() => toMenu(game)}>
          Title screen
        </button>
        <button
          className="btn"
          onClick={() => {
            run(game, cmd.playOnAfterTheAge(state));
            game.ui.set({ modal: 'ledger' });
          }}
        >
          <Icon name="scroll-unfurled" /> The ledger
        </button>
        <button className="btn primary" onClick={playOn}>
          <Icon name="play-button" /> Play on
        </button>
      </div>
    </Modal>
  );
}
