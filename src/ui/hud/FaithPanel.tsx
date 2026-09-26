/** The faith and the peoples of the player's realm: the church, holy places, missions and accepted cultures. */
import { FAITH_HEADS } from '../../data/faiths';
import { LEVEL_LAWS } from '../../data/politics';
import { cultureName, faithColor, faithFamily, faithName, holySites } from '../../sim/beliefs';
import * as cmd from '../../sim/commands';
import { opinion } from '../../sim/diplomacy';
import { income } from '../../sim/economy';
import {
  acceptSlots,
  blessingCost,
  canAcceptCulture,
  canAdoptFaith,
  canAskBlessing,
  cultureShares,
  cultureStanding,
  diversity,
  faithsToAdopt,
  headOf,
} from '../../sim/faith';
import {
  activeHolyWar,
  canCallHolyWar,
  greatHolyWarOf,
  greatHolyWarTarget,
  holyWarLeader,
  nextHolyWarYear,
} from '../../sim/holywars';
import { toDate } from '../../sim/calendar';
import { estateLoyalty } from '../../sim/politics';
import { provincesOf, topLiege } from '../../sim/queries';
import type { Country } from '../../sim/types';
import { run, selectCountry, selectWar } from '../actions';
import { CoatOfArms } from '../CoatOfArms';
import { useGame, type Game } from '../game';
import { Icon } from '../Icon';
import type { IconName } from '../../assets/icons';
import { Swatch } from '../realm';
import { goToProvince } from './SidePanel';
import { OpinionValue } from './DiplomacyPanel';
import { WithTip } from './Tip';

/** The icon of a faith's house of worship. */
export function faithIcon(faith: string): IconName {
  const family = faithFamily(faith);
  return family === 'christian' ? 'church' : family === 'islamic' ? 'samara-mosque' : 'prayer';
}

export function FaithTab({ c }: { c: Country }) {
  return (
    <>
      <StateFaith c={c} />
      <HolyWar c={c} />
      <HolySites c={c} />
      <RealmFaiths c={c} />
      <Peoples c={c} />
    </>
  );
}

function StateFaith({ c }: { c: Country }) {
  const game = useGame();
  const state = game.state;
  const head = headOf(state, c.religion);
  const cost = blessingCost(income(state, c).total);
  const bless = head && head.index !== c.index ? canAskBlessing(state, c, cost) : null;
  const pagan = faithFamily(c.religion) === 'pagan';
  const options = pagan ? faithsToAdopt(state, game.world, c) : [];
  return (
    <section className="sp-section">
      <div className="faith-head">
        <Icon name={faithIcon(c.religion)} />
        <span>
          <span className="display faith-name">
            <Swatch color={faithColor(c.religion)} /> {faithName(c.religion)}
          </span>
          <span className="caps dim small">The faith of the crown</span>
        </span>
      </div>
      {head && head.index === c.index ? (
        <p className="small">
          Your realm holds the headship of the faith: {FAITH_HEADS[c.religion]?.title}. Every realm of the faith thinks
          the better of you for it.
        </p>
      ) : head ? (
        <>
          <span className="caps dim small">Head of the faith: {FAITH_HEADS[c.religion]?.title}</span>
          <div className="diplo-row">
            <button className="diplo-row-main" onClick={() => selectCountry(game, head.index)}>
              <CoatOfArms country={head} size={22} />
              <span className="diplo-row-name">{head.name}</span>
            </button>
            <OpinionValue b={opinion(state, game.world, head.index, c.index)} title={`Opinion of ${head.short}`} />
          </div>
        </>
      ) : (
        <p className="dim small">
          {FAITH_HEADS[c.religion]
            ? `The office of ${FAITH_HEADS[c.religion].title} stands empty.`
            : 'Your faith has no single head on earth.'}
        </p>
      )}
      {bless && (
        <WithTip
          tip={
            <p className="tip-text">
              {bless.ok
                ? `A donation of ${cost} gold to ${head!.name}, for a blessing on your reign: legitimacy +10. Once in ten years.`
                : `${bless.reason}.`}
            </p>
          }
        >
          <button className="btn small" disabled={!bless.ok} onClick={() => run(game, cmd.blessing(state))}>
            <Icon name="pope-crown" /> Ask for a blessing · {cost} gold
          </button>
        </WithTip>
      )}
      {pagan && (
        <div className="adopt">
          <p className="dim small">
            The old gods have no church to anoint a king. Neighbours bring word of other faiths; the crown may take one
            up, and its people will follow in time.
          </p>
          <div className="btn-row">
            {options.map((f) => {
              const check = canAdoptFaith(state, game.world, c, f);
              return (
                <WithTip
                  key={f}
                  tip={
                    <p className="tip-text">
                      {check.ok
                        ? `The ruler is baptised into, or takes up, ${faithName(f)}: legitimacy −20 and stability −2, but the faithful of the wider world will think better of you.`
                        : `${check.reason}.`}
                    </p>
                  }
                >
                  <button
                    className="btn small"
                    disabled={!check.ok}
                    onClick={() => run(game, cmd.adopt(state, game.world, f))}
                  >
                    <Swatch color={faithColor(f)} /> {faithName(f)}
                  </button>
                </WithTip>
              );
            })}
            {!options.length && <p className="dim small">No neighbour of a greater faith borders you yet.</p>}
          </div>
        </div>
      )}
    </section>
  );
}

