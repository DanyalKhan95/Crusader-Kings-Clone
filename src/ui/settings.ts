/**
 * The player's settings: the interface, the map's graphics, the pace of the game, autosaves and the
 * key bindings. They are kept in this browser, applied at once, and read outside React by the map
 * and the runner. Sound keeps its own settings in `audio.ts`.
 */
import { createStore, useStore } from './store';

/** How sharp the map is drawn: the most device pixels it spends on each CSS pixel. */
export type MapQuality = 'low' | 'medium' | 'high' | 'native';

export interface Settings {
  /** size of the whole interface, map lettering and banners included */
  uiScale: number;
  /** size of the interface's text on top of that */
  textScale: number;
  quality: MapQuality;
  /** frames a second at most; 0 for the display's own rate */
  frameCap: number;
  /** pulsing highlights, camera glides and the drift behind the title */
  animations: boolean;
  /** days a second at the fastest speed; 0 for as fast as the machine allows */
  topSpeed: number;
  /** minutes of play between autosaves; 0 for never */
  autosaveMinutes: number;
  /** frame time and the simulation's costs on screen */
  perfOverlay: boolean;
  /** key bindings that differ from the defaults, by action */
  keys: Record<string, string[]>;
}

export const DEFAULT_SETTINGS: Settings = {
  uiScale: 1,
  textScale: 1,
  quality: 'high',
  frameCap: 0,
  animations: true,
  topSpeed: 120,
  autosaveMinutes: 4,
  perfOverlay: false,
  keys: {},
};

export const UI_SCALES = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
export const TEXT_SCALES = [0.9, 1, 1.1, 1.2, 1.3];
export const QUALITY_DPR: Record<MapQuality, number> = { low: 1, medium: 1.5, high: 2, native: 3 };
export const FRAME_CAPS = [0, 30, 60, 120];
export const TOP_SPEEDS = [60, 120, 240, 0];
export const AUTOSAVE_MINUTES = [0, 2, 4, 10];

const STORAGE_KEY = 'crowns-and-centuries:settings';

const pick = <T>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

/** Settings from storage, keeping only what is valid: anything damaged or unknown falls back to the default. */
export function sanitizeSettings(raw: unknown, d: Settings = DEFAULT_SETTINGS): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Settings, unknown>>;
  const keys: Record<string, string[]> = {};
  if (r.keys && typeof r.keys === 'object')
    for (const [action, list] of Object.entries(r.keys as Record<string, unknown>))
      if (Array.isArray(list) && list.every((k) => typeof k === 'string')) keys[action] = list.slice(0, 2);
  return {
    uiScale: pick(r.uiScale, UI_SCALES, d.uiScale),
    textScale: pick(r.textScale, TEXT_SCALES, d.textScale),
    quality: pick(r.quality, Object.keys(QUALITY_DPR) as MapQuality[], d.quality),
    frameCap: pick(r.frameCap, FRAME_CAPS, d.frameCap),
    animations: typeof r.animations === 'boolean' ? r.animations : d.animations,
    topSpeed: pick(r.topSpeed, TOP_SPEEDS, d.topSpeed),
    autosaveMinutes: pick(r.autosaveMinutes, AUTOSAVE_MINUTES, d.autosaveMinutes),
    perfOverlay: typeof r.perfOverlay === 'boolean' ? r.perfOverlay : d.perfOverlay,
    keys,
  };
}

function load(): Settings {
  // A system that asks for less motion starts with the map still, until the player says otherwise.
  const defaults = { ...DEFAULT_SETTINGS };
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) defaults.animations = false;
  } catch {
    /* no window: tests and tools */
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return sanitizeSettings(raw ? JSON.parse(raw) : {}, defaults);
  } catch {
    return defaults;
  }
}

export const settings = createStore<Settings>(load());

/**
 * The interface's desktop layout needs about this much room, in CSS pixels at its scale. Layout rules
 * for small screens look at the window itself, so a scale that leaves less would crowd the HUD.
 */
const LAYOUT_W = 1200;
const LAYOUT_H = 700;

/** The largest of the scales that a window fits; never below 100%, since small windows have their own layout. */
export function fittingScale(width: number, height: number): number {
  const fit = Math.max(1, Math.min(width / LAYOUT_W, height / LAYOUT_H));
  return UI_SCALES.filter((s) => s <= fit + 1e-9).at(-1) ?? 1;
}

/** The interface's scale in effect: the one chosen, or the largest the window fits. */
export const appliedScale = createStore<{ value: number }>({ value: DEFAULT_SETTINGS.uiScale });

/** Puts the interface's sizes and motion into effect. */
export function applySettings(s: Settings = settings.get()) {
  if (typeof document === 'undefined') return;
  const scale = Math.min(s.uiScale, fittingScale(window.innerWidth, window.innerHeight));
  const root = document.documentElement;
  root.style.setProperty('--ui-scale', String(scale));
  root.style.setProperty('--text-scale', String(s.textScale));
  root.classList.toggle('still', !s.animations);
  appliedScale.set({ value: scale });
}

applySettings();
if (typeof window !== 'undefined') window.addEventListener('resize', () => applySettings());
settings.subscribe(() => {
  const s = settings.get();
  applySettings(s);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // A browser that refuses storage keeps the settings for this visit only.
  }
});

export function useSettings<T>(select: (s: Settings) => T): T {
  return useStore(settings, select);
}

/** The interface's scale in effect, for code that places elements by viewport coordinates. */
export function uiScale(): number {
  return appliedScale.get().value;
}
