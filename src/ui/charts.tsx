/**
 * Charts of a realm over time: a line for each series against one axis, a hairline grid, the latest
 * value at each line's end, a legend when there are two or more series, and a readout of every
 * series under the pointer. The same figures are there as a table.
 *
 * Colours come from the chart palette (`--chart-*` in the themes), checked for colour-blind readers
 * against every era's panels; the text keeps to the text colours.
 */
import { useState, type PointerEvent } from 'react';

export interface ChartSeries {
  id: string;
  name: string;
  /** one of the chart palette's colours */
  color: string;
  values: number[];
  /** a pale wash under the line, for a single series such as the treasury */
  area?: boolean;
}

const W = 640,
  H = 200,
  PAD = { left: 52, right: 58, top: 12, bottom: 26 };

/** Round steps for an axis: 1, 2, 2.5 or 5 of a power of ten. */
export function niceStep(span: number, count = 4): number {
  const raw = Math.max(span, 1e-9) / count;
  const p = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * p) return m * p;
  return 10 * p;
}

/** Axis ticks that cover the values, zero included. */
export function niceTicks(lo: number, hi: number, count = 4): number[] {
  const step = niceStep(Math.max(hi, 0) - Math.min(lo, 0), count);
  const from = Math.floor(Math.min(lo, 0) / step) * step;
  const to = Math.ceil(Math.max(hi, 0) / step) * step;
  const out: number[] = [];
  for (let v = from; v <= to + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out.length > 1 ? out : [from, from + step];
}

export function LineChart({
  title,
  xs,
  xLabel,
  series,
  format,
  empty = 'Not enough months have passed to draw this yet.',
}: {
  /** what is plotted, for the page and for screen readers */
  title: string;
  /** one x per value: days of the calendar */
  xs: number[];
  /** how an x is written on the axis and in the readout */
  xLabel: (x: number, long?: boolean) => string;
  series: ChartSeries[];
  format: (v: number) => string;
  empty?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const n = xs.length;
  if (n < 2) return <p className="dim small">{empty}</p>;
  let lo = Infinity,
    hi = -Infinity;
  for (const s of series)
    for (const v of s.values) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  const ticks = niceTicks(lo, hi);
  const y0 = ticks[0],
    y1 = ticks[ticks.length - 1];
  const x = (i: number) => PAD.left + (i / (n - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => H - PAD.bottom - ((v - y0) / (y1 - y0 || 1)) * (H - PAD.top - PAD.bottom);
  const line = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  // About five labels along the bottom, at the turn of a year where one falls.
  const every = Math.max(1, Math.round(n / 5));
  const xTicks: number[] = [];
  for (let i = 0; i < n; i += every) xTicks.push(i);
  // End labels only where they stand clear of each other; the legend and readout carry the rest.
  const ends = series.map((s) => y(s.values[n - 1]));
  const clash = ends.some((a, i) => ends.some((b, j) => i < j && Math.abs(a - b) < 13));
  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const f = (e.clientX - r.left) / r.width;
    setHover(Math.max(0, Math.min(n - 1, Math.round(f * (n - 1)))));
  };
  const hx = hover === null ? 0 : x(hover);
  return (
    <figure className="lchart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="lchart-grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
            <text className="lchart-axis" x={PAD.left - 6} y={y(t) + 4} textAnchor="end">
              {format(t)}
            </text>
          </g>
        ))}
        {xTicks.map((i) => (
          <text key={i} className="lchart-axis" x={x(i)} y={H - 8} textAnchor={i ? 'middle' : 'start'}>
            {xLabel(xs[i])}
          </text>
        ))}
        {series.map((s) =>
          s.area ? (
            <path
              key={`${s.id}-area`}
              d={`${line(s.values)}L${x(n - 1).toFixed(1)} ${y(Math.max(y0, 0))}L${x(0).toFixed(1)} ${y(Math.max(y0, 0))}Z`}
              fill={s.color}
              opacity={0.1}
            />
          ) : null,
        )}
        {series.map((s) => (
          <path key={s.id} className="lchart-line" d={line(s.values)} stroke={s.color} />
        ))}
        {series.map((s) => (
          <g key={`${s.id}-end`}>
            <circle className="lchart-dot" cx={x(n - 1)} cy={y(s.values[n - 1])} r={4} fill={s.color} />
            {!clash && (
              <text className="lchart-end" x={x(n - 1) + 8} y={y(s.values[n - 1]) + 4}>
                {format(s.values[n - 1])}
              </text>
            )}
          </g>
        ))}
        {hover !== null && (
          <g className="lchart-cross">
            <line x1={hx} x2={hx} y1={PAD.top} y2={H - PAD.bottom} />
            {series.map((s) => (
              <circle key={s.id} className="lchart-dot" cx={hx} cy={y(s.values[hover])} r={4} fill={s.color} />
            ))}
          </g>
        )}
        <rect
          className="lchart-hit"
          x={PAD.left}
          y={PAD.top}
          width={W - PAD.left - PAD.right}
          height={H - PAD.top - PAD.bottom}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {hover !== null && (
        <div
          className="panel lchart-tip"
          style={{ left: `${(hx / W) * 100}%`, transform: `translateX(${hx / W > 0.6 ? '-105%' : '5%'})` }}
        >
          <div className="caps lchart-tip-date">{xLabel(xs[hover], true)}</div>
          {series.map((s) => (
            <div key={s.id} className="lchart-tip-row">
              <span className="lchart-key" style={{ background: s.color }} aria-hidden="true" />
              <span>{s.name}</span>
              <span className="num">{format(s.values[hover])}</span>
            </div>
          ))}
        </div>
      )}
      {series.length > 1 && (
        <ul className="lchart-legend" aria-label="Legend">
          {series.map((s) => (
            <li key={s.id}>
              <span className="lchart-key" style={{ background: s.color }} aria-hidden="true" />
              {s.name}
            </li>
          ))}
        </ul>
      )}
      <details className="lchart-table">
        <summary className="small">The figures</summary>
        <div className="lchart-table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Month</th>
                {series.map((s) => (
                  <th key={s.id} scope="col" className="num">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {xs
                .map((d, i) => ({ d, i }))
                .reverse()
                .map(({ d, i }) => (
                  <tr key={d}>
                    <th scope="row">{xLabel(d, true)}</th>
                    {series.map((s) => (
                      <td key={s.id} className="num">
                        {format(s.values[i])}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
