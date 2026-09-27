/**
 * The game's content read from JSON in src/content: each file is checked against its schema as it
 * loads, and a file that does not fit stops the game with every problem listed. Systems move their
 * content here as they are reworked, so that mods can later add to it and change it through
 * `extendContent`, before a campaign starts.
 */
import { parse, problems, type Schema } from '../shared/schema';

interface Registered {
  schema: Schema<Record<string, unknown>>;
  data: Record<string, unknown>;
}

const registry = new Map<string, Registered>();

/** Checks a content file (an object keyed by id) and registers it under a name. */
export function defineContent<T>(name: string, schema: Schema<Record<string, T>>, raw: unknown): Record<string, T> {
  const data = parse(schema, raw, name);
  registry.set(name, { schema: schema as Schema<Record<string, unknown>>, data });
  return data;
}

/**
 * Adds entries to a content file or replaces some, as a mod will. The entries are checked first; on
 * any problem nothing changes and the problems are returned. The file's object keeps its identity, so
 * code that holds it sees the change.
 */
export function extendContent(name: string, raw: unknown): string[] {
  const entry = registry.get(name);
  if (!entry) return [`There is no content called "${name}".`];
  const found = problems(entry.schema, raw, name);
  if (!found.length) Object.assign(entry.data, raw);
  return found;
}

/** The names of the content files, for tools and tests. */
export function contentNames(): string[] {
  return [...registry.keys()];
}
