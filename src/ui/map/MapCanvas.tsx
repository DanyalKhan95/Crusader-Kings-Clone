import { useEffect, useRef } from 'react';
import { latToY, lonToX } from '../../shared/projection';
import { pickRealmAt, selectProvince } from '../actions';
import { useGame, type Game, type UIState } from '../game';
import { MapController } from './MapController';

/** Where the title screen opens: the Mediterranean and Europe. */
const HOME = { lon: 16, lat: 45, zoom: 0.3 };

/** Map units per second of the slow drift behind the title screen. */
const MENU_DRIFT = 26;

async function loadFonts(labelText: string) {
  if (!document.fonts) return;
  await Promise.all([
    document.fonts.load('700 32px "Alegreya SC"', labelText),
    document.fonts.load('italic 700 16px "Alegreya SC"', 'Sea Ocean Gulf Bay'),
    document.fonts.load('500 16px "Alegreya SC"', 'Province'),
    document.fonts.load('600 32px "Grenze Gotisch"', 'Crowns & Centuries'),
  ]).catch(() => undefined);
}

function outlineFor(s: UIState): number {
  if (s.phase === 'playing') return s.player;
  if (s.phase === 'choose') return s.selectedCountry;
  return 0;
}

function onMapClick(game: Game, id: number) {
  const { phase } = game.ui.get();
  if (phase === 'choose') pickRealmAt(game, id);
  else if (phase === 'playing') selectProvince(game, id);
}

/** The map canvases. Creates the MapController once and keeps it in sync with the UI store. */
export function MapCanvas({ onError }: { onError: (message: string) => void }) {
  const game = useGame();
  const hostRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<HTMLCanvasElement>(null);
  const labelRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = hostRef.current!;
    let map: MapController;
    try {
      map = new MapController(host, glRef.current!, labelRef.current!, game.world, game.state, game.bundle, {
        hover: (id, x, y) => {
          moveTooltip(game, x, y);
          game.ui.set({ hovered: id });
        },
        hoverMove: (x, y) => moveTooltip(game, x, y),
        click: (id) => onMapClick(game, id),
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
      return;
    }
    game.map = map;
    map.camera.x = lonToX(HOME.lon);
    map.camera.y = latToY(HOME.lat);
    map.camera.zoom = HOME.zoom;
    map.camera.clamp();

    let prev: UIState | null = null;
    const sync = () => {
      const s = game.ui.get();
      const outline = outlineFor(s);
      if (!prev || s.mapMode !== prev.mapMode || outline !== outlineFor(prev)) map.setMode(s.mapMode, outline);
      map.setSelected(s.phase === 'playing' && s.panel === 'province' ? s.selectedProvince : 0);
      map.drift = s.phase === 'menu' ? MENU_DRIFT : 0;
      prev = s;
    };
    sync();
    const unsubscribe = game.ui.subscribe(sync);

    let cancelled = false;
    Promise.all([map.load(), loadFonts(map.labelText())])
      .then(() => {
        if (cancelled) return;
        map.fontsChanged();
        map.start();
        // Two frames: the first draws, the second is on screen.
        requestAnimationFrame(() => requestAnimationFrame(() => !cancelled && game.ui.set({ ready: true })));
      })
      .catch((e: unknown) => !cancelled && onError(e instanceof Error ? e.message : String(e)));
    const onFonts = () => map.fontsChanged();
    document.fonts?.addEventListener('loadingdone', onFonts);

    return () => {
      cancelled = true;
      unsubscribe();
      document.fonts?.removeEventListener('loadingdone', onFonts);
      map.dispose();
      if (game.map === map) game.map = null;
    };
  }, [game, onError]);

  return (
    <div ref={hostRef} className="map-host" data-testid="map">
      <canvas ref={glRef} className="map-gl" />
      <canvas ref={labelRef} className="map-labels" />
    </div>
  );
}

/** Tooltips follow the pointer without React: position is written straight to the element. */
export function moveTooltip(game: Game, x: number, y: number) {
  game.pointer.x = x;
  game.pointer.y = y;
  const el = game.tooltipEl;
  if (!el) return;
  const w = el.offsetWidth,
    h = el.offsetHeight;
  const vw = window.innerWidth,
    vh = window.innerHeight;
  let left = x + 16,
    top = y + 18;
  if (left + w > vw - 8) left = x - w - 12;
  if (top + h > vh - 8) top = y - h - 12;
  el.style.transform = `translate(${Math.max(8, left)}px, ${Math.max(8, top)}px)`;
}
