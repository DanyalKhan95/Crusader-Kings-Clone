import { useEffect, useRef } from 'react';
import type { UnitStyle } from '../../render/units';
import { latToY, lonToX } from '../../shared/projection';
import { orderArmy, pickRealmAt, secondaryClick, selectArmy, selectFleet, selectProvince } from '../actions';
import { emblemKey, emblemSvg } from '../CoatOfArms';
import { useGame, type Game, type UIState } from '../game';
import { attachRunner } from '../runner';
import { appliedScale, QUALITY_DPR, settings, uiScale } from '../settings';
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
  const { phase, orderMode } = game.ui.get();
  if (phase === 'choose') pickRealmAt(game, id);
  else if (phase === 'playing') {
    if (orderMode) orderArmy(game, id);
    else selectProvince(game, id);
  }
}

/** Emblems as images for the army banners, drawn from the same SVG as the panels. */
function unitStyle(game: Game, invalidate: () => void): UnitStyle {
  const cache = new Map<string, HTMLImageElement>();
  return {
    arms(index) {
      const c = game.state.countries[index];
      if (!c) return null;
      const key = `${index}:${emblemKey(c)}`;
      let img = cache.get(key);
      if (!img) {
        img = new Image();
        img.onload = invalidate;
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(emblemSvg(c, 30))}`;
        cache.set(key, img);
      }
      return img.complete && img.naturalWidth ? img : null;
    },
    color: (index) => game.state.countries[index]?.colorHex ?? '#8a8070',
  };
}

/** The map canvases. Creates the MapController once and keeps it in sync with the UI store. */
export function MapCanvas({ onError }: { onError: (message: string) => void }) {
  const game = useGame();
  const hostRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<HTMLCanvasElement>(null);
  const labelRef = useRef<HTMLCanvasElement>(null);
  const unitRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = hostRef.current!;
    let map: MapController;
    try {
      map = new MapController(
        host,
        glRef.current!,
        labelRef.current!,
        unitRef.current!,
        game.world,
        game.state,
        game.bundle,
        {
          hover: (id, x, y) => {
            moveTooltip(game, x, y);
            game.ui.set({ hovered: id });
          },
          hoverMove: (x, y) => moveTooltip(game, x, y),
          click: (id) => onMapClick(game, id),
          clickArmy: (id) => {
            if (game.ui.get().phase === 'playing') selectArmy(game, id);
          },
          clickFleet: (id) => {
            if (game.ui.get().phase === 'playing') selectFleet(game, id);
          },
          secondary: (id, x, y) => secondaryClick(game, id, x, y),
        },
      );
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
      return;
    }
    game.map = map;
    map.unitStyle = unitStyle(game, () => map.invalidateUnits());
    const runner = attachRunner(game);
    game.runner = runner;
    map.onFrame = runner.frame;
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
      map.setSelectedArmy(s.phase === 'playing' && s.panel === 'army' ? s.selectedArmy : 0);
      map.setSelectedFleet(s.phase === 'playing' && s.panel === 'fleet' ? s.selectedFleet : 0);
      map.setFog(s.phase === 'playing' ? s.player : 0);
      host.classList.toggle('ordering', s.orderMode);
      map.drift = s.phase === 'menu' ? MENU_DRIFT : 0;
      prev = s;
    };
    sync();
    const unsubscribe = game.ui.subscribe(sync);
    const applyMapSettings = () => {
      const s = settings.get();
      map.setQuality(QUALITY_DPR[s.quality]);
      map.setLetteringScale(uiScale());
      map.frameCap = s.frameCap;
      map.animations = s.animations;
    };
    applyMapSettings();
    const unsubscribeSettings = settings.subscribe(applyMapSettings);
    const unsubscribeScale = appliedScale.subscribe(applyMapSettings);

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
      unsubscribeSettings();
      unsubscribeScale();
      document.fonts?.removeEventListener('loadingdone', onFonts);
      map.dispose();
      if (game.map === map) game.map = null;
      if (game.runner === runner) game.runner = null;
    };
  }, [game, onError]);

  return (
    <div ref={hostRef} className="map-host" data-testid="map">
      <canvas ref={glRef} className="map-gl" />
      <canvas ref={labelRef} className="map-labels" />
      <canvas ref={unitRef} className="map-labels map-units" />
    </div>
  );
}

/**
 * Tooltips follow the pointer without React: position is written straight to the element. The
 * interface is zoomed by its scale, so viewport pixels are divided by it on the way in.
 */
export function moveTooltip(game: Game, x: number, y: number) {
  game.pointer.x = x;
  game.pointer.y = y;
  const el = game.tooltipEl;
  if (!el) return;
  const k = uiScale();
  const w = el.offsetWidth * k,
    h = el.offsetHeight * k;
  const vw = window.innerWidth,
    vh = window.innerHeight;
  let left = x + 16 * k,
    top = y + 18 * k;
  if (left + w > vw - 8) left = x - w - 12 * k;
  if (top + h > vh - 8) top = y - h - 12 * k;
  el.style.transform = `translate(${Math.max(8, left) / k}px, ${Math.max(8, top) / k}px)`;
}
