/**
 * Affairs of a realm beyond its figures: the modifiers it carries, the nations it may proclaim, and
 * the player's spies in a foreign realm.
 */
import { PLOT_ORDER, PLOTS, type PlotId } from '../../data/espionage';
import { MODIFIER_TEXT, MODIFIERS, type ModifierEffectKey } from '../../data/modifiers';
import type { NationDef } from '../../data/nations';
import { toDate } from '../../sim/calendar';
import * as cmd from '../../sim/commands';
import { canForm, heartland, nationsFor } from '../../sim/decisions';
import { canPlot, canSpyOn, network, networkGrowth, plotExposure, plotGold, plotOdds } from '../../sim/espionage';
import { techById } from '../../sim/tech';
import type { Country } from '../../sim/types';
import { run } from '../actions';
import { useGame } from '../game';
import { Icon } from '../Icon';
import { useStore } from '../store';
import { goToProvince } from './SidePanel';
import { BreakdownList, fmtSigned, WithTip } from './Tip';

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function until(day: number): string {
  const d = toDate(day);
  return `until ${SHORT_MONTHS[d.m - 1]} ${d.y}`;
}

// ── Modifiers ─────────────────────────────────────────────────────

export function ModifiersSection({ c }: { c: Country }) {
  useStore(useGame().ui, (s) => s.tick);
  if (!c.modifiers.length) return null;
  return (
    <section className="sp-section">
      <h3 className="section-title">Modifiers · {c.modifiers.length}</h3>
      <ul className="modifiers">
        {c.modifiers.map((m) => {
          const def = MODIFIERS[m.id];
          if (!def) return null;
          const effects = Object.entries(def.effects) as [ModifierEffectKey, number][];
          return (
            <li key={m.id}>
              <WithTip
                tip={
                  <div className="tip-text">
                    <p>{def.blurb}</p>
                    <ul className="modifier-effects">
                      {effects.map(([k, v]) => (
                        <li key={k}>{MODIFIER_TEXT[k](v)}</li>
                      ))}
                    </ul>
                  </div>
                }
              >
                <span className={`modifier ${def.bad ? 'bad' : ''}`}>
                  <Icon name={def.icon} />
                  <span className="modifier-name">{def.name}</span>
                  {m.until !== undefined && <span className="dim small">{until(m.until)}</span>}
                </span>
              </WithTip>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── Decisions ─────────────────────────────────────────────────────

/** Nations worth showing: those of the realm's people, or that it holds some heartland of. */
function nationsShown(game: ReturnType<typeof useGame>, c: Country): NationDef[] {
  return nationsFor(game.state, c).filter((n) => n.cultures || heartland(game.state, c, n).some((p) => p.held));
}

export function DecisionsSection({ c }: { c: Country }) {
  const game = useGame();
  useStore(game.ui, (s) => s.tick);
  const list = nationsShown(game, c);
  if (!list.length) return null;
  return (
    <section className="sp-section">
      <h3 className="section-title">Decisions</h3>
      {list.map((n) => (
        <Decision key={n.id} c={c} n={n} />
      ))}
    </section>
  );
}

function Decision({ c, n }: { c: Country; n: NationDef }) {
  const game = useGame();
  const state = game.state;
  const check = canForm(state, c, n);
  const land = heartland(state, c, n);
  const held = land.filter((p) => p.held).length;
  const tech = n.tech ? techById(n.tech) : undefined;
  // Reasons the requirements above already show are not repeated by the button.
  const why = !check.ok && !['Hold ', 'Not before', 'It needs'].some((p) => check.reason.startsWith(p));
  return (
    <div className="decision">
      <div className="decision-head">
        <span className="decision-icon">
          <Icon name={n.icon} />
        </span>
        <div>
          <div className="decision-name">Proclaim the {n.name}</div>
          <p className="dim small">{n.blurb}</p>
        </div>
      </div>
      <div className="decision-needs small">
        <span className={held >= n.need ? 'good' : ''}>
          Heartland held: {held} of the {n.need} needed
        </span>
        {n.from && <span className={toDate(state.day).y >= n.from ? 'good' : ''}>Not before {n.from}</span>}
        {tech && <span className={c.tech[tech.track] >= tech.level ? 'good' : ''}>Needs {tech.name}</span>}
      </div>
      <ul className="chips heartland">
        {land.map((p) => (
          <li key={p.name}>
            <button className={`chip ${p.held ? 'held' : ''}`} onClick={() => p.id && goToProvince(game, p.id)}>
              {p.held && <Icon name="checked-shield" />}
              {p.name}
            </button>
          </li>
        ))}
      </ul>
      <div className="decision-act">
        {why && !check.ok && <span className="dim small">{check.reason}</span>}
        <button
          className="btn primary"
          disabled={!check.ok}
          onClick={() => run(game, cmd.proclaimNation(state, game.world, n.id))}
        >
          <Icon name="flying-flag" /> Proclaim
        </button>
      </div>
    </div>
  );
}

// ── Intrigue ──────────────────────────────────────────────────────

/** The player's spies in a foreign realm, and the plots they could carry out. */
export function IntrigueSection({ c }: { c: Country }) {
  const game = useGame();
  useStore(game.ui, (s) => s.tick);
  const state = game.state;
  const me = state.countries[state.player];
  if (!me?.alive || !canSpyOn(state, me, c.index).ok) return null;
  const net = network(me, c.index);
  const building = me.spyTarget === c.index && me.tasks.spymaster === 'network';
  const elsewhere = me.spyTarget && me.spyTarget !== c.index ? state.countries[me.spyTarget] : undefined;
  const growth = networkGrowth(state, game.world, me, c.index);
  return (
    <section className="sp-section intrigue">
      <h3 className="section-title">Intrigue</h3>
      <div className="network">
        <span className="caps">Your network</span>
        <span className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(net)}>
          <span style={{ width: `${Math.min(100, net)}%` }} />
        </span>
        <span className="num">{Math.round(net)}</span>
      </div>
      {building ? (
        <div className="network-work small">
          <span>
            Your spymaster is at work:{' '}
            <WithTip tip={<BreakdownList title="Growth a month" b={growth} />}>
              <span className="num good">{fmtSigned(growth.total)} a month</span>
            </WithTip>
          </span>
          <button className="btn small" onClick={() => run(game, cmd.spyOn(state, 0))}>
            Recall the agents
          </button>
        </div>
      ) : (
        <div className="network-work small">
          <span className="dim">
            {elsewhere
              ? `Your agents work in ${elsewhere.name}; sending them here lets that network wither.`
              : 'Your spymaster could work agents into their court, about ' + `${fmtSigned(growth.total)} a month.`}
          </span>
          <button className="btn small" onClick={() => run(game, cmd.spyOn(state, c.index))}>
            <Icon name="eye-target" /> Build a network here
          </button>
        </div>
      )}
      <ul className="plots">
        {PLOT_ORDER.map((p) => (
          <Plot key={p} target={c} plot={p} />
        ))}
      </ul>
    </section>
  );
}

function Plot({ target, plot }: { target: Country; plot: PlotId }) {
  const game = useGame();
  const state = game.state;
  const me = state.countries[state.player];
  const def = PLOTS[plot];
  const check = canPlot(state, game.world, me, target.index, plot);
  const odds = plotOdds(state, me, target.index, plot);
  const exposure = plotExposure(state, target.index, plot);
  return (
    <li className="plot">
      <Icon name={def.icon} />
      <div className="plot-body">
        <span className="plot-name">{def.name}</span>
        <span className="dim small">{def.blurb}</span>
        <span className="small plot-terms">
          <span>network {def.network}</span>
          <span>{plotGold(state, me, plot)} gold</span>
          <WithTip tip={<BreakdownList title="Chance of success" b={odds} digits={0} unit="%" />}>
            <span className="num">{Math.round(odds.total)}% success</span>
          </WithTip>
          <span>{Math.round(exposure)}% traced</span>
        </span>
      </div>
      {check.ok ? (
        <button className="btn small danger" onClick={() => run(game, cmd.plot(state, game.world, target.index, plot))}>
          Act
        </button>
      ) : (
        <WithTip tip={<p className="tip-text">{check.reason}</p>}>
          <button className="btn small" disabled>
            Act
          </button>
        </WithTip>
      )}
    </li>
  );
}

/** Under the spymaster's seat: where the agents work. */
export function SpyNetworkLine({ c }: { c: Country }) {
  const game = useGame();
  const t = c.spyTarget ? game.state.countries[c.spyTarget] : undefined;
  if (c.tasks.spymaster !== 'network') return null;
  if (!t) return <p className="dim small seat-note">Choose a realm to spy on from its panel: Build a network here.</p>;
  return (
    <p className="small seat-note">
      Agents in {t.name}: <span className="num">{Math.round(network(c, t.index))}</span> of 100
    </p>
  );
}
