/**
 * Small things kept between visits: the settings, the sound, and whether the tour was seen. A browser
 * keeps each in localStorage; the desktop app keeps them together in settings.json in the player's
 * documents folder, each written as itself rather than as quoted text. Neither ever throws: storage
 * that refuses keeps nothing, and the game goes on with what it has.
 */
import { native } from './platform';

const PREFIX = 'crowns-and-centuries:';

let file: Record<string, unknown> | null = null;

/** The desktop app's settings file, read once. */
function entries(): Record<string, unknown> {
  if (!file) {
    let v: unknown = null;
    try {
      v = JSON.parse(native?.settings.read() ?? '{}');
    } catch {
      // a damaged file starts afresh
    }
    file = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  }
  return file;
}

/** The text kept under a name, or null. */
export function readPref(key: string): string | null {
  if (native) {
    const v = entries()[key];
    return v === undefined ? null : typeof v === 'string' ? v : JSON.stringify(v);
  }
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

/** Keeps text under a name: JSON, or a plain word. */
export function writePref(key: string, text: string) {
  if (native) {
    const all = entries();
    try {
      all[key] = JSON.parse(text);
    } catch {
      all[key] = text;
    }
    native.settings.write(`${JSON.stringify(all, null, 2)}\n`);
    return;
  }
  try {
    localStorage.setItem(PREFIX + key, text);
  } catch {
    // kept for this visit only
  }
}
