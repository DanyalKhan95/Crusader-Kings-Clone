import { useEffect, useLayoutEffect, useRef } from 'react';
import { relationTo, RELATION_INFO, TERRAIN_INFO } from '../../game/mapModes';
import { faithName, holyTo } from '../../sim/beliefs';
import { opinionOf } from '../../sim/diplomacy';
import { colonisedBy } from '../../sim/colonies';
import { knows } from '../../sim/exploration';
import { blockades, isOpenOcean } from '../../sim/naval';
import { topLiege } from '../../sim/queries';
import { CoatOfArms } from '../CoatOfArms';
import { useGame } from '../game';
import { moveTooltip } from '../map/MapCanvas';
import { cultureName } from '../realm';
import { capitalize } from '../format';
import { plagueName } from '../../sim/plague';
import { useStore } from '../store';

/** Follows the pointer over the map; the map writes its position directly (see moveTooltip). */
export function HoverTooltip() {
  const game = useGame();
  const hovered = useStore(game.ui, (s) => s.hovered);
  const phase = useStore(game.ui, (s) => s.phase);
  const mode = useStore(game.ui, (s) => s.mapMode);
  const player = useStore(game.ui, (s) => s.player);
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
  const viewer = phase === 'playing' ? game.state.countries[player] : undefined;
  if (r && viewer && !knows(game.world, viewer, r.id))
    return (
      <div ref={ref} className="panel tooltip show" role="tooltip">
        <div className="tt-name">Terra incognita</div>
        <div className="tt-line dim">
          {r.kind === 'land' ? 'Unknown lands' : 'Uncharted waters'}: send ships to chart them
        </div>
      </div>
    );
  const p = r ? game.state.provinces[r.id] : null;
  const owner = p?.owner ? game.state.countries[p.owner] : null;
  const top = owner ? game.state.countries[topLiege(game.state, owner.index)] : null;

  return (
    <div ref={ref} className={`panel tooltip ${r ? 'show' : ''}`} role="tooltip">
      {r && (
        <>
          <div className="tt-name">{r.name}</div>
          {r.kind !== 'land' ? (
            <div className="tt-line dim">
              {r.kind === 'lake' ? 'Lake' : isOpenOcean(game.world, r.id) ? 'Open ocean' : 'Sea zone'}
            </div>
          ) : owner ? (
            <>
              <div className="tt-owner">
                <CoatOfArms country={owner} size={18} />
                <span>{owner.name}</span>
              </div>
              {top && top !== owner && <div className="tt-line dim">Vassal of {top.name}</div>}
              {mode === 'diplomacy' && player > 0 && owner.index !== player && (
                <div className="tt-line">
                  {(() => {
                    const rel = relationTo(game.state, player, owner.index);
                    return rel === 'neutral' ? 'No treaties with you' : RELATION_INFO[rel].name;
                  })()}{' '}
                  · opinion of you {Math.round(opinionOf(game.state, game.world, owner.index, player))}
                </div>
              )}
              {mode === 'diplomacy' && player > 0 && game.state.countries[player]?.claims.includes(r.id) && (
                <div className="tt-line">You hold a claim here</div>
              )}
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
          {r.kind === 'land' && (mode === 'religion' || mode === 'culture') && p?.religion && (
            <div className="tt-line">
              {faithName(p.religion)} · {cultureName(game, p.culture)}
            </div>
          )}
          {r.kind === 'land' && mode === 'religion' && holyTo(r.id).length > 0 && (
            <div className="tt-line">
              Holy to{' '}
              {holyTo(r.id)
                .map((f) => faithName(f))
                .join(', ')}
            </div>
          )}
          {r.kind === 'land' && !owner && colonisedBy(game.state, r.id) && (
            <div className="tt-line">Being settled by {colonisedBy(game.state, r.id)!.name}</div>
          )}
          {r.kind === 'land' && p?.plague !== undefined && (
            <div className="tt-line bad">{capitalize(plagueName(game.state) || 'pestilence')} rages here</div>
          )}
          {r.kind === 'land' && blockades(game.state).has(r.id) && (
            <div className="tt-line bad">
              Blockaded by {game.state.countries[blockades(game.state).get(r.id)!]?.name}
            </div>
          )}
          {phase === 'choose' && owner && <div className="tt-hint caps">Click to view this realm</div>}
        </>
      )}
    </div>
  );
}
