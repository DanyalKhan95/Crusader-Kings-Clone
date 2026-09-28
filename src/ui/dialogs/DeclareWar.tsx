import { useState } from 'react';
import { formatMen } from '../../render/units';
import * as cmd from '../../sim/commands';
import { holyTo } from '../../sim/beliefs';
import { coalitionAgainst } from '../../sim/diplomacy';
import { holyWarGoals } from '../../sim/holywars';
import { lordOf, realmStrength, topLiege } from '../../sim/queries';
import type { CasusBelli } from '../../sim/types';
import { canDeclare, CB_INFO, CALL_REASON, claimTargets, previewCalls, type CallPreview } from '../../sim/war';
import { run, selectWar } from '../actions';
import { CoatOfArms } from '../CoatOfArms';
import { useGame } from '../game';
import { Icon } from '../Icon';
import { useStore } from '../store';
import { Modal } from './Modal';
import { placeName } from '../../sim/places';

const ANSWER: Record<CallPreview['answer'], string> = {
  join: 'will come',
  refuse: 'will refuse, and the treaty will break',
  cannot: 'cannot come',
  asked: 'you decide',
};

export function DeclareWar() {
  const game = useGame();
  const target = useStore(game.ui, (s) => s.dialogCountry);
  // A province the war was asked to be fought for, from a right-click or an alert.
  const wanted = useStore(game.ui, (s) => s.dialogGoal);
  const state = game.state;
  const player = state.player;
  const me = state.countries[player];
  const independence = lordOf(state, player) === target;
  const defender = independence ? target : topLiege(state, target);
  const d = state.countries[defender];
  const byDev = (a: number, b: number) => state.provinces[b].dev - state.provinces[a].dev;
  const claims = claimTargets(state, player, defender).sort(byDev);
  const holySite = (id: number) => holyTo(id).includes(me.religion);
  const holy = independence
    ? []
    : holyWarGoals(state, game.world, player, defender).sort((a, b) => +holySite(b) - +holySite(a) || byDev(a, b));
  const options: CasusBelli[] = [];
  if (independence) options.push('independence');
  else {
    if (me.throneClaims.includes(defender)) options.push('throne');
    if (claims.length) options.push('claim');
    if (holy.length) options.push('holy');
    if (coalitionAgainst(state, defender)?.members.includes(player)) options.push('coalition');
    options.push('conquest');
  }
  const [cb, setCb] = useState<CasusBelli>(
    options.includes('claim') && claims.includes(wanted)
      ? 'claim'
      : options.includes('holy') && holy.includes(wanted)
        ? 'holy'
        : options[0],
  );
  const [goal, setGoal] = useState<number>(claims.includes(wanted) ? wanted : (claims[0] ?? 0));
  const [holyGoal, setHolyGoal] = useState<number>(holy.includes(wanted) ? wanted : (holy[0] ?? 0));
  if (!d || !me) return null;
  const goalFor = cb === 'claim' ? goal : cb === 'holy' ? holyGoal : cb === 'throne' ? defender : 0;
  const check = canDeclare(state, game.world, player, target, cb, goalFor);
  const calls = previewCalls(state, game.world, player, target, cb);
  const joining = (side: 'attacker' | 'defender') =>
    calls
      .filter((x) => x.side === side && x.answer === 'join')
      .reduce((n, x) => n + realmStrength(state, x.country), 0);
  const ours = realmStrength(state, player) + joining('attacker');
  const theirs =
    (independence ? realmStrength(state, defender) - realmStrength(state, player) : realmStrength(state, defender)) +
    joining('defender');
  const declare = () => {
    const ok = run(game, cmd.declare(state, game.world, target, cb, goalFor));
    if (ok) {
      const war = state.wars.find((w) => w.attacker === player && w.defender === defender);
      game.ui.set({ modal: 'none' });
      if (war) selectWar(game, war.id);
    }
  };
  const Friends = ({ side }: { side: 'attacker' | 'defender' }) => {
    const list = calls.filter((x) => x.side === side);
    if (!list.length) return null;
    return (
      <div className="call-list">
        <span className="caps">{side === 'attacker' ? 'Your friends' : 'Their friends'}</span>
        <ul>
          {list.map((x) => {
            const c = state.countries[x.country];
            return (
              <li key={x.country} className={`answer-${x.answer}`}>
                <CoatOfArms country={c} size={18} />
                <span>
                  {c.name} <span className="dim small">({CALL_REASON[x.reason].toLowerCase()})</span>
                </span>
                <span className="small call-answer">
                  {ANSWER[x.answer]}
                  {x.why ? `: ${x.why}` : ''}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };
  return (
    <Modal title={independence ? `Independence from ${d.name}` : `War with ${d.name}`} kicker="Declare war">
      <div className="versus">
        <div>
          <CoatOfArms country={me} size={46} />
          <span className="num">{formatMen(ours)} men</span>
        </div>
        <span className="display versus-mark">against</span>
        <div>
          <CoatOfArms country={d} size={46} />
          <span className="num">{formatMen(theirs)} men</span>
        </div>
      </div>
      <p className="dim small">Counting the realms on each side that would answer the call.</p>
      {!independence && defender !== target && (
        <p className="dim">
          {state.countries[target].name} is a vassal: its liege, {d.name}, will defend it with the whole realm.
        </p>
      )}
      <fieldset className="choices">
        <legend className="caps">Cause for war</legend>
        {options.map((o) => (
          <label key={o} className={`choice ${cb === o ? 'active' : ''}`}>
            <input type="radio" name="cb" value={o} checked={cb === o} onChange={() => setCb(o)} />
            <span>
              <span className="choice-name">{CB_INFO[o].name}</span>
              <span className="dim small">{CB_INFO[o].blurb}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {!claims.length && !independence && (
        <p className="dim small">
          No claims on their land yet. Forge one from the panel of a province of theirs on your border.
        </p>
      )}
      {cb === 'claim' && (
        <label className="field">
          <span className="caps">Province to take</span>
          <select value={goal} onChange={(e) => setGoal(Number(e.target.value))}>
            {claims.map((id) => (
              <option key={id} value={id}>
                {placeName(game.state, id)} (development {state.provinces[id].dev})
              </option>
            ))}
          </select>
        </label>
      )}
      {cb === 'holy' && (
        <label className="field">
          <span className="caps">Province to free</span>
          <select value={holyGoal} onChange={(e) => setHolyGoal(Number(e.target.value))}>
            {holy.map((id) => (
              <option key={id} value={id}>
                {placeName(game.state, id)}
                {holySite(id) ? ', a holy site' : ''} (development {state.provinces[id].dev})
              </option>
            ))}
          </select>
        </label>
      )}
      <Friends side="attacker" />
      <Friends side="defender" />
      {!check.ok && <p className="alert">{check.reason}</p>}
      <div className="modal-actions">
        <button className="btn ghost" onClick={() => game.ui.set({ modal: 'none' })}>
          Not now
        </button>
        <button className="btn primary danger" disabled={!check.ok} onClick={declare}>
          <Icon name="crossed-swords" /> Declare war
        </button>
      </div>
    </Modal>
  );
}
