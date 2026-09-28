/** The navy and the new lands: fleets and their orders, shipyards, transports, colonies and the unknown. */
import { shipDef, TRANSPORT_CAPACITY, transportCost } from '../../data/ships';
import { formatMen } from '../../render/units';
import { character, skill } from '../../sim/characters';
import { canColonise, colonialRange, colonisedBy, colonists, COLONY_UPKEEP, natives } from '../../sim/colonies';
import * as cmd from '../../sim/commands';
import { knownCount } from '../../sim/exploration';
import { pathDays } from '../../sim/movement';
import {
  availableShips,
  blockades,
  canBuildShips,
  fleetById,
  fleetInBattle,
  fleetPower,
  fleetSize,
  fleetsOf,
  freeTransport,
  inPort,
  isOpenOcean,
  navalBattleAt,
  navyUpkeep,
  oceanGoing,
  shipLook,
  shipyards,
  transportCapacity,
} from '../../sim/naval';
import { atWar } from '../../sim/queries';
import { militaryEra } from '../../sim/tech';
import type { Country, ShipType } from '../../sim/types';
import type { RegionData } from '../../shared/dataTypes';
import { flyToProvince, run, selectCountry, selectFleet } from '../actions';
import { CoatOfArms } from '../CoatOfArms';
import { useGame } from '../game';
import { Icon } from '../Icon';
import { Portrait, Skills } from '../people';
import { cultureName } from '../realm';
import { WithTip } from './Tip';
import { placeName } from '../../sim/places';

// ── A fleet ───────────────────────────────────────────────────────

