import { useMemo, useState, type ReactNode } from 'react';
import * as cmd from '../../sim/commands';
import { cultureName, faithName } from '../../sim/beliefs';
import { alliesOf, PACT_INFO } from '../../sim/diplomacy';
import { REPARATIONS } from '../../sim/economy';
import { greatHolyWarOf, holyLandOf } from '../../sim/holywars';
import { provincesOf, realmStrength } from '../../sim/queries';
import type { PeaceTerms } from '../../sim/types';
import { releasable } from '../../sim/revolts';
import {
  allowedTerms,
  claimsToRenounce,
  HUMILIATION,
  offerCost,
  peaceAcceptance,
  REPARATION_TERMS,
  scoreFor,
  winnerSide,
} from '../../sim/war';
import { formatMen } from '../../render/units';
import { CoatOfArms } from '../CoatOfArms';
import { run } from '../actions';
import { useGame } from '../game';
import { Icon } from '../Icon';
import { useStore } from '../store';
import { BreakdownList, fmtSigned } from '../hud/Tip';
import { Modal } from './Modal';
import { placeName } from '../../sim/places';

type Flag =
  | 'throne'
  | 'tributary'
  | 'independence'
  | 'settle'
  | 'holyLand'
  | 'vassal'
  | 'convert'
  | 'humiliate'
  | 'breakAlliances'
  | 'renounce';

