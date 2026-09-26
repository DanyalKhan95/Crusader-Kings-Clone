import { useEffect } from 'react';
import type { IconName } from '../../assets/icons';
import { toDate } from '../../sim/calendar';
import { character } from '../../sim/characters';
import { expenses, income, maxManpower, reserveMen } from '../../sim/economy';
import { armiesOf, menIn } from '../../sim/queries';
import { flyToRealm, selectCountry, setSpeed, togglePause } from '../actions';
import { CoatOfArms } from '../CoatOfArms';
import { formatDate } from '../format';
import { useGame } from '../game';
import { Icon } from '../Icon';
import { formatMen } from '../../render/units';
import { useStore } from '../store';
import { SidePanel } from './SidePanel';
import { BreakdownList, fmtSigned, WithTip } from './Tip';
import { NoticeBar, Toasts } from './Toasts';

export function Hud() {
  const game = useGame();
  // Frame the player's realm on arrival; child panels have reported their insets by now.
  useEffect(() => {
    const { player } = game.ui.get();
    if (player) flyToRealm(game, player, 0.4);
  }, [game]);
  return (
    <>
      <NationPlate />
      <TimeControls />
      <Toasts />
      <SidePanel />
      <NoticeBar />
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
  const exp = expenses(state, c);
  const balance = inc.total - exp.total;
  const maxMp = maxManpower(state, c);
  let fieldMaa = 0;
  for (const a of armiesOf(state, c.index)) fieldMaa += menIn(a.units) - (a.units.levy ?? 0);
  const ruler = character(state, c.ruler);
  return (
    <header className="panel nation">
      <button className="nation-coa" onClick={() => selectCountry(game, player, true)} aria-label={`Open ${c.name}`}>
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
            </>
          }
        />
        <Resource
          icon="meeple-group"
          label="Levies"
          value={formatMen(c.manpower)}
          sub={`/ ${formatMen(maxMp.total)}`}
          tip={<BreakdownList title="Levies when fully rested" b={maxMp} digits={0} unit=" men" />}
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
            </div>
          }
        />
        <Resource
          icon="life-in-the-balance"
          label="Stability"
          value={fmtSigned(c.stability, 0)}
          tone={c.stability < 0 ? 'bad' : c.stability > 1 ? 'good' : undefined}
          tip={
            <p className="tip-text">
              Stability runs from −3 to +3. Each point changes taxes by 5% and levies by 3%. It drifts back towards +1;
              unjust wars, lost wars and the death of a ruler lower it.
            </p>
          }
        />
        {c.warExhaustion >= 0.5 && (
          <Resource
            icon="tattered-banner"
            label="Weariness"
            value={c.warExhaustion.toFixed(1)}
            tone="bad"
            tip={
              <p className="tip-text">
                War weariness cuts taxes by 1% a point and makes enemies bolder at the table. It fades in peace.
              </p>
            }
          />
        )}
      </div>
    </header>
  );
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function TimeControls() {
  const game = useGame();
  const speed = useStore(game.ui, (s) => s.speed);
  useStore(game.ui, (s) => s.tick);
  const d = toDate(game.state.day);
  return (
    <div className={`panel dateplate ${speed ? 'running' : 'paused'}`}>
      <button
        className="btn ghost icon-btn"
        onClick={() => togglePause(game)}
        aria-label={speed ? 'Pause (space)' : 'Resume (space)'}
        title={speed ? 'Pause (space)' : 'Resume (space)'}
      >
        <Icon name={speed ? 'pause-button' : 'play-button'} />
      </button>
      <span className="date date-long">{formatDate(d)}</span>
      <span className="date date-short">
        {d.d} {SHORT_MONTHS[d.m - 1]} {d.y}
      </span>
      <div className="speeds" role="radiogroup" aria-label="Game speed">
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            role="radio"
            aria-checked={speed >= s}
            aria-label={`Speed ${s}`}
            title={`Speed ${s} (key ${s})`}
            className={`pip ${speed >= s ? 'on' : ''}`}
            onClick={() => setSpeed(game, s)}
          />
        ))}
      </div>
      <button
        className="btn ghost icon-btn"
        onClick={() => game.ui.set({ modal: 'menu', speed: 0 })}
        aria-label="Game menu"
        title="Game menu"
      >
        <Icon name="hamburger-menu" />
      </button>
    </div>
  );
}
