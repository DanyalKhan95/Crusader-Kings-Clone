import { useEffect } from 'react';
import { MAP_MODES } from '../game/mapModes';
import { closePanel, setMapMode, toMenu } from './actions';
import { useGame } from './game';
import { HoverTooltip } from './hud/HoverTooltip';
import { Hud } from './hud/Hud';
import { MapModeBar } from './hud/MapModeBar';
import { isTyping } from './map/MapController';
import { ChooseRealm } from './screens/ChooseRealm';
import { Credits } from './screens/Credits';
import { MainMenu } from './screens/MainMenu';
import { useStore } from './store';

/** Everything drawn over the map, by game phase. */
export function GameRoot() {
  const game = useGame();
  const phase = useStore(game.ui, (s) => s.phase);
  const modal = useStore(game.ui, (s) => s.modal);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      const s = game.ui.get();
      if (e.key === 'Escape') {
        if (s.modal !== 'none') game.ui.set({ modal: 'none' });
        else if (s.phase === 'playing' && s.panel !== 'none') closePanel(game);
        else if (s.phase === 'choose') toMenu(game);
        return;
      }
      if (s.phase === 'menu' || s.modal !== 'none') return;
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
    </>
  );
}
