/**
 * The Year of Three Kings. On 15 September 1066 Harald Hardrada is ashore in Yorkshire with Tostig
 * Godwinson, the northern earls stand against him at York, King Harold is in London, and Duke William
 * waits in Normandy for a south wind.
 */
import { toDay } from './calendar';
import { makeCharacter } from './characters';
import { log } from './log';
import { newArmy } from './military';
import { countryByTag } from './queries';
import type { Country, GameState } from './types';
import { declareWar } from './war';
import type { SimWorld } from './world';

function provinceNamed(state: GameState, world: SimWorld, owner: Country, name: string): number {
  const r = world.regions.find((x) => x.name === name && state.provinces[x.id]?.owner === owner.index);
  return r?.id ?? owner.capital;
}

export function setup1066(state: GameState, world: SimWorld) {
  const eng = countryByTag(state, 'ENG');
  const nrw = countryByTag(state, 'NRW');
  const nrm = countryByTag(state, 'NRM');
  if (!eng || !nrw || !nrm) return;

  nrm.throneClaims.push(eng.index);
  nrw.throneClaims.push(eng.index);
  // Harold was crowned in January, on the day Edward the Confessor was buried; his right is disputed.
  eng.rulerSince = toDay(1066, 1, 6);
  eng.legitimacy = 45;

  const york = provinceNamed(state, world, eng, 'York');
  const london = provinceNamed(state, world, eng, 'London');

  // Hardrada's host has landed and faces Edwin and Morcar outside York.
  const tostig = makeCharacter(state, world, nrw, { name: 'Tostig Godwinson', age: 40, talent: 2 });
  nrw.courtiers.push(tostig.id);
  declareWar(state, world, nrw.index, eng.index, 'throne', eng.index);
  newArmy(state, nrw, york, { spearmen: 3000, archers: 800, levy: 5200 }, nrw.ruler).name = 'Host of Harald Hardrada';
  nrw.manpower = Math.max(0, nrw.manpower - 5200);
  // Some three hundred ships lie in the Ouse at Riccall.
  nrw.transports = Math.max(nrw.transports, 300);
  const morcar = makeCharacter(state, world, eng, { name: 'Morcar of Northumbria', age: 21, talent: 1 });
  eng.courtiers.push(morcar.id);
  newArmy(state, eng, york, { levy: 4500, spearmen: 500 }, morcar.id).name = 'Army of the Northern Earls';
  newArmy(state, eng, london, { spearmen: 2500, archers: 400, levy: 5000 }, eng.ruler).name = 'Royal Army of England';
  eng.manpower = Math.max(0, eng.manpower - 9500);
  eng.reserve = {};

  // William's fleet waits at the mouth of the Somme.
  const normandy = nrm.capital;
  newArmy(state, nrm, normandy, { knights: 2000, archers: 1500, spearmen: 2500, levy: 1000 }, nrm.ruler).name =
    'Army of Duke William';
  nrm.manpower = Math.max(0, nrm.manpower - 1000);
  nrm.reserve = {};
  nrm.gold += 300;
  // Seven hundred ships, built and gathered over the summer.
  nrm.transports = Math.max(nrm.transports, 250);
  state.scheduled.push({ day: state.day + 13, event: 'norman_invasion' });
}

export function runScheduled(state: GameState, world: SimWorld) {
  for (const s of state.scheduled) {
    if (s.day > state.day) continue;
    if (s.event === 'norman_invasion') normanInvasion(state, world);
  }
  state.scheduled = state.scheduled.filter((s) => s.day > state.day);
}

function normanInvasion(state: GameState, world: SimWorld) {
  const eng = countryByTag(state, 'ENG');
  const nrm = countryByTag(state, 'NRM');
  if (!eng?.alive || !nrm?.alive) return;
  if (nrm.index === state.player) {
    log(state, [nrm.index], 'event', 'The wind has turned to the south. The fleet is ready to sail for England.', {
      important: true,
      province: nrm.capital,
    });
    return;
  }
  declareWar(state, world, nrm.index, eng.index, 'throne', eng.index);
}
