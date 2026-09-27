/**
 * The first game's guided tour: a few cards, each pointing at a part of the screen. It starts by
 * itself on the first campaign, can be skipped, and is remembered once seen.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { MAP_MODES } from '../game/mapModes';
import { toDate } from '../sim/calendar';
import { theName } from '../sim/chronicle';
import { formatDate } from './format';
import { useGame, type Game } from './game';
import { SCREEN_KEYS, shortcut, withKey } from './keys';
import { readPref, writePref } from './prefs';
import { uiScale } from './settings';
import { useStore } from './store';

/** True once the tour was finished or skipped (in this browser, or in the desktop app). */
export function tourSeen(): boolean {
  return readPref('tour') === 'done';
}

export function startTour(game: Game) {
  game.ui.set({ modal: 'none', tour: 1, speed: 0 });
}

export function endTour(game: Game) {
  game.ui.set({ tour: 0 });
  // Storage that keeps nothing shows the tour again next time.
  writePref('tour', 'done');
}

/** The tabs of the realm's panel, in their order, for their keys. */
interface Step {
  /** the elements to point at, together; none for a card in the middle of the screen */
  target?: string;
  title: string;
  text: (game: Game) => ReactNode;
}

const STEPS: Step[] = [
  {
    title: 'A thousand years to rule',
    text: (game) => {
      const c = game.state.countries[game.state.player];
      return (
        <>
          It is the {formatDate(toDate(game.state.day))}, and {c ? theName(c.name) : 'your realm'} is yours to rule
          until 2066. Its rulers will come and go; the realm is what you play. A few words on where things are, and then
          the age begins.
        </>
      );
    },
  },
  {
    target: '.panel.nation',
    title: 'Your realm at a glance',
    text: () => (
      <>
        Gold and its monthly balance, levies, men-at-arms, legitimacy, stability and the age of your learning. Hover
        over any figure to see what it is made of; click the era to open the technology screen.
      </>
    ),
  },
  {
    target: '[data-tour="affairs"]',
    title: 'The affairs of your realm',
    text: () => (
      <>
        Your coat of arms opens the realm’s screens: the court and council, the economy, the military, diplomacy, faith
        and culture, government and laws, and technology, each on a key of its own (
        {SCREEN_KEYS.map((k) => shortcut(`screen:${k.screen}`)).join(' ')}). Time runs on behind them, and your
        councillors give their counsel there, each with a click that does it. A province, an army or another realm opens
        in the side panel instead; Esc goes back to the map.
      </>
    ),
  },
  {
    target: '.dateplate',
    title: 'Time and news',
    text: () => (
      <>
        The world waits for you. Press {shortcut('pause')} or the play button to let the days run, and{' '}
        {shortcut('speed1')} to {shortcut('speed5')} for the speed. Anything that needs your answer, a declaration of
        war, an offer, an event, stops the clock. News comes at the top of the screen, and the quill keeps all of it (
        {shortcut('log')}); the settings say what each kind of news does.
      </>
    ),
  },
  {
    target: '.hud-right > *',
    title: 'What you have in hand',
    text: () => (
      <>
        The outliner lists your armies and fleets, sieges, wars, buildings going up, colonies, missions and spies: click
        one to go there, or go through your armies and fleets with {shortcut('nextArmy')} and {shortcut('nextFleet')}.
        Above it, alerts show what needs your hand: hover for the reason, click to put it right, right-click to hide it.
      </>
    ),
  },
  {
    target: '.mapmodes',
    title: 'Map modes',
    text: () => (
      <>
        See the world by realm or country, terrain, development, people, faith or, as your realm sees it, friends and
        foes. The keys are {MAP_MODES.map((m) => shortcut(`mode:${m.id}`)).join(' ')}. The banner at the end chooses
        whose armies and fleets the map shows.
      </>
    ),
  },
  {
    title: 'Armies, war, and the right hand',
    text: () => (
      <>
        Raise your army from the military screen, select it on the map and right-click where it should march. With no
        army selected, right-click a province (or hold a finger on it) for what you can do there: build and recruit at
        home; forge a claim, send a gift or declare war abroad. Win battles and sieges, then make peace from the war’s
        panel.
      </>
    ),
  },
  {
    target: '[data-tour="encyclopedia"]',
    title: 'Help at hand',
    text: () => (
      <>
        The book opens the encyclopedia ({shortcut('encyclopedia')}): every rule of the game with its numbers, and all
        its records, to search. Underlined words in tooltips lead there, and a hint explains each screen the first time
        it opens.
      </>
    ),
  },
  {
    target: '[data-tour="ledger"]',
    title: 'The ledger of nations',
    text: () => (
      <>
        Each New Year your realm scores for its standing in the world. {withKey('The ledger', 'ledger')} ranks the
        nations, charts the centuries and keeps the chronicle of great events. The age ends on the first day of 2066.
      </>
    ),
  },
  {
    target: '[data-tour="menu"]',
    title: 'The game menu',
    text: () => (
      <>
        Save and load here, and change the settings. The game also saves itself every few minutes.{' '}
        {withKey('How to play', 'help')} explains every part of the game whenever you need it. Good fortune.
      </>
    ),
  },
];

