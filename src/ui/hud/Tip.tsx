import type { ReactNode } from 'react';
import type { Breakdown } from '../../sim/economy';
import { MoreAbout } from '../encyclopedia/Term';

/** Hover or focus to show a small panel explaining a number. */
export function WithTip({
  tip,
  children,
  className = '',
}: {
  tip: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`has-tip ${className}`} tabIndex={0}>
      {children}
      <span className="panel tip" role="tooltip">
        {tip}
      </span>
    </span>
  );
}

export function fmtSigned(v: number, digits = 1): string {
  const s = Math.abs(v).toFixed(digits);
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : s;
}

/** A labelled breakdown: each source and the total. */
export function BreakdownList({
  title,
  b,
  digits = 1,
  unit = '',
  percent = false,
  more,
}: {
  title: string;
  b: Breakdown;
  digits?: number;
  unit?: string;
  percent?: boolean;
  /** an encyclopedia entry that explains it */
  more?: string;
}) {
  const fmt = (v: number) => (percent ? `${fmtSigned(v * 100, 0)}%` : `${fmtSigned(v, digits)}${unit}`);
  return (
    <div className="breakdown">
      <div className="breakdown-title caps">{title}</div>
      <ul>
        {b.parts.map((p) => (
          <li key={p.label}>
            <span>{p.label}</span>
            <span className={`num ${p.value < 0 ? 'bad' : ''}`}>{fmt(p.value)}</span>
          </li>
        ))}
      </ul>
      <div className="breakdown-total">
        <span>Total</span>
        <span className="num">{percent ? `${Math.round(b.total * 100)}%` : `${b.total.toFixed(digits)}${unit}`}</span>
      </div>
      {more && <MoreAbout to={more} />}
    </div>
  );
}