/** A term of peace to tick, with what it does and what it costs on its own. */
function Choice({
  on,
  set,
  name,
  cost,
  children,
}: {
  on: boolean;
  set: (v: boolean) => void;
  name: string;
  cost?: number;
  children: ReactNode;
}) {
  return (
    <label className={`choice ${on ? 'active' : ''}`}>
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />
      <span>
        <span className="choice-name">
          {name}
          {cost !== undefined && <span className="choice-cost num"> {Math.round(cost)}%</span>}
        </span>
        <span className="dim small">{children}</span>
      </span>
    </label>
  );
}

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
  const [flags, setFlags] = useState<Partial<Record<Flag, boolean>>>({});
  const [freed, setFreed] = useState<string[]>([]);
  const [reparations, setReparations] = useState(0);
  const [white, setWhite] = useState(false);
  if (!war) return null;
  const enemyLeader = state.countries[side === 'attacker' ? war.defender : war.attacker];
  const me = state.countries[player];
  const score = scoreFor(state, war, player);
  const allowed = allowedTerms(state, war, side);
  const claimed = new Set(me?.claims ?? []);
  const peoples = allowed.release ? releasable(state, enemyLeader).slice(0, 8) : [];
  const renounce = allowed.renounce ? claimsToRenounce(state, war, side) : null;
  const flag = (f: Flag) => !!flags[f];
  const setFlag = (f: Flag) => (v: boolean) =>
    setFlags((old) => ({
      ...old,
      [f]: v,
      // A vassal pays no tribute, and a tributary is no vassal.
      ...(v && f === 'vassal' ? { tributary: false } : {}),
      ...(v && f === 'tributary' ? { vassal: false } : {}),
    }));
  const terms: PeaceTerms = white
    ? { provinces: [], gold: 0, white: true }
    : {
        provinces: picked,
        gold,
        throne: allowed.throne && flag('throne'),
        tributary: allowed.tributary && flag('tributary'),
        independence: allowed.independence && flag('independence'),
        demands: allowed.demands && flag('settle'),
        crush: allowed.crush && flag('settle'),
        holyLand: allowed.holyLand && flag('holyLand'),
        vassal: allowed.vassal && flag('vassal'),
        convert: allowed.convert && flag('convert'),
        humiliate: allowed.humiliate && flag('humiliate'),
        breakAlliances: allowed.breakAlliances && flag('breakAlliances'),
        renounce: allowed.renounce && flag('renounce'),
        ...(allowed.release && freed.length ? { release: freed } : {}),
        ...(allowed.reparations && reparations ? { reparations } : {}),
      };
  /** What one term would cost on its own. */
  const alone = (extra: Partial<PeaceTerms>) =>
    offerCost(state, game.world, war, side, { provinces: [], gold: 0, ...extra });
  const cost = white ? 0 : offerCost(state, game.world, war, side, terms);
  const answer = peaceAcceptance(state, game.world, war, player, terms);
  const empty =
    !white &&
    !picked.length &&
    !gold &&
    !terms.throne &&
    !terms.tributary &&
    !terms.independence &&
    !terms.demands &&
    !terms.crush &&
    !terms.holyLand &&
    !terms.vassal &&
    !terms.convert &&
    !terms.humiliate &&
    !terms.breakAlliances &&
    !terms.renounce &&
    !terms.release?.length &&
    !terms.reparations;
  const maxGold = Math.max(0, Math.floor(enemyLeader.gold));
  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const free = (culture: string) =>
    setFreed((f) => (f.includes(culture) ? f.filter((x) => x !== culture) : [...f, culture]));
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
          {allowed.throne && (
            <Choice on={flag('throne')} set={setFlag('throne')} name="Take the crown" cost={alone({ throne: true })}>
              Your ruler becomes ruler of {enemyLeader.name}, and your lands join it.
            </Choice>
          )}
          {allowed.independence && (
            <Choice
              on={flag('independence')}
              set={setFlag('independence')}
              name="Independence"
              cost={alone({ independence: true })}
            >
              You answer to {enemyLeader.name} no longer.
            </Choice>
          )}
          {(allowed.demands || allowed.crush) && (
            <Choice
              on={flag('settle')}
              set={setFlag('settle')}
              name={
                allowed.crush ? 'Crush the revolt' : war.demand === 'nation' ? 'Independence' : 'Our demands are met'
              }
              cost={alone(allowed.crush ? { crush: true } : { demands: true })}
            >
              {allowed.crush
                ? 'The rebels lay down their arms and their land returns to the crown.'
                : war.demand === 'nation'
                  ? 'The land you hold becomes a nation of its own.'
                  : 'The crown gives way, and the land returns to it.'}
            </Choice>
          )}
          {allowed.holyLand && <HolyLandChoice checked={flag('holyLand')} onChange={setFlag('holyLand')} />}
          {allowed.vassal && (
            <Choice
              on={flag('vassal')}
              set={setFlag('vassal')}
              name="Make them our vassal"
              cost={alone({ vassal: true })}
            >
              {enemyLeader.name} swears fealty to you: its land joins your realm, it gives up its treaties and its other
              wars, and in time you may integrate it. The neighbours will be alarmed.
            </Choice>
          )}
          {allowed.tributary && (
            <Choice
              on={flag('tributary')}
              set={setFlag('tributary')}
              name="Make them pay tribute"
              cost={alone({ tributary: true })}
            >
              {enemyLeader.name} pays you 15% of its taxes, gives up its alliances, and calls on you when attacked. It
              will resent it.
            </Choice>
          )}
          {allowed.spoils && allowed.land && (
            <fieldset className="choices">
              <legend className="caps">Provinces to take</legend>
              {candidates.length ? (
                <ul className="peace-provinces">
                  {candidates.map((id) => (
                    <li key={id}>
                      <label className={`choice compact ${picked.includes(id) ? 'active' : ''}`}>
                        <input type="checkbox" checked={picked.includes(id)} onChange={() => toggle(id)} />
                        <span className="choice-name">{placeName(game.state, id)}</span>
                        <span className="dim small num">
                          dev {state.provinces[id].dev}
                          {id === war.goal ? ' · war goal' : ''}
                          {claimed.has(id) ? ' · claimed' : ''}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="dim small">You hold none of their land. Occupy provinces to demand them.</p>
              )}
            </fieldset>
          )}
          {peoples.length > 0 && (
            <fieldset className="choices">
              <legend className="caps">Peoples to set free</legend>
              <ul className="peace-provinces">
                {peoples.map((g) => (
                  <li key={g.culture}>
                    <label className={`choice compact ${freed.includes(g.culture) ? 'active' : ''}`}>
                      <input type="checkbox" checked={freed.includes(g.culture)} onChange={() => free(g.culture)} />
                      <span className="choice-name">The {cultureName(g.culture)}</span>
                      <span className="dim small num">
                        {g.provinces.length} {g.provinces.length === 1 ? 'province' : 'provinces'} · dev {g.dev}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <p className="dim small">Each people becomes a realm of its own, grateful to you.</p>
            </fieldset>
          )}
          {allowed.convert && (
            <Choice
              on={flag('convert')}
              set={setFlag('convert')}
              name="Force a change of faith"
              cost={alone({ convert: true })}
            >
              The crown of {enemyLeader.name} takes up the {faithName(me.religion)} faith. Its people keep their own,
              and will resent it.
            </Choice>
          )}
          {allowed.humiliate && (
            <Choice
              on={flag('humiliate')}
              set={setFlag('humiliate')}
              name="Humiliate them"
              cost={alone({ humiliate: true })}
            >
              Their crown loses {HUMILIATION.loser} legitimacy and yours gains {HUMILIATION.winner}. They will not
              forget it.
            </Choice>
          )}
          {allowed.reparations && (
            <fieldset className="choices">
              <legend className="caps">Reparations</legend>
              <div className="segmented" role="radiogroup" aria-label="Reparations">
                {[0, ...REPARATION_TERMS.map((r) => r.years)].map((y) => (
                  <button
                    key={y}
                    type="button"
                    role="radio"
                    aria-checked={reparations === y}
                    onClick={() => setReparations(y)}
                  >
                    {y ? `${y} years · ${Math.round(alone({ reparations: y }))}%` : 'None'}
                  </button>
                ))}
              </div>
              <p className="dim small">
                {enemyLeader.name} pays you {Math.round(REPARATIONS * 100)}% of its taxes every month, unless you go to
                war again.
              </p>
            </fieldset>
          )}
          {allowed.breakAlliances && (
            <Choice
              on={flag('breakAlliances')}
              set={setFlag('breakAlliances')}
              name="Break their alliances"
              cost={alone({ breakAlliances: true })}
            >
              {enemyLeader.name} gives up its alliances with{' '}
              {alliesOf(state, enemyLeader.index)
                .map((i) => state.countries[i]?.short)
                .join(', ')}
              .
            </Choice>
          )}
          {renounce && (
            <Choice
              on={flag('renounce')}
              set={setFlag('renounce')}
              name="Renounce their claims"
              cost={alone({ renounce: true })}
            >
              {enemyLeader.name} gives up{' '}
              {[
                renounce.provinces.length
                  ? `${renounce.provinces.length} ${renounce.provinces.length === 1 ? 'claim' : 'claims'} on your side’s land`
                  : '',
                renounce.thrones.length ? 'its claim on your crown' : '',
              ]
                .filter(Boolean)
                .join(' and ')}
              .
            </Choice>
          )}
          {allowed.spoils && (
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
          )}
        </>
      )}
      <p className={`alert ${answer.accept && !empty ? 'good' : ''}`}>
        {empty
          ? 'Choose what to demand, or offer a white peace.'
          : answer.accept
            ? `They will accept. ${answer.reason}.`
            : `They will refuse. ${answer.reason}.`}
      </p>
      {!empty && answer.why.parts.length > 0 && (
        <BreakdownList title="How they weigh it" b={answer.why} digits={0} more="rule:peace" />
      )}
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

/** The goal of a great holy war: the land around the holy city, for a new kingdom or for the leader. */
function HolyLandChoice({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const game = useGame();
  const war = game.state.wars.find((w) => w.id === game.ui.get().selectedWar);
  if (!war) return null;
  const def = greatHolyWarOf(war.faith);
  const land = holyLandOf(game.state, game.world, war).map((id) => placeName(game.state, id));
  return (
    <label className={`choice ${checked ? 'active' : ''}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="choice-name">Free the Holy Land</span>
        <span className="dim small">
          {land.join(', ')}{' '}
          {def?.kingdom
            ? `become the ${def.kingdom.name}, a new realm of the faith.`
            : 'pass to the leader of the war.'}
        </span>
      </span>
    </label>
  );
}

/** An AI proposal waiting for the player's answer: peace terms, a call to arms, or a treaty. */
export function Offer() {
  const game = useGame();
  const state = game.state;
  const offer = state.offers.find((o) => o.to === state.player);
  if (!offer) return null;
  const from = state.countries[offer.from];
  const answer = (accept: boolean) => {
    run(game, cmd.answerOffer(state, game.world, offer.id, accept));
    game.ui.set({ modal: 'none' });
  };
  if (offer.kind === 'pact') {
    const info = PACT_INFO[offer.pact];
    const what =
      offer.pact === 'access'
        ? `${from.name} asks for leave to march its armies through your land.`
        : offer.pact === 'alliance'
          ? `${from.name} offers an alliance: each to defend the other, and to answer when called to war.`
          : `${from.name} offers a pact: neither of you will declare war on the other.`;
    return (
      <Modal
        title={
          offer.pact === 'access'
            ? `${from.name} asks for military access`
            : offer.pact === 'alliance'
              ? `${from.name} proposes an alliance`
              : `${from.name} proposes a non-aggression pact`
        }
        kicker="Diplomacy"
        onClose={() => answer(false)}
      >
        <div className="offer-from">
          <CoatOfArms country={from} size={46} />
          <p>{what}</p>
        </div>
        <p className="dim small">{info.blurb}</p>
        <div className="modal-actions">
          <button className="btn" onClick={() => answer(false)}>
            Decline
          </button>
          <button className="btn primary" onClick={() => answer(true)}>
            <Icon name="shaking-hands" /> Accept
          </button>
        </div>
      </Modal>
    );
  }
  if (offer.kind === 'ultimatum') return <Ultimatum />;
  const war = state.wars.find((w) => w.id === offer.war);
  if (offer.kind === 'call' && war?.cb === 'crusade') {
    const enemy = state.countries[war.defender];
    return (
      <Modal title={war.name} kicker="The call of the faith" onClose={() => answer(false)}>
        <div className="offer-from">
          <CoatOfArms country={from} size={46} />
          <p>
            {from.name} calls every realm of the faith to take the cross and free {placeName(game.state, war.goal)} from{' '}
            {enemy.name}, who can raise {formatMen(realmStrength(state, enemy.index))} men. {war.attackers.length}{' '}
            realms have answered so far.
          </p>
        </div>
        <p className="dim small">
          If the faithful win, the land around the holy city is theirs, and every realm that fought gains 10 legitimacy.
          No treaty binds you: staying at home costs nothing.
        </p>
        <div className="modal-actions">
          <button className="btn" onClick={() => answer(false)}>
            Stay at home
          </button>
          <button className="btn primary danger" onClick={() => answer(true)}>
            <Icon name="crossed-swords" /> Take the cross
          </button>
        </div>
      </Modal>
    );
  }
  if (offer.kind === 'call') {
    const enemy = war ? state.countries[war.attackers.includes(offer.from) ? war.defender : war.attacker] : null;
    return (
      <Modal title={`${from.name} calls you to arms`} kicker={war?.name} onClose={() => answer(false)}>
        <div className="offer-from">
          <CoatOfArms country={from} size={46} />
          <p>
            {from.name} is at war with {enemy?.name ?? 'its enemies'} and asks you to honour your word. They field{' '}
            {formatMen(realmStrength(state, from.index))} men; the enemy{' '}
            {formatMen(enemy ? realmStrength(state, enemy.index) : 0)}.
          </p>
        </div>
        <p className="alert">If you refuse, the treaty that binds you ends, and {from.name} will not forget it.</p>
        <div className="modal-actions">
          <button className="btn" onClick={() => answer(false)}>
            Refuse
          </button>
          <button className="btn primary danger" onClick={() => answer(true)}>
            <Icon name="crossed-swords" /> Join the war
          </button>
        </div>
      </Modal>
    );
  }
  const t = offer.terms;
  const items: string[] = [];
  if (t.white) items.push('A white peace: everyone keeps what they had.');
  if (t.throne) items.push(`Their ruler takes your crown, and ${from.name} joins your realm under them.`);
  if (t.independence) items.push(`${from.name} goes free.`);
  if (t.vassal) items.push(`You swear fealty to ${from.name}: your realm becomes its vassal.`);
  if (t.tributary) items.push(`You pay tribute to ${from.name}, and give up your alliances.`);
  if (t.holyLand && war) items.push(`You give up the land around ${placeName(game.state, war.goal)}.`);
  for (const id of t.provinces) items.push(`You cede ${placeName(game.state, id)}.`);
  for (const culture of t.release ?? []) items.push(`You set the ${cultureName(culture)} free, with their land.`);
  if (t.convert) items.push(`Your crown takes up the ${faithName(from.religion)} faith.`);
  if (t.humiliate) items.push(`You are humiliated: your crown loses ${HUMILIATION.loser} legitimacy.`);
  if (t.reparations)
    items.push(`You pay ${from.name} ${Math.round(REPARATIONS * 100)}% of your taxes for ${t.reparations} years.`);
  if (t.breakAlliances) items.push('You give up your alliances.');
  if (t.renounce) items.push(`You give up your claims on ${from.name} and its allies.`);
  if (t.gold) items.push(`You pay ${Math.round(t.gold)} gold.`);
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

/** Vassals united in a faction demand their freedom. */
function Ultimatum() {
  const game = useGame();
  const state = game.state;
  const offer = state.offers.find((o) => o.to === state.player && o.kind === 'ultimatum');
  if (!offer || offer.kind !== 'ultimatum') return null;
  const answer = (accept: boolean) => {
    run(game, cmd.answerOffer(state, game.world, offer.id, accept));
    game.ui.set({ modal: 'none' });
  };
  const members = offer.members.map((m) => state.countries[m]).filter((c) => c?.alive);
  const theirs = members.reduce((n, c) => n + realmStrength(state, c.index), 0);
  const ours = realmStrength(state, state.player) - theirs;
  return (
    <Modal title="Your vassals demand their freedom" kicker="An ultimatum" onClose={() => answer(false)}>
      <p>
        {members.map((c) => c.name).join(', ')} {members.length > 1 ? 'have' : 'has'} lost faith in the crown. Free
        them, or they will take their freedom by the sword.
      </p>
      <ul className="chips">
        {members.map((c) => (
          <li key={c.index} className="chip with-coa">
            <CoatOfArms country={c} size={16} />
            {c.short}
          </li>
        ))}
      </ul>
      <p className="dim small">
        They can raise {formatMen(theirs)} men; the rest of the realm {formatMen(ours)}.
      </p>
      <div className="modal-actions">
        <button className="btn" onClick={() => answer(true)}>
          <Icon name="breaking-chain" /> Grant their freedom
        </button>
        <button className="btn primary danger" onClick={() => answer(false)}>
          <Icon name="crossed-swords" /> Refuse, and fight
        </button>
      </div>
    </Modal>
  );
}
