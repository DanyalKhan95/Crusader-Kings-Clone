/** The realm at a glance: its facts and standing, what it carries, what it may proclaim, its subjects and lands. */
import { useMemo } from 'react';
import { provincesOf } from '../../sim/queries';
import { standing } from '../../sim/score';
import type { Country } from '../../sim/types';
import { selectCountry } from '../actions';
import { CoatOfArms } from '../CoatOfArms';
import { capitalize } from '../format';
import { countryStats, useGame } from '../game';
import { ColoniesSection } from '../hud/NavyPanel';
import { DecisionsSection, ModifiersSection } from '../hud/RealmAffairs';
import { goToProvince } from '../hud/SidePanel';
import { BreakdownList } from '../hud/Tip';
import { CountryFacts, CountryHeader } from '../realm';

export function RealmScreen({ c }: { c: Country }) {
  const game = useGame();
  const state = game.state;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the figures change with the day
  const stats = useMemo(() => countryStats(game, c.index), [game, c.index, state.day]);
  const best = useMemo(
    () => [...provincesOf(state, c.index)].sort((a, b) => state.provinces[b].dev - state.provinces[a].dev).slice(0, 12),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the provinces change with the day
    [game, c.index, state.day],
  );
  const subjects = state.countries.filter((x) => x?.alive && (x.liege === c.index || x.overlord === c.index));
  return (
    <div className="affairs-grid">
      <section className="affairs-card">
        <CountryHeader country={c} size={64} onLiege={(i) => selectCountry(game, i, true)} />
        <CountryFacts country={c} stats={stats} />
      </section>
      <section className="affairs-card">
        <h3 className="section-title">Standing among the nations</h3>
        <BreakdownList title="At the next New Year" b={standing(state, c)} />
        <p className="dim small">
          Each New Year the realm adds this to its score. On 1 January 2066 the highest score ranks first; the ledger of
          nations keeps the tally.
        </p>
      </section>
      <div className="affairs-flow">
        <ModifiersSection c={c} />
        <DecisionsSection c={c} />
        {subjects.length > 0 && (
          <section className="sp-section">
            <h3 className="section-title">Subjects · {subjects.length}</h3>
            <ul className="chips">
              {subjects.map((v) => (
                <li key={v.index}>
                  <button className="chip with-coa" onClick={() => selectCountry(game, v.index, true)}>
                    <CoatOfArms country={v} size={16} />
                    {capitalize(v.short)}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <ColoniesSection c={c} />
        {best.length > 0 && (
          <section className="sp-section">
            <h3 className="section-title">Richest provinces</h3>
            <ul className="ranked">
              {best.map((id) => (
                <li key={id}>
                  <button className="ranked-row" onClick={() => goToProvince(game, id)}>
                    <span>{game.world.region(id).name}</span>
                    <span className="num dim">{state.provinces[id].dev}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
