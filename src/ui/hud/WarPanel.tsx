import { toDate } from '../../sim/calendar';
import { sideOf } from '../../sim/queries';
import { CB_INFO, warScore } from '../../sim/war';
import { selectCountry } from '../actions';
import { CoatOfArms } from '../CoatOfArms';
import { formatDate } from '../format';
import { useGame } from '../game';
import { Icon } from '../Icon';
import { BreakdownList, fmtSigned } from './Tip';

export function WarView({ id }: { id: number }) {
  const game = useGame();
  const state = game.state;
  const war = state.wars.find((w) => w.id === id);
  if (!war) return <p className="sp-body dim">This war has ended.</p>;
  const score = warScore(state, war);
  const mySide = sideOf(war, state.player);
  const leader = war.attacker === state.player || war.defender === state.player;
  const shown = mySide === 'defender' ? -score.total : score.total;
  const goal =
    war.cb === 'border'
      ? `the province of ${game.world.region(war.goal).name}`
      : war.cb === 'throne'
        ? `the crown of ${state.countries[war.goal]?.short}`
        : 'whatever can be taken';
  const Side = ({ title, members }: { title: string; members: number[] }) => (
    <div className="war-side">
      <span className="caps">{title}</span>
      <ul>
        {members.map((m) => {
          const c = state.countries[m];
          return (
            <li key={m}>
              <button className="chip with-coa" onClick={() => selectCountry(game, m)}>
                <CoatOfArms country={c} size={16} />
                {c.short}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
  return (
    <div className="sp-body">
      <div className="sp-head">
        <p className="caps sp-kicker">{CB_INFO[war.cb].name}</p>
        <h2 className="display sp-title">{war.name}</h2>
        <p className="sp-sub">
          Since {formatDate(toDate(war.start))}. The war goal is {goal}.
        </p>
      </div>
      <div className="war-score">
        <span className="caps">War score{mySide ? ' for us' : ''}</span>
        <span className={`num big ${shown < 0 ? 'bad' : shown > 0 ? 'good' : ''}`}>{fmtSigned(shown, 0)}%</span>
        <span className="score-bar" aria-hidden="true">
          <span style={{ left: `${50 + Math.min(50, Math.max(-50, shown / 2))}%` }} />
        </span>
      </div>
      <BreakdownList
        title="Where the score comes from"
        b={
          mySide === 'defender'
            ? { total: -score.total, parts: score.parts.map((p) => ({ ...p, value: -p.value })) }
            : score
        }
        digits={0}
      />
      <div className="war-sides">
        <Side title="Attackers" members={war.attackers} />
        <Side title="Defenders" members={war.defenders} />
      </div>
      {leader && (
        <button className="btn primary" onClick={() => game.ui.set({ modal: 'peace', selectedWar: war.id, speed: 0 })}>
          <Icon name="peace-dove" /> Negotiate peace
        </button>
      )}
      {mySide && !leader && <p className="dim small">Only the war leader can make peace.</p>}
    </div>
  );
}
