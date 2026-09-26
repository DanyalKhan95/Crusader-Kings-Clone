/** Map modes: how each region is coloured, and which data the renderer gets per region. */
import type { Terrain } from '../shared/dataTypes';
import { FLAG_IMPASSABLE, FLAG_LAKE, FLAG_WATER, type MapRenderer } from '../render/mapRenderer';
import { topLiege } from '../sim/queries';
import { hexToRgb } from '../sim/setup';
import type { GameState } from '../sim/types';
import type { StaticWorld } from './world';

export type MapMode = 'realms' | 'countries' | 'terrain' | 'development' | 'culture' | 'religion';

export const MAP_MODES: { id: MapMode; label: string; key: string; hint: string }[] = [
  { id: 'realms', label: 'Realms', key: 'Q', hint: 'Countries with their vassals, in the colour of their liege' },
  { id: 'countries', label: 'Countries', key: 'W', hint: 'Every country in its own colour, vassals included' },
  { id: 'terrain', label: 'Terrain', key: 'E', hint: 'The land itself: plains, hills, forests, deserts' },
  { id: 'development', label: 'Development', key: 'R', hint: 'How settled and prosperous each province is' },
  { id: 'culture', label: 'Culture', key: 'T', hint: 'The peoples who live in each province' },
  { id: 'religion', label: 'Faith', key: 'Y', hint: 'The faith practised in each province' },
];

export const TERRAIN_INFO: Record<Terrain, { name: string; color: string }> = {
  plains: { name: 'Plains', color: '#b7c46a' },
  farmland: { name: 'Farmlands', color: '#e2cf5a' },
  hills: { name: 'Hills', color: '#b48c5a' },
  mountains: { name: 'Mountains', color: '#8a7466' },
  forest: { name: 'Forest', color: '#3f7a3c' },
  taiga: { name: 'Taiga', color: '#4a6e5c' },
  jungle: { name: 'Jungle', color: '#1f6a34' },
  steppe: { name: 'Steppe', color: '#d4b77a' },
  drylands: { name: 'Drylands', color: '#c89a62' },
  desert: { name: 'Desert', color: '#ecd9a0' },
  wetlands: { name: 'Wetlands', color: '#5f9a8e' },
  tundra: { name: 'Tundra', color: '#b9c3c8' },
  ice: { name: 'Ice', color: '#f2f6fa' },
};

const NATIVE: [number, number, number] = [156, 144, 122];

function shade(c: [number, number, number], k: number): [number, number, number] {
  return [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];
}

/** Heat ramp for development (1..40). */
function devColor(dev: number): [number, number, number] {
  const t = Math.min(1, Math.log(1 + dev) / Math.log(30));
  const stops: [number, number, number][] = [
    [78, 50, 40],
    [160, 80, 40],
    [220, 150, 50],
    [240, 220, 110],
    [250, 250, 220],
  ];
  const f = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(f));
  const u = f - i;
  return [0, 1, 2].map((k) => stops[i][k] + (stops[i + 1][k] - stops[i][k]) * u) as [number, number, number];
}

/** Writes fill colours and per-region info for the current state and map mode. */
export function applyMapMode(r: MapRenderer, world: StaticWorld, state: GameState, mode: MapMode, player: number) {
  const cultures = world.world.cultures;
  const religions = world.world.religions;
  for (const reg of world.regions) {
    const id = reg.id;
    const p = state.provinces[id];
    const water = reg.kind !== 'land';
    let flags =
      (water ? FLAG_WATER : 0) | (reg.kind === 'lake' ? FLAG_LAKE : 0) | (reg.impassable ? FLAG_IMPASSABLE : 0);
    const owner = p?.owner ?? 0;
    const liege = owner ? topLiege(state, owner) : 0;
    if (player && owner && (owner === player || liege === player)) flags |= 64;
    const prev = r.infoData[id * 4 + 3] & 3; // keep selection/hover
    r.setInfo(id, owner, liege, p?.controller ?? 0, flags | prev);
    if (water) {
      r.setFill(id, 0, 0, 0, 0);
      continue;
    }
    let c: [number, number, number] | null = null;
    let a = 210;
    switch (mode) {
      case 'realms': {
        if (owner) {
          const top = state.countries[liege];
          c = top.color;
          if (liege !== owner) c = shade(c, (owner % 3) * 0.06 + 0.9);
        } else if (p?.culture) {
          c = NATIVE;
          a = 110;
        }
        break;
      }
      case 'countries':
        if (owner) c = state.countries[owner].color;
        else if (p?.culture) {
          c = NATIVE;
          a = 110;
        }
        break;
      case 'terrain':
        c = hexToRgb(TERRAIN_INFO[reg.terrain ?? 'plains'].color);
        a = 175;
        break;
      case 'development':
        c = devColor(p?.dev ?? reg.dev ?? 1);
        a = 230;
        break;
      case 'culture':
        if (p?.culture) c = hexToRgb(cultures[p.culture]?.color ?? '#888888');
        break;
      case 'religion':
        if (p?.religion) c = hexToRgb(religions[p.religion]?.color ?? '#888888');
        break;
    }
    if (reg.impassable && mode !== 'terrain' && mode !== 'development') c = null;
    if (c) r.setFill(id, c[0], c[1], c[2], a);
    else r.setFill(id, 0, 0, 0, 0);
  }
  for (const country of state.countries) {
    if (!country) continue;
    r.setCountryColor(country.index, ...country.color);
  }
  r.markFillDirty();
}
