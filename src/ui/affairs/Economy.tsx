/**
 * The economy: the treasury and how it has gone month by month, what comes in and goes out, the
 * loans, and every province with its yield and buildings.
 */
import { useState } from 'react';
import { BUILDING_ORDER, BUILDINGS, MAX_LEVEL } from '../../data/buildings';
import { formatMen } from '../../render/units';
import { toDate } from '../../sim/calendar';
import * as cmd from '../../sim/commands';
import { devCap, expenses, income, loanSize, MAX_LOANS, provinceLevy, provinceTax } from '../../sim/economy';
import { provinceFactor } from '../../sim/faith';
import { provincesOf } from '../../sim/queries';
import type { Country } from '../../sim/types';
import { run } from '../actions';
import { LineChart } from '../charts';
import { shortDate } from '../format';
import { useGame } from '../game';
import { Icon } from '../Icon';
import { goToProvince } from '../hud/SidePanel';
import { BreakdownList, fmtSigned } from '../hud/Tip';

/** The chart palette (see charts.tsx): checked against every era's panels. */
export const CHART = { income: '#3987e5', expenses: '#d95926', gold: '#c98500', men: '#3987e5' };

const gold = (v: number) => Math.round(v).toLocaleString('en-US');
export const yearOf = (d: number, long?: boolean) => (long ? shortDate(toDate(d)) : String(toDate(d).y));