export function FleetView({ id }: { id: number }) {
  const game = useGame();
  const state = game.state;
  const world = game.world;
  const fleet = fleetById(state, id);
  if (!fleet) return <p className="sp-body dim">This fleet is no more.</p>;
  const owner = state.countries[fleet.owner];
  const mine = fleet.owner === state.player;
  const hostile = !mine && atWar(state, fleet.owner, state.player);
  const admiral = character(state, fleet.admiral);
  const here = world.region(fleet.location);
  const fighting = fleetInBattle(state, fleet);
  const docked = inPort(world, fleet);
  const dest = fleet.path.at(-1);
  const blockading = here.kind !== 'land' ? here.adj.filter(([n]) => blockades(state).get(n) === fleet.owner) : [];
  const days = dest ? pathDays(world, fleet.location, fleet.path, true) - fleet.progress : 0;
  let status: string;
  const hereName = placeName(state, fleet.location);
  if (fighting) status = `Fighting in the ${hereName}`;
  else if (fleet.retreating && dest) status = `Making for port at ${placeName(state, dest)}`;
  else if (fleet.mission === 'explore')
    status = dest ? `Charting the unknown, bound for the ${placeName(state, dest)}` : 'Charting the unknown';
  else if (dest) status = `Sailing to ${world.region(dest).kind === 'land' ? '' : 'the '}${placeName(state, dest)}`;
  else if (docked) status = `In port at ${hereName}`;
  else if (blockading.length)
    status = `Blockading ${blockading.length} ${blockading.length === 1 ? 'province' : 'provinces'} from the ${hereName}`;
  else status = `At sea in the ${hereName}`;
  const others = state.fleets.filter((f) => f !== fleet && f.owner === fleet.owner && f.location === fleet.location);
  const era = militaryEra(owner);
  return (
    <div className="sp-body">
      <div className="sp-head">
        <p className={`caps sp-kicker ${hostile ? 'bad' : ''}`}>
          {mine ? 'Your fleet' : hostile ? 'Enemy fleet' : 'Fleet'}
        </p>
        <h2 className="display sp-title">{fleet.name}</h2>
        <p className="sp-sub">
          {status}
          {dest && !fighting ? `, ${Math.max(1, Math.round(days))} days` : ''}
        </p>
      </div>
      <button className="holder" onClick={() => selectCountry(game, owner.index)}>
        <CoatOfArms country={owner} size={30} />
        <span className="holder-text">
          <span className="caps holder-label">Flying the colours of</span>
          <span className="holder-name">{owner.name}</span>
        </span>
      </button>
      <div className="army-stats">
        <div>
          <span className="caps">Ships</span>
          <span className="num big">{Math.round(fleetSize(fleet))}</span>
        </div>
        <div>
          <span className="caps">Morale</span>
          <span className="bar morale">
            <span style={{ width: `${fleet.morale * 100}%` }} />
          </span>
        </div>
        <div>
          <span className="caps">Strength</span>
          <span className="num">{Math.round(fleetPower(state, fleet))}</span>
        </div>
      </div>
      <section className="sp-section">
        <h3 className="section-title">Admiral</h3>
        {admiral && admiral.died === undefined ? (
          <div className="person with-portrait">
            <Portrait c={admiral} role={admiral.id === owner.ruler ? 'ruler' : 'commander'} size={46} />
            <div className="person-body">
              <div className="person-head">
                <span className="person-name">{admiral.name}</span>
                <span className="dim person-age">Martial {skill(admiral, 'mar')}</span>
              </div>
              <Skills c={admiral} highlight="mar" />
            </div>
          </div>
        ) : (
          <p className="dim small">No one commands this fleet.</p>
        )}
      </section>
      <section className="sp-section">
        <h3 className="section-title">Ships</h3>
        <ul className="units">
          {(Object.entries(fleet.ships) as [ShipType, number][])
            .filter(([, n]) => n >= 0.5)
            .map(([t, n]) => {
              const look = shipLook(owner, t);
              const d = shipDef(t, era);
              return (
                <li key={t} title={`${look.blurb} Guns ${d.attack.toFixed(1)}, hull ${d.hull.toFixed(0)} a ship.`}>
                  <Icon name={look.icon} />
                  <span>{look.name}</span>
                  <span className="num">{Math.round(n)}</span>
                </li>
              );
            })}
        </ul>
      </section>
      {mine && (
        <div className="army-actions">
          <button
            className="btn primary"
            disabled={fighting || fleet.retreating}
            onClick={() => game.ui.set({ orderMode: true })}
            title="Or right-click a sea or one of your ports"
          >
            <Icon name="ship-wheel" /> Sail
          </button>
          <WithTip
            tip={
              <p className="tip-text">
                {oceanGoing(owner)
                  ? 'The fleet sails on its own to the nearest waters your realm has not charted, and reports what it finds.'
                  : 'The fleet charts the unknown coasts within reach. Until your realm has Cartography, its ships keep within sight of land.'}
              </p>
            }
          >
            <button
              className="btn"
              disabled={fighting}
              aria-pressed={fleet.mission === 'explore'}
              onClick={() => run(game, cmd.explore(state, fleet.id, fleet.mission !== 'explore'))}
            >
              <Icon name="compass" /> {fleet.mission === 'explore' ? 'Stop exploring' : 'Explore'}
            </button>
          </WithTip>
          <button
            className="btn"
            disabled={fighting || docked}
            onClick={() => run(game, cmd.returnToPort(state, world, fleet.id))}
          >
            <Icon name="anchor" /> To port
          </button>
          <button
            className="btn"
            disabled={fighting || fleetSize(fleet) < 2}
            onClick={() => run(game, cmd.splitFleetInTwo(state, world, fleet.id))}
          >
            Split
          </button>
          <button
            className="btn"
            disabled={!others.length || fighting}
            onClick={() => run(game, cmd.mergeFleetsHere(state, [fleet.id, ...others.map((f) => f.id)]))}
          >
            Merge
          </button>
          <button
            className="btn ghost"
            disabled={fighting}
            onClick={() => run(game, cmd.disbandFleetCmd(state, fleet.id))}
          >
            Pay off
          </button>
        </div>
      )}
      {fighting && <SeaBattleBox zone={fleet.location} />}
      <button className="link" onClick={() => flyToProvince(game, fleet.location, 0.8)}>
        Show on the map
      </button>
    </div>
  );
}

function SeaBattleBox({ zone }: { zone: number }) {
  const game = useGame();
  const battle = navalBattleAt(game.state, zone);
  if (!battle) return null;
  const ships = (ids: number[]) =>
    ids.reduce((s, id) => {
      const f = fleetById(game.state, id);
      return s + (f ? fleetSize(f) : 0);
    }, 0);
  const a = game.state.countries[battle.attacker.country],
    d = game.state.countries[battle.defender.country];
  return (
    <section className="sp-section battle-box">
      <h3 className="section-title">Battle of the {placeName(game.state, zone)}</h3>
      <div className="battle-sides">
        <div>
          <CoatOfArms country={a} size={26} />
          <span className="num">{Math.round(ships(battle.attacker.fleets))} ships</span>
          <span className="dim small">lost {Math.round(battle.attacker.losses)}</span>
        </div>
        <span className="caps dim">against</span>
        <div>
          <CoatOfArms country={d} size={26} />
          <span className="num">{Math.round(ships(battle.defender.fleets))} ships</span>
          <span className="dim small">lost {Math.round(battle.defender.losses)}</span>
        </div>
      </div>
    </section>
  );
}

