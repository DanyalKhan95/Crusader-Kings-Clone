import { useEffect, useState } from 'react';
import { canContinue, resume, startChoosing } from '../actions';
import { loadChosen } from '../dialogs/Saves';
import { useGame } from '../game';
import { Icon } from '../Icon';
import { listSaves } from '../saves';
import type { SaveMeta } from '../storage';

export function MainMenu() {
  const game = useGame();
  const realms = game.state.countries.length - 1;
  const inMemory = canContinue(game);
  // With no campaign open, Continue picks up the latest save.
  const [latest, setLatest] = useState<SaveMeta | null>(null);
  const [anySaves, setAnySaves] = useState(false);
  useEffect(() => {
    let live = true;
    listSaves()
      .then((saves) => {
        if (!live) return;
        setLatest(saves[0] ?? null);
        setAnySaves(saves.length > 0);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  const cont = inMemory || !!latest;
  return (
    <div className="menu-screen">
      <div className="menu-vignette" aria-hidden="true" />
      <main className="menu-card">
        <p className="caps menu-kicker">A grand strategy of nations</p>
        <h1 className="display menu-title">
          Crowns <span className="rubric">&amp;</span> Centuries
        </h1>
        <p className="caps menu-years">
          <span>1066</span>
          <span className="menu-years-rule" aria-hidden="true" />
          <span>2066</span>
        </p>
        <div className="menu-actions">
          {cont && (
            <button
              className="btn primary big menu-continue"
              onClick={() => (inMemory ? resume(game) : latest && void loadChosen(game, latest))}
              autoFocus
            >
              <Icon name="play-button" /> Continue
              {!inMemory && latest && <span className="menu-continue-sub">{latest.label}</span>}
            </button>
          )}
          <button className={`btn big ${cont ? '' : 'primary'}`} onClick={() => startChoosing(game)} autoFocus={!cont}>
            <Icon name="crown" /> New Campaign
          </button>
          {(anySaves || inMemory) && (
            <button className="btn" onClick={() => game.ui.set({ modal: 'load' })}>
              <Icon name="load" /> Load Game
            </button>
          )}
          <button className="btn" onClick={() => game.ui.set({ modal: 'help' })}>
            <Icon name="scroll-quill" /> How to Play
          </button>
          <button className="btn" onClick={() => game.ui.set({ modal: 'settings' })}>
            <Icon name="settings-knobs" /> Settings
          </button>
          <button className="btn" onClick={() => game.ui.set({ modal: 'credits' })}>
            <Icon name="open-book" /> Sources &amp; Credits
          </button>
        </div>
        <p className="menu-note">
          The whole world as it stood in September 1066: {realms} realms across three thousand provinces, and a thousand
          years ahead of them. Rule one: fill the treasury, make war and peace, keep the estates loyal and the faith
          strong, and carry your people through the ages to 2066.
        </p>
      </main>
    </div>
  );
}
