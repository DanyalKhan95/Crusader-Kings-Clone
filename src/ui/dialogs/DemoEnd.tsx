import { toDate } from '../../sim/calendar';
import { TheName } from '../../sim/chronicle';
import { toMenu } from '../actions';
import { CoatOfArms } from '../CoatOfArms';
import { DEMO_END } from '../demo';
import { formatDate } from '../format';
import { useGame } from '../game';
import { Icon } from '../Icon';
import { Modal } from './Modal';

/** The demo's century is over: what the full game holds, and where to go from here. */
export function DemoEnd() {
  const game = useGame();
  const me = game.state.countries[game.state.player];
  const close = () => game.ui.set({ modal: 'none' });
  return (
    <Modal title="A century has passed" kicker={formatDate(toDate(DEMO_END))} onClose={close} className="demo-end">
      {me?.alive && (
        <p className="end-verdict">
          <CoatOfArms country={me} size={40} />
          <span>{TheName(me.name)} has come through its first hundred years.</span>
        </p>
      )}
      <p>
        This is where the free demo ends. The full game plays on to 2066: nine more centuries of war, faith and
        invention, the age of discovery and the world wars, with every realm of the world to rule. It is on its way as
        an app for Windows, macOS and Linux.
      </p>
      <p className="dim small">
        The world stands still from here, but you may look around it, load an earlier save, or begin again as another
        realm.
      </p>
      <div className="modal-actions">
        <button className="btn ghost" onClick={() => toMenu(game)}>
          Title screen
        </button>
        <button className="btn" onClick={() => game.ui.set({ modal: 'load' })}>
          <Icon name="load" /> Load a saved game
        </button>
        <button className="btn primary" onClick={close} autoFocus>
          Look around
        </button>
      </div>
    </Modal>
  );
}
