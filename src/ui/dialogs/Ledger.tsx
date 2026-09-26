import { useMemo, useState } from 'react';
import { ERAS } from '../../data/eras';
import { toDate } from '../../sim/calendar';
import { realmDev } from '../../sim/diplomacy';
import { realmProvinces, strengthOf } from '../../sim/queries';
import { ranking, standing } from '../../sim/score';
import { eraOf } from '../../sim/tech';
import type { ChronicleEntry, Country } from '../../sim/types';
import { formatMen } from '../../render/units';
import { flyToProvince, selectCountry } from '../actions';
import { CoatOfArms } from '../CoatOfArms';
import { useGame, type Game } from '../game';
import { Icon } from '../Icon';
import { useStore } from '../store';
import { BreakdownList, WithTip } from '../hud/Tip';
import { Modal } from './Modal';

type Tab = 'nations' | 'centuries' | 'chronicle';
const TABS: { id: Tab; label: string }[] = [
  { id: 'nations', label: 'Nations' },
  { id: 'centuries', label: 'The centuries' },
  { id: 'chronicle', label: 'Chronicle' },
];

/** The world ledger: the nations ranked, the great realms through the centuries, and the chronicle. */
export function Ledger() {
  const game = useGame();
  const [tab, setTab] = useState<Tab>('nations');
  useStore(game.ui, (s) => s.tick);
  const year = toDate(game.state.day).y;
  return (
    <Modal title="The ledger of nations" kicker={`The world in ${year}`} wide className="ledger">
      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === 'nations' && <Nations />}
      {tab === 'centuries' && <Centuries />}
      {tab === 'chronicle' && <Chronicle />}
    </Modal>
  );
}

// ── Nations ───────────────────────────────────────────────────────

type SortKey = 'score' | 'year' | 'provinces' | 'dev' | 'army';

interface Row {
  c: Country;
  rank: number;
  year: number;
  provinces: number;
  dev: number;
  army: number;
  era: number;
}

function openRealm(game: Game, index: number) {
  game.ui.set({ modal: 'none' });
  selectCountry(game, index, true);
}

