/**
 * The first game's guided tour: a few cards, each pointing at a part of the screen. It starts by
 * itself on the first campaign in this browser, can be skipped, and is remembered once seen.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { toDate } from '../sim/calendar';
import { theName } from '../sim/chronicle';
import { formatDate } from './format';
import { useGame, type Game } from './game';
import { useStore } from './store';

const SEEN = 'crowns-and-centuries:tour';

/** True once the tour was finished or skipped in this browser (or storage cannot say otherwise). */
export function tourSeen(): boolean {
  try {
    return localStorage.getItem(SEEN) === 'done';
  } catch {
    return false;
  }
}

export function startTour(game: Game) {
  game.ui.set({ modal: 'none', tour: 1, speed: 0 });
}

export function endTour(game: Game) {
  game.ui.set({ tour: 0 });
  try {
    localStorage.setItem(SEEN, 'done');
  } catch {
    /* a browser that keeps nothing shows the tour again next time */
  }
}

interface Step {
  /** the element to point at; none for a card in the middle of the screen */
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
    target: '.side-panel',
    title: 'The panel of your realm',
    text: () => (
      <>
        Its affairs tab by tab: the treasury, the army, the court and council, the laws, the faith and your dealings
        with other realms. Click any province or realm on the map to see it here instead; Esc closes it.
      </>
    ),
  },
  {
    target: '.dateplate',
    title: 'Time',
    text: () => (
      <>
        The world waits for you. Press Space or the play button to let the days run, and 1 to 5 for the speed. Anything
        that needs your answer, a declaration of war, an offer, an event, stops the clock.
      </>
    ),
  },
  {
    target: '.mapmodes',
    title: 'Map modes',
    text: () => (
      <>
        See the world by realm or country, terrain, development, people, faith or, as your realm sees it, friends and
        foes. The keys are Q to U.
      </>
    ),
  },
  {
    title: 'Armies and war',
    text: () => (
      <>
        Raise your army from the Army tab, select it on the map and right-click where it should march. To make war, open
        another realm and declare it: win battles and sieges, then negotiate peace from the war’s panel.
      </>
    ),
  },
  {
    target: '[data-tour="ledger"]',
    title: 'The ledger of nations',
    text: () => (
      <>
        Each New Year your realm scores for its standing in the world. The ledger (L) ranks the nations, charts the
        centuries and keeps the chronicle of great events. The age ends on the first day of 2066.
      </>
    ),
  },
  {
    target: '[data-tour="menu"]',
    title: 'The game menu',
    text: () => (
      <>
        Save and load here. The game also saves itself every few minutes. How to play (H) explains every part of the
        game whenever you need it. Good fortune.
      </>
    ),
  },
];

const GAP = 14;
const EDGE = 16;

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
      const el = def.target ? document.querySelector(def.target) : null;
      const rect = el ? el.getBoundingClientRect() : null;
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
  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {target ? (
        <div
          className="tour-spot"
          style={{ left: target.left - 6, top: target.top - 6, width: target.width + 12, height: target.height + 12 }}
        />
      ) : (
        <div className="tour-dim" />
      )}
      <div
        ref={card}
        className="panel tour-card"
        style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }}
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
