import { useRef, type ReactNode } from 'react';
import { BUILDING_ORDER, BUILDINGS, MAX_LEVEL } from '../../data/buildings';
import { TERRAIN_INFO } from '../../game/mapModes';
import { formatMen } from '../../render/units';
import * as cmd from '../../sim/commands';
import { canFabricate, fabricationCost, fabricationDays } from '../../sim/diplomacy';
import { canBuild, fortLevel, provinceLevy, provinceTax } from '../../sim/economy';
import { supplyLimit } from '../../sim/military';
import { armiesAt, armySize, atWar, isInRealm, topLiege, touchesRealm } from '../../sim/queries';
import { garrison } from '../../sim/siege';
import { ADJ_RIVER, type RegionData } from '../../shared/dataTypes';
import { closePanel, flyToProvince, run, selectArmy, selectCountry, selectProvince } from '../actions';
import { CoatOfArms } from '../CoatOfArms';
import { formatNumber } from '../format';
import { useGame, type Game } from '../game';
import { Icon } from '../Icon';
import { useMapInsets } from '../map/useMapInsets';
import { cultureName, religionName, Swatch } from '../realm';
import { useStore } from '../store';
import { ArmyView } from './ArmyPanel';
import { WithTip } from './Tip';
import { CountryView } from './CountryPanel';
import { WarView } from './WarPanel';

export function SidePanel() {
  const game = useGame();
  const panel = useStore(game.ui, (s) => s.panel);
  const province = useStore(game.ui, (s) => s.selectedProvince);
  const country = useStore(game.ui, (s) => s.selectedCountry);
  const army = useStore(game.ui, (s) => s.selectedArmy);
  const war = useStore(game.ui, (s) => s.selectedWar);
  useStore(game.ui, (s) => s.tick);
  if (panel === 'none') return null;
  const label = { province: 'Province', country: 'Realm', army: 'Army', war: 'War' }[panel];
  return (
    <PanelFrame label={label}>
      {panel === 'province' && province ? <ProvinceView key={province} id={province} /> : null}
      {panel === 'country' && country ? <CountryView key={country} index={country} /> : null}
      {panel === 'army' && army ? <ArmyView key={army} id={army} /> : null}
      {panel === 'war' && war ? <WarView key={war} id={war} /> : null}
    </PanelFrame>
  );
}

/** The panel chrome; mounted only while open, so the map knows when that edge is covered. */
function PanelFrame({ label, children }: { label: string; children: ReactNode }) {
  const game = useGame();
  const ref = useRef<HTMLElement>(null);
  useMapInsets([ref]);
  return (
    <aside ref={ref} className="panel side-panel" aria-label={label}>
      <button className="btn ghost close" onClick={() => closePanel(game)} aria-label="Close panel">
        <Icon name="cross-mark" />
      </button>
      {children}
    </aside>
  );
}

// ── Provinces ───────────────────────────────────────────────────

export function goToProvince(game: Game, id: number) {
  selectProvince(game, id);
  flyToProvince(game, id);
}

function ProvinceView({ id }: { id: number }) {
  const game = useGame();
  const r = game.world.region(id);
  if (!r) return null;
  return r.kind === 'land' ? <LandView r={r} /> : <WaterView r={r} />;
}

