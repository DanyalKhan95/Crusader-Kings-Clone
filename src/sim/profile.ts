/**
 * Where the simulation spends its time. `advanceDay` marks each system as it finishes. Timing is off
 * unless a tool or the performance overlay installs a sink: only then is the clock read, and nothing
 * measured ever reaches the game state, so the simulation stays deterministic.
 */
export interface ProfileSink {
  /** milliseconds a system took since the last mark */
  add(system: string, ms: number): void;
}

let sink: ProfileSink | null = null;
let last = 0;

export function setProfileSink(s: ProfileSink | null) {
  sink = s;
}

/** Starts the clock for a day. */
export function profileStart() {
  if (sink) last = performance.now();
}

/** Ends a system's share of the day. */
export function mark(system: string) {
  if (!sink) return;
  const now = performance.now();
  sink.add(system, now - last);
  last = now;
}

export interface SystemCost {
  system: string;
  /** milliseconds in all */
  ms: number;
  /** times it ran */
  calls: number;
  /** the longest single run, in milliseconds */
  max: number;
}

/** A sink that sums the time each system takes. */
export class ProfileTotals implements ProfileSink {
  private costs = new Map<string, SystemCost>();

  add(system: string, ms: number) {
    const c = this.costs.get(system);
    if (c) {
      c.ms += ms;
      c.calls++;
      if (ms > c.max) c.max = ms;
    } else this.costs.set(system, { system, ms, calls: 1, max: ms });
  }

  /** The systems, costliest first. */
  ranked(): SystemCost[] {
    return [...this.costs.values()].sort((a, b) => b.ms - a.ms);
  }

  total(): number {
    let t = 0;
    for (const c of this.costs.values()) t += c.ms;
    return t;
  }

  reset() {
    this.costs.clear();
  }
}