export function EconomyScreen({ c }: { c: Country }) {
  const game = useGame();
  const state = game.state;
  const inc = income(state, c);
  const exp = expenses(state, c, inc.total);
  const balance = inc.total - exp.total;
  const books = c.books ?? [];
  const days = books.map((b) => b[0]);
  const interest = c.loans.reduce((s, l) => s + l.interest, 0);
  return (
    <div className="affairs-grid">
      <section className="affairs-card wide">
        <ul className="stat-tiles">
          <li>
            <span className="caps">Treasury</span>
            <span className={`num tile-value ${c.gold < 0 ? 'bad' : ''}`}>{gold(c.gold)}</span>
          </li>
          <li>
            <span className="caps">A month</span>
            <span className={`num tile-value ${balance < 0 ? 'bad' : 'good'}`}>{fmtSigned(balance)}</span>
          </li>
          <li>
            <span className="caps">Income</span>
            <span className="num tile-value">{inc.total.toFixed(1)}</span>
          </li>
          <li>
            <span className="caps">Expenses</span>
            <span className="num tile-value">{exp.total.toFixed(1)}</span>
          </li>
          <li>
            <span className="caps">Loans</span>
            <span className="num tile-value">
              {c.loans.length}
              {interest > 0 && <span className="dim small"> · {interest.toFixed(1)} a month</span>}
            </span>
          </li>
        </ul>
      </section>
      <section className="affairs-card wide-half">
        <h3 className="section-title">Income and expenses a month</h3>
        <LineChart
          title="Income and expenses a month"
          xs={days}
          xLabel={yearOf}
          format={(v) => v.toFixed(Math.abs(v) >= 100 ? 0 : 1)}
          series={[
            { id: 'income', name: 'Income', color: CHART.income, values: books.map((b) => b[1]) },
            { id: 'expenses', name: 'Expenses', color: CHART.expenses, values: books.map((b) => b[2]) },
          ]}
        />
      </section>
      <section className="affairs-card wide-half">
        <h3 className="section-title">The treasury</h3>
        <LineChart
          title="Gold in the treasury"
          xs={days}
          xLabel={yearOf}
          format={gold}
          series={[{ id: 'gold', name: 'Gold', color: CHART.gold, values: books.map((b) => b[3]), area: true }]}
        />
      </section>
      <div className="affairs-flow">
        <BreakdownList title="Income a month" b={inc} more="rule:taxes" />
        <BreakdownList title="Expenses a month" b={exp} more="rule:expenses" />
        <section className="sp-section">
          <h3 className="section-title">Loans · {c.loans.length}</h3>
          {c.loans.length ? (
            <ul className="ranked">
              {c.loans.map((l, i) => (
                <li key={i} className="ranked-row static">
                  <span>
                    {l.amount} gold at {l.interest.toFixed(2)} a month
                  </span>
                  <button
                    className="btn small"
                    disabled={c.gold < l.amount}
                    onClick={() => run(game, cmd.repay(state, i))}
                  >
                    Repay
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dim small">The realm owes nothing.</p>
          )}
          <button className="btn" disabled={c.loans.length >= MAX_LOANS} onClick={() => run(game, cmd.borrow(state))}>
            <Icon name="bank" /> Borrow {loanSize(state, c)} gold
          </button>
          <p className="dim small">
            Lenders ask 12% a year. At most {MAX_LOANS} loans; when no one will lend, the realm goes bankrupt.
          </p>
        </section>
      </div>
      <Provinces c={c} />
    </div>
  );
}

type SortKey = 'name' | 'dev' | 'tax' | 'levy' | 'buildings';

/** Every province of the realm: development, taxes and levies after faith and people, and buildings. */
function Provinces({ c }: { c: Country }) {
  const game = useGame();
  const state = game.state;
  const [sort, setSort] = useState<SortKey>('dev');
  const rows = provincesOf(state, c.index).map((id) => {
    const p = state.provinces[id];
    const f = provinceFactor(c, p).value;
    return {
      id,
      name: game.world.region(id).name,
      p,
      dev: p.dev,
      cap: devCap(game.world, c, id),
      tax: provinceTax(p) * f,
      levy: provinceLevy(p) * f,
      buildings: BUILDING_ORDER.reduce((s, t) => s + (p.buildings[t] ?? 0), 0),
    };
  });
  const value = (r: (typeof rows)[number]) => (sort === 'name' ? 0 : r[sort]);
  rows.sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : value(b) - value(a)));
  const head = (key: SortKey, label: string, num = true) => (
    <th
      scope="col"
      className={num ? 'num' : ''}
      aria-sort={sort === key ? (key === 'name' ? 'ascending' : 'descending') : 'none'}
    >
      <button className={`sort ${sort === key ? 'on' : ''}`} onClick={() => setSort(key)}>
        {label}
      </button>
    </th>
  );
  return (
    <section className="affairs-card wide">
      <h3 className="section-title">Provinces · {rows.length}</h3>
      <div className="affairs-table-wrap">
        <table className="affairs-table">
          <thead>
            <tr>
              {head('name', 'Province', false)}
              {head('dev', 'Development')}
              {head('tax', 'Taxes')}
              {head('levy', 'Levies')}
              {head('buildings', 'Buildings', false)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <button className="link-like" onClick={() => goToProvince(game, r.id)}>
                    {r.name}
                  </button>
                  {r.p.controller !== r.p.owner && <span className="bad small"> occupied</span>}
                </td>
                <td className="num">
                  {r.dev} <span className="dim">/ {r.cap}</span>
                </td>
                <td className="num">{r.tax.toFixed(1)}</td>
                <td className="num">{formatMen(r.levy)}</td>
                <td>
                  <span className="building-icons">
                    {BUILDING_ORDER.filter((t) => r.p.buildings[t]).map((t) => (
                      <span
                        key={t}
                        className="building-icon"
                        title={`${BUILDINGS[t].levels[(r.p.buildings[t] ?? 1) - 1]}, level ${r.p.buildings[t]} of ${MAX_LEVEL}`}
                      >
                        <Icon name={BUILDINGS[t].icon} />
                        <span className="num">{r.p.buildings[t]}</span>
                      </span>
                    ))}
                    {r.p.construction && (
                      <span className="dim small">
                        {' '}
                        · {BUILDINGS[r.p.construction.type].levels[r.p.construction.level - 1]},{' '}
                        {r.p.construction.done - state.day} d
                      </span>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
