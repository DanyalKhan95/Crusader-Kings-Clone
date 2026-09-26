import { useState } from 'react';
import { formatMen } from '../../render/units';
import * as cmd from '../../sim/commands';
import { realmStrength, topLiege } from '../../sim/queries';
import type { CasusBelli } from '../../sim/types';
import { borderTargets, canDeclare, CB_INFO } from '../../sim/war';
import { run, selectWar } from '../actions';
import { CoatOfArms } from '../CoatOfArms';
import { useGame } from '../game';
import { Icon } from '../Icon';
import { useStore } from '../store';
import { Modal } from './Modal';

export function DeclareWar() {
  const game = useGame();
  const target = useStore(game.ui, (s) => s.dialogCountry);
  const state = game.state;
  const player = state.player;
  const defender = topLiege(state, target);
  const d = state.countries[defender];
  const me = state.countries[player];
  const border = borderTargets(state, game.world, player, target).sort(
    (a, b) => state.provinces[b].dev - state.provinces[a].dev,
  );
  const options: CasusBelli[] = [];
  if (me.throneClaims.includes(defender)) options.push('throne');
  if (border.length) options.push('border');
  options.push('conquest');
  const [cb, setCb] = useState<CasusBelli>(options[0]);
  const [goal, setGoal] = useState<number>(border[0] ?? 0);
  if (!d) return null;
  const check = canDeclare(
    state,
    game.world,
    player,
    target,
    cb,
    cb === 'border' ? goal : cb === 'throne' ? defender : 0,
  );
  const ours = realmStrength(state, player),
    theirs = realmStrength(state, defender);
  const declare = () => {
    const ok = run(game, cmd.declare(state, game.world, target, cb, cb === 'border' ? goal : defender));
    if (ok) {
      const war = state.wars.find((w) => w.attacker === player && w.defender === defender);
      game.ui.set({ modal: 'none' });
      if (war) selectWar(game, war.id);
    }
  };
  return (
    <Modal title={`War with ${d.name}`} kicker="Declare war">
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
      {defender !== target && (
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
      {cb === 'border' && (
        <label className="field">
          <span className="caps">Province to take</span>
          <select value={goal} onChange={(e) => setGoal(Number(e.target.value))}>
            {border.map((id) => (
              <option key={id} value={id}>
                {game.world.region(id).name} (development {state.provinces[id].dev})
              </option>
            ))}
          </select>
        </label>
      )}
      {!check.ok && <p className="alert">{check.reason}</p>}
      <div className="modal-actions">
        <button className="btn ghost" onClick={() => game.ui.set({ modal: 'none' })}>
          Not now
        </button>
        <button className="btn primary" disabled={!check.ok} onClick={declare}>
          <Icon name="crossed-swords" /> Declare war
        </button>
      </div>
    </Modal>
  );
}
