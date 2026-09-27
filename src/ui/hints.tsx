/**
 * Hints for a new ruler: the first time a screen, a panel or a turn of fortune comes up, a short note
 * says what matters about it and leads to the encyclopedia. Each is shown once (remembered with the
 * preferences), one at a time, never over the guided tour or a window; a setting turns them off.
 */
import { useMemo } from 'react';
import { warsOf } from '../sim/queries';
import type { Country, GameState } from '../sim/types';
import { openEncyclopedia } from './actions';
import { useGame, type Game, type UIState } from './game';
import { Icon } from './Icon';
import { readPref, writePref } from './prefs';
import { settings, useSettings } from './settings';
import { createStore, useStore } from './store';

interface Hint {
  id: string;
  title: string;
  text: string;
  /** the encyclopedia entry that says more */
  entry: string;
  when: (ui: UIState, state: GameState, c: Country) => boolean;
}

const onScreen = (screen: UIState['screen']) => (ui: UIState) => ui.screen === screen;
const inPanel = (panel: UIState['panel']) => (ui: UIState) => ui.panel === panel && !ui.screen;

export const HINTS: Hint[] = [
  {
    id: 'screen:realm',
    title: 'The realm’s affairs',
    text: 'Each part of your realm’s affairs has a screen of its own, while time runs on behind. The tabs and their keys move between them, and Esc goes back to the map. Your council’s counsel suggests what to do next.',
    entry: 'rule:realm',
    when: onScreen('realm'),
  },
  {
    id: 'screen:court',
    title: 'The council',
    text: 'Each councillor helps only with the task you set: a chaplain anointing the crown when legitimacy is low, a steward developing the land when gold piles up. An empty seat helps with nothing.',
    entry: 'rule:council',
    when: onScreen('court'),
  },
  {
    id: 'screen:economy',
    title: 'The treasury',
    text: 'Provinces pay by their development, less where their people are of another faith or tongue. Gold beyond three years of income wastes away: put it into buildings and development.',
    entry: 'rule:taxes',
    when: onScreen('economy'),
  },
  {
    id: 'screen:military',
    title: 'Levies and men-at-arms',
    text: 'Levies come from the provinces and return slowly once spent; men-at-arms are paid soldiers, kept at home until the army is raised. Mind the supply of large armies.',
    entry: 'rule:levies',
    when: onScreen('military'),
  },
  {
    id: 'screen:diplomacy',
    title: 'What the world thinks',
    text: 'Every realm weighs what it thinks of you, and why: hover over a number to see. Conquest makes neighbours wary, and enough of it binds them into a coalition.',
    entry: 'rule:opinion',
    when: onScreen('diplomacy'),
  },
  {
    id: 'screen:faith',
    title: 'Faith and peoples',
    text: 'Provinces of other faiths and peoples pay and serve less, by your religious policy. The chaplain converts them one by one, and the steward’s schools teach them your ways.',
    entry: 'rule:faith',
    when: onScreen('faith'),
  },
  {
    id: 'screen:government',
    title: 'Laws and estates',
    text: 'Laws change a step at a time, cost legitimacy, and then rest for five years. Keep the estates loyal: angry ones hinder the realm, and powerful angry ones rise.',
    entry: 'rule:laws',
    when: onScreen('government'),
  },
  {
    id: 'screen:technology',
    title: 'Learning',
    text: 'Each level has its year in history: learning it earlier costs more, later less, and what neighbours know comes cheaper. A focus speeds one track by a quarter.',
    entry: 'rule:technology',
    when: onScreen('technology'),
  },
  {
    id: 'panel:army',
    title: 'Armies',
    text: 'Right-click a province to march there. A province feeds only so many men: beyond its supply, an army wastes away.',
    entry: 'rule:supply',
    when: inPanel('army'),
  },
  {
    id: 'panel:war',
    title: 'War score',
    text: 'Victories, occupied land and the war goal fill the war score; every term of a peace costs some of it.',
    entry: 'rule:war-score',
    when: inPanel('war'),
  },
  {
    id: 'panel:fleet',
    title: 'Fleets',
    text: 'Warships fight for the seas, blockade enemy coasts and catch armies crossing them. Your armies cross on the transports of the realm.',
    entry: 'rule:navies',
    when: inPanel('fleet'),
  },
  {
    id: 'war',
    title: 'At war',
    text: 'Your allies are called to arms. Raise your army, take the war goal and enemy land, win battles, then offer terms the war score will bear.',
    entry: 'rule:peace',
    when: (_ui, state, c) => warsOf(state, c.index).length > 0,
  },
  {
    id: 'siege',
    title: 'Sieges',
    text: 'Open country falls in days, but walls must be besieged: outnumber the garrison, and bring siege engines.',
    entry: 'rule:sieges',
    when: (_ui, state, c) =>
      state.provinces.some((p) => !!p?.siege && (p.siege.by === c.index || p.controller === c.index)),
  },
  {
    id: 'loan',
    title: 'Debt',
    text: 'The treasury ran dry and the realm borrowed. Repay loans when you can: when no one will lend, the realm goes bankrupt.',
    entry: 'rule:loans',
    when: (_ui, _state, c) => c.loans.length > 0,
  },
  {
    id: 'unrest',
    title: 'Unrest',
    text: 'Stability is below zero: taxes, levies and loyalty all suffer. It drifts back by itself, faster with a chaplain preaching obedience.',
    entry: 'rule:stability',
    when: (_ui, _state, c) => c.stability < 0,
  },
  {
    id: 'legitimacy',
    title: 'A doubtful right',
    text: 'Legitimacy is low. Below 35 the nobles may rise for a pretender; let the chaplain anoint the crown, or ask the head of your faith for a blessing.',
    entry: 'rule:legitimacy',
    when: (_ui, _state, c) => c.legitimacy < 35,
  },
  {
    id: 'plague',
    title: 'Pestilence',
    text: 'The sickness has reached your land. Provinces struck pay and serve half, and lose people; it passes in time.',
    entry: 'rule:plague',
    when: (_ui, state, c) => state.provinces.some((p) => p?.owner === c.index && p.plague !== undefined),
  },
  {
    id: 'coalition',
    title: 'A coalition',
    text: 'Realms that fear your conquests have banded together. When they are strong enough, they will strike together.',
    entry: 'rule:coalitions',
    when: (_ui, state, c) => state.coalitions.some((x) => x.target === c.index),
  },
];

