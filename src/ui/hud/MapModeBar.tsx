import type { IconName } from '../../assets/icons';
import { CLAIM_COLOR, MAP_MODES, RELATION_INFO, TERRAIN_INFO, type MapMode, type Relation } from '../../game/mapModes';
import { setMapMode } from '../actions';
import { useGame } from '../game';
import { Icon } from '../Icon';
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
  const current = MAP_MODES.find((m) => m.id === mode)!;
  return (
    <div className={`mapmodes-wrap phase-${phase}`}>
      <Legend mode={mode} />
      <nav className="panel mapmodes" aria-label="Map modes">
        <span className="mapmodes-caption caps">{current.label}</span>
        <div className="mapmodes-row">
          {MAP_MODES.map((m) => (
            <button
              key={m.id}
              className={`mapmode ${mode === m.id ? 'active' : ''}`}
              onClick={() => setMapMode(game, m.id)}
              aria-pressed={mode === m.id}
              aria-label={`${m.label} map (${m.key})`}
              title={`${m.label} (${m.key}): ${m.hint}`}
            >
              <Icon name={MODE_ICONS[m.id]} />
              <kbd>{m.key}</kbd>
            </button>
          ))}
        </div>
      </nav>
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
