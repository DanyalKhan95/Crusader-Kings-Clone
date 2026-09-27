/**
 * The saved games: a list to load or delete from, the title screen's Load game window, and loading a
 * save file.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toDate } from '../../sim/calendar';
import { notice } from '../actions';
import { formatDate } from '../format';
import { useGame, type Game } from '../game';
import { Icon } from '../Icon';
import { native } from '../platform';
import { applySave, deleteSave, formatPlayed, formatSavedAt, listSaves, loadSlot } from '../saves';
import type { SaveMeta } from '../storage';
import { readSaveFile } from '../storage';
import { Modal } from './Modal';

/** The saves, newest first (null while looking), and a way to look again. */
export function useSaves(): [SaveMeta[] | null, () => Promise<void>] {
  const [saves, setSaves] = useState<SaveMeta[] | null>(null);
  const refresh = useCallback(async () => {
    setSaves(await listSaves().catch(() => []));
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return [saves, refresh];
}

/** Loads a save chosen from a list and says so, or why it could not. */
export async function loadChosen(game: Game, meta: SaveMeta): Promise<boolean> {
  try {
    if (await loadSlot(game, meta.slot)) {
      notice(game, `Loaded: ${meta.label}`);
      return true;
    }
    notice(game, 'That save could not be found.');
  } catch (e) {
    notice(game, e instanceof Error ? e.message : 'That save could not be read.');
  }
  return false;
}

/** Loads a save file the player picked. */
export async function loadFile(game: Game, file: File) {
  try {
    applySave(game, await readSaveFile(file));
    notice(game, `Loaded: ${file.name}`);
  } catch (e) {
    notice(game, e instanceof Error ? e.message : 'That file could not be read.');
  }
}

const emblemUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Saves with their realm, date and time played; each can be loaded or, after asking, deleted. */
export function SaveList({
  saves,
  busy,
  onLoad,
  onChanged,
}: {
  saves: SaveMeta[] | null;
  busy?: boolean;
  onLoad: (meta: SaveMeta) => void;
  /** after a save was deleted */
  onChanged: () => void;
}) {
  const [confirm, setConfirm] = useState<string | null>(null);
  if (saves === null) return <p className="dim small">Looking…</p>;
  if (!saves.length) return <p className="dim small">No saved games yet.</p>;
  return (
    <ul className="save-list">
      {saves.map((s) => {
        const facts = [
          s.realm,
          s.day !== undefined ? formatDate(toDate(s.day)) : '',
          s.played ? formatPlayed(s.played) : '',
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <li key={s.slot} className="save-row">
            {s.emblem ? (
              <img className="save-arms" src={emblemUrl(s.emblem)} alt="" width={28} height={34} />
            ) : (
              <span className="save-arms" aria-hidden="true" />
            )}
            <span className="save-text">
              <span className="save-name">
                {s.label}
                {s.kind === 'auto' && <span className="badge">Autosave</span>}
                {s.kind === 'ironman' && <span className="badge">Ironman</span>}
              </span>
              {facts && <span className="dim small">{facts}</span>}
              <span className="dim small">Saved {formatSavedAt(s.saved)}</span>
            </span>
            {confirm === s.slot ? (
              <span className="save-actions">
                <span className="small">Delete it?</span>
                <button
                  className="btn small primary"
                  onClick={async () => {
                    await deleteSave(s.slot);
                    setConfirm(null);
                    onChanged();
                  }}
                >
                  Delete
                </button>
                <button className="btn small ghost" onClick={() => setConfirm(null)}>
                  Keep
                </button>
              </span>
            ) : (
              <span className="save-actions">
                <button className="btn small" disabled={busy} onClick={() => onLoad(s)}>
                  Load
                </button>
                <button
                  className="btn small ghost icon-btn"
                  aria-label={`Delete ${s.label}`}
                  title="Delete"
                  onClick={() => setConfirm(s.slot)}
                >
                  <Icon name="trash-can" />
                </button>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** A button that loads a save file from disk. */
export function LoadFileButton({ game, label = 'Load a save file' }: { game: Game; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button className="btn" onClick={() => ref.current?.click()}>
        <Icon name="cloud-upload" /> {label}
      </button>
      <input
        ref={ref}
        type="file"
        accept=".json,.gz,.ccsave,application/json,application/gzip"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void loadFile(game, f);
          e.target.value = '';
        }}
      />
    </>
  );
}

/** In the desktop app, a button that opens the folder the saves are kept in. */
export function SavesFolderButton() {
  if (!native) return null;
  const { saves } = native;
  return (
    <button className="btn" onClick={() => void saves.openFolder()}>
      <Icon name="open-folder" /> Open the saves folder
    </button>
  );
}

/** Load game, from the title screen or after a fall. */
export function LoadGame() {
  const game = useGame();
  const [saves, refresh] = useSaves();
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Load a game" kicker="The archive" className="saves">
      <SaveList
        saves={saves}
        busy={busy}
        onChanged={() => void refresh()}
        onLoad={async (meta) => {
          setBusy(true);
          await loadChosen(game, meta);
          setBusy(false);
        }}
      />
      <div className="modal-actions">
        <SavesFolderButton />
        <LoadFileButton game={game} />
      </div>
    </Modal>
  );
}
