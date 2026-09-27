/**
 * The menu of a place: a right-click on the map (a long press on a touch screen), with no army or
 * fleet of the player's selected, lists what can be done there. At home: building, recruiting,
 * missions and schools. Abroad: claims, war, gifts, treaties and spies. In empty land: a colony.
 * What cannot be done says why, as the panels do.
 */
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { IconName } from '../../assets/icons';
import { BUILDING_ORDER, BUILDINGS, MAX_LEVEL } from '../../data/buildings';
import { unitDef } from '../../data/units';
import { formatMen } from '../../render/units';
import { toDate } from '../../sim/calendar';
import { theName } from '../../sim/chronicle';
import { canColonise, colonisedBy, natives } from '../../sim/colonies';
import * as cmd from '../../sim/commands';
import {
  canFabricate,
  canIntegrate,
  canPropose,
  fabricationCost,
  giftCost,
  hasPact,
  pactWillingness,
} from '../../sim/diplomacy';
import { canBuild, canDevelop, income, reserveMen } from '../../sim/economy';
import { canSpyOn } from '../../sim/espionage';
import { knows } from '../../sim/exploration';
import { canAssimilate, canConvert, cultureStanding, faithStanding } from '../../sim/faith';
import { availableMaa, recruitCost } from '../../sim/military';
import { availableShips, canBuildShips, isOpenOcean, shipLook } from '../../sim/naval';
import { atWar, isInRealm, lordOf, topLiege } from '../../sim/queries';
import { militaryEra } from '../../sim/tech';
import type { Country, PactKind } from '../../sim/types';
import { canDeclare } from '../../sim/war';
import { openDeclareWar, run, selectCountry, selectProvince, selectWar } from '../actions';
import { CoatOfArms } from '../CoatOfArms';
import { capitalize, formatDate } from '../format';
import { useGame, type ContextMenuAt, type Game } from '../game';
import { Icon } from '../Icon';
import { cultureName } from '../realm';
import { uiScale } from '../settings';
import { useStore } from '../store';

export type MenuPage = 'main' | 'build' | 'recruit' | 'treaties';

export interface MenuItem {
  key: string;
  icon: IconName;
  label: string;
  /** a second, quieter line: what it will do */
  note?: string;
  /** gold it costs */
  cost?: number;
  /** a word at the right, such as whether they would agree */
  detail?: string;
  /** why it cannot be done now: the item stays, closed, and says so */
  reason?: string;
  tone?: 'danger' | 'good' | 'bad';
  /** another page of the menu */
  page?: MenuPage;
  /** the menu stays open after it, for another of the same */
  keep?: boolean;
  /** what it does; an item with neither this nor a page is a line of news */
  act?: () => void;
}

export interface Menu {
  title: string;
  /** who holds the place, or what it is */
  sub: string;
  /** the realm whose arms head the menu */
  arms?: number;
  groups: MenuItem[][];
}

const back: MenuItem = { key: 'back', icon: 'return-arrow', label: 'Back', page: 'main' };

const look = (game: Game, id: number): MenuItem => ({
  key: 'look',
  icon: 'magnifying-glass',
  label: `Look at ${game.world.region(id).name}`,
  act: () => selectProvince(game, id),
});

const days = (n: number) => `${Math.max(1, n)} ${n === 1 ? 'day' : 'days'}`;

/** What can be done with a place, page by page; null where there is nothing to show. */
export function menuFor(game: Game, region: number, page: MenuPage = 'main'): Menu | null {
  const { state, world } = game;
  const r = world.region(region);
  const me = state.countries[state.player];
  if (!r || !me?.alive) return null;
  if (!knows(world, me, region)) return { title: 'Unknown lands', sub: 'Your people know nothing of them', groups: [] };
  if (r.kind !== 'land')
    return {
      title: r.name,
      sub: r.kind === 'lake' ? 'A lake' : isOpenOcean(world, region) ? 'The open ocean' : 'A sea zone',
      groups: [[look(game, region)]],
    };
  if (r.impassable) return { title: r.name, sub: 'Wilderness no one can cross', groups: [[look(game, region)]] };
  const owner = state.countries[state.provinces[region]?.owner ?? 0];
  if (!owner) return wildMenu(game, region, me);
  if (owner.index === me.index) {
    if (page === 'build') return buildPage(game, region, me);
    if (page === 'recruit') return recruitPage(game, region, me);
    return homeMenu(game, region, me);
  }
  if (page === 'treaties') return treatiesPage(game, me, owner);
  return foreignMenu(game, region, me, owner);
}

