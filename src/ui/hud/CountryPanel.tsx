import { useMemo } from 'react';
import { UNITS, UNIT_ORDER } from '../../data/units';
import { formatMen } from '../../render/units';
import { character, SEAT_INFO, SEAT_SKILL, skill, SKILL_NAMES, successorOf } from '../../sim/characters';
import * as cmd from '../../sim/commands';
import { expenses, income, loanSize, MAX_LOANS, maxManpower, reserveMen } from '../../sim/economy';
import { availableMaa, recruitCost } from '../../sim/military';
import { armiesOf, armySize, provincesOf } from '../../sim/queries';
import { COUNCIL_SEATS, type Country, type UnitType } from '../../sim/types';
import { run, selectArmy, selectCountry } from '../actions';
import { CoatOfArms } from '../CoatOfArms';
import { capitalize, formatDate } from '../format';
import { countryStats, useGame, type CountryTab } from '../game';
import { Icon } from '../Icon';
import { SEAT_TASKS, TASK_INFO } from '../../data/politics';
import { toDate } from '../../sim/calendar';
import { CharacterCard, Portrait } from '../people';
import { LawsTab } from './PoliticsPanel';
import { DiplomacyTab, ForeignDiplomacy } from './DiplomacyPanel';
import { CountryFacts, CountryHeader } from '../realm';
import { useStore } from '../store';
import { goToProvince } from './SidePanel';
import { BreakdownList, fmtSigned, WithTip } from './Tip';

const TABS: { id: CountryTab; label: string }[] = [
  { id: 'realm', label: 'Realm' },
  { id: 'treasury', label: 'Treasury' },
  { id: 'military', label: 'Army' },
  { id: 'court', label: 'Court' },
  { id: 'laws', label: 'Laws' },
  { id: 'diplomacy', label: 'Diplomacy' },
];

export function CountryView({ index }: { index: number }) {
  const game = useGame();
  const player = useStore(game.ui, (s) => s.player);
  const tab = useStore(game.ui, (s) => s.countryTab);
  const c = game.state.countries[index];
  if (!c) return null;
  const mine = index === player;
  const open = (i: number) => selectCountry(game, i, true);
  return (
    <div className="sp-body">
      <div className="sp-head">
        {mine && <p className="caps sp-kicker your-realm">Your realm</p>}
        {!c.alive && <p className="caps sp-kicker">Fallen</p>}
        <CountryHeader country={c} onLiege={open} />
      </div>
      {mine ? (
        <>
          <nav className="tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                className={`tab ${tab === t.id ? 'active' : ''}`}
                onClick={() => game.ui.set({ countryTab: t.id })}
              >
                {t.label}
              </button>
            ))}
          </nav>
          {tab === 'realm' && <RealmTab c={c} />}
          {tab === 'treasury' && <TreasuryTab c={c} />}
          {tab === 'military' && <MilitaryTab c={c} />}
          {tab === 'court' && <CourtTab c={c} />}
          {tab === 'laws' && <LawsTab c={c} />}
          {tab === 'diplomacy' && <DiplomacyTab c={c} />}
        </>
      ) : (
        <>
          <ForeignDiplomacy c={c} />
          <RealmTab c={c} />
        </>
      )}
    </div>
  );
}

