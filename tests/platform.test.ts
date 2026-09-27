import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NativeBridge } from '../src/ui/platform';

/** The desktop app's bridge, with its files in memory. */
function fakeBridge(settingsText: string | null = null) {
  const files = new Map<string, { meta: object; data: Uint8Array<ArrayBuffer> }>();
  const listed: unknown[] = [];
  let settings = settingsText;
  const bridge: NativeBridge = {
    platform: 'linux',
    saves: {
      list: async () => [...listed, ...[...files.values()].map((f) => f.meta)],
      read: async (slot) => files.get(slot)?.data ?? null,
      write: async (slot, meta, data) => void files.set(slot, { meta, data: new Uint8Array(data) }),
      remove: async (slot) => void files.delete(slot),
      openFolder: async () => '',
    },
    settings: {
      read: () => settings,
      write: (text) => void (settings = text),
    },
    window: {
      getMode: async () => 'windowed',
      setMode: async () => undefined,
      onMode: () => () => undefined,
    },
    saveFile: async () => '',
    beforeClose: () => undefined,
    quit: () => undefined,
  };
  return { bridge, files, listed, settings: () => settings };
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('preferences', () => {
  it('in the desktop app, live together in one settings file, each as itself', async () => {
    const fake = fakeBridge();
    vi.stubGlobal('window', { native: fake.bridge });
    const { readPref, writePref } = await import('../src/ui/prefs');
    expect(readPref('tour')).toBeNull();
    writePref('tour', 'done');
    writePref('audio', JSON.stringify({ music: true, musicVolume: 0.5 }));
    expect(JSON.parse(fake.settings()!)).toEqual({ tour: 'done', audio: { music: true, musicVolume: 0.5 } });
    expect(readPref('tour')).toBe('done');
    expect(JSON.parse(readPref('audio')!)).toEqual({ music: true, musicVolume: 0.5 });
  });

  it('start afresh from a damaged settings file', async () => {
    const fake = fakeBridge('{ "tour": "do');
    vi.stubGlobal('window', { native: fake.bridge });
    const { readPref, writePref } = await import('../src/ui/prefs');
    expect(readPref('tour')).toBeNull();
    writePref('tour', 'done');
    expect(JSON.parse(fake.settings()!)).toEqual({ tour: 'done' });
  });

  it('in a place with no storage, keep nothing and never throw', async () => {
    const { readPref, writePref } = await import('../src/ui/prefs');
    expect(() => writePref('tour', 'done')).not.toThrow();
    expect(readPref('tour')).toBeNull();
  });
});

describe('saves in the desktop app', () => {
  it('are gzipped files in the saves folder, listed without reading the game', async () => {
    const fake = fakeBridge();
    vi.stubGlobal('window', { native: fake.bridge });
    const storage = await import('../src/ui/storage');
    const first = await storage.saveGame('save:abc', { label: 'Before the storm', kind: 'manual' }, '{"day":1}');
    const second = await storage.saveGame('autosave:1', { label: 'Autosave', kind: 'auto' }, '{"day":2}');
    expect([...fake.files.get('save:abc')!.data.subarray(0, 2)]).toEqual([0x1f, 0x8b]);
    expect(await storage.loadGame('save:abc')).toBe('{"day":1}');
    expect(await storage.loadGame('save:none')).toBeNull();

    // Anything in the folder that is not a save's description is passed over; the newest comes first.
    fake.listed.push(null, { slot: 'odd' }, 'text');
    second.saved = '2999-01-01T00:00:00.000Z';
    expect(await storage.listSaves()).toEqual([second, first]);

    await storage.deleteSave('save:abc');
    expect(await storage.loadGame('save:abc')).toBeNull();
    expect((await storage.listSaves()).map((m) => m.slot)).toEqual(['autosave:1']);
  });

  it('read a save file the desktop app wrote, as well as an exported one', async () => {
    const fake = fakeBridge();
    vi.stubGlobal('window', { native: fake.bridge });
    const storage = await import('../src/ui/storage');
    await storage.saveGame('save:abc', { label: 'Kept' }, '{"day":7}');
    const gz = new File([fake.files.get('save:abc')!.data], 'save-abc.ccsave');
    expect(await storage.readSaveFile(gz)).toBe('{"day":7}');
    expect(await storage.readSaveFile(new File(['{"day":8}'], 'exported.json'))).toBe('{"day":8}');
  });
});
