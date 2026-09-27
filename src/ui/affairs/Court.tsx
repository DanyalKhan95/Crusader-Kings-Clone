/** The court: the ruler and the heir, the council and its tasks, the courtiers, and the line of rulers. */
import { SEAT_TASKS, SUCCESSION_INFO, TASK_INFO } from '../../data/politics';
import { toDate } from '../../sim/calendar';
import {
  age,
  character,
  indexRecords,
  SEAT_INFO,
  SEAT_SKILL,
  skill,
  SKILL_NAMES,
  successorOf,
} from '../../sim/characters';
import * as cmd from '../../sim/commands';
import { COUNCIL_SEATS, SKILLS, type Character, type Country } from '../../sim/types';
import { run } from '../actions';
import { formatDate } from '../format';
import { useGame } from '../game';
import { SpyNetworkLine } from '../hud/RealmAffairs';
import { WithTip } from '../hud/Tip';
import { CharacterCard, Portrait, Skills } from '../people';
import { Advice } from './Advice';

export function CourtScreen({ c }: { c: Country }) {
  const game = useGame();
  const state = game.state;
  const ruler = character(state, c.ruler);
  const successor = character(state, successorOf(state, c));
  const heirTitle =
    c.laws.succession === 'hereditary' ? 'Heir' : c.laws.succession === 'republic' ? 'Favourite' : 'Likely successor';
  return (
    <div className="affairs-grid court">
      <section className="affairs-card throne">
        <h3 className="section-title">The throne</h3>
        <div className="throne-pair">
          <CharacterCard c={ruler} role="Ruler" portrait="ruler" />
          <CharacterCard c={successor} role={heirTitle} portrait="heir" />
        </div>
        <p className="dim small">
          {ruler ? `${ruler.name} has reigned since ${formatDate(toDate(c.rulerSince))}. ` : ''}
          {SUCCESSION_INFO[c.laws.succession].name} succession: {SUCCESSION_INFO[c.laws.succession].blurb}
          {c.laws.succession === 'republic' && ` Next election on ${formatDate(toDate(c.termEnds))}.`}
        </p>
      </section>
      <Advice c={c} />
      <section className="affairs-card wide">
        <h3 className="section-title">The council</h3>
        <Council c={c} />
      </section>
      <Courtiers c={c} />
      <LineOfRulers c={c} />
    </div>
  );
}

/** The five seats: who sits in each, and the task each is set to. */
function Council({ c }: { c: Country }) {
  const game = useGame();
  const state = game.state;
  const candidates = [...c.courtiers, ...Object.values(c.council)].filter(
    (id) => id && character(state, id)?.died === undefined,
  );
  return (
    <ul className="council council-grid">
      {COUNCIL_SEATS.map((seat) => {
        const id = c.council[seat];
        const holder = character(state, id);
        const s = SEAT_SKILL[seat];
        const task = c.tasks[seat];
        const sitting = holder && holder.died === undefined;
        return (
          <li key={seat} className="seat">
            {sitting ? (
              <Portrait c={holder} role={seat} size={48} />
            ) : (
              <span className="portrait empty" style={{ width: 48, height: 58 }} />
            )}
            <div className="seat-body">
              <div className="seat-head">
                <span className="caps">{SEAT_INFO[seat].name}</span>
                <span className="num dim small">{holder ? `${SKILL_NAMES[s]} ${skill(holder, s)}` : ''}</span>
              </div>
              <label className="seat-pick">
                <span className="sr-only">{SEAT_INFO[seat].name}</span>
                <select
                  value={sitting ? id : 0}
                  onChange={(e) => run(game, cmd.appointCouncillor(state, seat, Number(e.target.value)))}
                >
                  {!sitting && <option value={0}>Vacant</option>}
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
              {seat === 'spymaster' && <SpyNetworkLine c={c} />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** The best skill a character has, as a councillor would be judged by it. */
function bestSkill(ch: Character): string {
  const s = [...SKILLS].sort((a, b) => skill(ch, b) - skill(ch, a))[0];
  return `${SKILL_NAMES[s]} ${skill(ch, s)}`;
}

/** Those at court without a seat, and what each is best at. */
function Courtiers({ c }: { c: Country }) {
  const game = useGame();
  const state = game.state;
  const people = c.courtiers
    .map((id) => character(state, id))
    .filter((ch): ch is Character => !!ch && ch.died === undefined);
  return (
    <section className="affairs-card wide-half">
      <h3 className="section-title">At court · {people.length}</h3>
      {people.length ? (
        <ul className="courtiers">
          {people.map((ch) => (
            <li key={ch.id}>
              <Portrait c={ch} role="courtier" size={34} />
              <span className="courtier-text">
                <span>{ch.name}</span>
                <span className="dim small">
                  {age(state, ch)} years · best at {bestSkill(ch).toLowerCase()}
                </span>
              </span>
              <Skills c={ch} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="dim small">No one waits at court for a seat.</p>
      )}
    </section>
  );
}

/** The realm's rulers, the latest first, as far as the records go. */
function LineOfRulers({ c }: { c: Country }) {
  const game = useGame();
  const state = game.state;
  const rulers = (indexRecords(state).reigns.get(c.index) ?? [])
    .map((id) => character(state, id))
    .filter((ch): ch is Character => !!ch)
    .reverse();
  if (!rulers.length) return null;
  const years = (ch: Character) =>
    ch.died !== undefined
      ? `${toDate(ch.born).y}–${toDate(ch.died).y}`
      : `born ${toDate(ch.born).y}${ch.id === c.ruler ? ' · reigns' : ''}`;
  return (
    <section className="affairs-card wide-half">
      <h3 className="section-title">The line of rulers</h3>
      <ol className="rulers">
        {rulers.slice(0, 24).map((ch) => (
          <li key={ch.id} className={ch.id === c.ruler ? 'current' : ''}>
            <span>{ch.name}</span>
            <span className="num dim small">{years(ch)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
