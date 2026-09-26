/**
 * Decisions: proclaiming a nation (see data/nations.ts). A realm of the right people that holds
 * enough of a nation's heartland may take its name, rank and arms, and claims the rest of it.
 */
import { NATIONS, type NationDef } from '../data/nations';
import type { Rank } from '../shared/dataTypes';
import { faithFamily, provinceNamed } from './beliefs';
import { toDate } from './calendar';
import { log } from './log';
import { countryByTag, invalidateTags, realmProvinces, topLiege } from './queries';
import { knowsId, techById } from './tech';
import type { Country, GameState } from './types';
import { distanceKm, type SimWorld } from './world';

type Check = { ok: true } | { ok: false; reason: string };
const yes: Check = { ok: true };
const no = (reason: string): Check => ({ ok: false, reason });

const RANKS: Rank[] = ['county', 'duchy', 'kingdom', 'empire'];

/** Nations a realm could one day proclaim: those of its people or faith not yet proclaimed by another. */
export function nationsFor(state: GameState, c: Country): NationDef[] {
  return NATIONS.filter(
    (n) =>
      (!n.cultures || n.cultures.includes(c.culture)) &&
      (!n.families || n.families.includes(faithFamily(c.religion))) &&
      c.tag !== n.tag &&
      !countryByTag(state, n.tag)?.alive,
  );
}

/** The heartland provinces, each with whether the realm holds it. */
export function heartland(state: GameState, c: Country, n: NationDef): { id: number; name: string; held: boolean }[] {
  return n.provinces.map((name) => {
    const id = provinceNamed(name);
    const owner = id ? (state.provinces[id]?.owner ?? 0) : 0;
    return { id, name, held: !!owner && topLiege(state, owner) === c.index };
  });
}

export function canForm(state: GameState, c: Country, n: NationDef): Check {
  if (!c?.alive || c.rebel) return no('No such realm');
  if (c.liege) return no('Only an independent realm may proclaim a nation');
  if (c.colony) return no('A colonial nation answers to its crown');
  if (c.tag === n.tag) return no('Already proclaimed');
  if (n.cultures && !n.cultures.includes(c.culture)) return no(`Only a realm of the ${n.adj} peoples`);
  if (n.families && !n.families.includes(faithFamily(c.religion))) return no('Only a realm of the right faith');
  const holder = countryByTag(state, n.tag);
  if (holder?.alive) return no(`${holder.name} has proclaimed it already`);
  if (n.from && toDate(state.day).y < n.from) return no(`Not before ${n.from}`);
  if (n.tech && !knowsId(c, n.tech)) return no(`It needs ${techById(n.tech)?.name ?? n.tech}`);
  const held = heartland(state, c, n).filter((p) => p.held).length;
  if (held < n.need) return no(`Hold ${n.need} of its ${n.provinces.length} heartland provinces (you hold ${held})`);
  return yes;
}

/** The realm proclaims the nation: a new name, rank and arms, and claims on the rest of its land. */
export function formNation(state: GameState, world: SimWorld, c: Country, n: NationDef): boolean {
  if (!canForm(state, c, n).ok) return false;
  const old = c.name;
  // Old names still answer: scripted happenings and heads of faith may look the realm up by them.
  state.happened[`tag:${c.tag}`] = c.index;
  c.tag = n.tag;
  c.name = n.name;
  c.short = n.short;
  c.adj = n.adj;
  if (RANKS.indexOf(n.rank) > RANKS.indexOf(c.rank)) c.rank = n.rank;
  c.legitimacy = Math.min(100, c.legitimacy + 15);
  c.stability = Math.min(3, c.stability + 1);
  c.history[`nation:${n.id}`] = state.day;
  // Claims: the heartland not yet held, and land of the nation's peoples around it.
  const mine = new Set(realmProvinces(state, c.index));
  const claims = new Set(c.claims);
  for (const p of heartland(state, c, n)) if (p.id && !p.held && state.provinces[p.id]?.owner) claims.add(p.id);
  if (n.lands) {
    const [lon, lat, km] = n.lands;
    const centre = { lon, lat } as Parameters<typeof distanceKm>[0];
    for (const r of world.regions) {
      const p = state.provinces[r.id];
      if (r.kind !== 'land' || !p?.owner || mine.has(r.id) || !p.culture || !n.cultures?.includes(p.culture)) continue;
      if (distanceKm(centre, r) <= km) claims.add(r.id);
    }
  }
  c.claims = [...claims];
  invalidateTags(state);
  state.mapVersion++;
  state.borderVersion++;
  state.diploVersion++;
  log(state, 'all', 'event', `${old} has proclaimed the ${n.name}.`, {
    province: c.capital,
    important: c.index === state.player,
  });
  return true;
}

/** The AI proclaims any nation it can, on the first of the year. */
export function decisionsAI(state: GameState, world: SimWorld, c: Country) {
  if (c.liege || c.rebel) return;
  for (const n of nationsFor(state, c)) if (canForm(state, c, n).ok) formNation(state, world, c, n);
}
