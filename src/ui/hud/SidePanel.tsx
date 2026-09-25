import { useMemo, useRef, type ReactNode } from 'react';
import { TERRAIN_INFO } from '../../game/mapModes';
import { topLiege } from '../../game/world';
import { ADJ_RIVER, type RegionData } from '../../shared/dataTypes';
import { closePanel, flyToProvince, selectCountry, selectProvince } from '../actions';
import { CoatOfArms } from '../CoatOfArms';
import { capitalize, formatNumber } from '../format';
import { countryStats, useGame, type Game } from '../game';
import { Icon } from '../Icon';
import { CountryFacts, CountryHeader, cultureName, religionName, Swatch } from '../realm';
import { useMapInsets } from '../map/useMapInsets';
import { useStore } from '../store';

export function SidePanel() {
  const game = useGame();
  const panel = useStore(game.ui, (s) => s.panel);
  const province = useStore(game.ui, (s) => s.selectedProvince);
  const country = useStore(game.ui, (s) => s.selectedCountry);
  if (panel === 'none') return null;
  return (
    <PanelFrame label={panel === 'province' ? 'Province' : 'Realm'}>
      {panel === 'province' && province ? <ProvinceView key={province} id={province} /> : null}
      {panel === 'country' && country ? <CountryView key={country} index={country} /> : null}
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

function goToProvince(game: Game, id: number) {
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
  const p = game.state.provinces[r.id];
  const owner = p?.owner ? game.state.countries[p.owner] : null;
  const top = owner ? game.state.countries[topLiege(game.state, owner.index)] : null;
  const terrain = TERRAIN_INFO[r.terrain ?? 'plains'];
  const culture = p?.culture ? game.world.world.cultures[p.culture] : null;
  const religion = p?.religion ? game.world.world.religions[p.religion] : null;
  const rivers = r.adj.filter(([, , f]) => f & ADJ_RIVER).length;
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
            {r.dev ?? 0}
            <span className="devbar" aria-hidden="true">
              <span style={{ width: `${Math.min(100, ((r.dev ?? 0) / 30) * 100)}%` }} />
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
        <div>
          <dt>Area</dt>
          <dd className="num">{formatNumber(r.area)} km²</dd>
        </div>
        <div>
          <dt>Elevation</dt>
          <dd className="num">{formatNumber(r.elev ?? 0)} m</dd>
        </div>
        <div>
          <dt>Coast</dt>
          <dd>{r.coastal ? 'Coastal' : 'Inland'}</dd>
        </div>
        <div>
          <dt>Rivers</dt>
          <dd>{rivers ? `${rivers} river ${rivers === 1 ? 'border' : 'borders'}` : 'None'}</dd>
        </div>
      </dl>

      <Neighbours r={r} />
    </div>
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

// ── Countries ───────────────────────────────────────────────────

function CountryView({ index }: { index: number }) {
  const game = useGame();
  const player = useStore(game.ui, (s) => s.player);
  const c = game.state.countries[index];
  const stats = useMemo(() => countryStats(game, index), [game, index]);
  const best = useMemo(() => {
    const ids: number[] = [];
    game.state.provinces.forEach((p, id) => {
      if (p?.owner === index) ids.push(id);
    });
    return ids.sort((a, b) => (game.world.region(b).dev ?? 0) - (game.world.region(a).dev ?? 0)).slice(0, 8);
  }, [game, index]);
  if (!c) return null;
  const open = (i: number) => selectCountry(game, i, true);
  return (
    <div className="sp-body">
      <div className="sp-head">
        {index === player && <p className="caps sp-kicker your-realm">Your realm</p>}
        <CountryHeader country={c} onLiege={open} />
      </div>
      <CountryFacts country={c} stats={stats} />

      {stats.vassals.length > 0 && (
        <section className="sp-section">
          <h3 className="section-title">Vassals · {stats.vassals.length}</h3>
          <ul className="chips">
            {stats.vassals.map((v) => (
              <li key={v.index}>
                <button className="chip with-coa" onClick={() => open(v.index)}>
                  <CoatOfArms country={v} size={16} />
                  {capitalize(v.short)}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {best.length > 0 && (
        <section className="sp-section">
          <h3 className="section-title">Richest provinces</h3>
          <ul className="ranked">
            {best.map((id) => {
              const r = game.world.region(id);
              return (
                <li key={id}>
                  <button className="ranked-row" onClick={() => goToProvince(game, id)}>
                    <span>{r.name}</span>
                    <span className="num dim">{r.dev ?? 0}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
