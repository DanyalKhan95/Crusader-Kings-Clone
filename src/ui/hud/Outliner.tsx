/**
 * The outliner, down the right of the screen: what the realm has in hand. Armies and fleets, sieges,
 * wars, buildings going up, colonies, missions and spy networks, each with a word on how it goes. A
 * click selects an entry and flies there. The outliner and each of its parts fold away, and stay as
 * they were left.
 */
import { useRef, type ReactNode } from 'react';
import type { IconName } from '../../assets/icons';
import { BUILDINGS } from '../../data/buildings';
import { formatMen } from '../../render/units';
import { inBattle } from '../../sim/military';
import { pathDays } from '../../sim/movement';
import { fleetInBattle, fleetSize, inPort } from '../../sim/naval';
import { armySize } from '../../sim/queries';
import { scoreFor } from '../../sim/war';
import type { Army, Country, Fleet, GameState } from '../../sim/types';
import { flyToProvince, selectArmy, selectCountry, selectFleet, selectProvince, selectWar } from '../actions';
import { CoatOfArms } from '../CoatOfArms';
import { useGame, type Game } from '../game';
import { Icon } from '../Icon';
import { useMapInsets } from '../map/useMapInsets';
import { withKey } from '../keys';
import { readPref, writePref } from '../prefs';
import { createStore, useStore } from '../store';

type SectionId = 'armies' | 'fleets' | 'sieges' | 'wars' | 'buildings' | 'colonies' | 'missions' | 'spies';

interface Layout {
  open: boolean;
  /** sections folded away */
  closed: SectionId[];
}

function loadLayout(): Layout {
  try {
    const raw = JSON.parse(readPref('outliner') ?? 'null') as Partial<Layout> | null;
    if (raw && typeof raw.open === 'boolean' && Array.isArray(raw.closed)) return raw as Layout;
  } catch {
    // a damaged preference starts afresh
  }
  // Small screens start with the outliner folded, so that it leaves the map clear.
  const small = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 760px)').matches;
  return { open: !small, closed: [] };
}

/** How the player left the outliner, kept between visits. */
const layoutStore = createStore<Layout>(loadLayout());
layoutStore.subscribe(() => writePref('outliner', JSON.stringify(layoutStore.get())));

/** Opens the outliner, or folds it away (a key does it too). */
export function toggleOutliner() {
  layoutStore.set((l) => ({ open: !l.open }));
}

interface Entry {
  key: string;
  /** the name, and a word on how it goes */
  name: ReactNode;
  status: string;
  /** a figure at the right: men, ships, progress, war score */
  value?: string;
  tone?: 'good' | 'bad';
  active?: boolean;
  onClick: () => void;
}

interface Section {
  id: SectionId;
  title: string;
  icon: IconName;
  entries: Entry[];
}

const percent = (x: number) => `${Math.floor(Math.max(0, Math.min(1, x)) * 100)}%`;

/** Selects an entry's province and flies there. */
function goTo(game: Game, id: number, select: () => void) {
  select();
  flyToProvince(game, id, 1.2);
}

export function armyStatus(game: Game, a: Army): string {
  const { state, world } = game;
  const here = world.region(a.location);
  const dest = a.path.at(-1);
  if (inBattle(state, a)) return `Fighting at ${here.name}`;
  if (a.retreating) return `Retreating to ${world.region(a.path[0] ?? a.location).name}`;
  if (dest) return `To ${world.region(dest).name}, ${Math.max(1, pathDays(world, a.location, a.path) - a.progress)} d`;
  const siege = state.provinces[a.location]?.siege;
  if (siege && siege.by === a.owner) return `Besieging ${here.name}, ${percent(siege.progress)}`;
  return here.kind === 'land' ? `At ${here.name}` : `At sea in the ${here.name}`;
}

export function fleetStatus(game: Game, f: Fleet): string {
  const { state, world } = game;
  const here = world.region(f.location);
  const dest = f.path.at(-1);
  if (fleetInBattle(state, f)) return `Fighting in the ${here.name}`;
  if (f.retreating) return 'Making for port';
  if (f.mission === 'explore') return 'Charting the unknown';
  if (dest) {
    const to = world.region(dest);
    return `To ${to.kind === 'land' ? '' : 'the '}${to.name}, ${Math.max(1, Math.round(pathDays(world, f.location, f.path, true) - f.progress))} d`;
  }
  return inPort(world, f) ? `In port at ${here.name}` : `In the ${here.name}`;
}

