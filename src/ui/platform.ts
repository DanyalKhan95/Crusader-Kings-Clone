/**
 * Where the game runs: in a browser, or in the desktop app, whose bridge (electron/preload.cjs) keeps
 * saves and settings as files in the player's documents folder and minds the window. Everything that
 * differs between the two asks `native`, which is null in a browser.
 */

export type WindowMode = 'windowed' | 'fullscreen';

export interface NativeBridge {
  /** the system, as Node names it: 'win32', 'darwin', 'linux' */
  platform: string;
  saves: {
    /** what the save browser shows of every save, in no order */
    list(): Promise<unknown[]>;
    /** the gzipped save, or null if it is gone */
    read(slot: string): Promise<Uint8Array<ArrayBuffer> | null>;
    write(slot: string, meta: object, data: ArrayBuffer): Promise<void>;
    remove(slot: string): Promise<void>;
    openFolder(): Promise<string>;
  };
  settings: {
    /** the settings file's text, or null before the first is written */
    read(): string | null;
    write(text: string): void;
  };
  window: {
    getMode(): Promise<WindowMode>;
    setMode(mode: WindowMode): Promise<void>;
    /** follows changes of mode, by the settings or by F11; returns a way to stop */
    onMode(fn: (mode: WindowMode) => void): () => void;
  };
  /** saves a file where the player chooses: its path, or '' if they cancelled */
  saveFile(name: string, text: string): Promise<string>;
  /** what to do before the window closes; the window waits for it a few seconds at most */
  beforeClose(fn: () => Promise<unknown> | void): void;
  quit(): void;
}

export const native: NativeBridge | null =
  typeof window === 'undefined' ? null : ((window as { native?: NativeBridge }).native ?? null);

/** What became of a file offered to the player. */
export type Offered = { saved: true; path?: string } | { saved: false; blocked: boolean };

/**
 * Offers text as a file: the desktop app asks where to put it, a browser downloads it. Some embedded
 * viewers block downloads, and say nothing: that counts as blocked.
 */
export async function offerFile(text: string, filename: string, type = 'application/json'): Promise<Offered> {
  if (native) {
    const path = await native.saveFile(filename, text);
    return path ? { saved: true, path } : { saved: false, blocked: false };
  }
  try {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return { saved: true };
  } catch {
    return { saved: false, blocked: true };
  }
}
