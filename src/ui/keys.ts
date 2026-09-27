/**
 * Key bindings: every action the keyboard can take, its default keys, and the player's own choices
 * from the settings. Keys are named by what they type ('Q', '1', '+') or by their name ('Space',
 * 'ArrowUp', 'F1'), so a binding reads as the key does. Esc always closes and goes back.
 */
import { MAP_MODES, type MapMode } from '../game/mapModes';
import type { CountryTab } from './game';
import { settings } from './settings';

export type KeyAction =
  | 'pause'
  | 'speed1'
  | 'speed2'
  | 'speed3'
  | 'speed4'
  | 'speed5'
  | `tab:${CountryTab}`
  | 'tech'
  | 'ledger'
  | 'log'
  | 'outliner'
  | 'help'
  | 'perfOverlay'
  | `mode:${MapMode}`
  | 'capital'
  | 'nextArmy'
  | 'nextFleet'
  | 'panLeft'
  | 'panRight'
  | 'panUp'
  | 'panDown'
  | 'zoomIn'
  | 'zoomOut';

export type KeyGroup = 'Time' | 'Your realm' | 'Screens' | 'Map modes' | 'The map';
export const KEY_GROUPS: KeyGroup[] = ['Time', 'Your realm', 'Screens', 'Map modes', 'The map'];

/** The tabs of the player's realm, with their keys: the letters of their names where they are free. */
const TAB_KEYS: { tab: CountryTab; label: string; key: string }[] = [
  { tab: 'realm', label: 'Your realm', key: 'I' },
  { tab: 'treasury', label: 'The treasury', key: 'G' },
  { tab: 'military', label: 'The army', key: 'A' },
  { tab: 'court', label: 'The court', key: 'C' },
  { tab: 'laws', label: 'Laws and estates', key: 'J' },
  { tab: 'faith', label: 'Faith', key: 'F' },
  { tab: 'diplomacy', label: 'Diplomacy', key: 'D' },
];

export interface KeyActionInfo {
  id: KeyAction;
  label: string;
  group: KeyGroup;
  /** the default keys, at most two */
  keys: string[];
}

export const KEY_ACTIONS: KeyActionInfo[] = [
  { id: 'pause', label: 'Pause and resume', group: 'Time', keys: ['Space'] },
  ...([1, 2, 3, 4, 5] as const).map((n): KeyActionInfo => ({
    id: `speed${n}`,
    label: `Speed ${n}`,
    group: 'Time',
    keys: [String(n)],
  })),
  ...TAB_KEYS.map((t): KeyActionInfo => ({ id: `tab:${t.tab}`, label: t.label, group: 'Your realm', keys: [t.key] })),
  { id: 'tech', label: 'Technology', group: 'Screens', keys: ['K'] },
  { id: 'ledger', label: 'The ledger of nations', group: 'Screens', keys: ['L'] },
  { id: 'log', label: 'The log of news', group: 'Screens', keys: ['N'] },
  { id: 'outliner', label: 'Show or fold the outliner', group: 'Screens', keys: ['O'] },
  { id: 'help', label: 'How to play', group: 'Screens', keys: ['H', 'F1'] },
  { id: 'perfOverlay', label: 'Performance overlay', group: 'Screens', keys: ['F3'] },
  ...MAP_MODES.map((m): KeyActionInfo => ({
    id: `mode:${m.id}`,
    label: `${m.label} map`,
    group: 'Map modes',
    keys: [m.key],
  })),
  { id: 'capital', label: 'Go to the capital', group: 'The map', keys: ['Home'] },
  { id: 'nextArmy', label: 'The next army (with Shift, the one before)', group: 'The map', keys: ['Z'] },
  { id: 'nextFleet', label: 'The next fleet (with Shift, the one before)', group: 'The map', keys: ['X'] },
  { id: 'panLeft', label: 'Move the map left', group: 'The map', keys: ['ArrowLeft'] },
  { id: 'panRight', label: 'Move the map right', group: 'The map', keys: ['ArrowRight'] },
  { id: 'panUp', label: 'Move the map up', group: 'The map', keys: ['ArrowUp'] },
  { id: 'panDown', label: 'Move the map down', group: 'The map', keys: ['ArrowDown'] },
  { id: 'zoomIn', label: 'Zoom in', group: 'The map', keys: ['+', '='] },
  { id: 'zoomOut', label: 'Zoom out', group: 'The map', keys: ['-', '_'] },
];

