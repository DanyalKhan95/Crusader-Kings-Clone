/** Map modes: how each region is coloured, and which data the renderer gets per region. */
import { faithColor } from '../sim/beliefs';
import type { Terrain } from '../shared/dataTypes';
import {
  FLAG_IMPASSABLE,
  FLAG_LAKE,
  FLAG_PLAGUE,
  FLAG_PLAYER,
  FLAG_UNKNOWN,
  FLAG_WATER,
  type MapRenderer,
} from '../render/mapRenderer';
import { knows, knowsWorld } from '../sim/exploration';
import { coalitionAgainst, hasPact } from '../sim/diplomacy';
import { atWar, hasTruce, isInRealm, realmHead, topLiege } from '../sim/queries';
import { hexToRgb } from '../sim/setup';
import type { GameState } from '../sim/types';
import type { StaticWorld } from './world';

export type MapMode = 'realms' | 'countries' | 'terrain' | 'development' | 'culture' | 'religion' | 'diplomacy';

export const MAP_MODES: { id: MapMode; label: string; key: string; hint: string }[] = [
  { id: 'realms', label: 'Realms', key: 'Q', hint: 'Countries with their vassals, in the colour of their liege' },
  { id: 'countries', label: 'Countries', key: 'W', hint: 'Every country in its own colour, vassals included' },
  { id: 'terrain', label: 'Terrain', key: 'E', hint: 'The land itself: plains, hills, forests, deserts' },
  { id: 'development', label: 'Development', key: 'R', hint: 'How settled and prosperous each province is' },
  { id: 'culture', label: 'Culture', key: 'T', hint: 'The peoples who live in each province' },
  { id: 'religion', label: 'Faith', key: 'Y', hint: 'The faith practised in each province' },
  {
    id: 'diplomacy',
    label: 'Diplomacy',
    key: 'U',
    hint: 'Friends, foes, subjects and claims, as your realm sees them',
  },
];

/** How one realm stands towards another, for the diplomacy map. */
export type Relation =
  | 'self'
  | 'realm'
  | 'subject'
  | 'lord'
  | 'war'
  | 'ally'
  | 'protected'
  | 'coalition'
  | 'nap'
  | 'access'
  | 'truce'
  | 'neutral';

export const RELATION_INFO: Record<Relation, { name: string; color: string }> = {
  self: { name: 'Your realm', color: '#f2c14e' },
  realm: { name: 'Your liege’s realm', color: '#d9a55a' },
  subject: { name: 'Your tributaries', color: '#f4e39a' },
  lord: { name: 'Your overlord', color: '#b58cf2' },
  war: { name: 'At war with you', color: '#ec3b27' },
  ally: { name: 'Allies', color: '#3f8cff' },
  protected: { name: 'Guarantees', color: '#8cc8ff' },
  coalition: { name: 'In a coalition against you', color: '#ff8a1c' },
  nap: { name: 'Non-aggression pact', color: '#2fc4ae' },
  access: { name: 'Military access', color: '#9ae0a4' },
  truce: { name: 'Truce', color: '#a9a49a' },
  neutral: { name: 'Others', color: '#cbbfa4' },
};
export const CLAIM_COLOR = '#d25ee0';

export function relationTo(state: GameState, viewer: number, other: number): Relation {
  if (!viewer || !other) return 'neutral';
  if (isInRealm(state, other, viewer)) return 'self';
  const me = topLiege(state, viewer),
    them = topLiege(state, other);
  if (me === them) return 'realm';
  if (atWar(state, viewer, other)) return 'war';
  if (state.countries[them]?.overlord === me) return 'subject';
  if (state.countries[me]?.overlord === them) return 'lord';
  if (hasPact(state, 'alliance', me, them)) return 'ally';
  if (hasPact(state, 'guarantee', me, them) || hasPact(state, 'guarantee', them, me)) return 'protected';
  if (coalitionAgainst(state, me)?.members.includes(them)) return 'coalition';
  if (hasPact(state, 'nap', me, them)) return 'nap';
  if (hasPact(state, 'access', me, them) || hasPact(state, 'access', them, me)) return 'access';
  if (hasTruce(state, me, them)) return 'truce';
  return 'neutral';
}

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

/**
 * Writes fill colours and per-region info for the current state and map mode. Regions the `fog`
 * country does not know are marked unknown (0 = the whole world is shown).
 */
export function applyMapMode(
  r: MapRenderer,
  world: StaticWorld,
  state: GameState,
  mode: MapMode,
  player: number,
  fog = 0,
) {
  const cultures = world.world.cultures;
  const relations = new Map<number, Relation>();
  const claimed = new Set(state.countries[player]?.claims ?? []);
  const viewer = fog ? state.countries[fog] : undefined;
  const fogged = !!viewer && !knowsWorld(viewer);
  let unknown = false;
  for (const reg of world.regions) {
    const id = reg.id;
    const p = state.provinces[id];
    const water = reg.kind !== 'land';
    let flags =
      (water ? FLAG_WATER : 0) | (reg.kind === 'lake' ? FLAG_LAKE : 0) | (reg.impassable ? FLAG_IMPASSABLE : 0);
    if (fogged && !knows(world, viewer, id)) {
      flags |= FLAG_UNKNOWN;
      unknown = true;
    }
    const owner = p?.owner ?? 0;
    const liege = owner ? realmHead(state, owner) : 0;
    if (player && owner && (owner === player || topLiege(state, owner) === player)) flags |= FLAG_PLAYER;
    if (p?.plague !== undefined && mode !== 'terrain') flags |= FLAG_PLAGUE;
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
        if (p?.religion) c = hexToRgb(faithColor(p.religion));
        break;
      case 'diplomacy': {
        if (!owner) {
          if (p?.culture) {
            c = NATIVE;
            a = 90;
          }
          break;
        }
        if (claimed.has(id)) {
          c = hexToRgb(CLAIM_COLOR);
          a = 245;
          break;
        }
        let rel = relations.get(owner);
        if (!rel) relations.set(owner, (rel = relationTo(state, player, owner)));
        c = hexToRgb(RELATION_INFO[rel].color);
        a = rel === 'neutral' ? 70 : 245;
        break;
      }
    }
    if (reg.impassable && mode !== 'terrain' && mode !== 'development') c = null;
    if (c) r.setFill(id, c[0], c[1], c[2], a);
    else r.setFill(id, 0, 0, 0, 0);
  }
  for (const country of state.countries) {
    if (!country) continue;
    r.setCountryColor(country.index, ...country.color);
  }
  r.fillBoost = mode === 'diplomacy' ? 0.6 : 0;
  r.hasUnknown = unknown;
  r.markFillDirty();
}