/** The faith's great holy war: under way, possible, or when it may next be called. */
function HolyWar({ c }: { c: Country }) {
  const game = useGame();
  const state = game.state;
  const def = greatHolyWarOf(c.religion);
  if (!def) return null;
  const war = activeHolyWar(state, def.faith);
  const target = greatHolyWarTarget(state, def);
  const leader = holyWarLeader(state, def);
  const check = leader?.index === c.index ? canCallHolyWar(state, def, c.index) : null;
  const name = def.name.toLowerCase();
  const year = toDate(state.day).y;
  const next = Math.max(nextHolyWarYear(state, def), def.from);
  const when = year < next ? `from ${next}` : 'now';
  let text: string;
  if (war)
    text = war.attackers.includes(c.index)
      ? `You fight in ${war.name} for ${game.world.region(war.goal).name}.`
      : `${war.name} is being fought for ${game.world.region(war.goal).name}, by ${war.attackers.length} realms.`;
  else if (!target) text = `${def.site} is in the hands of the faithful. There is no call for a ${name}.`;
  else {
    const holder = `${def.site} is held by ${state.countries[target.defender].name}.`;
    text = !leader
      ? `${holder} No one may call a ${name} while the headship stands empty.`
      : leader.index === c.index
        ? `${holder} You may call the faithful to a ${name} ${when}.`
        : `${holder} ${leader.name} may call a ${name} ${year < next ? `from ${next}` : 'at any time'}.`;
  }
  return (
    <section className="sp-section">
      <h3 className="section-title">The {name}</h3>
      <p className="small tight">{text}</p>
      {war && (
        <button className="btn small" onClick={() => selectWar(game, war.id)}>
          <Icon name="crossed-swords" /> {war.name}
        </button>
      )}
      {check && !war && (
        <WithTip
          tip={
            <p className="tip-text">
              {check.ok
                ? `Every realm of the faith is called to take the cross against ${state.countries[target!.defender].name}. If they win, the land around ${def.site} is won for the faith.`
                : `${check.reason}.`}
            </p>
          }
        >
          <button
            className="btn small primary danger"
            disabled={!check.ok}
            onClick={() => run(game, cmd.greatHolyWar(state, game.world))}
          >
            <Icon name="crossed-swords" /> Call the faithful to a {name}
          </button>
        </WithTip>
      )}
    </section>
  );
}

