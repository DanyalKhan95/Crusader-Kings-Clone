/** UI actions shared by the screens: selection, camera moves, orders and game flow. */
import { BOOKMARKS } from '../data/bookmarks';
import type { MapMode } from '../game/mapModes';
import * as cmd from '../sim/commands';
import { fleetById } from '../sim/naval';
import { armyById, countryByTag, realmProvinces } from '../sim/queries';
import { createGameState } from '../sim/setup';
import type { GameState } from '../sim/types';
import { sound } from './audio';
import type { Game, RealmScreen, SettingsSection } from './game';
import { tourSeen } from './tour';

// What goes to the side panel leaves the realm's screens, which would hide it.

export function selectProvince(game: Game, id: number) {
  if (!id) {
    closePanel(game);
    return;
  }
  game.ui.set({ selectedProvince: id, panel: 'province', orderMode: false, screen: null });
}

/** A realm in the side panel; the player's own opens its screens instead. */
export function selectCountry(game: Game, index: number, fly = false) {
  if (index && index === game.state.player && game.ui.get().phase === 'playing') {
    openScreen(game, 'realm');
    return;
  }
  game.ui.set({ selectedCountry: index, panel: index ? 'country' : 'none', screen: null });
  if (fly && index) flyToRealm(game, index);
}

export function selectArmy(game: Game, id: number) {
  game.ui.set({ selectedArmy: id, panel: 'army', orderMode: false, screen: null });
}

export function selectFleet(game: Game, id: number) {
  game.ui.set({ selectedFleet: id, panel: 'fleet', orderMode: false, screen: null });
}

export function selectWar(game: Game, id: number) {
  game.ui.set({ selectedWar: id, panel: 'war', screen: null });
}

export function closePanel(game: Game) {
  game.ui.set({ panel: 'none', selectedProvince: 0, selectedArmy: 0, selectedFleet: 0, orderMode: false });
}

/** Opens a screen of the player's realm over the map; with `toggle`, the same screen again closes it. */
export function openScreen(game: Game, screen: RealmScreen, toggle = false) {
  if (toggle && game.ui.get().screen === screen) closeScreen(game);
  else game.ui.set({ screen, contextMenu: null });
}

/** Back to the map. */
export function closeScreen(game: Game) {
  game.ui.set({ screen: null });
}

/** The next of the player's armies (or the one before), selected and in view. */
export function cycleArmies(game: Game, step: 1 | -1) {
  const { state } = game;
  const list = state.armies.filter((a) => a.owner === state.player);
  if (!list.length) return notice(game, 'No army of yours is in the field.');
  const { panel, selectedArmy } = game.ui.get();
  const next =
    list[
      following(
        list.findIndex((a) => panel === 'army' && a.id === selectedArmy),
        step,
        list.length,
      )
    ];
  selectArmy(game, next.id);
  flyToProvince(game, next.location, 1.2);
}

/** The next of the player's fleets (or the one before), selected and in view. */
export function cycleFleets(game: Game, step: 1 | -1) {
  const { state } = game;
  const list = state.fleets.filter((f) => f.owner === state.player);
  if (!list.length) return notice(game, 'You have no fleet.');
  const { panel, selectedFleet } = game.ui.get();
  const next =
    list[
      following(
        list.findIndex((f) => panel === 'fleet' && f.id === selectedFleet),
        step,
        list.length,
      )
    ];
  selectFleet(game, next.id);
  flyToProvince(game, next.location, 1.2);
}

/** The index after `at` in a ring of `n` (or before it); from none, the first or the last. */
function following(at: number, step: 1 | -1, n: number): number {
  if (at < 0) return step > 0 ? 0 : n - 1;
  return (at + step + n) % n;
}

/** Opens the declaration of war on a realm, fought for a province if one is given and can be. */
export function openDeclareWar(game: Game, target: number, goal = 0) {
  game.ui.set({ modal: 'declare', dialogCountry: target, dialogGoal: goal, speed: 0, contextMenu: null });
}

/**
 * A right-click on the map, or a long press on a touch screen: the selected army or fleet of the
 * player's marches or sails there, and otherwise the place's menu opens.
 */
export function secondaryClick(game: Game, region: number, x: number, y: number) {
  const { phase, panel, selectedArmy, selectedFleet } = game.ui.get();
  if (phase !== 'playing') return;
  const { state } = game;
  const orders =
    (panel === 'army' && armyById(state, selectedArmy)?.owner === state.player) ||
    (panel === 'fleet' && fleetById(state, selectedFleet)?.owner === state.player);
  if (orders) orderArmy(game, region);
  else game.ui.set({ contextMenu: region ? { region, x, y } : null });
}

/** A map mode, shown at once: the realm's screens make way for the map. */
export function setMapMode(game: Game, mode: MapMode) {
  game.ui.set({ mapMode: mode, screen: null });
}

/**
 * Opens the encyclopedia at a page: an entry's id, `cat:` and a category, or '' for its contents.
 * Closing it goes back to whatever it was opened from; time stops while it is open.
 */
export function openEncyclopedia(game: Game, page = '') {
  const s = game.ui.get();
  const open = s.modal === 'encyclopedia';
  game.ui.set({
    modal: 'encyclopedia',
    encyclopedia: page,
    encyclopediaTrail: open
      ? s.encyclopedia === page
        ? s.encyclopediaTrail
        : [...s.encyclopediaTrail, s.encyclopedia].slice(-40)
      : [],
    encyclopediaBack: open ? s.encyclopediaBack : s.modal,
    speed: 0,
    contextMenu: null,
  });
}

/** The page read before this one. */
export function encyclopediaBack(game: Game) {
  const trail = game.ui.get().encyclopediaTrail;
  if (trail.length) game.ui.set({ encyclopedia: trail[trail.length - 1], encyclopediaTrail: trail.slice(0, -1) });
}

/** Closes the encyclopedia. */
export function closeEncyclopedia(game: Game) {
  game.ui.set({ modal: game.ui.get().encyclopediaBack });
}

/** Opens the settings at a section; closing them goes back to the screen they were opened from. */
export function openSettings(game: Game, section: SettingsSection = 'interface') {
  game.ui.set({ modal: 'settings', settingsSection: section, settingsBack: game.ui.get().modal });
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

/** Flies to the player's capital. */
export function goToCapital(game: Game) {
  closeScreen(game);
  const capital = game.state.countries[game.state.player]?.capital;
  if (capital) flyToProvince(game, capital, 1.2);
}

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
    // The player's first campaign begins with the guided tour.
    tour: tourSeen() ? 0 : 1,
    phase: 'playing',
    player: index,
    selectedCountry: 0,
    selectedProvince: 0,
    panel: 'none',
    screen: null,
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
    selectedCountry: 0,
    panel: 'none',
    screen: null,
    modal: 'none',
  });
  // A loaded game may have an event or an offer waiting for an answer.
  game.runner?.sync();
}
