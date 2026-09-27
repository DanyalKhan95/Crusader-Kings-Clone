import {
  ESTATE_INFO,
  GOVERNMENT_INFO,
  IDEOLOGY_NAMES,
  ideologyOf,
  LEVEL_LAWS,
  SUCCESSION_INFO,
  type LevelLaw,
} from '../../data/politics';
import { canReform, reformCost, reformOptions, REFORM_YEARS } from '../../sim/tech';
import { toDate } from '../../sim/calendar';
import * as cmd from '../../sim/commands';
import { loyalty } from '../../sim/diplomacy';
import {
  canChangeLaw,
  estateInfluence,
  estateLoyalty,
  estateName,
  lawCooldown,
  lawCost,
  legitimacyTarget,
  successionOptions,
} from '../../sim/politics';
import { DEMAND_INFO, REVOLT_LOYALTY, revoltRisk } from '../../sim/revolts';
import { ESTATES, type Country, type EstateId, type LawId, type Laws } from '../../sim/types';
import { run, selectCountry } from '../actions';
import { CoatOfArms } from '../CoatOfArms';
import { formatDate } from '../format';
import { useGame } from '../game';
import { Icon } from '../Icon';
import { OpinionValue } from './DiplomacyPanel';
import { Term } from '../encyclopedia/Term';
import { BreakdownList, WithTip } from './Tip';

/** Laws, legitimacy and the estates of the player's realm. */
export function LawsTab({ c }: { c: Country }) {
  const game = useGame();
  const state = game.state;
  const target = legitimacyTarget(state, c);
  const wait = lawCooldown(state, c);
  const rebels = state.countries.filter((x) => x?.alive && x.rebel?.realm === c.index);
  const faction = state.factions.find((f) => f.realm === c.index);
  return (
    <>
      <section className="sp-section legitimacy">
        <div className="legit-row">
          <WithTip
            tip={
              <>
                <BreakdownList title="Legitimacy is heading for" b={target} digits={0} more="rule:legitimacy" />
                <p className="tip-text">
                  It moves a point or two a month. Loyal nobles and clergy, obedient vassals and a steady realm all
                  follow from it; below 30 stability sinks, and below 35 the nobles may rise for a pretender.
                </p>
              </>
            }
            className="legit-value"
          >
            <span className="caps">Legitimacy</span>
            <span className={`num big ${c.legitimacy < 35 ? 'bad' : c.legitimacy >= 60 ? 'good' : ''}`}>
              {Math.round(c.legitimacy)}
            </span>
          </WithTip>
          <span className="bar legit-bar" aria-hidden="true">
            <span style={{ width: `${c.legitimacy}%` }} />
          </span>
        </div>
      </section>

      <Government c={c} />

      {rebels.map((r) => (
        <div key={r.index} className="alert">
          <Icon name="tattered-banner" />
          <span>
            <button className="link" onClick={() => selectCountry(game, r.index)}>
              {r.name}
            </button>{' '}
            holds part of the realm, demanding {DEMAND_INFO[r.rebel!.demand]}.
          </span>
        </div>
      ))}

      <section className="sp-section">
        <h3 className="section-title">Laws</h3>
        <p className="dim small">
          {wait > 0
            ? `Laws may change again on ${formatDate(toDate(state.day + wait))}.`
            : 'One law may change now; after that the realm needs five years to settle.'}
        </p>
        <SuccessionLaw c={c} />
        {(['crown', 'conscription', 'taxation', 'tolerance'] as LevelLaw[]).map((law) => (
          <LevelLawRow key={law} c={c} law={law} />
        ))}
      </section>

      <section className="sp-section">
        <h3 className="section-title">Estates</h3>
        <ul className="estates">
          {ESTATES.map((e) => (
            <EstateRow key={e} c={c} e={e} />
          ))}
        </ul>
        <p className="dim small">
          A loyal estate helps the realm, a disloyal one hinders it. Below {String(REVOLT_LOYALTY).replace('-', '−')}{' '}
          loyalty, an estate with a fifth of the power or more may rise.
        </p>
      </section>

      {faction && (
        <section className="sp-section">
          <h3 className="section-title">A faction for independence</h3>
          <ul className="diplo-list">
            {faction.members.map((m) => {
              const v = state.countries[m];
              return (
                <li key={m} className="diplo-row">
                  <button className="diplo-row-main" onClick={() => selectCountry(game, m)}>
                    <CoatOfArms country={v} size={22} />
                    <span className="diplo-row-name">{v.name}</span>
                  </button>
                  <OpinionValue
                    b={loyalty(state, game.world, m)}
                    title={`Loyalty of ${v.short}`}
                    more="rule:subjects"
                  />
                </li>
              );
            })}
          </ul>
          <p className="dim small">
            Vassals below 0 loyalty band together. Once strong enough they will demand their freedom.
          </p>
        </section>
      )}
    </>
  );
}

