/**
 * The error panel, and the guard that keeps a crash in the interface from taking the game down. The
 * panel stands outside the guarded interface, so it shows even when the interface cannot.
 */
import { Component, useState, type ErrorInfo, type ReactNode } from 'react';
import { toMenu } from './actions';
import { buildReport, failures, failureText, report, type Failure } from './errors';
import { useGame, type Game } from './game';
import { Icon } from './Icon';
import { exportSave } from './storage';
import { useStore } from './store';

/** Guards the interface: a crash in it shows the error panel instead of an empty page. */
export function Guard({ children }: { children: ReactNode }) {
  const game = useGame();
  const failure = useStore(failures, (s) => s.current);
  const [epoch, setEpoch] = useState(0);
  // Carrying on clears the failure and builds the interface afresh.
  const carryOn = () => {
    failures.set({ current: null });
    setEpoch((e) => e + 1);
  };
  return (
    <>
      <Boundary key={epoch} game={game}>
        {children}
      </Boundary>
      {failure && <ErrorPanel game={game} failure={failure} onCarryOn={carryOn} />}
    </>
  );
}

class Boundary extends Component<{ game: Game; children: ReactNode }, { broken: boolean }> {
  state = { broken: false };

  static getDerivedStateFromError() {
    return { broken: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    report(error, 'interface', true, info.componentStack ?? undefined);
    this.props.game.ui.set({ speed: 0 });
  }

  render() {
    return this.state.broken ? null : this.props.children;
  }
}

const SOURCE: Record<Failure['source'], string> = {
  interface: 'The interface failed to draw part of the screen.',
  simulation: 'The world could not go on to the next day.',
  script: 'Part of the game failed.',
};

function ErrorPanel({ game, failure, onCarryOn }: { game: Game; failure: Failure; onCarryOn: () => void }) {
  const [note, setNote] = useState('');
  const playing = game.ui.get().phase === 'playing';
  const download = () => {
    const stamp = failure.time.slice(0, 19).replace(/[:T]/g, '-');
    let ok: boolean;
    try {
      ok = exportSave(buildReport(game, failure), `crowns-and-centuries-report-${stamp}.json`);
    } catch {
      ok = false;
    }
    setNote(ok ? 'The report is saved among your downloads.' : 'This viewer does not allow downloads.');
  };
  const copy = () => {
    navigator.clipboard
      ?.writeText(failureText(failure))
      .then(() => setNote('The error is copied.'))
      .catch(() => setNote('The clipboard could not be reached.'));
  };
  return (
    <div className="modal-backdrop failure-backdrop">
      <div className="panel modal failure" role="alertdialog" aria-modal="true" aria-label="Something went wrong">
        <p className="caps sp-kicker bad">Something went wrong</p>
        <h2 className="display modal-title">The chronicle breaks off</h2>
        <p>
          {SOURCE[failure.source]} {playing && 'The game has stopped, so nothing more is lost.'}
        </p>
        <p className="failure-message">{failure.message}</p>
        <p className="dim small">
          A report holds the error, the settings and your campaign’s save, and helps to mend it. Then carry on, load a
          save, or go back to the title screen.
        </p>
        <div className="btn-row">
          <button className="btn" onClick={download}>
            <Icon name="bug-net" /> Download a report
          </button>
          <button className="btn" onClick={copy}>
            Copy the error
          </button>
        </div>
        {note && (
          <p className="dim small" role="status">
            {note}
          </p>
        )}
        {failure.stack && (
          <details className="failure-details">
            <summary className="small">Details</summary>
            <pre>{failure.stack}</pre>
          </details>
        )}
        <div className="modal-actions">
          <button
            className="btn ghost"
            onClick={() => {
              onCarryOn();
              toMenu(game);
            }}
          >
            Title screen
          </button>
          {playing && (
            <button
              className="btn ghost"
              onClick={() => {
                onCarryOn();
                game.ui.set({ modal: 'load', speed: 0 });
              }}
            >
              Load a save
            </button>
          )}
          <button className="btn primary" onClick={onCarryOn} autoFocus>
            Carry on
          </button>
        </div>
      </div>
    </div>
  );
}
