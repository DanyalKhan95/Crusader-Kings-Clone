import type { ReactNode } from 'react';
import type { IconName } from '../../assets/icons';
import { relationTo, RELATION_INFO } from '../../game/mapModes';
import { toDate } from '../../sim/calendar';
import * as cmd from '../../sim/commands';
import {
  canIntegrate,
  canJoinCoalition,
  canPropose,
  claimsOn,
  coalitionAgainst,
  coalitionBalance,
  coalitionOf,
  giftCost,
  hasPact,
  integrationSpeed,
  loyalty,
  memory,
  opinion,
  pactWillingness,
  PACT_INFO,
  REBEL_LOYALTY,
} from '../../sim/diplomacy';
import type { Breakdown } from '../../sim/economy';
import { income } from '../../sim/economy';
import { atWar, hasTruce, lordOf, topLiege, tributariesOf, vassalsOf, warsOf } from '../../sim/queries';
import { estateName } from '../../sim/politics';
import { DEMAND_INFO } from '../../sim/revolts';
import type { Country, PactKind } from '../../sim/types';
import { scoreFor } from '../../sim/war';
import { formatMen } from '../../render/units';
import { openDeclareWar, run, selectCountry, selectWar } from '../actions';
import { CoatOfArms } from '../CoatOfArms';
import { formatDate } from '../format';
import { useGame } from '../game';
import { Icon } from '../Icon';
import { goToProvince } from './SidePanel';
import { BreakdownList, fmtSigned, WithTip } from './Tip';

/** A number coloured by whether it is friendly, with its reasons on hover. */
export function OpinionValue({ b, title }: { b: Breakdown; title: string }) {
  const v = Math.round(b.total);
  return (
    <WithTip tip={<BreakdownList title={title} b={b} digits={0} />} className="opinion">
      <span className={`num ${v < 0 ? 'bad' : v > 0 ? 'good' : ''}`}>{fmtSigned(v, 0)}</span>
    </WithTip>
  );
}

function Chip({ icon, children, tone }: { icon: IconName; children: ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <li className={`fact-chip ${tone ?? ''}`}>
      <Icon name={icon} />
      <span>{children}</span>
    </li>
  );
}

function CountryLink({ c, size = 16 }: { c: Country; size?: number }) {
  const game = useGame();
  return (
    <button className="chip with-coa" onClick={() => selectCountry(game, c.index)}>
      <CoatOfArms country={c} size={size} />
      {c.short}
    </button>
  );
}

export const PACT_ICON: Record<PactKind, IconName> = {
  alliance: 'shaking-hands',
  nap: 'wax-seal',
  access: 'open-gate',
  guarantee: 'checked-shield',
};

/** Proposes a treaty; the button shows whether they would say yes, and the tip says why. */
function PactButton({ kind, target, label }: { kind: PactKind; target: number; label: string }) {
  const game = useGame();
  const state = game.state;
  const check = canPropose(state, kind, state.player, target);
  const will =
    kind === 'guarantee' || !check.ok ? null : pactWillingness(state, game.world, kind, target, state.player);
  const yes = !will || will.total >= 0;
  const tip = !check.ok ? (
    <p className="tip-text">{check.reason}.</p>
  ) : (
    <>
      <p className="tip-text">{PACT_INFO[kind].blurb}</p>
      {will && (
        <>
          <BreakdownList title="How they weigh it" b={will} digits={0} />
          <p className={`tip-text ${yes ? 'good' : 'bad'}`}>{yes ? 'They would accept.' : 'They would refuse.'}</p>
        </>
      )}
    </>
  );
  return (
    <WithTip tip={tip}>
      <button
        className="btn small"
        disabled={!check.ok}
        onClick={() => run(game, cmd.proposePact(state, game.world, kind, target))}
      >
        <Icon name={PACT_ICON[kind]} /> {label}
        {will && <span className={`will ${yes ? 'good' : 'bad'}`}>{yes ? 'yes' : 'no'}</span>}
      </button>
    </WithTip>
  );
}

function CancelButton({ kind, target, label }: { kind: PactKind; target: number; label: string }) {
  const game = useGame();
  return (
    <WithTip
      tip={
        <p className="tip-text">
          {kind === 'access' ? 'Ends the right of passage.' : 'They will remember that you broke faith with them.'}
        </p>
      }
    >
      <button className="btn small ghost" onClick={() => run(game, cmd.cancelTreaty(game.state, kind, target))}>
        {label}
      </button>
    </WithTip>
  );
}

