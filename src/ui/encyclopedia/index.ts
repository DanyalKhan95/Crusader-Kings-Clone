/** Every entry of the encyclopedia, found by id. */
import { dataEntries } from './data';
import type { Entry } from './model';
import { RULE_ENTRIES } from './rules';

let cache: { entries: Entry[]; byId: Map<string, Entry> } | null = null;

/** The whole encyclopedia, built on first use (the faiths need the world to be loaded). */
export function encyclopedia(): { entries: Entry[]; byId: Map<string, Entry> } {
  if (!cache) {
    const entries = [...RULE_ENTRIES, ...dataEntries()];
    cache = { entries, byId: new Map(entries.map((e) => [e.id, e])) };
  }
  return cache;
}

export function entryById(id: string): Entry | undefined {
  return encyclopedia().byId.get(id);
}
