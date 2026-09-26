/**
 * Game time. Runs simulated days inside the map's frame loop, within a time budget, and tells the
 * map and the panels what changed. Important news pauses the game, as in any grand strategy game.
 */
import { advanceDay } from '../sim/tick';
import type { Game } from './game';

/** Days per second at speeds 1–5 (0 = paused). Speed 5 runs as fast as the frame budget allows. */
export const SPEEDS = [0, 1, 2.5, 6, 15, 120];
const FRAME_BUDGET_MS = 10;
const UI_INTERVAL_MS = 120;
const MAX_TOASTS = 5;

export function attachRunner(game: Game) {
  let backlog = 0;
  let lastUi = 0;
  let mapVersion = game.state.mapVersion;
  let borderVersion = game.state.borderVersion;
  let diploVersion = game.state.diploVersion;
  let lastMessage = game.state.messages.at(-1)?.id ?? 0;

  const sync = (force: boolean) => {
    const state = game.state;
    const map = game.map;
    if (map) {
      map.invalidateUnits();
      if (state.borderVersion !== borderVersion) {
        borderVersion = state.borderVersion;
        mapVersion = state.mapVersion;
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
      lastMessage = fresh[fresh.length - 1].id;
      patch.toasts = [...ui.toasts, ...fresh.map((m) => m.id)].slice(-MAX_TOASTS);
      if (fresh.some((m) => m.important)) patch.speed = 0;
    }
    if (state.offers.some((o) => o.to === state.player) && ui.modal === 'none') {
      patch.speed = 0;
      patch.modal = 'offer';
    }
    if (state.player !== ui.player) {
      patch.player = state.player;
      patch.selectedCountry = state.player;
    }
    if (state.player && !state.countries[state.player]?.alive && ui.modal !== 'fallen') {
      patch.speed = 0;
      patch.modal = 'fallen';
    }
    if (ui.selectedArmy && !state.armies.some((a) => a.id === ui.selectedArmy)) {
      patch.selectedArmy = 0;
      if (ui.panel === 'army') patch.panel = 'none';
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
    if (ui.phase !== 'playing' || ui.speed === 0 || ui.modal !== 'none') {
      backlog = 0;
      return;
    }
    backlog = Math.min(backlog + dt * SPEEDS[ui.speed], 4);
    const t0 = performance.now();
    let days = 0;
    while (backlog >= 1 && performance.now() - t0 < FRAME_BUDGET_MS) {
      advanceDay(game.state, game.world);
      backlog -= 1;
      days++;
      // Stop at once for news that needs the player.
      const last = game.state.messages.at(-1);
      if (last && last.id > lastMessage && last.important) break;
      if (game.state.offers.some((o) => o.to === game.state.player)) break;
    }
    if (days) sync(false);
  };

  /** Re-reads everything after a load or a change of player. */
  const reset = () => {
    mapVersion = -1;
    borderVersion = -1;
    diploVersion = -1;
    lastMessage = game.state.messages.at(-1)?.id ?? 0;
    sync(true);
  };

  return { frame, sync: () => sync(true), reset };
}

export type Runner = ReturnType<typeof attachRunner>;
