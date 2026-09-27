import { useEffect } from 'react';
import type { MapMode } from '../game/mapModes';
import {
  closePanel,
  cycleArmies,
  cycleFleets,
  goToCapital,
  closeScreen,
  openScreen,
  setMapMode,
  setSpeed,
  togglePause,
  toMenu,
} from './actions';
import { sound } from './audio';
import { DeclareWar } from './dialogs/DeclareWar';
import { DemoEnd } from './dialogs/DemoEnd';
import { EndOfAge } from './dialogs/EndOfAge';
import { EventDialog } from './dialogs/EventDialog';
import { Help } from './dialogs/Help';
import { Ledger } from './dialogs/Ledger';
import { MessageLog } from './dialogs/MessageLog';
import { Fallen, GameMenu } from './dialogs/GameMenu';
import { Offer, Peace } from './dialogs/Peace';
import { LoadGame } from './dialogs/Saves';
import { Settings } from './dialogs/Settings';
import { useGame, type RealmScreen } from './game';
import { HoverTooltip } from './hud/HoverTooltip';
import { Hud } from './hud/Hud';
import { MapModeBar } from './hud/MapModeBar';
import { toggleOutliner } from './hud/Outliner';
import { actionsFor, keyOf, type KeyAction } from './keys';
import { settings } from './settings';
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
        // A place's menu closes first, and the game menu does not open behind it.
        if (s.contextMenu) {
          game.ui.set({ contextMenu: null });
          return;
        }
        if (s.modal === 'offer' || s.modal === 'fallen' || s.modal === 'event' || s.modal === 'end') return;
        // The settings go back to the screen they were opened from.
        if (s.modal === 'settings') game.ui.set({ modal: s.settingsBack });
        else if (s.modal !== 'none') game.ui.set({ modal: 'none' });
        else if (s.screen) closeScreen(game);
        else if (s.orderMode) game.ui.set({ orderMode: false });
        else if (s.phase === 'playing' && s.panel !== 'none') closePanel(game);
        else if (s.phase === 'playing') game.ui.set({ modal: 'menu', speed: 0 });
        else if (s.phase === 'choose') toMenu(game);
        return;
      }
      if (s.phase === 'menu' || s.modal !== 'none') return;
      for (const action of actionsFor(keyOf(e))) {
        if (runAction(action, s.phase === 'playing', e.shiftKey)) {
          e.preventDefault();
          return;
        }
      }
    };
    /** Does what a key is bound to, if it can be done now. */
    const runAction = (action: KeyAction, playing: boolean, shift: boolean): boolean => {
      if (action.startsWith('mode:')) {
        setMapMode(game, action.slice(5) as MapMode);
        return true;
      }
      if (!playing) return false;
      if (action === 'pause') togglePause(game);
      else if (action.startsWith('speed')) setSpeed(game, Number(action.slice(5)));
      else if (action.startsWith('screen:')) openScreen(game, action.slice(7) as RealmScreen, true);
      else if (action === 'ledger') game.ui.set({ modal: 'ledger', speed: 0 });
      else if (action === 'log') game.ui.set({ modal: 'log', speed: 0 });
      else if (action === 'outliner') toggleOutliner();
      else if (action === 'help') game.ui.set({ modal: 'help', speed: 0 });
      else if (action === 'perfOverlay') settings.set({ perfOverlay: !settings.get().perfOverlay });
      else if (action === 'capital') goToCapital(game);
      else if (action === 'nextArmy') cycleArmies(game, shift ? -1 : 1);
      else if (action === 'nextFleet') cycleFleets(game, shift ? -1 : 1);
      else return false;
      return true;
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
      {modal === 'settings' && <Settings />}
      {modal === 'load' && <LoadGame />}
      {phase === 'playing' && modal === 'menu' && <GameMenu />}
      {phase === 'playing' && modal === 'declare' && <DeclareWar />}
      {phase === 'playing' && modal === 'peace' && <Peace />}
      {phase === 'playing' && modal === 'offer' && <Offer />}
      {phase === 'playing' && modal === 'fallen' && <Fallen />}
      {phase === 'playing' && modal === 'event' && <EventDialog />}
      {phase === 'playing' && modal === 'ledger' && <Ledger />}
      {phase === 'playing' && modal === 'log' && <MessageLog />}
      {phase === 'playing' && modal === 'end' && <EndOfAge />}
      {phase === 'playing' && modal === 'demoEnd' && <DemoEnd />}
      {phase === 'playing' && <Tour />}
    </>
  );
}
