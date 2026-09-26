import { useEffect, useRef, useState } from 'react';
import { toDate } from '../../sim/calendar';
import { deserialize, serialize } from '../../sim/save';
import { notice, replaceState, resume, startChoosing, toMenu } from '../actions';
import { sound, type AudioSettings } from '../audio';
import { formatDate } from '../format';
import { useGame, type Game } from '../game';
import { Icon } from '../Icon';
import { exportSave, listSaves, loadGame, readSaveFile, saveGame, type SaveMeta } from '../storage';
import { Modal } from './Modal';

function label(game: Game): string {
  const c = game.state.countries[game.state.player];
  return `${c?.name ?? 'Unknown realm'}, ${formatDate(toDate(game.state.day))}`;
}

function afterLoad(game: Game, json: string) {
  const state = deserialize(json, game.world);
  replaceState(game, state);
  resume(game);
  notice(game, `Loaded: ${label(game)}`);
}

export function GameMenu() {
  const game = useGame();
  const [saves, setSaves] = useState<SaveMeta[] | null>(null);
  const [busy, setBusy] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    listSaves().then(setSaves, () => setSaves([]));
  }, []);
  const close = () => game.ui.set({ modal: 'none' });
  const save = async (slot: string) => {
    setBusy('Saving…');
    try {
      await saveGame(slot, label(game), serialize(game.state));
      setSaves(await listSaves());
      notice(game, 'Game saved.');
    } catch {
      notice(game, 'This browser would not let the game save.');
    }
    setBusy('');
  };
  const load = async (slot: string) => {
    setBusy('Loading…');
    try {
      const json = await loadGame(slot);
      if (json) afterLoad(game, json);
      else notice(game, 'That save could not be found.');
    } catch (e) {
      notice(game, e instanceof Error ? e.message : 'That save could not be read.');
    }
    setBusy('');
  };
  const doExport = () => {
    const d = toDate(game.state.day);
    const tag = game.state.countries[game.state.player]?.tag ?? 'game';
    const ok = exportSave(serialize(game.state), `crowns-and-centuries-${tag}-${d.y}.json`);
    notice(game, ok ? 'Save file downloaded.' : 'This viewer does not allow downloads. Use Save instead.');
  };
  const doImport = async (file: File) => {
    try {
      afterLoad(game, await readSaveFile(file));
    } catch (e) {
      notice(game, e instanceof Error ? e.message : 'That file could not be read.');
    }
  };
  return (
    <Modal title="The scriptorium" kicker="Game menu">
      <div className="menu-list">
        <button className="btn primary" onClick={close}>
          <Icon name="play-button" /> Resume
        </button>
        <button className="btn" disabled={!!busy} onClick={() => save('quick')}>
          <Icon name="save" /> Save game
        </button>
        <button className="btn" disabled={!!busy} onClick={doExport}>
          <Icon name="cloud-download" /> Export save file
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          <Icon name="cloud-upload" /> Load a save file
        </button>
        <button className="btn" onClick={() => game.ui.set({ modal: 'help' })}>
          <Icon name="scroll-quill" /> How to play
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void doImport(f);
            e.target.value = '';
          }}
        />
      </div>
      <section className="sp-section">
        <h3 className="section-title">Saved games</h3>
        {saves === null ? (
          <p className="dim small">Looking…</p>
        ) : saves.length ? (
          <ul className="ranked">
            {saves.map((s) => (
              <li key={s.slot} className="ranked-row static">
                <span>
                  {s.label}
                  <span className="dim small"> · saved {new Date(s.saved).toLocaleString()}</span>
                </span>
                <button className="btn small" disabled={!!busy} onClick={() => load(s.slot)}>
                  Load
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="dim small">No saves in this browser yet.</p>
        )}
        {busy && <p className="dim small">{busy}</p>}
      </section>
      <SoundSettings />
      <div className="modal-actions">
        <button className="btn ghost" onClick={() => startChoosing(game)}>
          New campaign
        </button>
        <button className="btn ghost" onClick={() => toMenu(game)}>
          Title screen
        </button>
      </div>
    </Modal>
  );
}

/** Sound effects and music, each on or off with its own volume, kept in this browser. */
function SoundSettings() {
  const [s, setS] = useState(sound.settings);
  const update = (patch: Partial<AudioSettings>) => {
    sound.unlock();
    sound.update(patch);
    setS(sound.settings);
  };
  const row = (on: 'effects' | 'music', volume: 'effectsVolume' | 'musicVolume', label: string, blurb: string) => (
    <div className="sound-row">
      <label className={`choice compact ${s[on] ? 'active' : ''}`}>
        <input type="checkbox" checked={s[on]} onChange={(e) => update({ [on]: e.target.checked })} />
        <span>
          <span className="choice-name">{label}</span>
          <span className="dim small">{blurb}</span>
        </span>
      </label>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={s[volume]}
        disabled={!s[on]}
        aria-label={`${label}: volume`}
        onChange={(e) => update({ [volume]: Number(e.target.value) })}
        onPointerUp={() => on === 'effects' && sound.play('coin')}
      />
    </div>
  );
  return (
    <section className="sp-section">
      <h3 className="section-title">Sound</h3>
      {row('effects', 'effectsVolume', 'Sound effects', 'The drums of war, bells, the clash of battle.')}
      {row('music', 'musicVolume', 'Music', 'Quiet music in the manner of your age.')}
    </section>
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
        <button className="btn primary" onClick={playOn}>
          Play on as another realm
        </button>
      </div>
    </Modal>
  );
}
