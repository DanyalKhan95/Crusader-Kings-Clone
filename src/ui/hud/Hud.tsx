import { useEffect } from 'react';
import type { IconName } from '../../assets/icons';
import { toDate } from '../../sim/calendar';
import { character } from '../../sim/characters';
import { expenses, income, maxManpower, reserveMen } from '../../sim/economy';
import { legitimacyTarget } from '../../sim/politics';
import { ERAS } from '../../data/eras';
import { TECH_TRACKS, TECHS, TRACK_INFO } from '../../data/techs';
import { eraOf } from '../../sim/tech';
import { armiesOf, menIn } from '../../sim/queries';
import { flyToRealm, openEncyclopedia, openScreen, setSpeed, togglePause } from '../actions';
import { Affairs } from '../affairs/Affairs';
import { sound } from '../audio';
import { CoatOfArms } from '../CoatOfArms';
import { HintCard } from '../hints';
import { MoreAbout } from '../encyclopedia/Term';
import { formatDate, shortDate } from '../format';
import { useGame } from '../game';
import { Icon } from '../Icon';
import { formatMen } from '../../render/units';
import { withKey } from '../keys';
import { useSettings } from '../settings';
import { useStore } from '../store';
import { Alerts } from './Alerts';
import { ContextMenu } from './ContextMenu';
import { Outliner } from './Outliner';
import { PerfOverlay } from './PerfOverlay';
import { SidePanel } from './SidePanel';
import { BreakdownList, fmtSigned, WithTip } from './Tip';
import { NoticeBar, Toasts } from './Toasts';

export function Hud() {
  const game = useGame();
  const perf = useSettings((s) => s.perfOverlay);
  // Frame the player's realm on arrival; child panels have reported their insets by now.
  useEffect(() => {
    const { player } = game.ui.get();
    if (player) flyToRealm(game, player, 0.4);
  }, [game]);
  return (
    <>
      <NationPlate />
      <TimeControls />
      <div className="hud-right">
        <Alerts />
        <Outliner />
      </div>
      <Toasts />
      <SidePanel />
      <Affairs />
      <HintCard />
      <NoticeBar />
      <ContextMenu />
      {perf && <PerfOverlay />}
    </>
  );
}

function Resource({
  icon,
  label,
  value,
  sub,
  tip,
  tone,
}: {
  icon: IconName;
  label: string;
  value: string;
  sub?: string;
  tip: React.ReactNode;
  tone?: 'good' | 'bad';
}) {
  return (
    <WithTip tip={tip} className="stat">
      <Icon name={icon} />
      <span className={`num stat-value ${tone ?? ''}`}>{value}</span>
      {sub && <span className={`num stat-sub ${tone ?? ''}`}>{sub}</span>}
      <span className="stat-label">{label}</span>
    </WithTip>
  );
}

function NationPlate() {
  const game = useGame();
  const player = useStore(game.ui, (s) => s.player);
  useStore(game.ui, (s) => s.tick);
  const state = game.state;
  const c = state.countries[player];
  if (!c) return null;
  const inc = income(state, c);
  const exp = expenses(state, c, inc.total);
  const balance = inc.total - exp.total;
  const maxMp = maxManpower(state, c);
  let fieldMaa = 0;
  for (const a of armiesOf(state, c.index)) fieldMaa += menIn(a.units) - (a.units.levy ?? 0);
  const ruler = character(state, c.ruler);
  return (
    <header className="panel nation">
      <button
        className="nation-coa"
        data-tour="affairs"
        onClick={() => openScreen(game, 'realm', true)}
        aria-label={withKey(`The affairs of ${c.name}`, 'screen:realm')}
        title={withKey(`The affairs of ${c.name}`, 'screen:realm')}
      >
        <CoatOfArms country={c} size={50} />
      </button>
      <div className="nation-text">
        <div className="display nation-name">{c.name}</div>
        <div className="nation-ruler">{ruler?.name ?? 'No ruler'}</div>
      </div>
      <div className="nation-stats">
        <Resource
          icon="coins-pile"
          label="Gold"
          value={Math.floor(c.gold).toLocaleString('en-US')}
          sub={`${fmtSigned(balance)}`}
          tone={c.gold < 0 || balance < 0 ? 'bad' : undefined}
          tip={
            <>
              <BreakdownList title="Monthly income" b={inc} />
              <BreakdownList title="Monthly expenses" b={exp} />
              <MoreAbout to="rule:taxes" />
            </>
          }
        />
        <Resource
          icon="meeple-group"
          label="Levies"
          value={formatMen(c.manpower)}
          sub={`/ ${formatMen(maxMp.total)}`}
          tip={
            <>
              <BreakdownList title="Levies when fully rested" b={maxMp} digits={0} unit=" men" />
              <MoreAbout to="rule:levies" />
            </>
          }
        />
        <Resource
          icon="pikeman"
          label="Men-at-arms"
          value={formatMen(reserveMen(c) + fieldMaa)}
          tip={
            <div className="breakdown">
              <div className="breakdown-title caps">Men-at-arms</div>
              <ul>
                <li>
                  <span>In the field</span>
                  <span className="num">{formatMen(fieldMaa)}</span>
                </li>
                <li>
                  <span>At home</span>
                  <span className="num">{formatMen(reserveMen(c))}</span>
                </li>
              </ul>
              <MoreAbout to="rule:men-at-arms" />
            </div>
          }
        />
        <Resource
          icon="crowned-heart"
          label="Legitimacy"
          value={String(Math.round(c.legitimacy))}
          tone={c.legitimacy < 35 ? 'bad' : c.legitimacy >= 70 ? 'good' : undefined}
          tip={
            <>
              <BreakdownList title="Legitimacy is heading for" b={legitimacyTarget(state, c)} digits={0} />
              <p className="tip-text">The ruler’s right to rule.</p>
              <MoreAbout to="rule:legitimacy" />
            </>
          }
        />
        <Resource
          icon="life-in-the-balance"
          label="Stability"
          value={fmtSigned(c.stability, 0)}
          tone={c.stability < 0 ? 'bad' : c.stability > 1 ? 'good' : undefined}
          tip={
            <>
              <p className="tip-text">
                Stability runs from −3 to +3. Each point changes taxes by 5% and levies by 3%. It drifts back towards
                +1; unjust wars, lost wars and the death of a ruler lower it.
              </p>
              <MoreAbout to="rule:stability" />
            </>
          }
        />
        <EraButton />
        {c.warExhaustion >= 0.5 && (
          <Resource
            icon="tattered-banner"
            label="Weariness"
            value={c.warExhaustion.toFixed(1)}
            tone="bad"
            tip={
              <>
                <p className="tip-text">
                  War weariness cuts taxes by 1% a point, angers the commons and the burghers, and makes the realm
                  readier to make peace. It fades in peace.
                </p>
                <MoreAbout to="rule:war-weariness" />
              </>
            }
          />
        )}
      </div>
    </header>
  );
}

