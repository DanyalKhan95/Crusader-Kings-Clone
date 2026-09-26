/**
 * Saved games in the browser: gzipped into IndexedDB (falling back to localStorage), plus export to
 * and import from a file. Everything is wrapped so a browser that refuses storage just says so.
 */
const DB = 'crowns-and-centuries';
const STORE = 'saves';

export interface SaveMeta {
  slot: string;
  label: string;
  saved: string;
}

async function gzip(text: string): Promise<ArrayBuffer> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

async function gunzip(data: ArrayBuffer): Promise<string> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Storage is not available'));
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('Storage failed'));
      }),
  );
}

interface Stored {
  meta: SaveMeta;
  data: ArrayBuffer;
}

export async function saveGame(slot: string, label: string, json: string): Promise<void> {
  const meta: SaveMeta = { slot, label, saved: new Date().toISOString() };
  const data = await gzip(json);
  try {
    await tx('readwrite', (s) => s.put({ meta, data } satisfies Stored, slot));
  } catch {
    // localStorage fallback: base64 of the gzipped bytes
    const bytes = new Uint8Array(data);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    localStorage.setItem(`${DB}:${slot}`, JSON.stringify({ meta, data: btoa(bin) }));
  }
}

export async function loadGame(slot: string): Promise<string | null> {
  try {
    const stored = await tx<Stored | undefined>('readonly', (s) => s.get(slot));
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

export async function listSaves(): Promise<SaveMeta[]> {
  const out: SaveMeta[] = [];
  try {
    const all = await tx<Stored[]>('readonly', (s) => s.getAll());
    for (const s of all) out.push(s.meta);
  } catch {
    /* ignore */
  }
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(`${DB}:`)) continue;
      const { meta } = JSON.parse(localStorage.getItem(key)!) as { meta: SaveMeta };
      if (!out.some((m) => m.slot === meta.slot)) out.push(meta);
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
