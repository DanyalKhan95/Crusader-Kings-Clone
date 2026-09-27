/**
 * A small checker for content read from JSON (src/content, and mods later): each schema says what a
 * value must be, and checking lists every problem with where it lies ("modifiers.famine.years: must
 * be a number"). Objects are strict, so a misspelt key is caught rather than ignored.
 */
export interface Schema<T> {
  /** Adds a line to `out` for each problem found at `path`. */
  check(value: unknown, path: string, out: string[]): void;
  /** never set: carries the type */
  readonly _type?: T;
}

const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export const str = (opts: { nonEmpty?: boolean } = {}): Schema<string> => ({
  check(v, path, out) {
    if (typeof v !== 'string') out.push(`${path}: must be text`);
    else if (opts.nonEmpty && !v.trim()) out.push(`${path}: must not be empty`);
  },
});

export const num = (opts: { min?: number; max?: number; int?: boolean } = {}): Schema<number> => ({
  check(v, path, out) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return void out.push(`${path}: must be a number`);
    if (opts.int && !Number.isInteger(v)) out.push(`${path}: must be a whole number`);
    if (opts.min !== undefined && v < opts.min) out.push(`${path}: must be at least ${opts.min}`);
    if (opts.max !== undefined && v > opts.max) out.push(`${path}: must be at most ${opts.max}`);
  },
});

export const bool: Schema<boolean> = {
  check(v, path, out) {
    if (typeof v !== 'boolean') out.push(`${path}: must be true or false`);
  },
};

export const oneOf = <T extends string>(values: readonly T[], what = 'one of the known values'): Schema<T> => ({
  check(v, path, out) {
    if (!values.includes(v as T)) out.push(`${path}: "${String(v)}" is not ${what}`);
  },
});

/** A key the object may leave out. */
export interface Optional<T> extends Schema<T | undefined> {
  readonly optional: true;
}

export const opt = <T>(s: Schema<T>): Optional<T> => ({
  optional: true,
  check(v, path, out) {
    if (v !== undefined) s.check(v, path, out);
  },
});

export const arr = <T>(item: Schema<T>, opts: { min?: number } = {}): Schema<T[]> => ({
  check(v, path, out) {
    if (!Array.isArray(v)) return void out.push(`${path}: must be a list`);
    if (opts.min !== undefined && v.length < opts.min) out.push(`${path}: must have at least ${opts.min}`);
    v.forEach((x, i) => item.check(x, `${path}[${i}]`, out));
  },
});

/** An object keyed by ids (or by `keys`, when given). */
export const rec = <T>(value: Schema<T>, keys?: Schema<string>): Schema<Record<string, T>> => ({
  check(v, path, out) {
    if (!plain(v)) return void out.push(`${path}: must be an object`);
    for (const [k, x] of Object.entries(v)) {
      keys?.check(k, `${path}.${k}`, out);
      value.check(x, `${path}.${k}`, out);
    }
  },
});

type Shape = Record<string, Schema<unknown>>;
type Required<S extends Shape> = { [K in keyof S as S[K] extends Optional<unknown> ? never : K]: Infer<S[K]> };
type Optionals<S extends Shape> = { [K in keyof S as S[K] extends Optional<unknown> ? K : never]?: Infer<S[K]> };
export type Infer<S> = S extends Schema<infer T> ? T : never;

/** An object with exactly these keys (optional ones may be left out). */
export const obj = <S extends Shape>(shape: S): Schema<Required<S> & Optionals<S>> => ({
  check(v, path, out) {
    if (!plain(v)) return void out.push(`${path}: must be an object`);
    for (const k of Object.keys(v)) if (!(k in shape)) out.push(`${path}.${k}: is not a known key`);
    for (const [k, s] of Object.entries(shape)) {
      if (v[k] === undefined && !('optional' in s)) out.push(`${path}.${k}: is missing`);
      else s.check(v[k], `${path}.${k}`, out);
    }
  },
});

/** Every problem with a value, one line each; empty when it fits. */
export function problems<T>(schema: Schema<T>, value: unknown, name: string): string[] {
  const out: string[] = [];
  schema.check(value, name, out);
  return out;
}

/** The value as the schema's type, or an error listing every problem. */
export function parse<T>(schema: Schema<T>, value: unknown, name: string): T {
  const found = problems(schema, value, name);
  if (found.length) throw new Error(`${name} does not fit its schema:\n${found.join('\n')}`);
  return value as T;
}
