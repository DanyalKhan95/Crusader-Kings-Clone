import type { LoadProgress } from '../game/world';
import { roman } from './format';

export function LoadingScreen({ progress, leaving = false }: { progress: LoadProgress; leaving?: boolean }) {
  const pct = Math.round(Math.min(1, Math.max(0, progress.fraction)) * 100);
  return (
    <div className={`loading ${leaving ? 'leaving' : ''}`} aria-busy={!leaving}>
      <div className="loading-inner">
        <div className="loading-rule" aria-hidden="true" />
        <h1 className="display loading-title">Crowns &amp; Centuries</h1>
        <p className="caps loading-sub">Anno Domini {roman(1066)}</p>
        <div
          className="loading-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="Loading"
        >
          <div className="loading-fill" style={{ width: `${pct}%` }} />
        </div>
        <p className="loading-stage">{progress.stage}…</p>
      </div>
    </div>
  );
}
