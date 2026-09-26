import { useEffect, useLayoutEffect, useRef } from 'react';
import { TERRAIN_INFO } from '../../game/mapModes';
import { topLiege } from '../../sim/queries';
import { CoatOfArms } from '../CoatOfArms';
import { useGame } from '../game';
import { moveTooltip } from '../map/MapCanvas';
import { cultureName } from '../realm';
import { useStore } from '../store';

/** Follows the pointer over the map; the map writes its position directly (see moveTooltip). */
export function HoverTooltip() {
  const game = useGame();
  const hovered = useStore(game.ui, (s) => s.hovered);
  const phase = useStore(game.ui, (s) => s.phase);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    game.tooltipEl = el;
    return () => {
      if (game.tooltipEl === el) game.tooltipEl = null;
    };
  }, [game]);

  // New content has a new size: place it again so it never spills off screen.
  useLayoutEffect(() => {
    if (hovered) moveTooltip(game, game.pointer.x, game.pointer.y);
  }, [game, hovered]);

  const r = hovered ? game.world.region(hovered) : null;
  const p = r ? game.state.provinces[r.id] : null;
  const owner = p?.owner ? game.state.countries[p.owner] : null;
  const top = owner ? game.state.countries[topLiege(game.state, owner.index)] : null;

  return (
    <div ref={ref} className={`panel tooltip ${r ? 'show' : ''}`} role="tooltip">
      {r && (
        <>
          <div className="tt-name">{r.name}</div>
          {r.kind !== 'land' ? (
            <div className="tt-line dim">{r.kind === 'lake' ? 'Lake' : 'Sea zone'}</div>
          ) : owner ? (
            <>
              <div className="tt-owner">
                <CoatOfArms country={owner} size={18} />
                <span>{owner.name}</span>
              </div>
              {top && top !== owner && <div className="tt-line dim">Vassal of {top.name}</div>}
            </>
          ) : (
            <div className="tt-line dim">
              {r.impassable
                ? 'Impassable'
                : p?.culture
                  ? `Tribal lands · ${cultureName(game, p.culture)}`
                  : 'Unclaimed'}
            </div>
          )}
          {r.kind === 'land' && (
            <div className="tt-line dim">
              {TERRAIN_INFO[r.terrain ?? 'plains'].name} · development {p?.dev ?? r.dev ?? 0}
            </div>
          )}
          {phase === 'choose' && owner && <div className="tt-hint caps">Click to view this realm</div>}
        </>
      )}
    </div>
  );
}