/** Everything the outliner shows, worked out afresh each time the world moves on. */
function sections(game: Game, me: Country): Section[] {
  const state: GameState = game.state;
  const world = game.world;
  const ui = game.ui.get();
  const name = (id: number) => world.region(id).name;
  const out: Section[] = [];

  out.push({
    id: 'armies',
    title: 'Armies',
    icon: 'knight-banner',
    entries: state.armies
      .filter((a) => a.owner === me.index)
      .map((a) => ({
        key: `army:${a.id}`,
        name: a.name,
        status: armyStatus(game, a),
        value: formatMen(armySize(a)),
        tone: inBattle(state, a) ? 'bad' : undefined,
        active: ui.panel === 'army' && ui.selectedArmy === a.id,
        onClick: () => goTo(game, a.location, () => selectArmy(game, a.id)),
      })),
  });

  out.push({
    id: 'fleets',
    title: 'Fleets',
    icon: 'sailboat',
    entries: state.fleets
      .filter((f) => f.owner === me.index)
      .map((f) => ({
        key: `fleet:${f.id}`,
        name: f.name,
        status: fleetStatus(game, f),
        value: `${Math.round(fleetSize(f))} ships`,
        tone: fleetInBattle(state, f) ? 'bad' : undefined,
        active: ui.panel === 'fleet' && ui.selectedFleet === f.id,
        onClick: () => goTo(game, f.location, () => selectFleet(game, f.id)),
      })),
  });

  // Sieges: those we lay, and those laid to what is ours.
  const sieges: Entry[] = [];
  state.provinces.forEach((p, id) => {
    if (!p?.siege) return;
    const ours = p.siege.by === me.index;
    const against = p.owner === me.index;
    if (!ours && !against) return;
    const by = state.countries[p.siege.by];
    sieges.push({
      key: `siege:${id}`,
      name: name(id),
      status: ours ? 'We besiege it' : `Besieged by ${by?.name ?? 'the enemy'}`,
      value: percent(p.siege.progress),
      tone: ours ? 'good' : 'bad',
      active: ui.panel === 'province' && ui.selectedProvince === id,
      onClick: () => goTo(game, id, () => selectProvince(game, id)),
    });
  });
  out.push({ id: 'sieges', title: 'Sieges', icon: 'siege-tower', entries: sieges });

  out.push({
    id: 'wars',
    title: 'Wars',
    icon: 'crossed-swords',
    entries: state.wars
      .filter((w) => w.attackers.includes(me.index) || w.defenders.includes(me.index))
      .map((w) => {
        const score = Math.round(scoreFor(state, w, me.index));
        const leading = w.attacker === me.index || w.defender === me.index;
        return {
          key: `war:${w.id}`,
          name: w.name,
          status: leading ? 'We lead our side' : 'Called in as an ally',
          value: `${score > 0 ? '+' : ''}${score}%`,
          tone: score > 0 ? 'good' : score < 0 ? 'bad' : undefined,
          active: ui.panel === 'war' && ui.selectedWar === w.id,
          onClick: () => selectWar(game, w.id),
        };
      }),
  });

  // Buildings going up in our provinces, soonest done first.
  const works: (Entry & { done: number })[] = [];
  state.provinces.forEach((p, id) => {
    if (p?.owner !== me.index || !p.construction) return;
    const { type, level, start, done } = p.construction;
    works.push({
      key: `build:${id}`,
      name: BUILDINGS[type].levels[level - 1] ?? BUILDINGS[type].name,
      status: `${name(id)}, ${Math.max(1, done - state.day)} d`,
      value: percent((state.day - start) / Math.max(1, done - start)),
      active: ui.panel === 'province' && ui.selectedProvince === id,
      done,
      onClick: () => goTo(game, id, () => selectProvince(game, id)),
    });
  });
  works.sort((a, b) => a.done - b.done);
  out.push({ id: 'buildings', title: 'Buildings', icon: 'hammer-nails', entries: works });

  out.push({
    id: 'colonies',
    title: 'Colonies',
    icon: 'wood-cabin',
    entries: me.colonies.map((m) => ({
      key: `colony:${m.province}`,
      name: name(m.province),
      status: 'Settlers at work',
      value: percent(m.progress / Math.max(1, m.needed)),
      active: ui.panel === 'province' && ui.selectedProvince === m.province,
      onClick: () => goTo(game, m.province, () => selectProvince(game, m.province)),
    })),
  });

  // Missions of the faith and of the tongue, a claim being forged, a vassal being brought in.
  const missions: Entry[] = [];
  if (me.converting) {
    const m = me.converting;
    missions.push({
      key: 'converting',
      name: name(m.province),
      status: 'A mission to convert',
      value: percent(m.progress / Math.max(1, m.needed)),
      onClick: () => goTo(game, m.province, () => selectProvince(game, m.province)),
    });
  }
  if (me.assimilating) {
    const m = me.assimilating;
    missions.push({
      key: 'assimilating',
      name: name(m.province),
      status: 'Schools teaching our tongue',
      value: percent(m.progress / Math.max(1, m.needed)),
      onClick: () => goTo(game, m.province, () => selectProvince(game, m.province)),
    });
  }
  if (me.fabricating) {
    const f = me.fabricating;
    missions.push({
      key: 'fabricating',
      name: name(f.province),
      status: `A claim being forged, ${Math.max(1, f.done - state.day)} d`,
      value: percent((state.day - f.start) / Math.max(1, f.done - f.start)),
      onClick: () => goTo(game, f.province, () => selectProvince(game, f.province)),
    });
  }
  if (me.integrating) {
    const it = me.integrating;
    const v = state.countries[it.vassal];
    missions.push({
      key: 'integrating',
      name: v?.name ?? 'A vassal',
      status: 'Being integrated',
      value: percent(it.progress / Math.max(1, it.needed)),
      onClick: () => selectCountry(game, it.vassal, true),
    });
  }
  out.push({ id: 'missions', title: 'Missions', icon: 'prayer', entries: missions });

  out.push({
    id: 'spies',
    title: 'Spy networks',
    icon: 'spy',
    entries: Object.entries(me.spies)
      .map(([k, v]) => [Number(k), v] as const)
      .filter(([k, v]) => v > 0 && state.countries[k]?.alive)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => ({
        key: `spies:${k}`,
        name: state.countries[k].name,
        status: me.spyTarget === k ? 'The spymaster is building it' : 'Standing',
        value: `${Math.round(v)}`,
        active: ui.panel === 'country' && ui.selectedCountry === k,
        onClick: () => selectCountry(game, k, true),
      })),
  });

  return out.filter((s) => s.entries.length);
}