// ── Land no one rules ─────────────────────────────────────────────

function wildMenu(game: Game, id: number, me: Country): Menu {
  const { state, world } = game;
  const p = state.provinces[id];
  const settler = colonisedBy(state, id);
  const colony: MenuItem[] = [];
  if (settler) {
    const job = settler.colonies.find((m) => m.province === id);
    colony.push({
      key: 'settling',
      icon: 'wood-cabin',
      label: settler === me ? 'Your colonists are settling it' : `${capitalize(theName(settler.name))} is settling it`,
      note: job ? `${Math.max(1, job.needed - job.progress)} months to go` : undefined,
    });
  } else {
    const check = canColonise(state, world, me, id);
    colony.push({
      key: 'colonise',
      icon: 'wood-cabin',
      label: 'Found a colony',
      note: check.ok ? `About ${check.months} months; then the land is yours` : undefined,
      cost: check.ok ? check.cost : undefined,
      reason: check.ok ? undefined : check.reason,
      act: () => run(game, cmd.colonise(state, world, id)),
    });
  }
  const n = natives(state, world, id);
  return {
    title: world.region(id).name,
    sub: n && p?.culture ? `Tribal lands of the ${cultureName(game, p.culture)} people` : 'Empty land',
    groups: [[look(game, id)], colony],
  };
}

// ── The player's own provinces ────────────────────────────────────

function homeMenu(game: Game, id: number, me: Country): Menu {
  const { state, world } = game;
  const p = state.provinces[id];
  const con = p.construction;
  const open = BUILDING_ORDER.filter((t) => canBuild(state, world, me.index, id, t).ok).length;
  const work: MenuItem[] = [
    {
      key: 'build',
      icon: 'hammer-nails',
      label: 'Build',
      note: con
        ? `${BUILDINGS[con.type].levels[con.level - 1]} going up: ${days(con.done - state.day)}`
        : open
          ? `${open} ${open === 1 ? 'building' : 'buildings'} within reach`
          : 'Nothing within reach',
      page: 'build',
    },
    {
      key: 'recruit',
      icon: 'knight-banner',
      label: 'Recruit',
      note: 'Raise the army, or hire men-at-arms',
      page: 'recruit',
    },
  ];
  const missions: MenuItem[] = [];
  if (faithStanding(me, p) !== 'same') {
    const at = me.converting?.province === id ? me.converting : null;
    const check = at ? null : canConvert(state, me, id);
    missions.push({
      key: 'convert',
      icon: 'prayer',
      label: at ? 'Missionaries at work' : 'Send missionaries',
      note: at ? `${Math.floor((at.progress / at.needed) * 100)}% of the way` : 'Your chaplain turns to this province',
      reason: check && !check.ok ? check.reason : undefined,
      act: at ? undefined : () => run(game, cmd.convert(state, world, id)),
    });
  }
  const cs = cultureStanding(me, p);
  if (cs !== 'own' && cs !== 'accepted') {
    const at = me.assimilating?.province === id ? me.assimilating : null;
    const check = at ? null : canAssimilate(state, me, id);
    missions.push({
      key: 'assimilate',
      icon: 'scroll-quill',
      label: at ? 'Schools at work' : 'Found schools',
      note: at ? `${Math.floor((at.progress / at.needed) * 100)}% of the way` : 'Your steward teaches them your ways',
      reason: check && !check.ok ? check.reason : undefined,
      act: at ? undefined : () => run(game, cmd.assimilate(state, world, id)),
    });
  }
  return {
    title: world.region(id).name,
    sub: 'Your province',
    arms: me.index,
    groups: [[look(game, id)], work, missions].filter((g) => g.length),
  };
}

