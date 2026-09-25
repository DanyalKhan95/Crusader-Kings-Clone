/** The running game as the UI sees it: static world, mutable state, UI store and the map. */
import { createContext, useContext } from 'react';
import type { MapMode } from '../game/mapModes';
import { topLiege, type Country, type GameState, type StaticWorld } from '../game/world';
import type { MeshBundle } from '../render/meshBuilder';
import type { ScenarioData } from '../shared/dataTypes';
import type { MapController } from './map/MapController';
import { createStore, type Store } from './store';

export type Phase = 'menu' | 'choose' | 'playing';

export interface UIState {
  phase: Phase;
  /** Terrain and fonts are loaded and the first frame is drawn. */
  ready: boolean;
  mapMode: MapMode;
  /** Region under the pointer (0 = none). */
  hovered: number;
  /** Province shown in the side panel (0 = none). */
  selectedProvince: number;
  /** Country shown in the side panel or picked on the choose screen (0 = none). */
  selectedCountry: number;
  /** The country the player controls (0 = not chosen yet). */
  player: number;
  panel: 'none' | 'province' | 'country';
  modal: 'none' | 'credits';
}

export interface Game {
  world: StaticWorld;
  scenario: ScenarioData;
  state: GameState;
  bundle: MeshBundle;
  ui: Store<UIState>;
  map: MapController | null;
  /** The hover tooltip element, positioned directly by the map on pointer moves. */
  tooltipEl: HTMLElement | null;
  /** Last pointer position over the map (client px), for re-placing the tooltip. */
  pointer: { x: number; y: number };
}

export function createGame(world: StaticWorld, scenario: ScenarioData, state: GameState, bundle: MeshBundle): Game {
  const ui = createStore<UIState>({
    phase: 'menu',
    ready: false,
    mapMode: 'realms',
    hovered: 0,
    selectedProvince: 0,
    selectedCountry: 0,
    player: 0,
    panel: 'none',
    modal: 'none',
  });
  return { world, scenario, state, bundle, ui, map: null, tooltipEl: null, pointer: { x: 0, y: 0 } };
}

export const GameContext = createContext<Game | null>(null);

export function useGame(): Game {
  const g = useContext(GameContext);
  if (!g) throw new Error('useGame outside <GameContext>');
  return g;
}

export interface CountryStats {
  provinces: number;
  development: number;
  area: number;
  realmProvinces: number;
  realmDevelopment: number;
  vassals: Country[];
}

export function countryStats(game: Game, index: number): CountryStats {
  const { state, world } = game;
  const out: CountryStats = {
    provinces: 0,
    development: 0,
    area: 0,
    realmProvinces: 0,
    realmDevelopment: 0,
    vassals: [],
  };
  state.provinces.forEach((p, id) => {
    if (!p?.owner) return;
    const r = world.region(id);
    if (p.owner === index) {
      out.provinces++;
      out.development += r.dev ?? 0;
      out.area += r.area;
    }
    if (topLiege(state, p.owner) === index) {
      out.realmProvinces++;
      out.realmDevelopment += r.dev ?? 0;
    }
  });
  for (const c of state.countries) if (c?.liege === index) out.vassals.push(c);
  out.vassals.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export function religionFamily(game: Game, religion: string): string {
  return game.world.world.religions[religion]?.family ?? 'christian';
}
