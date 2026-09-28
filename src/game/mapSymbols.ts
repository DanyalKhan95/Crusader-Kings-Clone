/**
 * The towns and holy places the map draws, from the state of the world: each province's town where
 * mapgen placed it, as large as the province is developed beside the world's others, a crown or a
 * star on the capitals of independent kingdoms and empires, and the sign of the faiths that hold a
 * place holy.
 */
import { TOWN_FROM, type TownMark } from '../render/symbols';
import { faithFamily, holyTo } from '../sim/beliefs';
import type { GameState } from '../sim/types';

const SIGNS: Record<string, TownMark['holy']> = { christian: 'cross', islamic: 'crescent', jewish: 'star' };

export function townMarks(state: GameState, towns: Uint16Array): TownMark[] {
  const capitals = new Set<number>();
  // The seats of kings and emperors: lesser realms' capitals are towns like any other.
  for (const c of state.countries)
    if (c?.alive && !c.liege && !c.rebel && (c.rank === 'kingdom' || c.rank === 'empire')) capitals.add(c.capital);
  // Towns rank against the world's of their day: the most developed few are great, the next middling.
  const devs: number[] = [];
  for (let id = 1; id * 2 + 1 < towns.length; id++)
    if ((towns[id * 2] || towns[id * 2 + 1]) && state.provinces[id]) devs.push(state.provinces[id].dev);
  devs.sort((a, b) => b - a);
  const great = devs[Math.floor(devs.length * 0.04)] ?? Infinity;
  const middling = devs[Math.floor(devs.length * 0.2)] ?? Infinity;
  const out: TownMark[] = [];
  for (let id = 1; id * 2 + 1 < towns.length; id++) {
    const x = towns[id * 2],
      y = towns[id * 2 + 1];
    const p = state.provinces[id];
    if ((!x && !y) || !p) continue;
    const size = capitals.has(id) ? 3 : p.dev >= great ? 2 : p.dev >= middling ? 1 : 0;
    const faiths = holyTo(id);
    out.push({
      x,
      y,
      size,
      from: TOWN_FROM[size],
      holy: faiths.length ? (SIGNS[faithFamily(faiths[0])] ?? 'sun') : undefined,
    });
  }
  return out;
}