function buildPage(game: Game, id: number, me: Country): Menu {
  const { state, world } = game;
  const p = state.provinces[id];
  const dev = canDevelop(state, world, me.index, id);
  const land: MenuItem[] = [
    {
      key: 'develop',
      icon: 'village',
      label: 'Develop the land',
      note: `Development ${p.dev}, +1 at once`,
      cost: dev.ok ? dev.cost : undefined,
      reason: dev.ok ? undefined : dev.reason,
      act: () => run(game, cmd.developProvince(state, world, id)),
    },
  ];
  for (const type of BUILDING_ORDER) {
    const level = p.buildings[type] ?? 0;
    if (level >= MAX_LEVEL) continue;
    const def = BUILDINGS[type];
    const check = canBuild(state, world, me.index, id, type);
    // What this land can never hold is left out; what waits on gold, time or learning is shown.
    if (!check.ok && check.reason === 'Needs a coast') continue;
    land.push({
      key: type,
      icon: def.icon,
      label: def.levels[level],
      note: check.ok ? `${def.name}, level ${level + 1}: ${days(check.days)}` : `${def.name}, level ${level + 1}`,
      cost: check.ok ? check.cost : undefined,
      reason: check.ok ? undefined : check.reason,
      act: () => run(game, cmd.build(state, world, id, type)),
    });
  }
  const ships: MenuItem[] = [];
  if (world.region(id).coastal)
    for (const t of availableShips(me)) {
      const check = canBuildShips(state, world, me, id, t, 1);
      const shipLookup = shipLook(me, t);
      ships.push({
        key: `ship:${t}`,
        icon: shipLookup.icon,
        label: shipLookup.name,
        note: 'A warship, launched in this port',
        cost: check.ok ? check.cost : undefined,
        reason: check.ok ? undefined : check.reason,
        keep: true,
        act: () => run(game, cmd.buildWarships(state, world, id, t, 1)),
      });
    }
  return {
    title: world.region(id).name,
    sub: 'Build',
    arms: me.index,
    groups: [[back], land, ships].filter((g) => g.length),
  };
}

function recruitPage(game: Game, id: number, me: Country): Menu {
  const { state, world } = game;
  const men = me.manpower + reserveMen(me);
  const era = militaryEra(me);
  const capitalName = world.region(me.capital)?.name;
  return {
    title: world.region(id).name,
    sub: 'Recruit',
    arms: me.index,
    groups: [
      [back],
      [
        {
          key: 'raise',
          icon: 'knight-banner',
          label: 'Raise the army',
          note: `${formatMen(men)} men gather${capitalName ? ` at ${capitalName}` : ''}`,
          reason: men < 50 ? 'No men to raise' : undefined,
          act: () => run(game, cmd.raise(state, world)),
        },
      ],
      availableMaa(me).map((t): MenuItem => {
        const u = unitDef(t, era);
        const cost = recruitCost(me, t, 1);
        return {
          key: `maa:${t}`,
          icon: u.icon,
          label: u.name,
          note: `${u.regiment} men, at home until raised`,
          cost,
          reason: me.gold < cost ? `Needs ${cost} gold` : undefined,
          keep: true,
          act: () => run(game, cmd.recruitMaa(state, t, 1)),
        };
      }),
    ],
  };
}

// ── Other realms ──────────────────────────────────────────────────

