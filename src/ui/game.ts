/** The running game as the UI sees it: static world, mutable state, UI store and the map. */
import { createContext, useContext } from 'react';
import type { MapMode } from '../game/mapModes';
import type { StaticWorld } from '../game/world';
import { faithFamily } from '../sim/beliefs';
import { topLiege } from '../sim/queries';
import type { Country, GameState } from '../sim/types';
import type { MeshBundle } from '../render/meshBuilder';
import type { ScenarioData } from '../shared/dataTypes';
import type { MapController } from './map/MapController';
import type { Runner } from './runner';
import { createStore, type Store } from './store';

export type Phase = 'menu' | 'choose' | 'playing';
export type Panel = 'none' | 'province' | 'country' | 'army' | 'fleet' | 'war';
export type CountryTab = 'realm' | 'treasury' | 'military' | 'court' | 'laws' | 'faith' | 'diplomacy';
export type Modal =
  | 'none'
  | 'credits'
  | 'menu'
  | 'declare'
  | 'peace'
  | 'offer'
  | 'fallen'
  | 'tech'
  | 'event'
  | 'ledger'
  | 'log'
  | 'end'
  | 'help'
  | 'settings'
  | 'load'
  | 'demoEnd';
export type SettingsSection = 'interface' | 'graphics' | 'game' | 'news' | 'sound' | 'keys';

/** A menu of what can be done with a place, opened by a right-click or a long press. */
export interface ContextMenuAt {
  region: number;
  /** where it opened, in viewport pixels */
  x: number;
  y: number;
}

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
  panel: Panel;
  countryTab: CountryTab;
  modal: Modal;
  /** 0 = paused, 1 … 5 */
  speed: number;
  /** bumped when the world changed, so panels re-read the state */
  tick: number;
  selectedArmy: number;
  selectedFleet: number;
  selectedWar: number;
  /** the country a war declaration is aimed at, and the province it would be fought for (0 = any) */
  dialogCountry: number;
  dialogGoal: number;
  /** the next map click orders the selected army or fleet there (touch screens) */
  orderMode: boolean;
  /** message ids shown as toasts */
  toasts: number[];
  /** a short line of feedback, e.g. why an order failed */
  notice: string;
  /** the step of the guided tour on screen (0 = none) */
  tour: number;
  /** alerts the player hid, until what they are about changes */
  hiddenAlerts: string[];
  /** the section the settings open at, and the screen they go back to when closed */
  settingsSection: SettingsSection;
  settingsBack: Modal;
  contextMenu: ContextMenuAt | null;
}

export interface Game {
  world: StaticWorld;
  scenario: ScenarioData;
  state: GameState;
  bundle: MeshBundle;
  ui: Store<UIState>;
  map: MapController | null;
  runner: Runner | null;
  /** The hover tooltip element, positioned directly by the map on pointer moves. */
  tooltipEl: HTMLElement | null;
  /** Last pointer position over the map (client px), for re-placing the tooltip. */
  pointer: { x: number; y: number };
  /** The campaign's id, the same in every save of it. */
  campaign: string;
  /** Seconds of play in this campaign. */
  played: number;
  /** One save the game keeps itself, and no other. */
  ironman: boolean;
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
    countryTab: 'realm',
    modal: 'none',
    speed: 0,
    tick: 0,
    selectedArmy: 0,
    selectedFleet: 0,
    selectedWar: 0,
    dialogCountry: 0,
    dialogGoal: 0,
    orderMode: false,
    toasts: [],
    notice: '',
    tour: 0,
    hiddenAlerts: [],
    settingsSection: 'interface',
    settingsBack: 'none',
    contextMenu: null,
  });
  return {
    world,
    scenario,
    state,
    bundle,
    ui,
    map: null,
    runner: null,
    tooltipEl: null,
    pointer: { x: 0, y: 0 },
    campaign: '',
    played: 0,
    ironman: false,
  };
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
    if (p.owner === index) {
      out.provinces++;
      out.development += p.dev;
      out.area += world.region(id).area;
    }
    if (topLiege(state, p.owner) === index) {
      out.realmProvinces++;
      out.realmDevelopment += p.dev;
    }
  });
  for (const c of state.countries) if (c?.alive && c.liege === index) out.vassals.push(c);
  out.vassals.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/** The family of a faith, for heraldry: heresies take their parent's charges. */
export function religionFamily(_game: Game, religion: string): string {
  return faithFamily(religion) || 'christian';
}