// ── A foreign realm ───────────────────────────────────────────────

/** Opinions, treaties and what you can do with a realm that is not yours. */
export function ForeignDiplomacy({ c }: { c: Country }) {
  const game = useGame();
  const state = game.state;
  const world = game.world;
  const player = state.player;
  if (!player || !c.alive || c.index === player) return null;
  if (c.rebel) {
    const realm = state.countries[c.rebel.realm];
    return (
      <section className="diplomacy">
        <p className="alert">
          <Icon name="tattered-banner" />
          <span>
            A revolt of the {estateName(realm, c.rebel.estate).toLowerCase()} against <CountryLink c={realm} />,
            demanding {DEMAND_INFO[c.rebel.demand]}. When it ends, its land returns to the crown.
          </span>
        </p>
      </section>
    );
  }
  const me = state.countries[player];
  const top = topLiege(state, c.index);
  const t = state.countries[top];
  const myTop = topLiege(state, player);
  const rel = relationTo(state, player, c.index);
  const war = atWar(state, player, c.index);
  const truce = state.truces.find(
    (x) => ((x.a === myTop && x.b === top) || (x.b === myTop && x.a === top)) && x.until > state.day,
  );
  const theirView = opinion(state, world, c.index, player);
  const ourView = opinion(state, world, player, c.index);
  const ae = memory(state, top, myTop, 'ae');
  const ourClaims = claimsOn(state, player, top).length;
  const theirClaims = claimsOn(state, top, myTop).length;
  const coalitionVsUs = coalitionAgainst(state, myTop)?.members.includes(top);
  const inCoalition = coalitionAgainst(state, top)?.members.includes(player);
  const ourAe = memory(state, player, top, 'ae');
  const cost = giftCost(income(state, c).total);
  const isVassal = c.liege === player,
    isTributary = c.overlord === player,
    isLord = lordOf(state, player) === c.index;
  const foreign = !isVassal && !isTributary && !isLord && top !== myTop;
  return (
    <section className="diplomacy">
      {war && <p className="alert war">We are at war with {c.name}.</p>}
      <div className="opinions">
        <div>
          <span className="caps">Their opinion of us</span>
          <OpinionValue b={theirView} title={`${c.short} thinks of us`} />
        </div>
        <div>
          <span className="caps">Ours of them</span>
          <OpinionValue b={ourView} title={`We think of ${c.short}`} />
        </div>
        {(isVassal || isTributary) && (
          <div>
            <span className="caps">Loyalty</span>
            <OpinionValue b={loyalty(state, world, c.index)} title="Loyalty to us" />
          </div>
        )}
      </div>
      <ul className="fact-chips">
        {rel !== 'neutral' && rel !== 'war' && (
          <Chip icon="flying-flag" tone={rel === 'coalition' ? 'bad' : 'good'}>
            {RELATION_INFO[rel].name}
          </Chip>
        )}
        {hasPact(state, 'access', top, myTop) && <Chip icon="open-gate">They let our armies pass</Chip>}
        {hasPact(state, 'access', myTop, top) && <Chip icon="open-gate">We let their armies pass</Chip>}
        {hasPact(state, 'guarantee', myTop, top) && <Chip icon="checked-shield">We guarantee them</Chip>}
        {hasPact(state, 'guarantee', top, myTop) && <Chip icon="checked-shield">They guarantee us</Chip>}
        {truce && <Chip icon="peace-dove">Truce until {formatDate(toDate(truce.until))}</Chip>}
        {me.throneClaims.includes(top) && <Chip icon="crown">We claim their throne</Chip>}
        {t.throneClaims.includes(myTop) && (
          <Chip icon="crown" tone="bad">
            They claim our throne
          </Chip>
        )}
        {ourClaims > 0 && (
          <Chip icon="scroll-quill">
            We claim {ourClaims} of their province{ourClaims > 1 ? 's' : ''}
          </Chip>
        )}
        {theirClaims > 0 && (
          <Chip icon="scroll-quill" tone="bad">
            They claim {theirClaims} of ours
          </Chip>
        )}
        {ae < -1 && (
          <Chip icon="angry-eyes" tone="bad">
            Wary of our conquests ({Math.round(ae)})
          </Chip>
        )}
        {coalitionVsUs && (
          <Chip icon="rally-the-troops" tone="bad">
            In the coalition against us
          </Chip>
        )}
      </ul>

      {top !== c.index && !isVassal && (
        <p className="dim small">
          {c.name} is a vassal of <CountryLink c={t} />. Treaties and wars are made with its liege.
        </p>
      )}

      <div className="diplo-actions">
        {isVassal && <VassalActions c={c} />}
        {isTributary && (
          <button className="btn small" onClick={() => run(game, cmd.releaseSubject(state, c.index))}>
            <Icon name="breaking-chain" /> Release them
          </button>
        )}
        {isLord && (
          <button className="btn small" onClick={() => openDeclareWar(game, c.index)}>
            <Icon name="breaking-chain" /> Fight for independence
          </button>
        )}
        {foreign && top === c.index && !war && (
          <>
            {hasPact(state, 'alliance', player, top) ? (
              <CancelButton kind="alliance" target={top} label="Break the alliance" />
            ) : (
              <PactButton kind="alliance" target={top} label="Propose an alliance" />
            )}
            {hasPact(state, 'nap', player, top) ? (
              <CancelButton kind="nap" target={top} label="End the pact" />
            ) : (
              <PactButton kind="nap" target={top} label="Non-aggression pact" />
            )}
            {hasPact(state, 'access', top, player) ? (
              <CancelButton kind="access" target={top} label="Give up access" />
            ) : (
              <PactButton kind="access" target={top} label="Ask for military access" />
            )}
            {hasPact(state, 'access', player, top) && (
              <CancelButton kind="access" target={top} label="Revoke their access" />
            )}
            {hasPact(state, 'guarantee', player, top) ? (
              <CancelButton kind="guarantee" target={top} label="Withdraw the guarantee" />
            ) : (
              <PactButton kind="guarantee" target={top} label="Guarantee their independence" />
            )}
          </>
        )}
        {!war && (
          <WithTip tip={<p className="tip-text">They will think better of you for years. Costs {cost} gold.</p>}>
            <button className="btn small" disabled={me.gold < cost} onClick={() => run(game, cmd.gift(state, c.index))}>
              <Icon name="present" /> Send a gift · {cost}
            </button>
          </WithTip>
        )}
        {foreign && !war && ourAe <= -25 && !inCoalition && <CoalitionJoin target={top} />}
        {inCoalition && (
          <button className="btn small ghost" onClick={() => run(game, cmd.leaveCoalitionAgainst(state, top))}>
            Leave the coalition
          </button>
        )}
      </div>
      {foreign && !war && (
        <button
          className="btn primary danger"
          disabled={hasTruce(state, myTop, top)}
          onClick={() => openDeclareWar(game, c.index)}
        >
          <Icon name="crossed-swords" /> Declare war
        </button>
      )}
    </section>
  );
}

