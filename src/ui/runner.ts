/**
 * Game time. Runs simulated days inside the map's frame loop, within a time budget, and tells the
 * map and the panels what changed. Important news pauses the game, as in any grand strategy game.
 */
import { toDate } from '../sim/calendar';
import { playerEvent } from '../sim/events';
import { advanceDay } from '../sim/tick';
import { sound } from './audio';
import { report } from './errors';
import { formatDate } from './format';
import type { Game } from './game';
import { autosave } from './saves';
import { DEFAULT_SETTINGS, settings } from './settings';

/**
 * Days per second at speeds 1–5 (0 = paused). The top speed is a setting: 120 days a second by
 * default, or as fast as the frame budget allows.
 */
export const SPEEDS = [0, 1, 2.5, 6, 15, 120];
const FRAME_BUDGET_MS = 10;
/** Days a frame may run without a top speed: the frame budget stops it first. */
const MAX_BACKLOG_UNCAPPED = 64;
const UI_INTERVAL_MS = 120;
const MAX_TOASTS = 5;

/** Days a second at a speed, with the player's top speed. */
export function daysPerSecond(speed: number): number {
  if (speed < SPEEDS.length - 1) return SPEEDS[speed] ?? 0;
  return settings.get().topSpeed || Infinity;
}

export function attachRunner(game: Game) {
  let backlog = 0;
  let lastSpeed = 0;
  /** Days run and the time they took, for the performance overlay. */
  const stats = { days: 0, simMs: 0 };
  let lastUi = 0;
  let mapVersion = game.state.mapVersion;
  let borderVersion = game.state.borderVersion;
  let diploVersion = game.state.diploVersion;
  let known: string | undefined = game.state.countries[game.state.player]?.known;
  let lastMessage = game.state.messages.at(-1)?.id ?? 0;
  let lastSave = performance.now();
  // What each day of the month has cost of late, in ms: a busy first of the month waits for a fresh
  // frame rather than overrunning this one.
  const cost = new Array<number>(32).fill(1);

  const sync = (force: boolean) => {
    const state = game.state;
    const map = game.map;
    if (map) {
      map.invalidateUnits();
      // What the player knows of the world grew: redraw the unknown and the names.
      const nowKnown = state.countries[state.player]?.known;
      if (state.borderVersion !== borderVersion || nowKnown !== known) {
        borderVersion = state.borderVersion;
        mapVersion = state.mapVersion;
        known = nowKnown;
        map.refresh();
      } else if (state.mapVersion !== mapVersion || state.diploVersion !== diploVersion) {
        mapVersion = state.mapVersion;
        map.recolor();
      }
      diploVersion = state.diploVersion;
    }
    const ui = game.ui.get();
    const patch: Partial<typeof ui> = {};
    // News
    const fresh = state.messages.filter((m) => m.id > lastMessage);
    if (fresh.length) {
      sound.news(fresh, state.player);
      lastMessage = fresh[fresh.length - 1].id;
      patch.toasts = [...ui.toasts, ...fresh.map((m) => m.id)].slice(-MAX_TOASTS);
      if (fresh.some((m) => m.important)) patch.speed = 0;
    }
    if (state.offers.some((o) => o.to === state.player) && ui.modal === 'none') {
      patch.speed = 0;
      patch.modal = 'offer';
    } else if (playerEvent(state) && ui.modal === 'none') {
      patch.speed = 0;
      patch.modal = 'event';
      sound.play('bell', 0.7);
    } else if (state.happened.end !== undefined && state.happened.end_seen === undefined && ui.modal === 'none') {
      patch.speed = 0;
      patch.modal = 'end';
      sound.play('fanfare');
    }
    if (state.player !== ui.player) {
      patch.player = state.player;
      patch.selectedCountry = state.player;
    }
    if (state.player && !state.countries[state.player]?.alive && ui.modal !== 'fallen' && ui.modal !== 'load') {
      patch.speed = 0;
      patch.modal = 'fallen';
    }
    if (ui.selectedArmy && !state.armies.some((a) => a.id === ui.selectedArmy)) {
      patch.selectedArmy = 0;
      if (ui.panel === 'army') patch.panel = 'none';
    }
    if (ui.selectedFleet && !state.fleets.some((f) => f.id === ui.selectedFleet)) {
      patch.selectedFleet = 0;
      if (ui.panel === 'fleet') patch.panel = 'none';
    }
    if (ui.selectedWar && !state.wars.some((w) => w.id === ui.selectedWar) && ui.panel === 'war') patch.panel = 'none';
    const now = performance.now();
    if (force || Object.keys(patch).length || now - lastUi > UI_INTERVAL_MS) {
      lastUi = now;
      patch.tick = ui.tick + 1;
      game.ui.set(patch);
    }
  };

  const frame = (dt: number) => {
    const ui = game.ui.get();
    if (ui.phase === 'playing') game.played += dt;
    if (ui.phase !== 'playing' || ui.speed === 0 || ui.modal !== 'none') {
      backlog = 0;
      return;
    }
    // Days owed carry over a few frames at most, so a slow frame is not paid back all at once; a new
    // speed starts afresh. Without a top speed the frame budget alone sets the pace.
    if (ui.speed !== lastSpeed) backlog = 0;
    lastSpeed = ui.speed;
    const rate = daysPerSecond(ui.speed);
    backlog = rate === Infinity ? MAX_BACKLOG_UNCAPPED : Math.min(backlog + dt * rate, Math.max(4, rate / 30));
    const t0 = performance.now();
    let days = 0;
    while (backlog >= 1) {
      const next = toDate(game.state.day + 1).d;
      const start = performance.now();
      if (start - t0 >= FRAME_BUDGET_MS || (days && start - t0 + cost[next] > FRAME_BUDGET_MS)) break;
      try {
        advanceDay(game.state, game.world);
        stats.days++;
        stats.simMs += performance.now() - start;
      } catch (e) {
        // The day broke off half done: stop the clock and say so, rather than fail again every frame.
        report(e, 'simulation', true, `on ${formatDate(toDate(game.state.day))}`);
        backlog = 0;
        game.ui.set({ speed: 0 });
        try {
          sync(true);
        } catch {
          // a state too broken to show; the error panel says what it can
        }
        return;
      }
      cost[next] = cost[next] * 0.7 + (performance.now() - start) * 0.3;
      backlog -= 1;
      days++;
      // Stop at once for news that needs the player.
      const last = game.state.messages.at(-1);
      if (last && last.id > lastMessage && last.important) break;
      if (game.state.offers.some((o) => o.to === game.state.player)) break;
      if (playerEvent(game.state)) break;
    }
    if (days) sync(false);
    // Out of the frame: the save serialises the world and compresses it. An ironman campaign keeps
    // its save even with autosaves off.
    const minutes = settings.get().autosaveMinutes || (game.ironman ? DEFAULT_SETTINGS.autosaveMinutes : 0);
    const every = minutes * 60_000;
    if (days && every && performance.now() - lastSave > every && game.state.player) {
      lastSave = performance.now();
      // Storage that refuses is ignored: the game plays on.
      setTimeout(() => void autosave(game).catch(() => undefined), 0);
    }
  };

  /** Re-reads everything after a load or a change of player. */
  const reset = () => {
    mapVersion = -1;
    borderVersion = -1;
    diploVersion = -1;
    known = undefined;
    lastMessage = game.state.messages.at(-1)?.id ?? 0;
    sync(true);
  };

  return { frame, sync: () => sync(true), reset, stats };
}

export type Runner = ReturnType<typeof attachRunner>;