function LandView({ r }: { r: RegionData }) {
  const game = useGame();
  const state = game.state;
  const p = state.provinces[r.id];
  const owner = p?.owner ? state.countries[p.owner] : null;
  const top = owner ? state.countries[topLiege(state, owner.index)] : null;
  const controller = p && p.controller !== p.owner ? state.countries[p.controller] : null;
  const terrain = TERRAIN_INFO[r.terrain ?? 'plains'];
  const culture = p?.culture ? game.world.world.cultures[p.culture] : null;
  const religion = p?.religion ? game.world.world.religions[p.religion] : null;
  const rivers = r.adj.filter(([, , f]) => f & ADJ_RIVER).length;
  const fort = fortLevel(state, r.id);
  const mine = owner?.index === state.player;
  const siegeBy = p?.siege ? state.countries[p.siege.by] : null;
  return (
    <div className="sp-body">
      <div className="sp-head">
        <p className="caps sp-kicker">{r.impassable ? 'Impassable' : `${terrain.name} province`}</p>
        <h2 className="display sp-title">{r.name}</h2>
        {r.modern && <p className="sp-sub">Today in {r.modern[1]}</p>}
      </div>

      {owner ? (
        <button className="holder" onClick={() => selectCountry(game, owner.index)}>
          <CoatOfArms country={owner} size={34} />
          <span className="holder-text">
            <span className="caps holder-label">Held by</span>
            <span className="holder-name">{owner.name}</span>
            {top && top !== owner && <span className="holder-sub">within the realm of {top.name}</span>}
          </span>
        </button>
      ) : (
        <div className="holder unowned">
          <Icon name={r.impassable ? 'mountains' : 'pine-tree'} />
          <span className="holder-text">
            <span className="caps holder-label">{r.impassable ? 'Wilderness' : 'Unclaimed'}</span>
            <span className="holder-name">
              {r.impassable
                ? 'No one can live or march here'
                : p?.culture
                  ? `Tribal lands of the ${cultureName(game, p.culture)} people`
                  : 'Empty land, awaiting settlers'}
            </span>
          </span>
        </div>
      )}

      {controller && (
        <p className="alert">
          <Icon name="tattered-banner" /> Occupied by {controller.name}. Its taxes and levies go to no one.
        </p>
      )}
      {siegeBy && p?.siege && (
        <div className="alert siege">
          <Icon name="siege-tower" /> Besieged by {siegeBy.name}
          <span className="bar" aria-label="Siege progress">
            <span style={{ width: `${Math.min(100, p.siege.progress * 100)}%` }} />
          </span>
          <span className="num">{Math.floor(p.siege.progress * 100)}%</span>
        </div>
      )}

      {owner && <Claims id={r.id} />}

      <dl className="facts">
        <div>
          <dt>Terrain</dt>
          <dd>
            <Swatch color={terrain.color} /> {terrain.name}
          </dd>
        </div>
        <div>
          <dt>Development</dt>
          <dd className="num">
            {p?.dev ?? r.dev ?? 0}
            <span className="devbar" aria-hidden="true">
              <span style={{ width: `${Math.min(100, ((p?.dev ?? 0) / 30) * 100)}%` }} />
            </span>
          </dd>
        </div>
        <div>
          <dt>Culture</dt>
          <dd>
            {culture && <Swatch color={culture.color} />} {p?.culture ? cultureName(game, p.culture) : 'None'}
          </dd>
        </div>
        <div>
          <dt>Faith</dt>
          <dd>
            {religion && <Swatch color={religion.color} />} {p?.religion ? religionName(game, p.religion) : 'None'}
          </dd>
        </div>
        {owner && (
          <>
            <div>
              <dt>Taxes</dt>
              <dd className="num">{provinceTax(p).toFixed(1)} a month</dd>
            </div>
            <div>
              <dt>Levies</dt>
              <dd className="num">{formatMen(provinceLevy(p))} men</dd>
            </div>
            <div>
              <dt>Fortifications</dt>
              <dd className="num">{fort ? `Level ${fort}, ${formatMen(garrison(state, r.id))} garrison` : 'None'}</dd>
            </div>
            <div>
              <dt>Supply</dt>
              <dd className="num">{formatMen(supplyLimit(state, game.world, r.id))} men</dd>
            </div>
          </>
        )}
        <div>
          <dt>Area</dt>
          <dd className="num">{formatNumber(r.area)} km²</dd>
        </div>
        <div>
          <dt>Rivers</dt>
          <dd>{rivers ? `${rivers} river ${rivers === 1 ? 'border' : 'borders'}` : 'None'}</dd>
        </div>
      </dl>

      {owner && <Buildings id={r.id} mine={mine} />}
      <ArmiesHere id={r.id} />
      <Neighbours r={r} />
    </div>
  );
}

