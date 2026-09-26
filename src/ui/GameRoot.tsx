import { useEffect } from 'react';
import { MAP_MODES } from '../game/mapModes';
import { closePanel, setMapMode, setSpeed, togglePause, toMenu } from './actions';
import { sound } from './audio';
import { DeclareWar } from './dialogs/DeclareWar';
import { EndOfAge } from './dialogs/EndOfAge';
import { EventDialog } from './dialogs/EventDialog';
import { Help } from './dialogs/Help';
import { Ledger } from './dialogs/Ledger';
import { Fallen, GameMenu } from './dialogs/GameMenu';
import { Offer, Peace } from './dialogs/Peace';
import { TechScreen } from './dialogs/TechScreen';
import { useGame } from './game';
import { HoverTooltip } from './hud/HoverTooltip';
import { Hud } from './hud/Hud';
import { MapModeBar } from './hud/MapModeBar';
import { isTyping } from './map/MapController';
import { ChooseRealm } from './screens/ChooseRealm';
import { Credits } from './screens/Credits';
import { MainMenu } from './screens/MainMenu';
import { useStore } from './store';
import { endTour, Tour } from './tour';

/** Everything drawn over the map, by game phase. */
export function GameRoot() {
  const game = useGame();
  const phase = useStore(game.ui, (s) => s.phase);
  const modal = useStore(game.ui, (s) => s.modal);

  // Browsers let sound begin only after the player has touched the page.
  useEffect(() => {
    const unlock = () => sound.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      const s = game.ui.get();
      // The guided tour answers only to its own buttons, and Esc to leave it.
      if (s.tour) {
        if (e.key === 'Escape') endTour(game);
        return;
      }
      if (e.key === 'Escape') {
        if (s.modal === 'offer' || s.modal === 'fallen' || s.modal === 'event' || s.modal === 'end') return;
        if (s.modal !== 'none') game.ui.set({ modal: 'none' });
        else if (s.orderMode) game.ui.set({ orderMode: false });
        else if (s.phase === 'playing' && s.panel !== 'none') closePanel(game);
        else if (s.phase === 'playing') game.ui.set({ modal: 'menu', speed: 0 });
        else if (s.phase === 'choose') toMenu(game);
        return;
      }
      if (s.phase === 'menu' || s.modal !== 'none') return;
      if (s.phase === 'playing') {
        if (e.key === ' ') {
          e.preventDefault();
          togglePause(game);
          return;
        }
        if (/^[1-5]$/.test(e.key)) {
          setSpeed(game, Number(e.key));
          return;
        }
        if (e.key === 'l' || e.key === 'L') {
          game.ui.set({ modal: 'ledger', speed: 0 });
          return;
        }
        if (e.key === 'h' || e.key === 'H' || e.key === 'F1') {
          e.preventDefault();
          game.ui.set({ modal: 'help', speed: 0 });
          return;
        }
      }
      const mode = MAP_MODES.find((m) => m.key === e.key.toUpperCase());
      if (mode) setMapMode(game, mode.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game]);

  return (
    <>
      {phase === 'menu' && <MainMenu />}
      {phase === 'choose' && <ChooseRealm />}
      {phase === 'playing' && <Hud />}
      {phase !== 'menu' && <MapModeBar />}
      {phase !== 'menu' && <HoverTooltip />}
      {modal === 'credits' && <Credits />}
      {modal === 'help' && <Help />}
      {phase === 'playing' && modal === 'menu' && <GameMenu />}
      {phase === 'playing' && modal === 'declare' && <DeclareWar />}
      {phase === 'playing' && modal === 'peace' && <Peace />}
      {phase === 'playing' && modal === 'offer' && <Offer />}
      {phase === 'playing' && modal === 'fallen' && <Fallen />}
      {phase === 'playing' && modal === 'tech' && <TechScreen />}
      {phase === 'playing' && modal === 'event' && <EventDialog />}
      {phase === 'playing' && modal === 'ledger' && <Ledger />}
      {phase === 'playing' && modal === 'end' && <EndOfAge />}
      {phase === 'playing' && <Tour />}
    </>
  );
}