function foreignMenu(game: Game, id: number, me: Country, owner: Country): Menu {
  const { state, world } = game;
  const top = state.countries[topLiege(state, owner.index)];
  const myTop = topLiege(state, me.index);
  const subject = lordOf(state, owner.index) === me.index;
  const lord = lordOf(state, me.index) === owner.index;
  const foreign = !subject && !lord && !isInRealm(state, owner.index, myTop);
  const war = atWar(state, me.index, owner.index);
  const sub =
    top !== owner
      ? `${capitalize(theName(owner.name))}, within ${theName(top.name)}`
      : subject
        ? `${capitalize(theName(owner.name))}, your ${owner.liege === me.index ? 'vassal' : 'tributary'}`
        : capitalize(theName(owner.name));

  const first: MenuItem[] = [
    look(game, id),
    {
      key: 'realm',
      icon: 'flying-flag',
      label: `See ${theName(owner.name)}`,
      act: () => selectCountry(game, owner.index),
    },
  ];

  // War and claims.
  const arms: MenuItem[] = [];
  if (war) {
    const w = state.wars.find(
      (x) =>
        (x.attackers.includes(me.index) && x.defenders.includes(owner.index)) ||
        (x.defenders.includes(me.index) && x.attackers.includes(owner.index)),
    );
    if (w)
      arms.push({
        key: 'war',
        icon: 'crossed-swords',
        label: `See the war`,
        note: w.name,
        act: () => selectWar(game, w.id),
      });
  } else if (lord) {
    arms.push({
      key: 'independence',
      icon: 'breaking-chain',
      label: 'Fight for independence',
      tone: 'danger',
      act: () => openDeclareWar(game, owner.index),
    });
  } else if (foreign) {
    const general = canDeclare(state, world, me.index, owner.index, 'conquest', 0);
    const throne =
      me.throneClaims.includes(top.index) && canDeclare(state, world, me.index, owner.index, 'throne', top.index).ok;
    const truce = state.truces.find(
      (t) => ((t.a === myTop && t.b === top.index) || (t.b === myTop && t.a === top.index)) && t.until > state.day,
    );
    arms.push({
      key: 'declare',
      icon: 'crossed-swords',
      label: `Declare war on ${theName(top.short)}`,
      note: me.claims.includes(id) ? `For your claim on ${world.region(id).name}` : undefined,
      tone: 'danger',
      reason:
        general.ok || throne
          ? undefined
          : truce
            ? `A truce holds until ${formatDate(toDate(truce.until))}`
            : general.reason,
      act: () => openDeclareWar(game, owner.index, id),
    });
  }
  if (foreign) {
    const forging = me.fabricating?.province === id ? me.fabricating : null;
    if (me.claims.includes(id)) arms.push({ key: 'claimed', icon: 'wax-seal', label: 'You claim this province' });
    else if (forging)
      arms.push({
        key: 'forging',
        icon: 'scroll-quill',
        label: 'Your chancellor is forging a claim',
        note: `${days(forging.done - state.day)} to go`,
      });
    else {
      const check = canFabricate(state, world, me.index, id);
      arms.push({
        key: 'fabricate',
        icon: 'scroll-quill',
        label: 'Forge a claim',
        note: 'A just cause for war, and half the price at the peace table',
        cost: check.ok ? fabricationCost(state, id) : undefined,
        reason: check.ok ? undefined : check.reason,
        act: () => run(game, cmd.fabricate(state, world, id)),
      });
    }
  }

  // Diplomacy and spies.
  const talk: MenuItem[] = [];
  if (!war) {
    const cost = giftCost(income(state, owner).total);
    talk.push({
      key: 'gift',
      icon: 'present',
      label: 'Send a gift',
      note: 'They will think better of you for years',
      cost,
      reason: me.gold < cost ? `Needs ${cost} gold` : undefined,
      act: () => run(game, cmd.gift(state, owner.index)),
    });
    if (foreign && !top.rebel)
      talk.push({ key: 'treaties', icon: 'wax-seal', label: `Treaties with ${theName(top.short)}`, page: 'treaties' });
  }
  if (subject && owner.liege === me.index) {
    const at = me.integrating?.vassal === owner.index ? me.integrating : null;
    const check = at ? null : canIntegrate(state, world, me.index, owner.index);
    talk.push({
      key: 'integrate',
      icon: 'crossed-chains',
      label: at ? 'Being integrated' : `Integrate ${theName(owner.short)}`,
      note: at ? `${Math.floor((at.progress / at.needed) * 100)}% of the way` : 'Their lands become yours, slowly',
      reason: check && !check.ok ? check.reason : undefined,
      act: at ? undefined : () => run(game, cmd.integrate(state, world, owner.index)),
    });
  }
  if (canSpyOn(state, me, owner.index).ok) {
    const here = me.spyTarget === owner.index;
    const elsewhere = me.spyTarget && !here ? state.countries[me.spyTarget] : undefined;
    talk.push(
      here
        ? { key: 'spies', icon: 'spy', label: 'Your agents are at work here', note: 'Plots are in their panel' }
        : {
            key: 'spies',
            icon: 'spy',
            label: 'Build a spy network',
            note: elsewhere
              ? `Your agents leave ${theName(elsewhere.name)}`
              : 'Your spymaster works agents into their court',
            act: () => run(game, cmd.spyOn(state, owner.index)),
          },
    );
  }

  return {
    title: world.region(id).name,
    sub,
    arms: owner.index,
    groups: [first, arms, talk].filter((g) => g.length),
  };
}

