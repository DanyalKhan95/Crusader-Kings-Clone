/**
 * The performance overlay (a setting, F3): frames a second and their cost, the days the simulation
 * runs and theirs, and the systems that take the most. The simulation is timed only while it shows.
 */
import { useEffect, useState } from 'react';
import { ProfileTotals, setProfileSink, type SystemCost } from '../../sim/profile';
import { buildId } from '../errors';
import { useGame } from '../game';
import { withKey } from '../keys';

interface Sample {
  fps: number;
  frameMs: number;
  worstMs: number;
  daysPerSecond: number;
  msPerDay: number;
  systems: SystemCost[];
  heapMb: number | null;
}

const EVERY_MS = 500;

export function PerfOverlay() {
  const game = useGame();
  const [sample, setSample] = useState<Sample | null>(null);
  useEffect(() => {
    const totals = new ProfileTotals();
    setProfileSink(totals);
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const seconds = (now - last) / 1000;
      last = now;
      const f = game.map?.stats;
      const r = game.runner?.stats;
      const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      setSample({
        fps: f ? f.frames / seconds : 0,
        frameMs: f && f.frames ? f.busyMs / f.frames : 0,
        worstMs: f ? f.worstMs : 0,
        daysPerSecond: r ? r.days / seconds : 0,
        msPerDay: r && r.days ? r.simMs / r.days : 0,
        systems: totals
          .ranked()
          .slice(0, 5)
          .map((c) => ({ ...c, ms: r && r.days ? c.ms / r.days : 0 })),
        heapMb: memory ? memory.usedJSHeapSize / 1048576 : null,
      });
      if (f) {
        f.frames = 0;
        f.busyMs = 0;
        f.worstMs = 0;
      }
      if (r) {
        r.days = 0;
        r.simMs = 0;
      }
      totals.reset();
    }, EVERY_MS);
    return () => {
      window.clearInterval(timer);
      setProfileSink(null);
    };
  }, [game]);
  return (
    <aside className="panel perf" aria-label="Performance" title={withKey('Performance overlay', 'perfOverlay')}>
      {sample ? (
        <>
          <div>
            <b className="num">{Math.round(sample.fps)}</b> fps ·{' '}
            <span className="num">{sample.frameMs.toFixed(1)}</span> ms of work a frame, worst{' '}
            <span className="num">{sample.worstMs.toFixed(1)}</span>
          </div>
          <div>
            <b className="num">{Math.round(sample.daysPerSecond)}</b> days/s ·{' '}
            <span className="num">{sample.msPerDay.toFixed(2)}</span> ms a day
          </div>
          {sample.systems.length > 0 && (
            <ol className="perf-systems">
              {sample.systems.map((s) => (
                <li key={s.system}>
                  <span>{s.system}</span>
                  <span className="num">{s.ms.toFixed(2)}</span>
                </li>
              ))}
            </ol>
          )}
          <div className="dim">
            {sample.heapMb !== null && <>{Math.round(sample.heapMb)} MB · </>}build {buildId()}
          </div>
        </>
      ) : (
        <div className="dim">Measuring…</div>
      )}
    </aside>
  );
}
