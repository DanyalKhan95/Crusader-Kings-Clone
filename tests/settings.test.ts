import { beforeEach, describe, expect, it } from 'vitest';
import {
  actionsFor,
  bindKey,
  bindings,
  keyLabel,
  keyOf,
  resetKeys,
  shortcut,
  unbindKey,
  withKey,
} from '../src/ui/keys';
import { DEFAULT_SETTINGS, fittingScale, sanitizeSettings, settings } from '../src/ui/settings';

describe('settings', () => {
  it('fall back to the defaults for anything missing or damaged', () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('nonsense')).toEqual(DEFAULT_SETTINGS);
    const s = sanitizeSettings({
      uiScale: 1.5,
      textScale: 7,
      quality: 'ultra',
      frameCap: 60,
      animations: 'yes',
      topSpeed: 0,
      autosaveMinutes: 10,
      keys: { pause: ['P'], ledger: [3], help: ['A', 'B', 'C'] },
    });
    expect(s.uiScale).toBe(1.5);
    expect(s.textScale).toBe(DEFAULT_SETTINGS.textScale);
    expect(s.quality).toBe(DEFAULT_SETTINGS.quality);
    expect(s.frameCap).toBe(60);
    expect(s.animations).toBe(true);
    expect(s.topSpeed).toBe(0);
    expect(s.autosaveMinutes).toBe(10);
    // Bindings keep only lists of names, two keys at most.
    expect(s.keys).toEqual({ pause: ['P'], help: ['A', 'B'] });
  });

  it('grow the interface only as far as the window leaves room for the desktop layout', () => {
    expect(fittingScale(1600, 900)).toBe(1.25);
    expect(fittingScale(1920, 1080)).toBe(1.5);
    expect(fittingScale(3840, 2160)).toBe(2);
    // Small windows keep their own layouts at 100%.
    expect(fittingScale(1280, 720)).toBe(1);
    expect(fittingScale(390, 844)).toBe(1);
  });
});

describe('key bindings', () => {
  beforeEach(() => resetKeys());

  it('name keys as they read, whatever Shift does to letters', () => {
    expect(keyOf({ key: ' ' })).toBe('Space');
    expect(keyOf({ key: 'l' })).toBe('L');
    expect(keyOf({ key: 'L' })).toBe('L');
    expect(keyOf({ key: 'ArrowUp' })).toBe('ArrowUp');
    expect(keyLabel('ArrowUp')).toBe('↑');
    expect(keyLabel('-')).toBe('−');
  });

  it('start from the defaults', () => {
    expect(actionsFor('Space')).toEqual(['pause']);
    expect(actionsFor('Y')).toEqual(['mode:religion']);
    expect(actionsFor('=')).toEqual(['zoomIn']);
    expect(bindings('help')).toEqual(['H', 'F1']);
    expect(withKey('The ledger of nations', 'ledger')).toBe('The ledger of nations (L)');
  });

  it('move a key from the action that had it, and say which', () => {
    const taken = bindKey('pause', 'L');
    expect(taken).toBe('ledger');
    expect(bindings('pause')).toEqual(['L']);
    expect(bindings('ledger')).toEqual([]);
    expect(actionsFor('L')).toEqual(['pause']);
    expect(actionsFor('Space')).toEqual([]);
    expect(shortcut('ledger')).toBe('');
    expect(withKey('The ledger of nations', 'ledger')).toBe('The ledger of nations');
  });

  it('keep a second key, and store only what differs from the defaults', () => {
    bindKey('help', 'F2', 1);
    expect(bindings('help')).toEqual(['H', 'F2']);
    bindKey('help', 'F1', 1);
    expect(settings.get().keys).toEqual({});
    unbindKey('help', 'F1');
    expect(bindings('help')).toEqual(['H']);
    resetKeys();
    expect(bindings('help')).toEqual(['H', 'F1']);
  });

  it('refuse the keys that move focus or go back', () => {
    expect(bindKey('pause', 'Escape')).toBeNull();
    expect(bindKey('pause', 'Tab')).toBeNull();
    expect(bindings('pause')).toEqual(['Space']);
  });
});
