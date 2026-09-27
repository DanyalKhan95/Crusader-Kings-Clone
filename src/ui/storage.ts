/**
 * Saved games in the browser: gzipped into IndexedDB (falling back to localStorage), plus export to
 * and import from a file. What the save browser shows of each save is kept apart from the save
 * itself, so listing them reads no game. Everything is wrapped so a browser that refuses storage
 * just says so.
 */
const DB = 'crowns-and-centuries';
const DB_VERSION = 2;
/** The gzipped saves, by slot. */
const STORE = 'saves';
/** What the save browser shows of each save, by slot (from version 2). */
const META = 'meta';

export type SaveKind = 'manual' | 'auto' | 'ironman';

export interface SaveMeta {
  slot: string;
  /** the name the player gave it, or the realm and date of an autosave */
  label: string;
  /** when it was saved, as an ISO date */
  saved: string;
  kind?: SaveKind;
  /** the campaign it belongs to */
  campaign?: string;
  /** the player's realm, and its emblem as SVG */
  realm?: string;
  emblem?: string;
  /** the day in the game, and the seconds of play so far */
  day?: number;
  played?: number;
}

async function gzip(text: string): Promise<ArrayBuffer> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

async function gunzip(data: ArrayBuffer): Promise<string> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

let opened: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  opened ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(META)) {
        const metas = db.createObjectStore(META);
        // Saves from before version 2 kept their meta inside: copy it out.
        if (e.oldVersion >= 1)
          req.transaction!.objectStore(STORE).openCursor().onsuccess = (ev) => {
            const cursor = (ev.target as IDBRequest<IDBCursorWithValue | null>).result;
            if (!cursor) return;
            const meta = (cursor.value as Partial<Stored>).meta;
            if (meta) metas.put(meta, cursor.key);
            cursor.continue();
          };
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Storage is not available'));
  }).catch((e: unknown) => {
    opened = null;
    throw e;
  });
  return opened;
}

/** Runs requests over both stores in one transaction, resolving when it has committed. */
async function inTransaction<T>(
  mode: IDBTransactionMode,
  fn: (saves: IDBObjectStore, metas: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await openDb();
  return new Promise<T | undefined>((resolve, reject) => {
    const t = db.transaction([STORE, META], mode);
    const req = fn(t.objectStore(STORE), t.objectStore(META));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error ?? new Error('Storage failed'));
    t.onabort = () => reject(t.error ?? new Error('Storage failed'));
  });
}

interface Stored {
  meta: SaveMeta;
  data: ArrayBuffer;
}

/** Saves a game in a slot, replacing what was there, and returns what the save browser will show. */
export async function saveGame(slot: string, info: Omit<SaveMeta, 'slot' | 'saved'>, json: string): Promise<SaveMeta> {
  const meta: SaveMeta = { ...info, slot, saved: new Date().toISOString() };
  const data = await gzip(json);
  try {
    await inTransaction('readwrite', (saves, metas) => {
      saves.put({ meta, data } satisfies Stored, slot);
      metas.put(meta, slot);
    });
  } catch {
    // localStorage fallback: base64 of the gzipped bytes
    const bytes = new Uint8Array(data);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    localStorage.setItem(`${DB}:${slot}`, JSON.stringify({ meta, data: btoa(bin) }));
  }
  return meta;
}

export async function loadGame(slot: string): Promise<string | null> {
  try {
    const stored = await inTransaction<Stored | undefined>('readonly', (saves) => saves.get(slot));
    if (stored) return gunzip(stored.data);
  } catch {
    /* fall through to localStorage */
  }
  try {
    const raw = localStorage.getItem(`${DB}:${slot}`);
    if (!raw) return null;
    const { data } = JSON.parse(raw) as { data: string };
    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return gunzip(bytes.buffer);
  } catch {
    return null;
  }
}

export async function deleteSave(slot: string): Promise<void> {
  try {
    await inTransaction('readwrite', (saves, metas) => {
      saves.delete(slot);
      metas.delete(slot);
    });
  } catch {
    /* nothing kept there */
  }
  try {
    localStorage.removeItem(`${DB}:${slot}`);
  } catch {
    /* nothing kept there */
  }
}

/** The meta of a save kept in localStorage, or null for anything else stored under the game's name. */
function savedMeta(raw: string | null): SaveMeta | null {
  try {
    const meta = (JSON.parse(raw ?? '') as { meta?: Partial<SaveMeta> } | null)?.meta;
    return meta && typeof meta.slot === 'string' && typeof meta.label === 'string' && typeof meta.saved === 'string'
      ? (meta as SaveMeta)
      : null;
  } catch {
    return null;
  }
}

/** Every save, newest first. */
export async function listSaves(): Promise<SaveMeta[]> {
  const out: SaveMeta[] = [];
  try {
    const all = await inTransaction<SaveMeta[]>('readonly', (_, metas) => metas.getAll());
    for (const m of all ?? []) out.push(m);
  } catch {
    /* ignore */
  }
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(`${DB}:`)) continue;
      // The settings, the sound and the tour share the prefix: only entries with a save's meta count.
      const meta = savedMeta(localStorage.getItem(key));
      if (meta && !out.some((m) => m.slot === meta.slot)) out.push(meta);
    }
  } catch {
    /* ignore */
  }
  return out.sort((a, b) => b.saved.localeCompare(a.saved));
}

/** Offers the save as a file download. Some embedded viewers block downloads; returns false then. */
export function exportSave(json: string, filename: string): boolean {
  try {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch {
    return false;
  }
}

export async function readSaveFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf, 0, 2);
  return head[0] === 0x1f && head[1] === 0x8b ? gunzip(buf) : new TextDecoder().decode(buf);
}