/** Who claims this province, and forging a claim of our own on land across the border. */
function Claims({ id }: { id: number }) {
  const game = useGame();
  const state = game.state;
  const player = state.player;
  const me = state.countries[player];
  const p = state.provinces[id];
  const claimants = state.countries.filter((c) => c?.alive && c.claims.includes(id));
  const foreign = !!me && !!p.owner && !isInRealm(state, p.owner, topLiege(state, player));
  const reachable = foreign && touchesRealm(state, game.world, player, id);
  const forging = me?.fabricating?.province === id ? me.fabricating : null;
  const check = reachable && !me.claims.includes(id) && !forging ? canFabricate(state, game.world, player, id) : null;
  if (!claimants.length && !forging && !check) return null;
  const cost = fabricationCost(state, id);
  const months = me ? Math.round(fabricationDays(state, me) / 30) : 0;
  return (
    <section className="sp-section claims">
      {claimants.length > 0 && (
        <div className="claimants">
          <span className="caps">Claimed by</span>
          <ul className="chips">
            {claimants.map((c) => (
              <li key={c.index}>
                <button className="chip with-coa" onClick={() => selectCountry(game, c.index)}>
                  <CoatOfArms country={c} size={16} />
                  {c.index === player ? 'You' : c.short}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {forging && (
        <div className="construction">
          <Icon name="scroll-quill" />
          <span>
            Your chancellor is forging a claim
            <span className="bar">
              <span
                style={{
                  width: `${Math.min(100, ((state.day - forging.start) / (forging.done - forging.start)) * 100)}%`,
                }}
              />
            </span>
          </span>
          <span className="num dim">{forging.done - state.day} days</span>
        </div>
      )}
      {check && (
        <WithTip
          tip={
            <p className="tip-text">
              {check.ok
                ? `Your chancellor digs through old charters to prove this land is rightfully yours: about ${months} months. A claim is a just cause for war and halves the land's price at the peace table.`
                : `${check.reason}.`}
            </p>
          }
        >
          <button
            className="btn small"
            disabled={!check.ok}
            onClick={() => run(game, cmd.fabricate(state, game.world, id))}
          >
            <Icon name="scroll-quill" /> Forge a claim · {cost} gold
          </button>
        </WithTip>
      )}
    </section>
  );
}

function Buildings({ id, mine }: { id: number; mine: boolean }) {
  const game = useGame();
  const p = game.state.provinces[id];
  const con = p.construction;
  return (
    <section className="sp-section">
      <h3 className="section-title">Buildings</h3>
      {con && (
        <div className="construction">
          <Icon name="hammer-nails" />
          <span>
            Building {BUILDINGS[con.type].levels[con.level - 1]}
            <span className="bar">
              <span
                style={{ width: `${Math.min(100, ((game.state.day - con.start) / (con.done - con.start)) * 100)}%` }}
              />
            </span>
          </span>
          <span className="num dim">{con.done - game.state.day} days</span>
        </div>
      )}
      <ul className="buildings">
        {BUILDING_ORDER.map((type) => {
          const def = BUILDINGS[type];
          const level = p.buildings[type] ?? 0;
          const check = mine ? canBuild(game.state, game.world, game.state.player, id, type) : null;
          const hidden = !level && !mine;
          if (hidden) return null;
          return (
            <li key={type} className={level ? 'built' : ''}>
              <Icon name={def.icon} />
              <span className="building-text">
                <span className="building-name">{level ? def.levels[level - 1] : def.name}</span>
                <span className="pips" aria-label={`Level ${level} of ${MAX_LEVEL}`}>
                  {[1, 2, 3].map((l) => (
                    <span key={l} className={l <= level ? 'on' : ''} />
                  ))}
                </span>
              </span>
              {mine && level < MAX_LEVEL && check && (
                <button
                  className="btn small"
                  disabled={!check.ok}
                  title={check.ok ? `${def.blurb} Takes ${check.days} days.` : check.reason}
                  onClick={() => run(game, cmd.build(game.state, game.world, id, type))}
                >
                  {check.ok ? `${check.cost}` : level ? 'Upgrade' : 'Build'}
                  {check.ok && <Icon name="coins" />}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ArmiesHere({ id }: { id: number }) {
  const game = useGame();
  const armies = armiesAt(game.state, id);
  if (!armies.length) return null;
  return (
    <section className="sp-section">
      <h3 className="section-title">Armies here</h3>
      <ul className="army-list">
        {armies.map((a) => {
          const owner = game.state.countries[a.owner];
          const hostile = atWar(game.state, a.owner, game.state.player);
          return (
            <li key={a.id}>
              <button className={`army-row ${hostile ? 'hostile' : ''}`} onClick={() => selectArmy(game, a.id)}>
                <CoatOfArms country={owner} size={18} />
                <span className="army-row-name">{a.name}</span>
                <span className="num">{formatMen(armySize(a))}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function WaterView({ r }: { r: RegionData }) {
  const game = useGame();
  const coasts = r.adj.filter(([n]) => game.world.region(n)?.kind === 'land').length;
  return (
    <div className="sp-body">
      <div className="sp-head">
        <p className="caps sp-kicker">{r.kind === 'lake' ? 'Lake' : 'Sea zone'}</p>
        <h2 className="display sp-title">{r.name}</h2>
      </div>
      <dl className="facts">
        <div>
          <dt>Area</dt>
          <dd className="num">{formatNumber(r.area)} km²</dd>
        </div>
        <div>
          <dt>Coasts</dt>
          <dd className="num">{coasts} provinces</dd>
        </div>
      </dl>
      <ArmiesHere id={r.id} />
      <Neighbours r={r} />
    </div>
  );
}

function Neighbours({ r }: { r: RegionData }) {
  const game = useGame();
  const list = [...r.adj].sort((a, b) => b[1] - a[1]).slice(0, 14);
  return (
    <section className="sp-section">
      <h3 className="section-title">Borders</h3>
      <ul className="chips">
        {list.map(([n]) => {
          const nr = game.world.region(n);
          if (!nr) return null;
          return (
            <li key={n}>
              <button className={`chip ${nr.kind !== 'land' ? 'water' : ''}`} onClick={() => goToProvince(game, n)}>
                {nr.name}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