const PACTS: { kind: PactKind; icon: IconName; propose: string; cancel: string }[] = [
  { kind: 'alliance', icon: 'shaking-hands', propose: 'Propose an alliance', cancel: 'Break the alliance' },
  { kind: 'nap', icon: 'wax-seal', propose: 'Non-aggression pact', cancel: 'End the pact' },
  { kind: 'access', icon: 'open-gate', propose: 'Ask for military access', cancel: 'Give up access' },
  {
    kind: 'guarantee',
    icon: 'checked-shield',
    propose: 'Guarantee their independence',
    cancel: 'Withdraw the guarantee',
  },
];

function treatiesPage(game: Game, me: Country, owner: Country): Menu {
  const { state, world } = game;
  const top = state.countries[topLiege(state, owner.index)];
  const items = PACTS.map(({ kind, icon, propose, cancel }): MenuItem => {
    // Access is asked of them; the other treaties bind both alike.
    if (kind === 'access' ? hasPact(state, 'access', top.index, me.index) : hasPact(state, kind, me.index, top.index))
      return {
        key: kind,
        icon,
        label: cancel,
        note: kind === 'access' ? 'Ends your right of passage' : 'They will remember that you broke faith',
        tone: 'danger',
        act: () => run(game, cmd.cancelTreaty(state, kind, top.index)),
      };
    const check = canPropose(state, kind, me.index, top.index);
    const will = kind === 'guarantee' || !check.ok ? null : pactWillingness(state, world, kind, top.index, me.index);
    return {
      key: kind,
      icon,
      label: propose,
      detail: will ? (will.total >= 0 ? 'they agree' : 'they refuse') : undefined,
      tone: will ? (will.total >= 0 ? 'good' : 'bad') : undefined,
      reason: check.ok ? undefined : check.reason,
      act: () => run(game, cmd.proposePact(state, world, kind, top.index)),
    };
  });
  if (hasPact(state, 'access', me.index, top.index))
    items.push({
      key: 'revoke',
      icon: 'open-gate',
      label: 'Revoke their access',
      tone: 'danger',
      act: () => run(game, cmd.cancelTreaty(state, 'access', top.index)),
    });
  return {
    title: top.short,
    sub: 'Treaties',
    arms: top.index,
    groups: [[back], items],
  };
}

// ── On screen ─────────────────────────────────────────────────────

export function ContextMenu() {
  const game = useGame();
  const at = useStore(game.ui, (s) => s.contextMenu);
  const modal = useStore(game.ui, (s) => s.modal);
  // A window that opens over the map takes the menu with it.
  useEffect(() => {
    if (modal !== 'none' && game.ui.get().contextMenu) game.ui.set({ contextMenu: null });
  }, [game, modal]);
  if (!at || modal !== 'none') return null;
  return <PlaceMenu key={`${at.region}:${at.x}:${at.y}`} at={at} />;
}