/** The form of government, and the reforms that technology has opened. */
function Government({ c }: { c: Country }) {
  const game = useGame();
  const state = game.state;
  const options = reformOptions(c);
  const cost = reformCost();
  const ideology = ideologyOf(c.gov);
  return (
    <section className="sp-section">
      <h3 className="section-title">Government</h3>
      <p className="small">
        <strong>{GOVERNMENT_INFO[c.gov].name}.</strong> {GOVERNMENT_INFO[c.gov].blurb}
        {ideology !== 'traditional' && <> Its ideals: {IDEOLOGY_NAMES[ideology].toLowerCase()}.</>}
      </p>
      {options.length > 0 ? (
        <div className="btn-row">
          {options.map((g) => {
            const check = canReform(state, c, g);
            return (
              <WithTip
                key={g}
                tip={
                  <p className="tip-text">
                    {GOVERNMENT_INFO[g].blurb} A reform costs {cost.legitimacy} legitimacy and {cost.stability}{' '}
                    stability, and the next may not come for {REFORM_YEARS} years.
                    {!check.ok && <> {check.reason}.</>}
                  </p>
                }
              >
                <button
                  className="btn small"
                  disabled={!check.ok}
                  onClick={() => run(game, cmd.reformGovernment(state, g))}
                >
                  <Icon name="capitol" /> {GOVERNMENT_INFO[g].name}
                </button>
              </WithTip>
            );
          })}
        </div>
      ) : (
        <p className="dim small">No other form of government is open to you yet: that takes new ideas.</p>
      )}
    </section>
  );
}

function SuccessionLaw({ c }: { c: Country }) {
  const options = successionOptions(c.gov);
  return (
    <div className="law">
      <div className="law-head">
        <span className="law-name">
          <Term to="law:succession">Succession</Term>
        </span>
        <span className="dim small">{SUCCESSION_INFO[c.laws.succession].blurb}</span>
      </div>
      {options.length > 1 && (
        <div className="law-levels" role="radiogroup" aria-label="Succession">
          {options.map((o) => (
            <LawButton
              key={o}
              c={c}
              law="succession"
              value={o}
              label={SUCCESSION_INFO[o].name}
              tip={SUCCESSION_INFO[o].blurb}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LevelLawRow({ c, law }: { c: Country; law: LevelLaw }) {
  const info = LEVEL_LAWS[law];
  return (
    <div className="law">
      <div className="law-head">
        <span className="law-name">
          <Term to={`law:${law}`}>{info.name}</Term>
        </span>
        <span className="dim small">{info.effects[c.laws[law]]}</span>
      </div>
      <div className="law-levels" role="radiogroup" aria-label={info.name}>
        {info.levels.map((label, i) => (
          <LawButton key={i} c={c} law={law} value={i} label={label} tip={info.effects[i]} />
        ))}
      </div>
    </div>
  );
}

function LawButton({
  c,
  law,
  value,
  label,
  tip,
}: {
  c: Country;
  law: LawId;
  value: Laws[LawId];
  label: string;
  tip: string;
}) {
  const game = useGame();
  const state = game.state;
  const current = c.laws[law] === value;
  const check = canChangeLaw(state, c, law, value);
  const cost = lawCost(c, law, value);
  return (
    <WithTip
      tip={
        <p className="tip-text">
          {tip}
          {!current && check.ok && (
            <>
              {' '}
              Costs {cost.legitimacy} legitimacy{cost.stability ? ' and a point of stability' : ''}.
            </>
          )}
          {!current && !check.ok && <> {check.reason}.</>}
        </p>
      }
    >
      <button
        role="radio"
        aria-checked={current}
        className={`law-level ${current ? 'on' : ''}`}
        disabled={!current && !check.ok}
        onClick={() => !current && run(game, cmd.setLaw(state, law, value))}
      >
        {label}
      </button>
    </WithTip>
  );
}

function EstateRow({ c, e }: { c: Country; e: EstateId }) {
  const game = useGame();
  const state = game.state;
  const info = ESTATE_INFO[e];
  const influence = estateInfluence(state, c);
  const loyal = estateLoyalty(state, c, e);
  const risk = revoltRisk(state, c, e);
  const privileged = c.estates[e].privileged;
  return (
    <li className={`estate ${risk > 0 ? 'unrest' : ''}`}>
      <div className="estate-head">
        <span className="estate-name">{estateName(c, e)}</span>
        <WithTip
          tip={
            <BreakdownList
              title="Power"
              b={{
                total: influence.share[e],
                parts: influence.parts[e].map((p) => ({ label: p.label, value: p.value / 100 })),
              }}
              percent
              more="rule:estates"
            />
          }
        >
          <span className="num dim small">{Math.round(influence.share[e] * 100)}% of the power</span>
        </WithTip>
        <OpinionValue b={loyal} title={`Loyalty of the ${estateName(c, e).toLowerCase()}`} more="rule:estates" />
      </div>
      <p className="dim small estate-blurb">{info.blurb}</p>
      {risk > 0 && <p className="small bad">On the brink: about {Math.round(risk * 100)}% a month that they rise.</p>}
      <WithTip
        tip={
          <p className="tip-text">
            {privileged
              ? 'Taking it back costs 30 loyalty and a point of stability.'
              : `${info.privilegeBlurb} Their loyalty +25, their power +10.`}
          </p>
        }
      >
        <button
          className={`btn small ${privileged ? 'ghost' : ''}`}
          onClick={() => run(game, cmd.privilege(state, e, !privileged))}
        >
          <Icon name="wax-seal" />{' '}
          {privileged ? `Revoke ${info.privilege.toLowerCase()}` : `Grant ${info.privilege.toLowerCase()}`}
        </button>
      </WithTip>
    </li>
  );
}