/** Hints already seen, kept with the preferences. */
const seen = createStore<{ ids: string[] }>({ ids: readSeen() });

function readSeen(): string[] {
  try {
    const v = JSON.parse(readPref('hints') ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function markSeen(id: string) {
  const ids = seen.get().ids;
  if (ids.includes(id)) return;
  seen.set({ ids: [...ids, id] });
  writePref('hints', JSON.stringify([...ids, id]));
}

/** Every hint shows again, once each. */
export function resetHints() {
  seen.set({ ids: [] });
  writePref('hints', '[]');
}

/** The hint to show now, if any. */
export function currentHint(game: Game): Hint | null {
  const ui = game.ui.get();
  if (ui.phase !== 'playing' || ui.tour || ui.modal !== 'none' || !settings.get().hints) return null;
  const c = game.state.countries[ui.player];
  if (!c?.alive) return null;
  const done = seen.get().ids;
  return HINTS.find((h) => !done.includes(h.id) && h.when(ui, game.state, c)) ?? null;
}

/** The hint of the moment, at the foot of the screen. */
export function HintCard() {
  const game = useGame();
  const view = useStore(game.ui, (s) => `${s.phase}|${s.screen}|${s.panel}|${s.modal}|${s.tour}`);
  useStore(game.ui, (s) => s.tick);
  const on = useSettings((s) => s.hints);
  const done = useStore(seen, (s) => s.ids);
  const day = game.state.day;
  // Asked again when the screen, the panel or the day changes, not on every frame.
  const hint = useMemo(
    () => (on ? currentHint(game) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `view` and `day` stand for what it reads
    [game, on, done, view, day],
  );
  if (!hint) return null;
  return (
    <aside className="panel hint" role="note" aria-label={`Hint: ${hint.title}`}>
      <Icon name="open-book" />
      <div className="hint-body">
        <p className="caps hint-kicker">Hint</p>
        <h3 className="display hint-title">{hint.title}</h3>
        <p className="hint-text">{hint.text}</p>
        <div className="hint-actions">
          <button
            className="btn small"
            onClick={() => {
              markSeen(hint.id);
              openEncyclopedia(game, hint.entry);
            }}
          >
            <Icon name="open-book" /> Read more
          </button>
          <button className="btn small primary" onClick={() => markSeen(hint.id)}>
            Got it
          </button>
          <button className="link-like small" onClick={() => settings.set({ hints: false })}>
            No more hints
          </button>
        </div>
      </div>
    </aside>
  );
}