function Nations() {
  const game = useGame();
  const state = game.state;
  const [sort, setSort] = useState<SortKey>('score');
  const [all, setAll] = useState(false);
  const rows = useMemo<Row[]>(
    () =>
      ranking(state).map((c, i) => ({
        c,
        rank: i + 1,
        year: standing(state, c).total,
        provinces: realmProvinces(state, c.index).length,
        dev: realmDev(state, c.index),
        army: strengthOf(state, c.index),
        era: eraOf(c),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, state.day],
  );
  const value = (r: Row): number =>
    sort === 'score'
      ? -r.rank
      : sort === 'year'
        ? r.year
        : sort === 'provinces'
          ? r.provinces
          : sort === 'dev'
            ? r.dev
            : r.army;
  const sorted = [...rows].sort((a, b) => value(b) - value(a));
  const mine = rows.find((r) => r.c.index === state.player);
  const shown = all ? sorted : sorted.slice(0, 30);
  if (mine && !shown.includes(mine)) shown.push(mine);
  const head = (key: SortKey, label: string, title: string) => (
    <th scope="col" aria-sort={sort === key ? 'descending' : 'none'}>
      <button className={`sort ${sort === key ? 'on' : ''}`} onClick={() => setSort(key)} title={title}>
        {label}
      </button>
    </th>
  );
  return (
    <>
      <p className="dim small ledger-note">
        Each New Year every independent realm scores for its standing in the world: its share of the world’s people, its
        learning, its armies, its holy places and its good order. When the age ends on 1 January 2066, the highest score
        ranks first.
      </p>
      <div className="ledger-table-wrap">
        <table className="ledger-table">
          <thead>
            <tr>
              <th scope="col" className="num">
                #
              </th>
              <th scope="col">Realm</th>
              {head('score', 'Score', 'Points gathered over the years')}
              {head('year', 'This year', 'What the realm scores at the next New Year')}
              {head('provinces', 'Provinces', 'Provinces of the realm, vassals included')}
              {head('dev', 'Development', 'Development of the realm, vassals included')}
              {head('army', 'Men', 'Levies, men-at-arms and armies of the realm')}
              <th scope="col">Era</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.c.index} className={r.c.index === state.player ? 'mine' : ''}>
                <td className="num dim">{r.rank}</td>
                <td>
                  <button className="ledger-realm" onClick={() => openRealm(game, r.c.index)}>
                    <CoatOfArms country={r.c} size={20} />
                    <span>{r.c.name}</span>
                  </button>
                </td>
                <td className="num">{Math.round(r.c.score).toLocaleString('en-US')}</td>
                <td className="num">
                  <WithTip tip={<BreakdownList title="At the next New Year" b={standing(state, r.c)} />}>
                    +{Math.round(r.year)}
                  </WithTip>
                </td>
                <td className="num">{r.provinces}</td>
                <td className="num">{r.dev.toLocaleString('en-US')}</td>
                <td className="num">{formatMen(r.army)}</td>
                <td className="dim">{ERAS[r.era].name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 30 && (
        <button className="btn small" onClick={() => setAll(!all)}>
          {all ? 'Show the first thirty' : `Show all ${rows.length} realms`}
        </button>
      )}
    </>
  );
}

// ── The centuries ─────────────────────────────────────────────────

const W = 720,
  H = 320,
  PAD = { left: 52, right: 16, top: 12, bottom: 28 };

function niceMax(v: number): number {
  const p = 10 ** Math.floor(Math.log10(Math.max(1, v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}

function Centuries() {
  const game = useGame();
  const state = game.state;
  const [metric, setMetric] = useState<'dev' | 'score'>('dev');
  const [hover, setHover] = useState(0);
  const ledger = state.ledger;
  if (ledger.length < 2)
    return <p className="dim">The ledger fills in every ten years. Come back when a decade has passed.</p>;
  const last = ledger[ledger.length - 1];
  // The great realms of the latest entry, and the player's.
  const realms = last.rows.map((r) => r[0]);
  if (state.player && !realms.includes(state.player)) realms.push(state.player);
  const col = metric === 'dev' ? 1 : 2;
  const y0 = ledger[0].year,
    y1 = last.year;
  let max = 1;
  for (const snap of ledger) for (const r of snap.rows) if (realms.includes(r[0])) max = Math.max(max, r[col]);
  const top = niceMax(max);
  const x = (y: number) => PAD.left + ((y - y0) / Math.max(1, y1 - y0)) * (W - PAD.left - PAD.right);
  const y = (v: number) => H - PAD.bottom - (v / top) * (H - PAD.top - PAD.bottom);
  const series = realms.map((index) => {
    const pts: [number, number][] = [];
    for (const snap of ledger) {
      const r = snap.rows.find((row) => row[0] === index);
      if (r) pts.push([snap.year, r[col]]);
    }
    return { index, pts };
  });
  const firstCentury = Math.ceil(y0 / 100) * 100;
  const centuries: number[] = [];
  for (let c = firstCentury; c <= y1; c += 100) centuries.push(c);
  return (
    <div className="centuries">
      <div className="centuries-head">
        <div className="segmented" role="radiogroup" aria-label="Show">
          <button role="radio" aria-checked={metric === 'dev'} onClick={() => setMetric('dev')}>
            Development
          </button>
          <button role="radio" aria-checked={metric === 'score'} onClick={() => setMetric('score')}>
            Score
          </button>
        </div>
        <span className="dim small">The great realms of {y1}, as the ledger saw them every ten years.</span>
      </div>
      <div className="chart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`${metric} of the great realms`}>
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(top * f)} y2={y(top * f)} className="grid" />
              <text x={PAD.left - 6} y={y(top * f) + 4} className="axis" textAnchor="end">
                {Math.round(top * f).toLocaleString('en-US')}
              </text>
            </g>
          ))}
          {centuries.map((c) => (
            <text key={c} x={x(c)} y={H - 8} className="axis" textAnchor="middle">
              {c}
            </text>
          ))}
          {series.map(({ index, pts }) => {
            if (pts.length < 1) return null;
            const c = state.countries[index];
            const d = pts.map(([yr, v], i) => `${i ? 'L' : 'M'}${x(yr).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
            const dim = hover && hover !== index;
            return (
              <path
                key={index}
                d={d}
                className={`series ${index === state.player ? 'mine' : ''}`}
                stroke={c?.colorHex ?? '#888'}
                opacity={dim ? 0.18 : 1}
              />
            );
          })}
        </svg>
      </div>
      <ul className="chart-legend">
        {series.map(({ index, pts }) => {
          const c = state.countries[index];
          if (!c || !pts.length) return null;
          return (
            <li key={index}>
              <button
                className={`legend-item ${index === state.player ? 'mine' : ''}`}
                onMouseEnter={() => setHover(index)}
                onMouseLeave={() => setHover(0)}
                onFocus={() => setHover(index)}
                onBlur={() => setHover(0)}
                onClick={() => openRealm(game, index)}
              >
                <span className="legend-swatch" style={{ background: c.colorHex }} />
                <CoatOfArms country={c} size={16} />
                <span>{c.name}</span>
                {!c.alive && <span className="dim small">fallen</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── The chronicle ─────────────────────────────────────────────────

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function centuryName(year: number): string {
  const n = Math.floor(year / 100) + 1;
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `The ${n}${s} century`;
}

function Chronicle() {
  const game = useGame();
  const entries = game.state.chronicle;
  if (!entries.length) return <p className="dim">Nothing of note has happened yet.</p>;
  const groups: { century: string; items: ChronicleEntry[] }[] = [];
  for (const e of entries) {
    const name = centuryName(toDate(e.day).y);
    if (groups.at(-1)?.century !== name) groups.push({ century: name, items: [] });
    groups.at(-1)!.items.push(e);
  }
  const look = (e: ChronicleEntry) => {
    if (!e.province) return;
    game.ui.set({ modal: 'none' });
    flyToProvince(game, e.province, 0.6);
  };
  return (
    <div className="chronicle">
      {groups.map((g) => (
        <section key={g.century}>
          <h3 className="section-title">{g.century}</h3>
          <ol className="chronicle-list">
            {g.items.map((e, i) => {
              const d = toDate(e.day);
              return (
                <li key={`${e.day}-${i}`}>
                  <span className="num chronicle-date">
                    {d.d} {SHORT_MONTHS[d.m - 1]} {d.y}
                  </span>
                  {e.province ? (
                    <button className="chronicle-text link-like" onClick={() => look(e)}>
                      {e.text} <Icon name="flag-objective" />
                    </button>
                  ) : (
                    <span className="chronicle-text">{e.text}</span>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