function PlaceMenu({ at }: { at: ContextMenuAt }) {
  const game = useGame();
  useStore(game.ui, (s) => s.tick);
  const [page, setPage] = useState<MenuPage>('main');
  const ref = useRef<HTMLDivElement>(null);
  const menu = menuFor(game, at.region, page);
  const close = () => game.ui.set({ contextMenu: null });

  // At the pointer, and wholly on screen.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const k = uiScale();
    const w = el.offsetWidth * k,
      h = el.offsetHeight * k;
    const left = Math.max(8, Math.min(at.x, window.innerWidth - w - 8));
    const top = Math.max(8, Math.min(at.y, window.innerHeight - h - 8));
    // By left and top: the transform is the opening animation's.
    el.style.left = `${left / k}px`;
    el.style.top = `${top / k}px`;
  });

  // Keys go to the menu: the first thing it offers takes the focus.
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('.cm-item[role="menuitem"]:not([aria-disabled="true"])')?.focus();
  }, [page]);

  // A press anywhere else, the wheel or a new size of window closes it.
  useEffect(() => {
    const outside = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) game.ui.set({ contextMenu: null });
    };
    const shut = () => game.ui.set({ contextMenu: null });
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('wheel', outside, true);
    window.addEventListener('resize', shut);
    return () => {
      window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('wheel', outside, true);
      window.removeEventListener('resize', shut);
    };
  }, [game]);

  if (!menu) return null;
  const choose = (item: MenuItem) => {
    if (item.reason) return;
    if (item.page) setPage(item.page);
    else if (item.act) {
      item.act();
      if (!item.keep) close();
    }
  };
  const onKey = (e: KeyboardEvent) => {
    // The menu answers the keys while it has them; none reach the map or the hotkeys behind it.
    e.stopPropagation();
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('.cm-item[role="menuitem"]') ?? [])];
    const now = items.indexOf(document.activeElement as HTMLElement);
    const focus = (i: number) => items[(i + items.length) % items.length]?.focus();
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown') focus(now + 1);
    else if (e.key === 'ArrowUp') focus(now < 0 ? -1 : now - 1);
    else if (e.key === 'Home') focus(0);
    else if (e.key === 'End') focus(-1);
    else if (e.key === 'ArrowLeft' && page !== 'main') setPage('main');
    else return;
    e.preventDefault();
  };
  return (
    <div
      ref={ref}
      className="panel context-menu"
      role="menu"
      aria-label={menu.title}
      onKeyDown={onKey}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="cm-head">
        {menu.arms !== undefined && <CoatOfArms country={game.state.countries[menu.arms]} size={26} />}
        <div className="cm-head-text">
          <span className="cm-title">{menu.title}</span>
          <span className="caps cm-sub">{menu.sub}</span>
        </div>
      </div>
      {menu.groups.map((group, i) => (
        <ul key={i} className="cm-group" role="group">
          {group.map((item) => (
            <li key={item.key} role="none">
              <MenuEntry item={item} onChoose={() => choose(item)} />
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

function MenuEntry({ item, onChoose }: { item: MenuItem; onChoose: () => void }) {
  const body = (
    <>
      <Icon name={item.icon} />
      <span className="cm-text">
        <span className="cm-label">{item.label}</span>
        {(item.reason ?? item.note) && <span className="cm-note">{item.reason ?? item.note}</span>}
      </span>
      {item.cost !== undefined && (
        <span className="num cm-cost">
          {item.cost}
          <Icon name="coins" />
        </span>
      )}
      {item.detail && <span className={`cm-detail ${item.tone ?? ''}`}>{item.detail}</span>}
      {item.page && item.page !== 'main' && <span className="cm-chevron" aria-hidden="true" />}
    </>
  );
  if (!item.act && !item.page) return <div className="cm-item info">{body}</div>;
  return (
    <button
      role="menuitem"
      className={`cm-item ${item.tone ?? ''} ${item.page === 'main' ? 'back' : ''}`}
      aria-disabled={item.reason ? true : undefined}
      aria-haspopup={item.page && item.page !== 'main' ? 'menu' : undefined}
      onClick={onChoose}
    >
      {body}
    </button>
  );
}
