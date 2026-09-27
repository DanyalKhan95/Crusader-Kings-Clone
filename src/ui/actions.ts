/** UI actions shared by the screens: selection, camera moves, orders and game flow. */
import { BOOKMARKS } from '../data/bookmarks';
import type { MapMode } from '../game/mapModes';
import * as cmd from '../sim/commands';
import { fleetById } from '../sim/naval';
import { armyById, countryByTag, realmProvinces } from '../sim/queries';
import { createGameState } from '../sim/setup';
import type { GameState } from '../sim/types';
import { sound } from './audio';
import type { Game } from './game';
import { tourSeen } from './tour';

export function selectProvince(game: Game, id: number) {
  if (!id) {
    closePanel(game);
    return;
  }
  game.ui.set({ selectedProvince: id, panel: 'province', orderMode: false });
}

export function selectCountry(game: Game, index: number, fly = false) {
  game.ui.set({ selectedCountry: index, panel: index ? 'country' : 'none', countryTab: 'realm' });
  if (fly && index) flyToRealm(game, index);
}

export function selectArmy(game: Game, id: number) {
  game.ui.set({ selectedArmy: id, panel: 'army', orderMode: false });
}

export function selectFleet(game: Game, id: number) {
  game.ui.set({ selectedFleet: id, panel: 'fleet', orderMode: false });
}

export function selectWar(game: Game, id: number) {
  game.ui.set({ selectedWar: id, panel: 'war' });
}

export function closePanel(game: Game) {
  game.ui.set({ panel: 'none', selectedProvince: 0, selectedArmy: 0, selectedFleet: 0, orderMode: false });
}

export function setMapMode(game: Game, mode: MapMode) {
  game.ui.set({ mapMode: mode });
}

let noticeTimer = 0;
/** A short line of feedback at the bottom of the screen. */
export function notice(game: Game, text: string) {
  game.ui.set({ notice: text });
  clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => game.ui.set({ notice: '' }), 3200);
}

/** Runs a player command and refreshes the screen, or explains why it failed. */
export function run(game: Game, result: cmd.Result): boolean {
  if (!result.ok) {
    sound.play('deny');
    notice(game, result.reason);
    return false;
  }
  sound.play('click');
  if (result.message) notice(game, result.message);
  game.runner?.sync();
  return true;
}

/** Marches the selected army, or sails the selected fleet, to a region. */
export function orderArmy(game: Game, region: number) {
  const { selectedArmy, selectedFleet, panel } = game.ui.get();
  game.ui.set({ orderMode: false });
  if (!region) return;
  if (panel === 'fleet') {
    const fleet = fleetById(game.state, selectedFleet);
    if (fleet && fleet.owner === game.state.player) run(game, cmd.moveFleet(game.state, game.world, fleet.id, region));
    return;
  }
  const army = armyById(game.state, selectedArmy);
  if (!army || army.owner !== game.state.player) return;
  run(game, cmd.moveArmy(game.state, game.world, army.id, region));
}

// ── Time ──────────────────────────────────────────────────────────

export function setSpeed(game: Game, speed: number) {
  game.ui.set({ speed: Math.max(0, Math.min(5, speed)) });
}

let lastSpeed = 2;
export function togglePause(game: Game) {
  const { speed } = game.ui.get();
  if (speed) {
    lastSpeed = speed;
    setSpeed(game, 0);
  } else setSpeed(game, lastSpeed);
}

// ── Camera ────────────────────────────────────────────────────────

/** Frames a country together with its vassals. */
export function flyToRealm(game: Game, index: number, minZoom = 0.3, maxZoom = 1.2) {
  const map = game.map;
  if (!map) return;
  const f = map.frame(realmProvinces(game.state, index), 0.6, minZoom, maxZoom);
  if (f) map.flyTo(f.x, f.y, f.zoom);
}

export function flyToProvince(game: Game, id: number, zoom = 1.4) {
  const r = game.world.region(id);
  if (r && game.map) game.map.flyToPoint(r.label[0], r.label[1], Math.max(zoom, game.map.camera.zoom));
}

// ── Game flow ─────────────────────────────────────────────────────

/** On the choose screen a click picks the country that owns the province. */
export function pickRealmAt(game: Game, id: number) {
  const owner = id ? (game.state.provinces[id]?.owner ?? 0) : 0;
  if (owner) game.ui.set({ selectedCountry: owner });
}

/** True if a campaign is under way and can be resumed. */
export function canContinue(game: Game): boolean {
  const s = game.state;
  return !!s.player && !!s.countries[s.player]?.alive;
}

/** Swaps in another game state (new campaign or a loaded save). */
export function replaceState(game: Game, state: GameState) {
  game.state = state;
  game.map?.setState(state);
  game.runner?.reset();
}

/** Opens the choose-your-realm screen on the first featured realm, with a fresh world. */
export function startChoosing(game: Game) {
  if (game.state.player) replaceState(game, createGameState(game.world, game.scenario));
  const first = countryByTag(game.state, BOOKMARKS[0].tag);
  game.ui.set({
    phase: 'choose',
    selectedCountry: first?.index ?? 0,
    panel: 'none',
    selectedProvince: 0,
    selectedArmy: 0,
    toasts: [],
    speed: 0,
    modal: 'none',
  });
}

/**
 * Takes control of a country. The HUD frames its realm once its panels are on screen. A fresh world
 * begins a new campaign; playing on as another realm after a fall continues the same one.
 */
export function startAs(game: Game, index: number) {
  if (!game.state.player) {
    game.campaign = '';
    game.played = 0;
    game.ironman = false;
  }
  game.state.player = index;
  game.runner?.reset();
  game.ui.set({
    // The first campaign in this browser begins with the guided tour.
    tour: tourSeen() ? 0 : 1,
    phase: 'playing',
    player: index,
    selectedCountry: index,
    selectedProvince: 0,
    panel: 'country',
    countryTab: 'realm',
    mapMode: 'realms',
    speed: 0,
    modal: 'none',
  });
}

/** Back to the title screen; the campaign stays loaded so it can be continued. */
export function toMenu(game: Game) {
  game.ui.set({
    phase: 'menu',
    panel: 'none',
    selectedProvince: 0,
    selectedArmy: 0,
    mapMode: 'realms',
    modal: 'none',
    speed: 0,
    orderMode: false,
  });
}

export function resume(game: Game) {
  game.ui.set({
    phase: 'playing',
    player: game.state.player,
    selectedCountry: game.state.player,
    panel: 'country',
    countryTab: 'realm',
    modal: 'none',
  });
  // A loaded game may have an event or an offer waiting for an answer.
  game.runner?.sync();
}
