import { useEffect, useState } from 'react';
import { loadWorld, type LoadProgress } from '../game/world';
import { createGameState } from '../sim/setup';
import { loadArt } from './art';
import { Guard } from './ErrorPanel';
import { createGame, GameContext, useGame, type Game } from './game';
import { GameRoot } from './GameRoot';
import { LoadingScreen } from './LoadingScreen';
import { MapCanvas } from './map/MapCanvas';
import { useStore } from './store';

/** Game data lives next to the page, so the build works from any folder or host. */
const DATA_BASE = './data';

export function App() {
  const [game, setGame] = useState<Game | null>(null);
  const [progress, setProgress] = useState<LoadProgress>({ stage: 'Sharpening the quills', fraction: 0 });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // The art's index is small and optional: without it the game draws its own.
    Promise.all([
      loadWorld(DATA_BASE, (p) => {
        if (!cancelled) setProgress(p);
      }),
      loadArt(),
    ])
      .then(([{ world, scenario, bundle }]) => {
        if (cancelled) return;
        const g = createGame(world, scenario, createGameState(world, scenario), bundle);
        // Tests and the curious can reach the running game with ?debug in the address.
        if (new URLSearchParams(location.search).has('debug')) (window as unknown as { game: Game }).game = g;
        setGame(g);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <ErrorScreen message={error} />;
  if (!game) return <LoadingScreen progress={progress} />;
  return (
    <GameContext.Provider value={game}>
      <div className="shell">
        <MapCanvas onError={setError} />
        <ReadyGate />
      </div>
    </GameContext.Provider>
  );
}

/** Keeps the loading screen up until the terrain and fonts are in and the first frame is drawn. */
function ReadyGate() {
  const game = useGame();
  const ready = useStore(game.ui, (s) => s.ready);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => setGone(true), 700);
    return () => clearTimeout(t);
  }, [ready]);
  return (
    <>
      {ready && (
        <Guard>
          <GameRoot />
        </Guard>
      )}
      {!gone && <LoadingScreen progress={{ stage: 'Unrolling the map', fraction: ready ? 1 : 0.92 }} leaving={ready} />}
    </>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="fullscreen-center">
      <div className="panel error-card" role="alert">
        <h1 className="display">The map could not be unrolled</h1>
        <p>{message}</p>
        <p className="dim">
          Crowns &amp; Centuries needs a browser with WebGL 2: any current Chrome, Edge, Firefox or Safari.
        </p>
        <button className="btn primary" onClick={() => location.reload()}>
          Try again
        </button>
      </div>
    </div>
  );
}
