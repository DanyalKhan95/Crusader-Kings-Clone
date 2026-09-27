import { useLayoutEffect, type RefObject } from 'react';
import { useGame } from '../game';
import type { Insets } from './MapController';

/**
 * Tells the map which screen edges are covered by these panels, so camera moves frame their
 * target in the part of the map that is still visible. A panel hugging a side counts for that side.
 * Each caller reports under its own name, and the map keeps clear of them all.
 */
export function useMapInsets(source: string, refs: RefObject<HTMLElement | null>[]) {
  const game = useGame();
  useLayoutEffect(() => {
    const measure = () => {
      const vw = window.innerWidth,
        vh = window.innerHeight;
      const ins: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
      for (const ref of refs) {
        const el = ref.current;
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const wide = r.width > vw * 0.6;
        if (wide && r.top < vh * 0.25) ins.top = Math.max(ins.top, r.bottom);
        else if (wide) ins.bottom = Math.max(ins.bottom, vh - r.top);
        else if (r.left < vw * 0.25) ins.left = Math.max(ins.left, r.right);
        else if (r.right > vw * 0.75) ins.right = Math.max(ins.right, vw - r.left);
      }
      game.map?.setInsets(source, ins);
    };
    measure();
    const ro = new ResizeObserver(measure);
    for (const ref of refs) if (ref.current) ro.observe(ref.current);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      game.map?.setInsets(source, null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs are stable objects
  }, [game, source]);
}