function CoalitionJoin({ target }: { target: number }) {
  const game = useGame();
  const check = canJoinCoalition(game.state, game.state.player, target);
  return (
    <WithTip
      tip={
        <p className="tip-text">
          {check.ok
            ? 'Stand with those who fear them. When the coalition is strong enough, it goes to war together.'
            : `${check.reason}.`}
        </p>
      }
    >
      <button
        className="btn small"
        disabled={!check.ok}
        onClick={() => run(game, cmd.joinCoalitionAgainst(game.state, target))}
      >
        <Icon name="rally-the-troops" /> Join the coalition against them
      </button>
    </WithTip>
  );
}

function VassalActions({ c }: { c: Country }) {
  const game = useGame();
  const state = game.state;
  const me = state.countries[state.player];
  const integrating = me.integrating?.vassal === c.index ? me.integrating : null;
  if (integrating) {
    const months = Math.ceil((integrating.needed - integrating.progress) / integrationSpeed(state, me));
    return (
      <div className="integration">
        <span className="small">
          Integrating: {Math.floor((integrating.progress / integrating.needed) * 100)}%, about {months} months left
        </span>
        <span className="bar">
          <span style={{ width: `${(integrating.progress / integrating.needed) * 100}%` }} />
        </span>
        <button className="btn small ghost" onClick={() => run(game, cmd.stopIntegration(state))}>
          Stop
        </button>
      </div>
    );
  }
  const check = canIntegrate(state, game.world, state.player, c.index);
  return (
    <>
      <WithTip
        tip={
          <p className="tip-text">
            {check.ok
              ? 'Their lands become yours, slowly, as your ruler and chancellor win over their lords. They will like it less while it lasts.'
              : `${check.reason}.`}
          </p>
        }
      >
        <button
          className="btn small"
          disabled={!check.ok}
          onClick={() => run(game, cmd.integrate(state, game.world, c.index))}
        >
          <Icon name="crossed-chains" /> Integrate
        </button>
      </WithTip>
      <button className="btn small ghost" onClick={() => run(game, cmd.releaseSubject(state, c.index))}>
        <Icon name="breaking-chain" /> Release
      </button>
    </>
  );
}

