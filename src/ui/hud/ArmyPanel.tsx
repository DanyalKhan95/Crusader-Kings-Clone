import { UNIT_ORDER, unitDef } from '../../data/units';
import { formatMen } from '../../render/units';
import { character, skill } from '../../sim/characters';
import { battleAt } from '../../sim/combat';
import * as cmd from '../../sim/commands';
import { inBattle, supplyLimit } from '../../sim/military';
import { pathDays } from '../../sim/movement';
import { armySize, armyById, atWar } from '../../sim/queries';
import { siegeDays } from '../../sim/siege';
import { militaryEra } from '../../sim/tech';
import { flyToProvince, run, selectCountry } from '../actions';
import { CoatOfArms } from '../CoatOfArms';
import { useGame } from '../game';
import { Icon } from '../Icon';
import { Portrait, Skills } from '../people';
import { Term } from '../encyclopedia/Term';
import { placeName } from '../../sim/places';

export function ArmyView({ id }: { id: number }) {
  const game = useGame();
  const state = game.state;
  const army = armyById(state, id);
  if (!army) return <p className="sp-body dim">This army is no more.</p>;
  const owner = state.countries[army.owner];
  const era = militaryEra(owner);
  const mine = army.owner === state.player;
  const hostile = !mine && atWar(state, army.owner, state.player);
  const commander = character(state, army.commander);
  const here = placeName(state, army.location);
  const onLand = game.world.region(army.location)?.kind === 'land';
  const fighting = inBattle(state, army);
  const size = armySize(army);
  const supply = supplyLimit(state, game.world, army.location);
  const dest = army.path.at(-1);
  const siege = state.provinces[army.location]?.siege;
  const others = state.armies.filter((a) => a !== army && a.owner === army.owner && a.location === army.location);
  let status: string;
  if (fighting) status = `Fighting at ${here}`;
  else if (army.retreating) status = `Retreating to ${placeName(state, army.path[0])}`;
  else if (dest)
    status = `Marching to ${placeName(state, dest)}, ${pathDays(game.world, army.location, army.path) - army.progress} days`;
  else if (siege && siege.by === army.owner)
    status = `Besieging ${here}: ${Math.floor(siege.progress * 100)}%, about ${Math.max(0, Math.ceil(siegeDays(state, army.location, [army]) * (1 - siege.progress)))} days left`;
  else status = `Encamped at ${here}`;
  return (
    <div className="sp-body">
      <div className="sp-head">
        <p className={`caps sp-kicker ${hostile ? 'bad' : ''}`}>
          {mine ? 'Your army' : hostile ? 'Enemy army' : 'Army'}
        </p>
        <h2 className="display sp-title">{army.name}</h2>
        <p className="sp-sub">{status}</p>
      </div>
      <button className="holder" onClick={() => selectCountry(game, owner.index)}>
        <CoatOfArms country={owner} size={30} />
        <span className="holder-text">
          <span className="caps holder-label">Serving</span>
          <span className="holder-name">{owner.name}</span>
        </span>
      </button>
      <div className="army-stats">
        <div>
          <span className="caps">Men</span>
          <span className="num big">{formatMen(size)}</span>
        </div>
        <div>
          <span className="caps">
            <Term to="rule:morale">Morale</Term>
          </span>
          <span className="bar morale">
            <span style={{ width: `${army.morale * 100}%` }} />
          </span>
        </div>
        <div>
          <span className="caps">
            <Term to="rule:supply">Supply</Term>
          </span>
          <span className={`num ${size > supply ? 'bad' : ''}`}>{formatMen(supply)}</span>
        </div>
      </div>
      {size > supply && onLand && (
        <p className="alert">This province cannot feed so many. The army loses men to hunger and disease.</p>
      )}
      <section className="sp-section">
        <h3 className="section-title">Commander</h3>
        {commander && commander.died === undefined ? (
          <div className="person with-portrait">
            <Portrait c={commander} role={commander.id === owner.ruler ? 'ruler' : 'commander'} size={46} />
            <div className="person-body">
              <div className="person-head">
                <span className="person-name">{commander.name}</span>
                <span className="dim person-age">Martial {skill(commander, 'mar')}</span>
              </div>
              <Skills c={commander} highlight="mar" />
            </div>
          </div>
        ) : (
          <p className="dim small">No one leads this army.</p>
        )}
      </section>
      <section className="sp-section">
        <h3 className="section-title">Troops</h3>
        <ul className="units">
          {UNIT_ORDER.filter((t) => (army.units[t] ?? 0) >= 1).map((t) => (
            <li key={t} title={unitDef(t, era).blurb}>
              <Icon name={unitDef(t, era).icon} />
              <span>{unitDef(t, era).name}</span>
              <span className="num">{formatMen(army.units[t] ?? 0)}</span>
            </li>
          ))}
        </ul>
      </section>
      {mine && (
        <div className="army-actions">
          <button
            className="btn primary"
            disabled={fighting || army.retreating}
            onClick={() => game.ui.set({ orderMode: true })}
            title="Or right-click any province"
          >
            <Icon name="boot-prints" /> March
          </button>
          <button
            className="btn"
            disabled={fighting || size < 200}
            onClick={() => run(game, cmd.splitArmy(state, army.id))}
          >
            Split
          </button>
          <button
            className="btn"
            disabled={!others.length || fighting}
            onClick={() => run(game, cmd.mergeArmies(state, [army.id, ...others.map((a) => a.id)]))}
          >
            Merge
          </button>
          <button className="btn ghost" disabled={fighting} onClick={() => run(game, cmd.disbandArmy(state, army.id))}>
            Disband
          </button>
        </div>
      )}
      {fighting && <BattleBox province={army.location} />}
      <button className="link" onClick={() => flyToProvince(game, army.location, 1)}>
        Show on the map
      </button>
    </div>
  );
}

function BattleBox({ province }: { province: number }) {
  const game = useGame();
  const battle = battleAt(game.state, province);
  if (!battle) return null;
  const men = (ids: number[]) =>
    ids.reduce((s, id) => s + armySize(armyById(game.state, id) ?? ({ units: {} } as never)), 0);
  const a = game.state.countries[battle.attacker.country],
    d = game.state.countries[battle.defender.country];
  return (
    <section className="sp-section battle-box">
      <h3 className="section-title">Battle of {placeName(game.state, province)}</h3>
      <div className="battle-sides">
        <div>
          <CoatOfArms country={a} size={26} />
          <span className="num">{formatMen(men(battle.attacker.armies))}</span>
          <span className="dim small">lost {formatMen(battle.attacker.losses)}</span>
        </div>
        <span className="caps dim">against</span>
        <div>
          <CoatOfArms country={d} size={26} />
          <span className="num">{formatMen(men(battle.defender.armies))}</span>
          <span className="dim small">lost {formatMen(battle.defender.losses)}</span>
        </div>
      </div>
      {battle.crossing && <p className="dim small">The attackers are fighting their way across a river.</p>}
    </section>
  );
}
