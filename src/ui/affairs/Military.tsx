/**
 * The military: levies and men-at-arms, the armies in the field and what each is doing, recruitment,
 * the navy and its transports, and the realm's wars.
 */
import { UNIT_ORDER, unitDef } from '../../data/units';
import { formatMen } from '../../render/units';
import * as cmd from '../../sim/commands';
import { maxManpower, reserveMen } from '../../sim/economy';
import { availableMaa, inBattle, recruitCost } from '../../sim/military';
import { armiesOf, armySize, warsOf } from '../../sim/queries';
import { militaryEra } from '../../sim/tech';
import type { Country, UnitType } from '../../sim/types';
import { scoreFor } from '../../sim/war';
import { flyToProvince, run, selectArmy, selectWar } from '../actions';
import { LineChart } from '../charts';
import { useGame } from '../game';
import { Icon } from '../Icon';
import { NavySection } from '../hud/NavyPanel';
import { armyStatus } from '../hud/Outliner';
import { BreakdownList, fmtSigned, WithTip } from '../hud/Tip';
import { CHART, yearOf } from './Economy';

export function MilitaryScreen({ c }: { c: Country }) {
  const game = useGame();
  const state = game.state;
  const max = maxManpower(state, c);
  const armies = armiesOf(state, c.index);
  const reserve = reserveMen(c);
  let field = 0,
    fieldMaa = 0;
  for (const a of armies) {
    field += armySize(a);
    fieldMaa += armySize(a) - (a.units.levy ?? 0);
  }
  const books = c.books ?? [];
  const wars = warsOf(state, c.index);
  return (
    <div className="affairs-grid">
      <section className="affairs-card wide">
        <ul className="stat-tiles">
          <li>
            <span className="caps">Levies ready</span>
            <WithTip tip={<BreakdownList title="Levies when fully rested" b={max} digits={0} unit=" men" />}>
              <span className="num tile-value">
                {formatMen(c.manpower)} <span className="dim small">of {formatMen(max.total)}</span>
              </span>
            </WithTip>
          </li>
          <li>
            <span className="caps">Men-at-arms at home</span>
            <span className="num tile-value">{formatMen(reserve)}</span>
          </li>
          <li>
            <span className="caps">In the field</span>
            <span className="num tile-value">
              {formatMen(field)}
              {fieldMaa > 0 && <span className="dim small"> · {formatMen(fieldMaa)} men-at-arms</span>}
            </span>
          </li>
          <li>
            <span className="caps">Armies</span>
            <span className="num tile-value">{armies.length}</span>
          </li>
        </ul>
        <div className="btn-row">
          <button
            className="btn primary"
            disabled={c.manpower + reserve < 50}
            onClick={() => run(game, cmd.raise(state, game.world))}
          >
            <Icon name="knight-banner" /> Raise the army
          </button>
          <span className="dim small">
            Levies and men-at-arms gather at the capital. Raised levies cost upkeep; disband them in peace.
          </span>
        </div>
      </section>
      <section className="affairs-card wide-half">
        <h3 className="section-title">Armies in the field · {armies.length}</h3>
        {armies.length ? (
          <div className="affairs-table-wrap">
            <table className="affairs-table">
              <thead>
                <tr>
                  <th scope="col">Army</th>
                  <th scope="col" className="num">
                    Men
                  </th>
                  <th scope="col" className="num">
                    Morale
                  </th>
                  <th scope="col">Doing</th>
                </tr>
              </thead>
              <tbody>
                {armies.map((a) => (
                  <tr key={a.id} className={inBattle(state, a) ? 'hostile' : ''}>
                    <td>
                      <button
                        className="link-like"
                        onClick={() => {
                          selectArmy(game, a.id);
                          flyToProvince(game, a.location, 1.2);
                        }}
                      >
                        {a.name}
                      </button>
                    </td>
                    <td className="num">{formatMen(armySize(a))}</td>
                    <td className="num">{Math.round(a.morale * 100)}%</td>
                    <td className="dim small">{armyStatus(game, a)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="dim small">No army is in the field. Raise one when war comes.</p>
        )}
      </section>
      <section className="affairs-card wide-half">
        <h3 className="section-title">Levies ready</h3>
        <LineChart
          title="Levies ready to raise"
          xs={books.map((b) => b[0])}
          xLabel={yearOf}
          format={formatMen}
          series={[{ id: 'levies', name: 'Levies', color: CHART.men, values: books.map((b) => b[4]), area: true }]}
        />
      </section>
      <div className="affairs-flow">
        <section className="sp-section">
          <h3 className="section-title">Recruit men-at-arms</h3>
          <ul className="recruit">
            {availableMaa(c).map((t) => (
              <RecruitRow key={t} c={c} t={t} />
            ))}
          </ul>
        </section>
        <section className="sp-section">
          <h3 className="section-title">At home</h3>
          {reserve ? (
            <ul className="units">
              {UNIT_ORDER.filter((t) => (c.reserve[t] ?? 0) > 0).map((t) => (
                <li key={t}>
                  <Icon name={unitDef(t, militaryEra(c)).icon} />
                  <span>{unitDef(t, militaryEra(c)).name}</span>
                  <span className="num">{formatMen(c.reserve[t] ?? 0)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dim small">Every regiment is in the field.</p>
          )}
        </section>
        <NavySection c={c} />
        <section className="sp-section">
          <h3 className="section-title">Wars · {wars.length}</h3>
          {wars.length ? (
            <ul className="war-list">
              {wars.map((w) => {
                const score = scoreFor(state, w, c.index);
                return (
                  <li key={w.id}>
                    <button className="war-row" onClick={() => selectWar(game, w.id)}>
                      <Icon name="crossed-swords" />
                      <span className="war-row-name">{w.name}</span>
                      <span className={`num ${score < 0 ? 'bad' : 'good'}`}>{fmtSigned(score, 0)}%</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="dim small">The realm is at peace.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function RecruitRow({ c, t }: { c: Country; t: UnitType }) {
  const game = useGame();
  const u = unitDef(t, militaryEra(c));
  const one = recruitCost(c, t, 1),
    five = recruitCost(c, t, 5);
  return (
    <li>
      <Icon name={u.icon} />
      <span className="recruit-text" title={u.blurb}>
        <span>{u.name}</span>
        <span className="dim small">
          {u.regiment} men · upkeep {((u.upkeep * u.regiment) / 100).toFixed(1)} in the field
        </span>
      </span>
      <button className="btn small" disabled={c.gold < one} onClick={() => run(game, cmd.recruitMaa(game.state, t, 1))}>
        {one} <Icon name="coins" />
      </button>
      <button
        className="btn small"
        disabled={c.gold < five}
        title={`Five regiments for ${five} gold`}
        onClick={() => run(game, cmd.recruitMaa(game.state, t, 5))}
      >
        ×5
      </button>
    </li>
  );
}