// ── The player's own realm ────────────────────────────────────────

function Row({ c, children, onClick }: { c: Country; children?: ReactNode; onClick?: () => void }) {
  const game = useGame();
  return (
    <li className="diplo-row">
      <button className="diplo-row-main" onClick={onClick ?? (() => selectCountry(game, c.index))}>
        <CoatOfArms country={c} size={22} />
        <span className="diplo-row-name">{c.name}</span>
      </button>
      {children}
    </li>
  );
}

/** Wars, treaties, subjects, claims and coalitions of the player's realm. */
export function DiplomacyTab({ c }: { c: Country }) {
  const game = useGame();
  const state = game.state;
  const world = game.world;
  const wars = warsOf(state, c.index);
  const truces = state.truces.filter((t) => (t.a === c.index || t.b === c.index) && t.until > state.day);
  const pacts = state.pacts.filter((p) => p.a === c.index || p.b === c.index);
  const lord = lordOf(state, c.index);
  const subjects = [...vassalsOf(state, c.index), ...tributariesOf(state, c.index)];
  const against = coalitionAgainst(state, c.index);
  const joined = coalitionOf(state, c.index);
  const wary = state.countries
    .filter((o) => o?.alive && o.index !== c.index)
    .map((o) => ({ o, ae: memory(state, o.index, c.index, 'ae') }))
    .filter((x) => x.ae <= -5)
    .sort((a, b) => a.ae - b.ae)
    .slice(0, 5);
  const pactLabel = (p: (typeof pacts)[number]) => {
    if (p.kind === 'access') return p.a === c.index ? 'May march through our land' : 'Lets us march through';
    if (p.kind === 'guarantee') return p.a === c.index ? 'Under our protection' : 'Protects us';
    return PACT_INFO[p.kind].name;
  };
  return (
    <>
      <section className="sp-section">
        <h3 className="section-title">Wars · {wars.length}</h3>
        {wars.length ? (
          <ul className="war-list">
            {wars.map((w) => {
              const score = scoreFor(state, w, c.index);
              return (
                <li key={w.id}>
                  <button className="war-row" onClick={() => selectWar(game, w.id)}>
                    <Icon name="crossed-swords" />
                    <span className="war-row-name">{w.name}</span>
                    <span className={`num ${score < 0 ? 'bad' : 'good'}`}>{fmtSigned(score, 0)}%</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="dim small">The realm is at peace. Declare war from the panel of another realm.</p>
        )}
      </section>

      {lord > 0 && (
        <section className="sp-section">
          <h3 className="section-title">{c.liege ? 'Our liege' : 'Our overlord'}</h3>
          <ul className="diplo-list">
            <Row c={state.countries[lord]}>
              <OpinionValue b={loyalty(state, world, c.index)} title="Our loyalty to them" />
            </Row>
          </ul>
          <p className="dim small">
            {c.liege
              ? 'We owe them a quarter of our taxes and follow them to war.'
              : 'We pay them tribute, and may not make alliances of our own.'}{' '}
            Below {REBEL_LOYALTY} loyalty, a subject that feels strong enough rises.
          </p>
        </section>
      )}

      <section className="sp-section">
        <h3 className="section-title">Treaties · {pacts.length}</h3>
        {pacts.length ? (
          <ul className="diplo-list">
            {pacts.map((p) => {
              const other = state.countries[p.a === c.index ? p.b : p.a];
              return (
                <Row key={`${p.kind}:${p.a}:${p.b}`} c={other}>
                  <span className="diplo-row-what small dim">
                    <Icon name={PACT_ICON[p.kind]} /> {pactLabel(p)}
                  </span>
                </Row>
              );
            })}
          </ul>
        ) : (
          <p className="dim small">No treaties. Propose them from the panel of another realm.</p>
        )}
      </section>

      {subjects.length > 0 && (
        <section className="sp-section">
          <h3 className="section-title">Subjects · {subjects.length}</h3>
          <ul className="diplo-list">
            {subjects.map((s) => {
              const l = loyalty(state, world, s.index);
              return (
                <Row key={s.index} c={s}>
                  <span className="diplo-row-what small dim">{s.liege ? 'Vassal' : 'Tributary'}</span>
                  <OpinionValue b={l} title={`Loyalty of ${s.short}`} />
                </Row>
              );
            })}
          </ul>
          {c.integrating && (
            <p className="dim small">
              Integrating {state.countries[c.integrating.vassal]?.name}:{' '}
              {Math.floor((c.integrating.progress / c.integrating.needed) * 100)}%
            </p>
          )}
        </section>
      )}

      <ClaimsSection c={c} />

      {(against || joined.length > 0) && (
        <section className="sp-section">
          <h3 className="section-title">Coalitions</h3>
          {against && <CoalitionBox target={c.index} />}
          {joined.map((co) => (
            <p key={co.id} className="small">
              We stand with {co.members.length - 1} other{co.members.length === 2 ? '' : 's'} against{' '}
              <CountryLink c={state.countries[co.target]} />.
            </p>
          ))}
        </section>
      )}

      {wary.length > 0 && (
        <section className="sp-section">
          <h3 className="section-title">Wary of our conquests</h3>
          <ul className="diplo-list">
            {wary.map(({ o, ae }) => (
              <Row key={o.index} c={o}>
                <span className="num bad">{Math.round(ae)}</span>
              </Row>
            ))}
          </ul>
          <p className="dim small">
            At −40 a realm that fears us joins a coalition against us. The fear fades by a little each month.
          </p>
        </section>
      )}

      {truces.length > 0 && (
        <section className="sp-section">
          <h3 className="section-title">Truces</h3>
          <ul className="ranked">
            {truces.map((t, i) => {
              const other = state.countries[t.a === c.index ? t.b : t.a];
              return (
                <li key={i} className="ranked-row static">
                  <span>{other?.name}</span>
                  <span className="dim small">until {formatDate(toDate(t.until))}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}

function CoalitionBox({ target }: { target: number }) {
  const game = useGame();
  const state = game.state;
  const co = coalitionAgainst(state, target);
  if (!co) return null;
  const bal = coalitionBalance(state, target);
  return (
    <div className="alert coalition">
      <Icon name="rally-the-troops" />
      <div>
        <p className="small">
          {co.members.length} realm{co.members.length > 1 ? 's' : ''} stand together against us:
        </p>
        <ul className="chips">
          {co.members.map((m) => (
            <li key={m}>
              <CountryLink c={state.countries[m]} />
            </li>
          ))}
        </ul>
        <p className="small dim">
          They could muster {formatMen(bal.coalition)} men against our {formatMen(bal.target)} with allies. They strike
          once they are a tenth stronger.
        </p>
      </div>
    </div>
  );
}

function ClaimsSection({ c }: { c: Country }) {
  const game = useGame();
  const state = game.state;
  const f = c.fabricating;
  if (!c.claims.length && !f) return null;
  return (
    <section className="sp-section">
      <h3 className="section-title">Claims · {c.claims.length}</h3>
      {f && (
        <div className="construction">
          <Icon name="scroll-quill" />
          <span>
            Forging a claim on {game.world.region(f.province).name}
            <span className="bar">
              <span style={{ width: `${Math.min(100, ((state.day - f.start) / (f.done - f.start)) * 100)}%` }} />
            </span>
          </span>
          <span className="num dim">{f.done - state.day} days</span>
          <button className="btn small ghost" onClick={() => run(game, cmd.cancelFabrication(state))}>
            Stop
          </button>
        </div>
      )}
      {c.claims.length > 0 && (
        <ul className="ranked">
          {c.claims.map((id) => {
            const owner = state.countries[state.provinces[id]?.owner ?? 0];
            return (
              <li key={id}>
                <button className="ranked-row" onClick={() => goToProvince(game, id)}>
                  <span>{game.world.region(id).name}</span>
                  <span className="dim small">{owner?.short}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="dim small">
        A claim is a just cause for war, and claimed land costs half as much at the peace table.
      </p>
    </section>
  );
}
