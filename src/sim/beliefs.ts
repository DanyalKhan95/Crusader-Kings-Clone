/**
 * Faiths and peoples of the loaded world, including the heresies the map data does not know, and the
 * provinces that are holy to each faith. Set once when the world is loaded (see `makeSimWorld` and
 * `loadWorld`); the data never changes during a game.
 */
import { HERESIES, HOLY_SITES } from '../data/faiths';
import type { RegionData, WorldData } from '../shared/dataTypes';

interface FaithDef {
  name: string;
  family: string;
  color: string;
}

let faiths: Record<string, FaithDef> = {};
let groups: Record<string, string> = {};
let cultureNames: Record<string, string> = {};
let sites: Record<string, number[]> = {};
let holyMap: Map<number, string[]> = new Map();
let named: Map<string, number> = new Map();

export function registerBeliefs(world: WorldData, regions: RegionData[]) {
  faiths = { ...world.religions };
  for (const [id, h] of Object.entries(HERESIES)) faiths[id] = { name: h.name, family: h.family, color: h.color };
  groups = {};
  cultureNames = {};
  for (const [id, c] of Object.entries(world.cultures)) {
    groups[id] = c.group;
    cultureNames[id] = c.name;
  }
  const byName = new Map<string, number>();
  for (const r of regions) if (r.kind === 'land' && !byName.has(r.name)) byName.set(r.name, r.id);
  named = byName;
  sites = {};
  holyMap = new Map();
  for (const [faith, names] of Object.entries(HOLY_SITES)) {
    sites[faith] = names.map((n) => byName.get(n) ?? 0).filter(Boolean);
    for (const id of sites[faith]) holyMap.set(id, [...(holyMap.get(id) ?? []), faith]);
  }
}

export function faithFamily(id: string | null | undefined): string {
  return (id && faiths[id]?.family) || '';
}

export function faithName(id: string | null | undefined): string {
  return (id && faiths[id]?.name) || 'Unknown';
}

export function faithColor(id: string | null | undefined): string {
  return (id && faiths[id]?.color) || '#888888';
}

export function isFaith(id: string): boolean {
  return !!faiths[id];
}

/** Every faith of the world, the heresies included. */
export function faithIds(): string[] {
  return Object.keys(faiths);
}

export function cultureGroup(id: string | null | undefined): string {
  return (id && groups[id]) || '';
}

export function cultureName(id: string | null | undefined): string {
  return (id && cultureNames[id]) || 'Unknown';
}

/** Province ids of the holy sites of a faith. */
export function holySites(faith: string): number[] {
  return sites[faith] ?? [];
}

/** Faiths for which a province is holy. */
export function holyTo(province: number): string[] {
  return holyMap.get(province) ?? [];
}

/** The land province with this name (the first, if several share it), or 0. */
export function provinceNamed(name: string): number {
  return named.get(name) ?? 0;
}