/** The realm's era and the progress of its scholars; opens the technology screen. The interface
 * dresses in the era's colours and letters. */
function EraButton() {
  const game = useGame();
  const c = game.state.countries[game.state.player];
  const index = c ? eraOf(c) : 0;
  const era = ERAS[index];
  useEffect(() => {
    sound.setEra(index);
    document.documentElement.dataset.era = era.id;
    return () => {
      document.documentElement.dataset.era = 'medieval';
    };
  }, [era.id, index]);
  if (!c) return null;
  return (
    <WithTip
      className="stat stat-button"
      tip={
        <div className="breakdown">
          <div className="breakdown-title caps">{era.name} era</div>
          <ul>
            {TECH_TRACKS.map((t) => (
              <li key={t}>
                <span>
                  {TRACK_INFO[t].name}: {TECHS[t][c.tech[t] - 1]?.name ?? 'nothing yet'}
                </span>
                <span className="num">{c.tech[t]}</span>
              </li>
            ))}
          </ul>
          <p className="tip-text">{withKey('Open the technology screen', 'screen:technology')}.</p>
          <MoreAbout to="rule:technology" />
        </div>
      }
    >
      <button className="stat-hit" onClick={() => openScreen(game, 'technology', true)} aria-label="Technology">
        <Icon name="graduate-cap" />
        <span className="num stat-value">{era.name}</span>
        <span className="stat-label">Era</span>
      </button>
    </WithTip>
  );
}

function TimeControls() {
  const game = useGame();
  const speed = useStore(game.ui, (s) => s.speed);
  useStore(game.ui, (s) => s.tick);
  useSettings((s) => s.keys);
  const d = toDate(game.state.day);
  const pause = withKey(speed ? 'Pause' : 'Resume', 'pause');
  return (
    <div className={`panel dateplate ${speed ? 'running' : 'paused'}`}>
      <button className="btn ghost icon-btn" onClick={() => togglePause(game)} aria-label={pause} title={pause}>
        <Icon name={speed ? 'pause-button' : 'play-button'} />
      </button>
      <span className="date date-long">{formatDate(d)}</span>
      <span className="date date-short">{shortDate(d)}</span>
      <div className="speeds" role="radiogroup" aria-label="Game speed">
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            role="radio"
            aria-checked={speed >= s}
            aria-label={`Speed ${s}`}
            title={withKey(`Speed ${s}`, `speed${s as 1 | 2 | 3 | 4 | 5}`)}
            className={`pip ${speed >= s ? 'on' : ''}`}
            onClick={() => setSpeed(game, s)}
          />
        ))}
      </div>
      <button
        className="btn ghost icon-btn"
        data-tour="ledger"
        onClick={() => game.ui.set({ modal: 'ledger', speed: 0 })}
        aria-label={withKey('The ledger of nations', 'ledger')}
        title={withKey('The ledger of nations', 'ledger')}
      >
        <Icon name="scroll-unfurled" />
      </button>
      <button
        className="btn ghost icon-btn"
        data-tour="log"
        onClick={() => game.ui.set({ modal: 'log', speed: 0 })}
        aria-label={withKey('The log of news', 'log')}
        title={withKey('The log of news', 'log')}
      >
        <Icon name="quill-ink" />
      </button>
      <button
        className="btn ghost icon-btn"
        data-tour="encyclopedia"
        onClick={() => openEncyclopedia(game)}
        aria-label={withKey('The encyclopedia', 'encyclopedia')}
        title={withKey('The encyclopedia', 'encyclopedia')}
      >
        <Icon name="open-book" />
      </button>
      <button
        className="btn ghost icon-btn"
        data-tour="menu"
        onClick={() => game.ui.set({ modal: 'menu', speed: 0 })}
        aria-label="Game menu"
        title="Game menu"
      >
        <Icon name="hamburger-menu" />
      </button>
    </div>
  );
}
