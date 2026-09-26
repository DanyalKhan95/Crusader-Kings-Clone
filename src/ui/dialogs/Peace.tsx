import { useMemo, useState } from 'react';
import * as cmd from '../../sim/commands';
import { provincesOf } from '../../sim/queries';
import type { PeaceTerms } from '../../sim/types';
import { peaceAcceptance, peaceCost, scoreFor, winnerSide } from '../../sim/war';
import { run } from '../actions';
import { useGame } from '../game';
import { Icon } from '../Icon';
import { useStore } from '../store';
import { fmtSigned } from '../hud/Tip';
import { Modal } from './Modal';

/** Terms of peace for a war the player leads. */
export function Peace() {
  const game = useGame();
  const warId = useStore(game.ui, (s) => s.selectedWar);
  const state = game.state;
  const war = state.wars.find((w) => w.id === warId);
  const player = state.player;
  const side = war ? winnerSide(war, player) : 'attacker';
  const enemies = war ? (side === 'attacker' ? war.defenders : war.attackers) : [];
  const allies = war ? (side === 'attacker' ? war.attackers : war.defenders) : [];
  const candidates = useMemo(() => {
    if (!war) return [];
    const list: number[] = [];
    for (const e of enemies)
      for (const id of provincesOf(state, e))
        if (allies.includes(state.provinces[id].controller) || id === war.goal) list.push(id);
    return list.sort((a, b) => state.provinces[b].dev - state.provinces[a].dev);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [war?.id]);
  const [picked, setPicked] = useState<number[]>([]);
  const [gold, setGold] = useState(0);
  const [throne, setThrone] = useState(false);
  const [white, setWhite] = useState(false);
  if (!war) return null;
  const enemyLeader = state.countries[side === 'attacker' ? war.defender : war.attacker];
  const score = scoreFor(state, war, player);
  const terms: PeaceTerms = white ? { provinces: [], gold: 0, white: true } : { provinces: picked, gold, throne };
  const cost = white ? 0 : peaceCost(state, war, side, terms);
  const answer = peaceAcceptance(state, war, player, terms);
  const empty = !white && !picked.length && !gold && !throne;
  const maxGold = Math.max(0, Math.floor(enemyLeader.gold));
  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const send = () => {
    if (run(game, cmd.offerPeace(state, game.world, war.id, terms))) game.ui.set({ modal: 'none', panel: 'country' });
  };
  return (
    <Modal title={`Peace with ${enemyLeader.name}`} kicker={war.name} wide>
      <div className="peace-score">
        <span className="caps">Our war score</span>
        <span className={`num big ${score < 0 ? 'bad' : 'good'}`}>{fmtSigned(score, 0)}%</span>
        <span className="caps">These terms cost</span>
        <span className="num big">{Math.round(cost)}%</span>
      </div>
      <label className={`choice ${white ? 'active' : ''}`}>
        <input type="checkbox" checked={white} onChange={(e) => setWhite(e.target.checked)} />
        <span>
          <span className="choice-name">White peace</span>
          <span className="dim small">Everyone keeps what they had before the war.</span>
        </span>
      </label>
      {!white && (
        <>
          {war.cb === 'throne' && side === 'attacker' && (
            <label className={`choice ${throne ? 'active' : ''}`}>
              <input type="checkbox" checked={throne} onChange={(e) => setThrone(e.target.checked)} />
              <span>
                <span className="choice-name">Take the crown</span>
                <span className="dim small">
                  Your ruler becomes ruler of {enemyLeader.name}, and your lands join it.
                </span>
              </span>
            </label>
          )}
          <fieldset className="choices">
            <legend className="caps">Provinces to take</legend>
            {candidates.length ? (
              <ul className="peace-provinces">
                {candidates.map((id) => (
                  <li key={id}>
                    <label className={`choice compact ${picked.includes(id) ? 'active' : ''}`}>
                      <input type="checkbox" checked={picked.includes(id)} onChange={() => toggle(id)} />
                      <span className="choice-name">{game.world.region(id).name}</span>
                      <span className="dim small num">
                        dev {state.provinces[id].dev}
                        {id === war.goal ? ' · war goal' : ''}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dim small">You hold none of their land. Occupy provinces to demand them.</p>
            )}
          </fieldset>
          <label className="field">
            <span className="caps">
              Gold: <span className="num">{gold}</span> of {maxGold}
            </span>
            <input
              type="range"
              min={0}
              max={maxGold}
              step={10}
              value={gold}
              onChange={(e) => setGold(Number(e.target.value))}
            />
          </label>
        </>
      )}
      <p className={`alert ${answer.accept ? 'good' : ''}`}>
        {empty
          ? 'Choose what to demand, or offer a white peace.'
          : answer.accept
            ? `They will accept. ${answer.reason}.`
            : `They will refuse. ${answer.reason}.`}
      </p>
      <div className="modal-actions">
        <button className="btn ghost" onClick={() => game.ui.set({ modal: 'none' })}>
          Keep fighting
        </button>
        <button className="btn primary" disabled={empty || !answer.accept} onClick={send}>
          <Icon name="peace-dove" /> Send the offer
        </button>
      </div>
    </Modal>
  );
}

/** An AI proposal waiting for the player's answer. */
export function Offer() {
  const game = useGame();
  const state = game.state;
  const offer = state.offers.find((o) => o.to === state.player);
  if (!offer) return null;
  const war = state.wars.find((w) => w.id === offer.war);
  const from = state.countries[offer.from];
  const t = offer.terms;
  const items: string[] = [];
  if (t.white) items.push('A white peace: everyone keeps what they had.');
  if (t.throne) items.push(`Their ruler takes your crown, and ${from.name} joins your realm under them.`);
  for (const id of t.provinces) items.push(`You cede ${game.world.region(id).name}.`);
  if (t.gold) items.push(`You pay ${Math.round(t.gold)} gold.`);
  const answer = (accept: boolean) => {
    run(game, cmd.answerOffer(state, game.world, offer.id, accept));
    game.ui.set({ modal: 'none' });
  };
  return (
    <Modal title={`${from.name} proposes peace`} kicker={war?.name} onClose={() => answer(false)}>
      <ul className="offer-terms">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
      <div className="modal-actions">
        <button className="btn" onClick={() => answer(false)}>
          Refuse
        </button>
        <button className="btn primary" onClick={() => answer(true)}>
          <Icon name="peace-dove" /> Accept
        </button>
      </div>
    </Modal>
  );
}