function RealmTab({ c }: { c: Country }) {
  const game = useGame();
  const stats = useMemo(() => countryStats(game, c.index), [game, c.index]);
  const best = useMemo(
    () =>
      [...provincesOf(game.state, c.index)]
        .sort((a, b) => game.state.provinces[b].dev - game.state.provinces[a].dev)
        .slice(0, 8),
    [game, c.index],
  );
  const open = (i: number) => selectCountry(game, i, true);
  return (
    <>
      <CountryFacts country={c} stats={stats} />
      {stats.vassals.length > 0 && (
        <section className="sp-section">
          <h3 className="section-title">Vassals · {stats.vassals.length}</h3>
          <ul className="chips">
            {stats.vassals.map((v) => (
              <li key={v.index}>
                <button className="chip with-coa" onClick={() => open(v.index)}>
                  <CoatOfArms country={v} size={16} />
                  {capitalize(v.short)}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {best.length > 0 && (
        <section className="sp-section">
          <h3 className="section-title">Richest provinces</h3>
          <ul className="ranked">
            {best.map((id) => (
              <li key={id}>
                <button className="ranked-row" onClick={() => goToProvince(game, id)}>
                  <span>{game.world.region(id).name}</span>
                  <span className="num dim">{game.state.provinces[id].dev}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function TreasuryTab({ c }: { c: Country }) {
  const game = useGame();
  const inc = income(game.state, c);
  const exp = expenses(game.state, c);
  const balance = inc.total - exp.total;
  return (
    <>
      <div className="treasury-summary">
        <span className="caps">Treasury</span>
        <span className="num big">{Math.floor(c.gold).toLocaleString('en-US')}</span>
        <span className={`num ${balance < 0 ? 'bad' : 'good'}`}>{fmtSigned(balance)} a month</span>
      </div>
      <BreakdownList title="Income" b={inc} />
      <BreakdownList title="Expenses" b={exp} />
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
                  onClick={() => run(game, cmd.repay(game.state, i))}
                >
                  Repay
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="dim small">The realm owes nothing.</p>
        )}
        <button
          className="btn"
          disabled={c.loans.length >= MAX_LOANS}
          onClick={() => run(game, cmd.borrow(game.state))}
        >
          <Icon name="bank" /> Borrow {loanSize(game.state, c)} gold
        </button>
        <p className="dim small">Lenders ask 12% a year. At most {MAX_LOANS} loans.</p>
      </section>
    </>
  );
}

function MilitaryTab({ c }: { c: Country }) {
  const game = useGame();
  const state = game.state;
  const maxMp = maxManpower(state, c).total;
  const armies = armiesOf(state, c.index);
  const reserve = reserveMen(c);
  return (
    <>
      <div className="levy-box">
        <div>
          <span className="caps">Levies ready</span>
          <span className="num big">{formatMen(c.manpower)}</span>
          <span className="dim small">of {formatMen(maxMp)} when rested</span>
        </div>
        <div>
          <span className="caps">Men-at-arms at home</span>
          <span className="num big">{formatMen(reserve)}</span>
        </div>
      </div>
      <button
        className="btn primary"
        disabled={c.manpower + reserve < 50}
        onClick={() => run(game, cmd.raise(game.state, game.world))}
      >
        <Icon name="knight-banner" /> Raise the army
      </button>
      <p className="dim small">
        Levies and men-at-arms gather at your capital. Raised levies cost upkeep; disband them in peace.
      </p>
      {armies.length > 0 && (
        <section className="sp-section">
          <h3 className="section-title">Armies · {armies.length}</h3>
          <ul className="army-list">
            {armies.map((a) => (
              <li key={a.id}>
                <button className="army-row" onClick={() => selectArmy(game, a.id)}>
                  <Icon name="knight-banner" />
                  <span className="army-row-name">
                    {a.name}
                    <span className="dim small"> · {game.world.region(a.location).name}</span>
                  </span>
                  <span className="num">{formatMen(armySize(a))}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
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
                <Icon name={UNITS[t].icon} />
                <span>{UNITS[t].name}</span>
                <span className="num">{formatMen(c.reserve[t] ?? 0)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="dim small">Every regiment is in the field.</p>
        )}
      </section>
    </>
  );
}

function RecruitRow({ c, t }: { c: Country; t: UnitType }) {
  const game = useGame();
  const u = UNITS[t];
  const cost = recruitCost(t, 1);
  return (
    <li>
      <Icon name={u.icon} />
      <span className="recruit-text" title={u.blurb}>
        <span>{u.name}</span>
        <span className="dim small">
          {u.regiment} men · upkeep {((u.upkeep * u.regiment) / 100).toFixed(1)} in the field
        </span>
      </span>
      <button
        className="btn small"
        disabled={c.gold < cost}
        onClick={() => run(game, cmd.recruitMaa(game.state, t, 1))}
      >
        {cost} <Icon name="coins" />
      </button>
    </li>
  );
}

function CourtTab({ c }: { c: Country }) {
  const game = useGame();
  const state = game.state;
  const candidates = [...c.courtiers, ...Object.values(c.council)].filter(
    (id) => character(state, id)?.died === undefined && id,
  );
  const successor = character(state, successorOf(state, c));
  const heirTitle =
    c.laws.succession === 'hereditary' ? 'Heir' : c.laws.succession === 'republic' ? 'Favourite' : 'Likely successor';
  return (
    <>
      <CharacterCard c={character(state, c.ruler)} role="Ruler" portrait="ruler" />
      <CharacterCard c={successor} role={heirTitle} portrait="heir" />
      {c.laws.succession === 'republic' && (
        <p className="dim small">Next election on {formatDate(toDate(c.termEnds))}.</p>
      )}
      <section className="sp-section">
        <h3 className="section-title">Council</h3>
        <ul className="council">
          {COUNCIL_SEATS.map((seat) => {
            const id = c.council[seat];
            const holder = character(state, id);
            const s = SEAT_SKILL[seat];
            const task = c.tasks[seat];
            return (
              <li key={seat} className="seat">
                {holder && holder.died === undefined ? (
                  <Portrait c={holder} role={seat} size={42} />
                ) : (
                  <span className="portrait empty" style={{ width: 42, height: 50 }} />
                )}
                <div className="seat-body">
                  <div className="seat-head">
                    <span className="caps">{SEAT_INFO[seat].name}</span>
                    <span className="num dim small">{holder ? `${SKILL_NAMES[s]} ${skill(holder, s)}` : ''}</span>
                  </div>
                  <label className="seat-pick">
                    <span className="sr-only">{SEAT_INFO[seat].name}</span>
                    <select
                      value={holder && holder.died === undefined ? id : 0}
                      onChange={(e) => run(game, cmd.appointCouncillor(state, seat, Number(e.target.value)))}
                    >
                      {!holder && <option value={0}>Vacant</option>}
                      {candidates.map((cid) => {
                        const ch = character(state, cid)!;
                        return (
                          <option key={cid} value={cid}>
                            {ch.name} ({skill(ch, s)})
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  <div className="tasks" role="radiogroup" aria-label={`${SEAT_INFO[seat].name}’s task`}>
                    {SEAT_TASKS[seat].map((t) => (
                      <WithTip key={t} tip={<p className="tip-text">{TASK_INFO[t].blurb}</p>}>
                        <button
                          role="radio"
                          aria-checked={task === t}
                          className={`task ${task === t ? 'on' : ''}`}
                          onClick={() => run(game, cmd.councilTask(state, seat, t))}
                        >
                          {TASK_INFO[t].name}
                        </button>
                      </WithTip>
                    ))}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
