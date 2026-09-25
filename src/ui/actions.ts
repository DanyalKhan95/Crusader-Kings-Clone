/** UI actions shared by the screens: selection, camera moves, choosing a realm. */
import { BOOKMARKS } from '../data/bookmarks';
import type { MapMode } from '../game/mapModes';
import { realmProvinces } from '../game/world';
import type { Game } from './game';

export function selectProvince(game: Game, id: number) {
  if (!id) {
    closePanel(game);
    return;
  }
  game.ui.set({ selectedProvince: id, panel: 'province' });
}

export function selectCountry(game: Game, index: number, fly = false) {
  game.ui.set({ selectedCountry: index, panel: index ? 'country' : 'none' });
  if (fly && index) flyToRealm(game, index);
}

export function closePanel(game: Game) {
  game.ui.set({ panel: 'none', selectedProvince: 0 });
}

export function setMapMode(game: Game, mode: MapMode) {
  game.ui.set({ mapMode: mode });
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

/** On the choose screen a click picks the country that owns the province. */
export function pickRealmAt(game: Game, id: number) {
  const owner = id ? (game.state.provinces[id]?.owner ?? 0) : 0;
  if (owner) game.ui.set({ selectedCountry: owner });
}

/** Opens the choose-your-realm screen on the first featured realm. */
export function startChoosing(game: Game) {
  const first = game.state.byTag.get(BOOKMARKS[0].tag);
  game.ui.set({ phase: 'choose', selectedCountry: first?.index ?? 0, panel: 'none', selectedProvince: 0 });
}

/** Takes control of a country. The HUD frames its realm once its panels are on screen. */
export function startAs(game: Game, index: number) {
  game.ui.set({
    phase: 'playing',
    player: index,
    selectedCountry: index,
    selectedProvince: 0,
    panel: 'country',
    mapMode: 'realms',
  });
}

export function toMenu(game: Game) {
  game.ui.set({
    phase: 'menu',
    panel: 'none',
    selectedProvince: 0,
    selectedCountry: 0,
    player: 0,
    mapMode: 'realms',
    modal: 'none',
  });
}