/** Fleets lying in a province's port or sailing a sea. */
export function FleetsHere({ id }: { id: number }) {
  const game = useGame();
  const fleets = game.state.fleets.filter((f) => f.location === id && fleetSize(f) >= 0.5);
  if (!fleets.length) return null;
  const land = game.world.region(id).kind === 'land';
  return (
    <section className="sp-section">
      <h3 className="section-title">{land ? 'Fleets in port' : 'Fleets here'}</h3>
      <ul className="army-list">
        {fleets.map((f) => {
          const owner = game.state.countries[f.owner];
          const hostile = atWar(game.state, f.owner, game.state.player);
          return (
            <li key={f.id}>
              <button className={`army-row ${hostile ? 'hostile' : ''}`} onClick={() => selectFleet(game, f.id)}>
                <CoatOfArms country={owner} size={18} />
                <span className="army-row-name">{f.name}</span>
                <span className="num">{Math.round(fleetSize(f))} ships</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── Shipyards and transports ──────────────────────────────────────

/** Warships built in one of the player's ports, and the realm's transports. */
export function Shipyard({ id }: { id: number }) {
  const game = useGame();
  const state = game.state;
  const c = state.countries[state.player];
  const p = state.provinces[id];
  if (!c || p?.owner !== c.index || !game.world.region(id).coastal) return null;
  const era = militaryEra(c);
  const blockader = blockades(state).get(id);
  return (
    <section className="sp-section">
      <h3 className="section-title">Shipyard</h3>
      {blockader && (
        <p className="alert">
          <Icon name="anchor" /> Blockaded by {state.countries[blockader]?.name}: no ship can be launched, and its trade
          suffers.
        </p>
      )}
      <ul className="recruit">
        {availableShips(c).map((t) => {
          const look = shipLook(c, t);
          const d = shipDef(t, era);
          const one = canBuildShips(state, game.world, c, id, t, 1);
          const five = canBuildShips(state, game.world, c, id, t, 5);
          return (
            <li key={t}>
              <Icon name={look.icon} />
              <span className="recruit-text" title={look.blurb}>
                <span>{look.name}</span>
                <span className="dim small">
                  guns {d.attack.toFixed(1)} · hull {d.hull.toFixed(0)} · upkeep {d.upkeep.toFixed(2)}
                </span>
              </span>
              <button
                className="btn small"
                disabled={!one.ok}
                title={one.ok ? 'Build one' : one.reason}
                onClick={() => run(game, cmd.buildWarships(state, game.world, id, t, 1))}
              >
                {d.cost} <Icon name="coins" />
              </button>
              <button
                className="btn small"
                disabled={!five.ok}
                title={five.ok ? 'Build five' : five.reason}
                onClick={() => run(game, cmd.buildWarships(state, game.world, id, t, 5))}
              >
                ×5
              </button>
            </li>
          );
        })}
      </ul>
      <TransportRow c={c} />
    </section>
  );
}

function TransportRow({ c }: { c: Country }) {
  const game = useGame();
  const state = game.state;
  const era = militaryEra(c);
  const look = shipLook(c, 'transport');
  const cost = Math.round(transportCost(era) * 10);
  const mine = c.index === state.player;
  return (
    <div className="transport-row">
      <Icon name={look.icon} />
      <span className="recruit-text" title={look.blurb}>
        <span>
          {Math.floor(c.transports)} {look.name.toLowerCase()} as transports
        </span>
        <span className="dim small">
          carry {formatMen(transportCapacity(c))} men, {TRANSPORT_CAPACITY[era]} a ship ·{' '}
          {formatMen(Math.max(0, freeTransport(state, game.world, c.index)))} free
        </span>
      </span>
      {mine && (
        <button
          className="btn small"
          disabled={c.gold < cost || !shipyards(state, game.world, c).length}
          title="Build ten transports"
          onClick={() => run(game, cmd.buildTransportShips(state, game.world, 10))}
        >
          +10 · {cost} <Icon name="coins" />
        </button>
      )}
    </div>
  );
}

/** The realm's navy, for the military tab. */
export function NavySection({ c }: { c: Country }) {
  const game = useGame();
  const state = game.state;
  const fleets = fleetsOf(state, c.index);
  const upkeep = navyUpkeep(state, c);
  const coast = shipyards(state, game.world, c).length > 0;
  if (!coast && !fleets.length && !c.transports) return null;
  return (
    <section className="sp-section">
      <h3 className="section-title">
        Navy · {fleets.length} {fleets.length === 1 ? 'fleet' : 'fleets'}
      </h3>
      {fleets.length > 0 && (
        <ul className="army-list">
          {fleets.map((f) => (
            <li key={f.id}>
              <button className="army-row" onClick={() => selectFleet(game, f.id)}>
                <Icon name={shipLook(c, 'heavy').icon} />
                <span className="army-row-name">
                  {f.name}
                  <span className="dim small"> · {placeName(game.state, f.location)}</span>
                </span>
                <span className="num">{Math.round(fleetSize(f))}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <TransportRow c={c} />
      <p className="dim small">
        Armies cross the sea only on transports, and enemy warships that catch them at sea sink men and ships. Warships
        and transports cost {(upkeep.fleets + upkeep.transports).toFixed(1)} gold a month.
        {c.index === state.player && coast ? ' Build warships in the shipyard of any of your ports.' : ''}
      </p>
    </section>
  );
}

// ── Colonies ──────────────────────────────────────────────────────

/** Land no realm rules: its natives, who is settling it, and founding a colony there. */
export function ColonySection({ id }: { id: number }) {
  const game = useGame();
  const state = game.state;
  const r = game.world.region(id);
  const p = state.provinces[id];
  if (!p || p.owner || r.kind !== 'land' || r.impassable) return null;
  const me = state.countries[state.player];
  const n = natives(state, game.world, id);
  const settler = colonisedBy(state, id);
  const job = settler?.colonies.find((m) => m.province === id);
  const check = me && !settler ? canColonise(state, game.world, me, id) : null;
  return (
    <section className="sp-section">
      <h3 className="section-title">Colonisation</h3>
      <p className="dim small">
        {n
          ? `Some ${n * 1000} ${p.culture ? cultureName(game, p.culture) : 'native'} people live here. They slow settlers, and may attack them.`
          : 'No one lives here. Settlers would bring their own ways.'}
      </p>
      {settler && job && (
        <div className="construction">
          <Icon name="wood-cabin" />
          <span>
            {settler.index === state.player ? 'Your colonists are settling it' : `${settler.name} is settling it`}
            <span className="bar">
              <span style={{ width: `${Math.min(100, (job.progress / job.needed) * 100)}%` }} />
            </span>
          </span>
          <span className="num dim">{job.needed - job.progress} months</span>
        </div>
      )}
      {settler?.index === state.player && (
        <button className="btn small ghost" onClick={() => run(game, cmd.abandonColonyCmd(state, id))}>
          Abandon the colony
        </button>
      )}
      {check && me && (
        <WithTip
          tip={
            <p className="tip-text">
              {check.ok
                ? `A colony takes about ${check.months} months and ${COLONY_UPKEEP} gold a month; then the land is yours. You have ${colonists(me) - me.colonies.length} of ${colonists(me)} colonists free, and may settle coasts up to ${colonialRange(me).toLocaleString('en-US')} km from your land.`
                : `${check.reason}.`}
            </p>
          }
        >
          <button
            className="btn small"
            disabled={!check.ok}
            onClick={() => run(game, cmd.colonise(state, game.world, id))}
          >
            <Icon name="wood-cabin" /> Found a colony{check.ok ? ` · ${check.cost}` : ''}
            {check.ok && <Icon name="coins" />}
          </button>
        </WithTip>
      )}
    </section>
  );
}

/** Colonies being founded, and the colonial nations that govern the realm's lands over the sea. */
export function ColoniesSection({ c }: { c: Country }) {
  const game = useGame();
  const state = game.state;
  const nations = state.countries.filter((x) => x?.alive && x.liege === c.index && x.colony);
  if (!c.colonies.length && !nations.length) return null;
  return (
    <section className="sp-section">
      <h3 className="section-title">
        Colonies · {c.colonies.length} of {colonists(c)} colonists at work
      </h3>
      {c.colonies.length > 0 && (
        <ul className="ranked">
          {c.colonies.map((m) => (
            <li key={m.province}>
              <button className="ranked-row" onClick={() => flyToProvince(game, m.province, 1)}>
                <span>{placeName(game.state, m.province)}</span>
                <span className="num dim">
                  {m.progress} of {m.needed} months
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {nations.length > 0 && (
        <ul className="chips">
          {nations.map((v) => (
            <li key={v.index}>
              <button className="chip with-coa" onClick={() => selectCountry(game, v.index, true)}>
                <CoatOfArms country={v} size={16} />
                {v.short}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── The unknown ───────────────────────────────────────────────────

export function UnknownView({ r }: { r: RegionData }) {
  const game = useGame();
  const me = game.state.countries[game.state.player];
  const water = r.kind !== 'land';
  return (
    <div className="sp-body">
      <div className="sp-head">
        <p className="caps sp-kicker">{water ? 'Uncharted waters' : 'Unknown lands'}</p>
        <h2 className="display sp-title">Terra incognita</h2>
      </div>
      <p className="dim">
        Your realm knows nothing of this place. Its ships may sail there to chart it
        {water && isOpenOcean(game.world, r.id) && me && !oceanGoing(me) ? ', once they can cross the open ocean' : ''},
        and allies share their maps with you.
      </p>
      {me && (
        <p className="dim small">
          Your realm knows {knownCount(game.world, me).toLocaleString('en-US')} of{' '}
          {game.world.regions.length.toLocaleString('en-US')} regions of the world.
        </p>
      )}
    </div>
  );
}
