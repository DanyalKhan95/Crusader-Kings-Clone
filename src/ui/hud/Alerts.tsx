/**
 * The alerts, under the date: a row of signs for what needs the player's hand. Each says why, and a
 * click goes where it can be put right; a right-click hides it until something about it changes.
 * Red signs are troubles, green ones chances.
 */
import type { IconName } from '../../assets/icons';
import { SEAT_INFO, alive } from '../../sim/characters';
import { expenses, income } from '../../sim/economy';
import { supplyLimit } from '../../sim/military';
import { lawCooldown } from '../../sim/politics';
import { armySize, isInRealm, topLiege } from '../../sim/queries';
import { COUNCIL_SEATS, type Country, type PeaceTerms, type War } from '../../sim/types';
import { allowedTerms, canDeclare, peaceAcceptance, winnerSide } from '../../sim/war';
import { formatMen } from '../../render/units';
import { flyToProvince, openDeclareWar, openRealmTab, selectArmy, selectWar } from '../actions';
import { useGame, type CountryTab, type Game } from '../game';
import { Icon } from '../Icon';
import { useStore } from '../store';
import { WithTip } from './Tip';

export interface Alert {
  /** what it is about: hiding lasts until this changes */
  key: string;
  icon: IconName;
  title: string;
  lines: string[];
  tone: 'bad' | 'good';
  /** what a click does */
  action: string;
  onClick: () => void;
}

const openTab = (game: Game, tab: CountryTab) => openRealmTab(game, tab);

/** The terms that would end a war as it was declared: the goal, and no more. */
function goalTerms(game: Game, war: War): PeaceTerms | null {
  const side = winnerSide(war, game.state.player);
  const allowed = allowedTerms(game.state, war, side);
  if (allowed.throne) return { provinces: [], gold: 0, throne: true };
  if (allowed.independence) return { provinces: [], gold: 0, independence: true };
  if (allowed.demands) return { provinces: [], gold: 0, demands: true };
  if (allowed.crush) return { provinces: [], gold: 0, crush: true };
  if (allowed.holyLand) return { provinces: [], gold: 0, holyLand: true };
  const goal = game.state.provinces[war.goal];
  const enemies = side === 'attacker' ? war.defenders : war.attackers;
  if (allowed.land && goal && enemies.includes(goal.owner)) return { provinces: [war.goal], gold: 0 };
  return null;
}