export function Outliner() {
  const game = useGame();
  useStore(game.ui, (s) => s.tick);
  useStore(game.ui, (s) => `${s.panel}:${s.selectedArmy}:${s.selectedFleet}:${s.selectedProvince}:${s.selectedWar}`);
  const player = useStore(game.ui, (s) => s.player);
  const layout = useStore(layoutStore, (l) => l);
  const update = (next: Layout) => layoutStore.set(next);
  const me = game.state.countries[player];
  if (!me) return null;
  const list = sections(game, me);
  return layout.open ? (
    <OpenOutliner list={list} layout={layout} update={update} />
  ) : (
    <button
      className="panel outliner-closed"
      onClick={() => update({ ...layout, open: true })}
      aria-expanded="false"
      title={withKey('Show the outliner', 'outliner')}
    >
      <Icon name="scroll-unfurled" />
      <span className="caps">Outliner</span>
    </button>
  );
}

/** The open outliner; mounted only while open, so the map knows when the right edge is covered. */
function OpenOutliner({ list, layout, update }: { list: Section[]; layout: Layout; update: (l: Layout) => void }) {
  const game = useGame();
  const ref = useRef<HTMLElement>(null);
  useMapInsets('outliner', [ref]);
  const me = game.state.countries[game.state.player];
  const toggle = (id: SectionId) =>
    update({
      ...layout,
      closed: layout.closed.includes(id) ? layout.closed.filter((x) => x !== id) : [...layout.closed, id],
    });
  return (
    <aside ref={ref} className="panel outliner" aria-label="Outliner">
      <header className="outliner-head">
        {me && <CoatOfArms country={me} size={22} />}
        <span className="caps">Outliner</span>
        <button
          className="btn ghost small outliner-fold"
          onClick={() => update({ ...layout, open: false })}
          aria-expanded="true"
          aria-label="Fold the outliner away"
          title={withKey('Fold the outliner away', 'outliner')}
        >
          <Icon name="contract" />
        </button>
      </header>
      {list.length ? (
        <div className="outliner-body">
          {list.map((s) => {
            const open = !layout.closed.includes(s.id);
            return (
              <section key={s.id} className="ol-section">
                <button className="ol-title" aria-expanded={open} onClick={() => toggle(s.id)}>
                  <Icon name={s.icon} />
                  <span className="caps">{s.title}</span>
                  <span className="num ol-count">{s.entries.length}</span>
                  <span className={`ol-chevron ${open ? 'open' : ''}`} aria-hidden="true" />
                </button>
                {open && (
                  <ul className="ol-list">
                    {s.entries.map((e) => (
                      <li key={e.key}>
                        <button className={`ol-row ${e.active ? 'active' : ''}`} onClick={e.onClick}>
                          <span className="ol-name">{e.name}</span>
                          {e.value && <span className={`num ol-value ${e.tone ?? ''}`}>{e.value}</span>}
                          <span className="ol-status">{e.status}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <p className="dim small outliner-empty">No armies in the field, no wars and nothing building.</p>
      )}
    </aside>
  );
}