function HolySites({ c }: { c: Country }) {
  const game = useGame();
  const state = game.state;
  const sites = holySites(c.religion);
  if (!sites.length) return null;
  const top = topLiege(state, c.index);
  return (
    <section className="sp-section">
      <h3 className="section-title">Holy places</h3>
      <ul className="diplo-list">
        {sites.map((id) => {
          const owner = state.provinces[id]?.owner ?? 0;
          const holder = owner ? state.countries[topLiege(state, owner)] : null;
          const ours = !!holder && holder.index === top;
          const lost = !!holder && faithFamily(holder.religion) !== faithFamily(c.religion);
          return (
            <li key={id} className="diplo-row">
              <button className="diplo-row-main" onClick={() => goToProvince(game, id)}>
                {holder ? <CoatOfArms country={holder} size={22} /> : <Icon name="pine-tree" />}
                <span className="diplo-row-name">{game.world.region(id).name}</span>
                <span className={`diplo-row-what small ${ours ? 'good' : lost ? 'bad' : 'dim'}`}>
                  {ours ? 'yours' : holder ? (lost ? `unbelievers: ${holder.short}` : holder.short) : 'unclaimed'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="dim small">
        Each holy place of your faith within your realm adds 3 legitimacy, up to 10. Realms of your faith resent
        unbelievers who hold them.
      </p>
    </section>
  );
}

function shareList(game: Game, c: Country, key: 'religion' | 'culture') {
  const dev = new Map<string, number>();
  let total = 0;
  for (const id of provincesOf(game.state, c.index)) {
    const p = game.state.provinces[id];
    total += p.dev;
    const v = p[key];
    if (v) dev.set(v, (dev.get(v) ?? 0) + p.dev);
  }
  return [...dev].map(([id, d]) => ({ id, share: d / Math.max(1, total) })).sort((a, b) => b.share - a.share);
}

function ShareBar({ share, color }: { share: number; color: string }) {
  return (
    <>
      <span className="share-bar" aria-hidden="true">
        <span style={{ width: `${Math.max(2, share * 100)}%`, background: color }} />
      </span>
      <span className="num dim small">{share < 0.005 ? '<1%' : `${Math.round(share * 100)}%`}</span>
    </>
  );
}

/** Faiths within the realm, the strife they bring, and the court chaplain's mission. */
function RealmFaiths({ c }: { c: Country }) {
  const game = useGame();
  const state = game.state;
  const faiths = shareList(game, c, 'religion');
  const d = diversity(state, c);
  const strife = estateLoyalty(state, c, 'commons').parts.find((p) => p.label === 'Religious strife');
  const job = c.converting;
  return (
    <section className="sp-section">
      <h3 className="section-title">Faiths of the realm</h3>
      <ul className="shares">
        {faiths.map(({ id, share }) => (
          <li key={id}>
            <span>
              <Swatch color={faithColor(id)} /> {faithName(id)}
            </span>
            <ShareBar share={share} color={faithColor(id)} />
          </li>
        ))}
      </ul>
      <p className="dim small">
        {LEVEL_LAWS.tolerance.levels[c.laws.tolerance]}.{' '}
        {d.sister + d.heathen > 0.005
          ? `Other faiths pay and serve less${strife ? `, and religious strife costs the commons ${Math.round(-strife.value)} loyalty` : ''}. The religious policy is set among the laws.`
          : 'The realm is of one faith.'}
      </p>
      {job ? (
        <div className="construction">
          <Icon name={faithIcon(c.religion)} />
          <span>
            <button className="link" onClick={() => goToProvince(game, job.province)}>
              {game.world.region(job.province).name}
            </button>
            {c.tasks.chaplain === 'convert' ? ': missionaries at work' : ': the mission waits for the chaplain'}
            <span className="bar">
              <span style={{ width: `${Math.min(100, (job.progress / job.needed) * 100)}%` }} />
            </span>
          </span>
          <span className="num dim">{Math.floor((job.progress / job.needed) * 100)}%</span>
        </div>
      ) : (
        d.sister + d.heathen > 0.005 && (
          <p className="dim small">
            Set the court chaplain to send missionaries, or pick a province and send them there.
          </p>
        )
      )}
    </section>
  );
}

/** Peoples of the realm, the cultures accepted as its own, and the steward's schools. */
function Peoples({ c }: { c: Country }) {
  const game = useGame();
  const state = game.state;
  const shares = cultureShares(state, c);
  const slots = acceptSlots(c);
  const job = c.assimilating;
  return (
    <section className="sp-section">
      <h3 className="section-title">
        Peoples of the realm · {c.accepted.length} of {slots} accepted
      </h3>
      <ul className="shares with-actions">
        {shares.map(({ culture, share }) => {
          const color = game.world.world.cultures[culture]?.color ?? '#888888';
          const own = culture === c.culture;
          const accepted = c.accepted.includes(culture);
          const standing = own
            ? 'own'
            : cultureStanding(c, { culture, religion: null, owner: 0, controller: 0, dev: 0, buildings: {} });
          const check = !own && !accepted ? canAcceptCulture(state, c, culture) : null;
          return (
            <li key={culture}>
              <span>
                <Swatch color={color} /> {cultureName(culture)}
                <span className="dim small">
                  {' '}
                  {own ? '· your people' : accepted ? '· accepted' : standing === 'kin' ? '· kindred' : '· foreign'}
                </span>
              </span>
              <ShareBar share={share} color={color} />
              <span className="share-action">
                {accepted && (
                  <button className="btn tiny ghost" onClick={() => run(game, cmd.unaccept(state, culture))}>
                    Revoke
                  </button>
                )}
                {check && share >= 0.05 && (
                  <WithTip
                    tip={
                      <p className="tip-text">
                        {check.ok
                          ? `The ${cultureName(culture)} are counted among your own peoples: they pay and serve in full and stir no unrest. Legitimacy −10.`
                          : `${check.reason}.`}
                      </p>
                    }
                  >
                    <button
                      className="btn tiny"
                      disabled={!check.ok}
                      onClick={() => run(game, cmd.accept(state, culture))}
                    >
                      Accept
                    </button>
                  </WithTip>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {job && (
        <div className="construction">
          <Icon name="scroll-quill" />
          <span>
            <button className="link" onClick={() => goToProvince(game, job.province)}>
              {game.world.region(job.province).name}
            </button>
            {c.tasks.steward === 'assimilate' ? ': schools at work' : ': the schools wait for the steward'}
            <span className="bar">
              <span style={{ width: `${Math.min(100, (job.progress / job.needed) * 100)}%` }} />
            </span>
          </span>
          <span className="num dim">{Math.floor((job.progress / job.needed) * 100)}%</span>
        </div>
      )}
      <p className="dim small">
        {/^[aeiou]/.test(c.rank) ? 'An' : 'A'} {c.rank} may accept {slots} culture{slots === 1 ? '' : 's'} besides its
        own. Kindred peoples cost a little in taxes and levies, foreign ones more; the steward's schools turn them to
        your ways.
      </p>
    </section>
  );
}