const GAP = 14;
const EDGE = 16;

/** The box around every element shown of a list, or null when none is. */
function around(els: NodeListOf<Element>): DOMRect | null {
  let box: { l: number; t: number; r: number; b: number } | null = null;
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    box = box
      ? {
          l: Math.min(box.l, r.left),
          t: Math.min(box.t, r.top),
          r: Math.max(box.r, r.right),
          b: Math.max(box.b, r.bottom),
        }
      : { l: r.left, t: r.top, r: r.right, b: r.bottom };
  }
  return box && new DOMRect(box.l, box.t, box.r - box.l, box.b - box.t);
}

/** Where the card goes: beside a tall target if there is room, else below or above it, always on screen. */
function place(target: DOMRect | null, w: number, h: number): { left: number; top: number } {
  const vw = window.innerWidth,
    vh = window.innerHeight;
  const clampX = (x: number) => Math.max(EDGE, Math.min(vw - w - EDGE, x));
  const clampY = (y: number) => Math.max(EDGE, Math.min(vh - h - EDGE, y));
  if (!target) return { left: clampX((vw - w) / 2), top: clampY((vh - h) / 2) };
  if (target.height > vh * 0.45) {
    if (target.right + GAP + w <= vw - EDGE) return { left: target.right + GAP, top: clampY(target.top + 40) };
    if (target.left - GAP - w >= EDGE) return { left: target.left - GAP - w, top: clampY(target.top + 40) };
  }
  const left = clampX(target.left + target.width / 2 - w / 2);
  const below = target.bottom + GAP;
  if (below + h <= vh - EDGE) return { left, top: below };
  const above = target.top - GAP - h;
  return { left, top: above >= EDGE ? above : clampY(below) };
}

export function Tour() {
  const game = useGame();
  const step = useStore(game.ui, (s) => s.tour);
  const def = STEPS[step - 1];
  const card = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!def) return;
    // Panels move and open; follow the target while the card is up.
    const measure = () => {
      const rect = def.target ? around(document.querySelectorAll(def.target)) : null;
      setTarget(rect);
      const box = card.current?.getBoundingClientRect();
      setPos(place(rect, box?.width ?? 360, box?.height ?? 220));
    };
    measure();
    const timer = window.setInterval(measure, 300);
    window.addEventListener('resize', measure);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('resize', measure);
    };
  }, [def]);

  if (!def) return null;
  const last = step === STEPS.length;
  // Measured in viewport pixels; the interface is zoomed by its scale.
  const k = uiScale();
  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {target ? (
        <div
          className="tour-spot"
          style={{
            left: target.left / k - 6,
            top: target.top / k - 6,
            width: target.width / k + 12,
            height: target.height / k + 12,
          }}
        />
      ) : (
        <div className="tour-dim" />
      )}
      <div
        ref={card}
        className="panel tour-card"
        style={pos ? { left: pos.left / k, top: pos.top / k } : { visibility: 'hidden' }}
      >
        <p className="caps sp-kicker">
          {step} of {STEPS.length}
        </p>
        <h2 id="tour-title" className="display tour-title">
          {def.title}
        </h2>
        <p className="tour-text">{def.text(game)}</p>
        <div className="tour-actions">
          {!last && (
            <button className="btn ghost small" onClick={() => endTour(game)}>
              Skip the tour
            </button>
          )}
          <span className="tour-gap" />
          {step > 1 && (
            <button className="btn small" onClick={() => game.ui.set({ tour: step - 1 })}>
              Back
            </button>
          )}
          <button
            className="btn primary small"
            autoFocus
            onClick={() => (last ? endTour(game) : game.ui.set({ tour: step + 1 }))}
          >
            {last ? 'Begin' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