const INFO = new Map(KEY_ACTIONS.map((a) => [a.id, a]));

/**
 * Keys that cannot be bound: Esc goes back, F11 fills the screen (in browsers and the desktop app),
 * and the rest move focus or are only modifiers.
 */
export const RESERVED_KEYS = new Set([
  'Escape',
  'F11',
  'Tab',
  'Enter',
  'Shift',
  'Control',
  'Alt',
  'AltGraph',
  'Meta',
  'CapsLock',
  'ContextMenu',
  'Dead',
  'Unidentified',
  'Process',
]);

/** A pressed key as the bindings name it. */
export function keyOf(e: Pick<KeyboardEvent, 'key'>): string {
  if (e.key === ' ' || e.key === 'Spacebar') return 'Space';
  return e.key.length === 1 ? e.key.toUpperCase() : e.key;
}

/** The keys bound to an action: the player's choice, or the default. */
export function bindings(action: KeyAction): string[] {
  return settings.get().keys[action] ?? INFO.get(action)?.keys ?? [];
}

let indexedFor: Record<string, string[]> | null = null;
let byKey = new Map<string, KeyAction[]>();

/** The actions a key is bound to. */
export function actionsFor(key: string): KeyAction[] {
  const custom = settings.get().keys;
  if (custom !== indexedFor) {
    indexedFor = custom;
    byKey = new Map();
    for (const a of KEY_ACTIONS)
      for (const k of bindings(a.id)) {
        const list = byKey.get(k);
        if (list) list.push(a.id);
        else byKey.set(k, [a.id]);
      }
  }
  return byKey.get(key) ?? [];
}

/**
 * Binds a key to an action, in the first or second place. The key leaves any other action that had
 * it, and that action is returned so the player can be told.
 */
export function bindKey(action: KeyAction, key: string, slot: 0 | 1 = 0): KeyAction | null {
  if (RESERVED_KEYS.has(key)) return null;
  const next: Record<string, string[]> = { ...settings.get().keys };
  let takenFrom: KeyAction | null = null;
  for (const a of KEY_ACTIONS) {
    if (a.id === action) continue;
    const keys = bindings(a.id);
    if (keys.includes(key)) {
      next[a.id] = keys.filter((k) => k !== key);
      takenFrom = a.id;
    }
  }
  const own = [...bindings(action)];
  own[slot] = key;
  next[action] = own.filter((k, i) => k && own.indexOf(k) === i).slice(0, 2);
  settings.set({ keys: pruneDefaults(next) });
  return takenFrom;
}

/** Takes a key off an action, leaving it with the other key or none. */
export function unbindKey(action: KeyAction, key: string) {
  const next = { ...settings.get().keys, [action]: bindings(action).filter((k) => k !== key) };
  settings.set({ keys: pruneDefaults(next) });
}

export function resetKeys() {
  settings.set({ keys: {} });
}

/** Keeps only bindings that differ from the defaults, so new defaults reach players who kept theirs. */
function pruneDefaults(keys: Record<string, string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [action, list] of Object.entries(keys)) {
    const def = INFO.get(action as KeyAction)?.keys ?? [];
    if (list.length !== def.length || list.some((k, i) => k !== def[i])) out[action] = list;
  }
  return out;
}

const LABELS: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  '-': '−',
  PageUp: 'Page Up',
  PageDown: 'Page Down',
  Backspace: 'Backspace',
  Delete: 'Del',
};

/** A key as the interface shows it. */
export function keyLabel(key: string): string {
  return LABELS[key] ?? key;
}

/** The first key of an action as shown, or '' when it has none. */
export function shortcut(action: KeyAction): string {
  const k = bindings(action)[0];
  return k ? keyLabel(k) : '';
}

/** A label with the action's key after it, for tooltips: "Pause (Space)". */
export function withKey(text: string, action: KeyAction): string {
  const k = shortcut(action);
  return k ? `${text} (${k})` : text;
}