/** Everything that needs the player now, most pressing first. */
export function alertsFor(game: Game): Alert[] {
  const { state, world } = game;
  const me: Country | undefined = state.countries[state.player];
  if (!me?.alive) return [];
  const out: Alert[] = [];

  // Rebels in arms, and factions of vassals.
  const rebels = state.countries.filter((c) => c?.alive && c.rebel?.realm === me.index);
  if (rebels.length) {
    const war = state.wars.find((w) => rebels.some((r) => w.attacker === r!.index));
    out.push({
      key: `rebels:${rebels.map((r) => r!.index).join(',')}`,
      icon: 'fist',
      title: rebels.length === 1 ? 'Rebels in arms' : `${rebels.length} revolts`,
      lines: rebels.map((r) => r!.name),
      tone: 'bad',
      action: 'See the war',
      onClick: () => (war ? selectWar(game, war.id) : openTab(game, 'laws')),
    });
  }
  const faction = state.factions.find((f) => f.realm === me.index);
  if (faction)
    out.push({
      key: `faction:${faction.id}`,
      icon: 'angry-eyes',
      title: 'A faction of vassals',
      lines: [
        `${faction.members.length} ${faction.members.length === 1 ? 'vassal has' : 'vassals have'} banded together against the crown.`,
      ],
      tone: 'bad',
      action: 'Open the laws and estates',
      onClick: () => openTab(game, 'laws'),
    });

  // The treasury.
  const inc = income(state, me).total;
  const balance = inc - expenses(state, me, inc).total;
  const treasury: string[] = [];
  if (me.gold < 0) treasury.push('The treasury is empty.');
  else if (balance < 0 && me.gold / -balance < 12)
    treasury.push(
      `At ${Math.round(balance)} a month, the gold runs out in ${Math.max(1, Math.floor(me.gold / -balance))} months.`,
    );
  if (me.loans.length) {
    const interest = me.loans.reduce((s, l) => s + l.interest, 0);
    treasury.push(
      `${me.loans.length} ${me.loans.length === 1 ? 'loan costs' : 'loans cost'} ${interest.toFixed(1)} gold a month.`,
    );
  }
  if (treasury.length)
    out.push({
      key: `treasury:${me.gold < 0}:${me.loans.length}`,
      icon: 'coins-pile',
      title: me.gold < 0 || balance < 0 ? 'The treasury runs dry' : 'Debts',
      lines: treasury,
      tone: 'bad',
      action: 'Open the treasury',
      onClick: () => openTab(game, 'treasury'),
    });

  // Armies too large for the land to feed.
  const hungry = state.armies.filter(
    (a) =>
      a.owner === me.index &&
      world.region(a.location).kind === 'land' &&
      armySize(a) > supplyLimit(state, world, a.location),
  );
  if (hungry.length)
    out.push({
      key: `supply:${hungry.map((a) => a.id).join(',')}`,
      icon: 'bread',
      title: hungry.length === 1 ? 'An army is starving' : `${hungry.length} armies are starving`,
      lines: hungry.map(
        (a) =>
          `${a.name}: ${formatMen(armySize(a))} men where ${world.region(a.location).name} feeds ${formatMen(supplyLimit(state, world, a.location))}`,
      ),
      tone: 'bad',
      action: 'Go to the army',
      onClick: () => {
        selectArmy(game, hungry[0].id);
        flyToProvince(game, hungry[0].location, 1.2);
      },
    });

  // Council seats empty or idle.
  const council: string[] = [];
  for (const seat of COUNCIL_SEATS)
    if (!alive(state, me.council[seat])) council.push(`No ${SEAT_INFO[seat].name.toLowerCase()} sits on the council.`);
  if (me.tasks.spymaster === 'network' && !me.spyTarget) council.push('The spymaster has no realm to spy on.');
  if (me.tasks.chancellor === 'claims' && !me.fabricating)
    council.push('The chancellor searches the archives, but no claim is being forged.');
  if (me.tasks.chaplain === 'convert' && !me.converting) council.push('The chaplain has no province left to convert.');
  if (me.tasks.steward === 'assimilate' && !me.assimilating)
    council.push('The steward has no province left to school.');
  if (council.length)
    out.push({
      key: `council:${council.join('|')}`,
      icon: 'organigram',
      title: 'The council is idle',
      lines: council,
      tone: 'bad',
      action: 'Open the court',
      onClick: () => openTab(game, 'court'),
    });

  // Peace offers, and wars that could be ended on our terms.
  const offer = state.offers.find((o) => o.to === me.index);
  if (offer)
    out.push({
      key: `offer:${offer.id}`,
      icon: 'tied-scroll',
      title: 'An offer awaits an answer',
      lines: [`${state.countries[offer.from]?.name ?? 'A realm'} awaits your answer.`],
      tone: 'good',
      action: 'Read it',
      onClick: () => game.ui.set({ modal: 'offer', speed: 0 }),
    });
  for (const war of state.wars) {
    if (war.attacker !== me.index && war.defender !== me.index) continue;
    const terms = goalTerms(game, war);
    if (!terms || !peaceAcceptance(state, world, war, me.index, terms).accept) continue;
    const enemy = state.countries[war.attacker === me.index ? war.defender : war.attacker];
    out.push({
      key: `peace:${war.id}`,
      icon: 'peace-dove',
      title: 'A war won at the table',
      lines: [`${enemy?.name ?? 'The enemy'} would give up what ${war.name} was fought for.`],
      tone: 'good',
      action: 'See the war',
      onClick: () => selectWar(game, war.id),
    });
  }

  // Claims ready to press.
  const ready = me.claims.filter((id) => {
    const owner = state.provinces[id]?.owner;
    if (!owner || isInRealm(state, owner, topLiege(state, me.index))) return false;
    return canDeclare(state, world, me.index, owner, 'claim', id).ok;
  });
  if (ready.length)
    out.push({
      key: `claims:${ready.join(',')}`,
      icon: 'wax-seal',
      title: ready.length === 1 ? 'A claim to press' : `${ready.length} claims to press`,
      lines: ready.map((id) => `${world.region(id).name}, held by ${state.countries[state.provinces[id].owner]?.name}`),
      tone: 'good',
      action: 'Declare war for it',
      onClick: () => openDeclareWar(game, topLiege(state, state.provinces[ready[0]].owner), ready[0]),
    });

  // Laws that may change again.
  if (lawCooldown(state, me) === 0)
    out.push({
      key: `laws:${me.lawChanged}`,
      icon: 'scales',
      title: 'The laws may change',
      lines: ['Five years have passed since the laws last changed.'],
      tone: 'good',
      action: 'Open the laws',
      onClick: () => openTab(game, 'laws'),
    });

  return out;
}

export function Alerts() {
  const game = useGame();
  useStore(game.ui, (s) => s.tick);
  const hidden = useStore(game.ui, (s) => s.hiddenAlerts);
  const alerts = alertsFor(game).filter((a) => !hidden.includes(a.key));
  if (!alerts.length) return null;
  return (
    <ul className="alerts" aria-label="Alerts">
      {alerts.map((a) => (
        <li key={a.key}>
          <WithTip
            className="alert-tip"
            tip={
              <div className="breakdown">
                <div className="breakdown-title caps">{a.title}</div>
                {a.lines.map((l) => (
                  <p key={l} className="tip-text">
                    {l}
                  </p>
                ))}
                <p className="tip-text dim">Click: {a.action.toLowerCase()}. Right-click: hide it.</p>
              </div>
            }
          >
            <button
              className={`alert-sign ${a.tone}`}
              aria-label={a.title}
              onClick={a.onClick}
              onContextMenu={(e) => {
                e.preventDefault();
                // Only the alerts still standing stay hidden; the rest may return when they come again.
                const standing = new Set(alertsFor(game).map((x) => x.key));
                const kept = game.ui.get().hiddenAlerts.filter((k) => standing.has(k));
                game.ui.set({ hiddenAlerts: [...kept, a.key] });
              }}
            >
              <Icon name={a.icon} />
            </button>
          </WithTip>
        </li>
      ))}
    </ul>
  );
}
