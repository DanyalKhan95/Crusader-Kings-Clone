import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { IconName } from '../../assets/icons';
import {
  CLAIM_COLOR,
  MAP_MODES,
  RELATION_INFO,
  TERRAIN_INFO,
  UNIT_LAYERS,
  type MapMode,
  type Relation,
} from '../../game/mapModes';
import { faithColor, faithName } from '../../sim/beliefs';
import { setMapMode } from '../actions';
import { useGame } from '../game';
import { Icon } from '../Icon';
import { shortcut, withKey } from '../keys';
import { settings, useSettings } from '../settings';
import { useStore } from '../store';

const MODE_ICONS: Record<MapMode, IconName> = {
  realms: 'crown',
  countries: 'castle',
  terrain: 'mountains',
  development: 'village',
  culture: 'meeple-group',
  religion: 'prayer',
  diplomacy: 'shaking-hands',
};

export function MapModeBar() {
  const game = useGame();
  const mode = useStore(game.ui, (s) => s.mapMode);
  const phase = useStore(game.ui, (s) => s.phase);
  useSettings((s) => s.keys);
  const current = MAP_MODES.find((m) => m.id === mode)!;
  // Its height, with the legend, for the outliner above it to keep clear of.
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const ro = new ResizeObserver(() => root.style.setProperty('--mapmodes-h', `${el.offsetHeight}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty('--mapmodes-h');
    };
  }, []);
  return (
    <div ref={ref} className={`mapmodes-wrap phase-${phase}`}>
      <Legend mode={mode} />
      <nav className="panel mapmodes" aria-label="Map modes">
        <span className="mapmodes-caption caps">{current.label}</span>
        <div className="mapmodes-row">
          {MAP_MODES.map((m) => {
            const key = shortcut(`mode:${m.id}`);
            return (
              <button
                key={m.id}
                className={`mapmode ${mode === m.id ? 'active' : ''}`}
                onClick={() => setMapMode(game, m.id)}
                aria-pressed={mode === m.id}
                aria-label={withKey(`${m.label} map`, `mode:${m.id}`)}
                title={`${withKey(m.label, `mode:${m.id}`)}: ${m.hint}`}
              >
                <Icon name={MODE_ICONS[m.id]} />
                {key && <kbd>{key}</kbd>}
              </button>
            );
          })}
        </div>
        {phase === 'playing' && <UnitLayersButton />}
      </nav>
    </div>
  );
}

/** Whose armies and fleets the map shows: a button on the bar, and its choices above it. */
function UnitLayersButton() {
  const layers = useSettings((s) => s.unitLayers);
  const portFleets = useSettings((s) => s.portFleets);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // A press elsewhere or Esc puts the choices away (Esc before anything else it would do).
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setOpen(false);
    };
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', esc, true);
    return () => {
      window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('keydown', esc, true);
    };
  }, [open]);
  const hidden = UNIT_LAYERS.filter((l) => !layers[l.id]).length;
  return (
    <div className="unit-layers" ref={ref}>
      <button
        className={`mapmode layers-button ${open ? 'active' : ''}`}
        aria-expanded={open}
        aria-label="Armies and fleets on the map"
        title="Whose armies and fleets the map shows"
        onClick={() => setOpen(!open)}
      >
        <Icon name="knight-banner" />
        {hidden > 0 && <span className="layers-hidden" aria-hidden="true" />}
      </button>
      {open && (
        <div className="panel layers-pop" role="group" aria-label="Whose armies and fleets are shown">
          <p className="caps layers-title">Armies and fleets</p>
          {UNIT_LAYERS.map((l) => (
            <label key={l.id} className={`choice compact ${layers[l.id] ? 'active' : ''}`}>
              <input
                type="checkbox"
                checked={layers[l.id]}
                onChange={(e) => settings.set({ unitLayers: { ...layers, [l.id]: e.target.checked } })}
              />
              <span className="choice-name">{l.name}</span>
            </label>
          ))}
          <label className={`choice compact ${portFleets ? 'active' : ''}`}>
            <input
              type="checkbox"
              checked={portFleets}
              onChange={(e) => settings.set({ portFleets: e.target.checked })}
            />
            <span className="choice-name">Foreign fleets in port</span>
          </label>
          <p className="dim small">
            Fleets in port at war with you always show. Far out, a realm&rsquo;s armies close together share one banner.
          </p>
        </div>
      )}
    </div>
  );
}

const DEV_STOPS = ['rgb(78,50,40)', 'rgb(160,80,40)', 'rgb(220,150,50)', 'rgb(240,220,110)', 'rgb(250,250,220)'];

function Legend({ mode }: { mode: MapMode }) {
  if (mode === 'terrain') {
    return (
      <div className="panel legend" aria-label="Terrain legend">
        <ul className="legend-list">
          {Object.entries(TERRAIN_INFO).map(([id, t]) => (
            <li key={id}>
              <span className="swatch" style={{ background: t.color }} aria-hidden="true" />
              {t.name}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (mode === 'diplomacy') {
    const shown: Relation[] = [
      'self',
      'ally',
      'war',
      'coalition',
      'protected',
      'nap',
      'access',
      'subject',
      'lord',
      'truce',
    ];
    return (
      <div className="panel legend" aria-label="Diplomacy legend">
        <ul className="legend-list">
          {shown.map((r) => (
            <li key={r}>
              <span className="swatch" style={{ background: RELATION_INFO[r].color }} aria-hidden="true" />
              {RELATION_INFO[r].name}
            </li>
          ))}
          <li>
            <span className="swatch" style={{ background: CLAIM_COLOR }} aria-hidden="true" />
            Your claims
          </li>
        </ul>
      </div>
    );
  }
  if (mode === 'religion') return <FaithLegend />;
  if (mode === 'development') {
    return (
      <div className="panel legend" aria-label="Development legend">
        <div className="legend-ramp" style={{ background: `linear-gradient(90deg, ${DEV_STOPS.join(', ')})` }} />
        <div className="legend-ramp-labels num">
          <span>Wild</span>
          <span>Settled</span>
          <span>Great cities</span>
        </div>
      </div>
    );
  }
  return null;
}

/** The faiths with the most provinces, heresies among them when they have spread. */
function FaithLegend() {
  const game = useGame();
  useStore(game.ui, (s) => s.tick);
  const counts = new Map<string, number>();
  for (const p of game.state.provinces) if (p?.religion) counts.set(p.religion, (counts.get(p.religion) ?? 0) + 1);
  const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 14);
  return (
    <div className="panel legend" aria-label="Faith legend">
      <ul className="legend-list">
        {top.map(([id]) => (
          <li key={id}>
            <span className="swatch" style={{ background: faithColor(id) }} aria-hidden="true" />
            {faithName(id)}
          </li>
        ))}
      </ul>
    </div>
  );
}
