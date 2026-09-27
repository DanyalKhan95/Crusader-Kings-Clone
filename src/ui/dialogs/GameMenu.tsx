import { useState } from 'react';
import { toDate } from '../../sim/calendar';
import { notice, startChoosing, toMenu } from '../actions';
import { useGame } from '../game';
import { Icon } from '../Icon';
import { native, offerFile } from '../platform';
import { defaultSaveName, SAVE_FAILED, saveIronman, saveNamed, serializeGame } from '../saves';
import { Modal } from './Modal';
import { LoadFileButton, loadChosen, SaveList, SavesFolderButton, useSaves } from './Saves';

export function GameMenu() {
  const game = useGame();
  const [saves, refresh] = useSaves();
  const [name, setName] = useState(() => defaultSaveName(game));
  const [busy, setBusy] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  const close = () => game.ui.set({ modal: 'none' });
  const trimmed = name.trim();
  const exists = !!saves?.some((m) => (m.kind ?? 'manual') === 'manual' && m.label === trimmed);

  const save = async () => {
    if (!trimmed || busy) return;
    // Saving over another save asks first.
    if (exists && !overwrite) {
      setOverwrite(true);
      return;
    }
    setBusy('Saving…');
    try {
      await saveNamed(game, trimmed, saves ?? undefined);
      await refresh();
      notice(game, 'Game saved.');
    } catch {
      notice(game, SAVE_FAILED);
    }
    setOverwrite(false);
    setBusy('');
  };
  const saveAndQuit = async () => {
    setBusy('Saving…');
    try {
      await saveIronman(game);
      toMenu(game);
    } catch {
      notice(game, SAVE_FAILED);
    }
    setBusy('');
  };
  const doExport = async () => {
    const d = toDate(game.state.day);
    const tag = game.state.countries[game.state.player]?.tag ?? 'game';
    const r = await offerFile(serializeGame(game), `crowns-and-centuries-${tag}-${d.y}.json`).catch(() => null);
    if (!r) notice(game, 'The save file could not be written.');
    else if (r.saved) notice(game, r.path ? `Save file written: ${r.path}` : 'Save file downloaded.');
    else if (r.blocked) notice(game, 'This viewer does not allow downloads. Use Save instead.');
  };

  return (
    <Modal title="The scriptorium" kicker="Game menu" className="game-menu">
      <div className="menu-list">
        <button className="btn primary" onClick={close}>
          <Icon name="play-button" /> Resume
        </button>
        <button className="btn" onClick={() => game.ui.set({ modal: 'settings' })}>
          <Icon name="settings-knobs" /> Settings
        </button>
        <button className="btn" onClick={() => game.ui.set({ modal: 'help' })}>
          <Icon name="scroll-quill" /> How to play
        </button>
      </div>
      {game.ironman ? (
        <section className="sp-section">
          <h3 className="section-title">Ironman</h3>
          <p className="dim small">This campaign has one save, and the game keeps it itself as you play.</p>
          <div className="btn-row">
            <button className="btn" disabled={!!busy} onClick={saveAndQuit}>
              <Icon name="save" /> Save and go to the title screen
            </button>
          </div>
        </section>
      ) : (
        <section className="sp-section">
          <h3 className="section-title">Save the game</h3>
          <form
            className="save-form"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label className="field">
              <span className="sr-only">Name of the save</span>
              <input
                value={name}
                maxLength={60}
                spellCheck={false}
                onChange={(e) => {
                  setName(e.target.value);
                  setOverwrite(false);
                }}
              />
            </label>
            <button className="btn primary" type="submit" disabled={!!busy || !trimmed}>
              <Icon name="save" /> {overwrite ? 'Overwrite' : 'Save game'}
            </button>
          </form>
          {overwrite && (
            <p className="alert" role="status">
              A save called “{trimmed}” exists. Save again to overwrite it, or change the name.
            </p>
          )}
        </section>
      )}
      <section className="sp-section">
        <h3 className="section-title">Saved games</h3>
        <SaveList
          saves={saves}
          busy={!!busy}
          onChanged={() => void refresh()}
          onLoad={async (meta) => {
            setBusy('Loading…');
            await loadChosen(game, meta);
            setBusy('');
          }}
        />
        {busy && <p className="dim small">{busy}</p>}
      </section>
      <div className="btn-row">
        <button className="btn" disabled={!!busy} onClick={() => void doExport()}>
          <Icon name="cloud-download" /> Export save file
        </button>
        <LoadFileButton game={game} />
        <SavesFolderButton />
      </div>
      <div className="modal-actions">
        <button className="btn ghost" onClick={() => startChoosing(game)}>
          New campaign
        </button>
        <button className="btn ghost" onClick={() => toMenu(game)}>
          Title screen
        </button>
        {native && (
          <button className="btn ghost" title="The campaign is saved first" onClick={() => native?.quit()}>
            Quit to desktop
          </button>
        )}
      </div>
    </Modal>
  );
}

export function Fallen() {
  const game = useGame();
  const c = game.state.countries[game.ui.get().player];
  const playOn = () =>
    game.ui.set({ phase: 'choose', modal: 'none', panel: 'none', selectedCountry: 0, speed: 0, selectedArmy: 0 });
  return (
    <Modal title="Your realm has fallen" kicker={c?.name} onClose={playOn}>
      <p>
        The last of your lands are in the hands of others, and {c?.name ?? 'your realm'} is no more. The world goes on
        without you.
      </p>
      <div className="modal-actions">
        <button className="btn" onClick={() => toMenu(game)}>
          Title screen
        </button>
        <button className="btn" onClick={() => game.ui.set({ modal: 'load' })}>
          Load a saved game
        </button>
        <button className="btn primary" onClick={playOn}>
          Play on as another realm
        </button>
      </div>
    </Modal>
  );
}
