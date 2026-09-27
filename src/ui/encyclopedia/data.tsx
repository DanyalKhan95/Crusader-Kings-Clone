/**
 * Entries built from the game's own data: technologies and eras, arms and ships, buildings, laws,
 * governments, estates and the council, causes for war and treaties, faiths, nations, events,
 * modifiers, traits, plots and plagues. They follow the data as it changes.
 */
import type { ReactNode } from 'react';
import { BUILDING_ORDER, BUILDINGS, buildingCost, buildingDays, FREE_LEVELS, MAX_LEVEL } from '../../data/buildings';
import { ERAS, eraOfLevel } from '../../data/eras';
import { EVENTS, PLAGUE_BY_ID, PLAGUES, type EventEffects } from '../../data/events';
import { PLOT_ORDER, PLOTS } from '../../data/espionage';
import { FAITH_HEADS, GREAT_HOLY_WARS, HERESIES, HOLY_SITES } from '../../data/faiths';
import { MODIFIER_TEXT, MODIFIERS, type ModifierEffectKey } from '../../data/modifiers';
import { NATIONS } from '../../data/nations';
import {
  ESTATE_INFO,
  ESTATE_WEIGHT,
  GOVERNMENT_INFO,
  ideologyOf,
  IDEOLOGY_NAMES,
  LEVEL_LAWS,
  SEAT_TASKS,
  SUCCESSION_INFO,
  TASK_INFO,
  termYears,
  type LevelLaw,
} from '../../data/politics';
import {
  SHIP_LINES,
  SHIP_ORDER,
  SHIPS,
  shipDef,
  SUBMARINE_ERA,
  TRANSPORT_CAPACITY,
  transportCost,
  transportUpkeep,
} from '../../data/ships';
import { EFFECT_TEXT, TECH_TRACKS, TECHS, TRACK_INFO, type TechDef, type TechEffectKey } from '../../data/techs';
import { TRAITS } from '../../data/traits';
import { UNIT_LINES, UNIT_ORDER, UNITS, unitDef } from '../../data/units';
import type { Government } from '../../shared/dataTypes';
import { cultureName, faithFamily, faithIds, faithName, faithColor } from '../../sim/beliefs';
import { SEAT_INFO, SKILL_NAMES } from '../../sim/characters';
import { AE_FACTOR, PACT_INFO } from '../../sim/diplomacy';
import { SPECIAL_TEXT } from '../../sim/events';
import { successionOptions } from '../../sim/politics';
import { buildingTech, knows } from '../../sim/tech';
import {
  COUNCIL_SEATS,
  ESTATES,
  type CasusBelli,
  type EstateId,
  type PactKind,
  type ShipType,
  type UnitType,
} from '../../sim/types';
import { CB_INFO } from '../../sim/war';
import { techSummary } from '../affairs/Technology';
import type { Game } from '../game';
import type { CategoryId, Entry } from './model';
import { Term as T } from './Term';

const pct = (v: number) => `${Math.round(v * 100)}%`;
const signed = (v: number) => `${v > 0 ? '+' : '−'}${Math.abs(Math.round(v * 100) / 100)}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Facts({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="enc-facts">
      {rows.map(([k, v], i) => (
        <div key={i}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Grid({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="enc-table-wrap">
      <table className="enc-table">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Links to entries, joined into a sentence. */
function Links({ items }: { items: { to: string; label: string }[] }) {
  return (
    <>
      {items.map((x, i) => (
        <span key={x.to}>
          {i > 0 && (i === items.length - 1 ? ' and ' : ', ')}
          <T to={x.to}>{x.label}</T>
        </span>
      ))}
    </>
  );
}

const playing = (game: Game) => {
  const s = game.ui.get();
  return s.phase === 'playing' ? game.state.countries[s.player] : undefined;
};

type Draft = Omit<Entry, 'category'>;
const inCategory = (category: CategoryId, list: Draft[]): Entry[] => list.map((e) => ({ ...e, category }));

// ── Technologies and eras ─────────────────────────────────────────

const TRACK_ICON = { economy: 'coins-pile', military: 'crossed-swords', society: 'open-book' } as const;

function techEntries(): Entry[] {
  const out: Draft[] = [];
  for (const track of TECH_TRACKS) {
    const info = TRACK_INFO[track];
    out.push({
      id: `track:${track}`,
      group: 'The three tracks',
      title: `${info.name} (track)`,
      icon: TRACK_ICON[track],
      summary: info.blurb,
      terms: ['track', 'research'],
      see: ['rule:technology'],
      body: () => (
        <>
          <p>{info.blurb}</p>
          <Grid
            head={['Level', 'Technology', 'Year', 'Brings']}
            rows={TECHS[track].map((t) => [
              t.level,
              <T key={t.id} to={`tech:${t.id}`}>
                {t.name}
              </T>,
              t.year,
              techSummary(t),
            ])}
          />
        </>
      ),
      live: (game) => {
        const c = playing(game);
        return c ? (
          <p>
            Your realm has learned {c.tech[track]} of {TECHS[track].length} levels of {info.name.toLowerCase()}.
          </p>
        ) : null;
      },
    });
    for (const t of TECHS[track]) out.push(techEntry(t));
  }
  return inCategory('technologies', out);
}

function techEntry(t: TechDef): Draft {
  const info = TRACK_INFO[t.track];
  const era = ERAS[eraOfLevel(t.level)];
  const prev = TECHS[t.track][t.level - 2];
  const next = TECHS[t.track][t.level];
  const unlocks: ReactNode[] = [];
  if (t.building) {
    const [type, level] = t.building;
    unlocks.push(
      <li key="b">
        <T to={`building:${type}`}>{BUILDINGS[type].levels[level - 1]}</T> (level {level} of{' '}
        {BUILDINGS[type].name.toLowerCase()})
      </li>,
    );
  }
  if (t.government)
    unlocks.push(
      <li key="g">
        A new form of government: <T to={`gov:${t.government}`}>{GOVERNMENT_INFO[t.government].name}</T>
      </li>,
    );
  if (t.unit)
    unlocks.push(
      <li key="u">
        A new arm of the army: <T to={`unit:${t.unit}`}>{unitDef(t.unit, eraOfLevel(t.level)).name}</T>
      </li>,
    );
  if (t.nationalism)
    unlocks.push(
      <li key="n">
        The age of nations: peoples who do not belong want a state of their own (<T to="rule:culture">culture</T>)
      </li>,
    );
  return {
    id: `tech:${t.id}`,
    group: info.name,
    title: t.name,
    icon: TRACK_ICON[t.track],
    summary: t.blurb,
    terms: [info.name, era.name, String(t.year), ...Object.keys(t.effects ?? {})],
    see: ['rule:technology', `track:${t.track}`],
    body: () => (
      <>
        <Facts
          rows={[
            ['Track', <T to={`track:${t.track}`}>{info.name}</T>],
            ['Level', `${t.level} of ${TECHS[t.track].length}`],
            ['In history', String(t.year)],
            ['Era', <T to={`era:${era.id}`}>{era.name}</T>],
          ]}
        />
        {t.effects && (
          <>
            <h4 className="enc-sub">Effects</h4>
            <ul>
              {(Object.entries(t.effects) as [TechEffectKey, number][]).map(([k, v]) => (
                <li key={k}>{cap(EFFECT_TEXT[k](v))}</li>
              ))}
            </ul>
          </>
        )}
        {unlocks.length > 0 && (
          <>
            <h4 className="enc-sub">Opens</h4>
            <ul>{unlocks}</ul>
          </>
        )}
        <p className="dim small">
          {prev && (
            <>
              After <T to={`tech:${prev.id}`}>{prev.name}</T>.{' '}
            </>
          )}
          {next && (
            <>
              Before <T to={`tech:${next.id}`}>{next.name}</T>.
            </>
          )}
        </p>
      </>
    ),
    live: (game) => {
      const c = playing(game);
      if (!c) return null;
      const known = knows(c, t);
      return (
        <p>
          {known
            ? 'Your realm knows it.'
            : c.tech[t.track] + 1 === t.level
              ? 'Your scholars are working on it now.'
              : `Your realm must first learn ${t.level - c.tech[t.track] - 1} more level${t.level - c.tech[t.track] - 1 === 1 ? '' : 's'} of ${info.name.toLowerCase()}.`}
        </p>
      );
    },
  };
}

function eraEntries(): Entry[] {
  return inCategory(
    'eras',
    ERAS.map((e, i) => {
      const levels = TECH_TRACKS.flatMap((track) => TECHS[track].filter((t) => eraOfLevel(t.level) === i));
      return {
        id: `era:${e.id}`,
        title: e.name,
        icon: 'hourglass',
        summary: e.blurb,
        terms: ['era', String(e.from)],
        see: ['rule:eras', 'rule:technology'],
        body: () => (
          <>
            <Facts
              rows={[
                ['In history, from', String(e.from)],
                ['Technology levels', `${e.firstLevel} to ${(ERAS[i + 1]?.firstLevel ?? 34) - 1}`],
              ]}
            />
            <h4 className="enc-sub">The army</h4>
            <p>
              <Links
                items={UNIT_ORDER.filter((u) => u !== 'air' || i >= 4).map((u) => ({
                  to: `unit:${u}`,
                  label: UNIT_LINES[u][i].name,
                }))}
              />
            </p>
            <h4 className="enc-sub">Ships</h4>
            <p>
              <Links
                items={[
                  ...SHIP_ORDER.filter((s) => s !== 'submarine' || i >= SUBMARINE_ERA).map((s) => ({
                    to: `ship:${s}`,
                    label: SHIP_LINES[s][i].name,
                  })),
                  { to: 'ship:transport', label: SHIP_LINES.transport[i].name },
                ]}
              />
            </p>
            <h4 className="enc-sub">Technologies</h4>
            <p>
              <Links items={levels.map((t) => ({ to: `tech:${t.id}`, label: t.name }))} />
            </p>
          </>
        ),
      };
    }),
  );
}

// ── Arms and ships ────────────────────────────────────────────────

const ERA_NAMES = ERAS.map((e) => e.name);

function armEntries(): Entry[] {
  return inCategory(
    'arms',
    UNIT_ORDER.map((t: UnitType) => {
      const u = UNITS[t];
      const beaten = UNIT_ORDER.filter((o) => UNITS[o].counters.includes(t));
      return {
        id: `unit:${t}`,
        title: UNIT_LINES[t][0].name,
        icon: u.icon,
        summary: u.blurb,
        terms: [...new Set(UNIT_LINES[t].map((l) => l.name))],
        see: t === 'levy' ? ['rule:levies', 'rule:battles'] : ['rule:men-at-arms', 'rule:battles'],
        body: () => (
          <>
            <Facts
              rows={[
                ['Pursuit', String(u.pursuit)],
                ['Screen', String(u.screen)],
                ['Siege power', u.siege ? `${u.siege} per 100 men, more in later eras` : 'none'],
                ...(t === 'levy'
                  ? []
                  : ([
                      ['Regiment', `${u.regiment} men`],
                      ['At home', `${u.reserveUpkeep} gold a month per 100 men, medieval`],
                    ] as [string, string][])),
                [
                  'Beats',
                  u.counters.length ? (
                    <Links items={u.counters.map((c) => ({ to: `unit:${c}`, label: UNIT_LINES[c][0].name }))} />
                  ) : (
                    'none in particular'
                  ),
                ],
                [
                  'Beaten by',
                  beaten.length ? (
                    <Links items={beaten.map((c) => ({ to: `unit:${c}`, label: UNIT_LINES[c][0].name }))} />
                  ) : (
                    'none in particular'
                  ),
                ],
              ]}
            />
            <h4 className="enc-sub">Through the eras</h4>
            <Grid
              head={['Era', 'Name', 'Damage', 'Toughness', t === 'levy' ? 'Upkeep' : 'Regiment costs']}
              rows={ERAS.map((_, i) => {
                const d = unitDef(t, i);
                return [
                  ERA_NAMES[i],
                  <span key="n" title={d.blurb}>
                    {d.name}
                  </span>,
                  Math.round(d.damage),
                  Math.round(d.toughness),
                  t === 'levy' ? `${d.upkeep.toFixed(2)} a month` : `${Math.round((d.cost * d.regiment) / 100)} gold`,
                ];
              })}
            />
            <p className="dim small">
              Damage and toughness per hundred men. A unit facing an army full of what beats it deals up to half less.
              {t === 'knights' && ' Heavy horse is for knightly realms until the industrial era.'}
              {t === 'horse_archers' && ' Only the peoples of the steppe raise horse archers.'}
              {t === 'air' && ' Air wings need aircraft.'}
            </p>
          </>
        ),
        live: (game) => {
          const c = playing(game);
          if (!c) return null;
          const era = eraOfLevel(c.tech.military);
          return <p>Your realm fields them as {unitDef(t, era).name.toLowerCase()}.</p>;
        },
      };
    }),
  );
}

const SHIP_TITLE: Record<ShipType | 'transport', string> = {
  heavy: 'Heavy ships',
  light: 'Light ships',
  submarine: 'Submarines',
  transport: 'Transports',
};

function shipEntries(): Entry[] {
  const out: Draft[] = SHIP_ORDER.map((t) => {
    const s = SHIPS[t];
    return {
      id: `ship:${t}`,
      title: SHIP_TITLE[t],
      icon: SHIP_LINES[t][t === 'submarine' ? SUBMARINE_ERA : 0].icon,
      summary: SHIP_LINES[t][t === 'submarine' ? SUBMARINE_ERA : 0].blurb,
      terms: [...new Set(SHIP_LINES[t].map((l) => l.name))],
      see: ['rule:navies', 'rule:blockades'],
      body: () => (
        <>
          <Facts
            rows={[
              ['Against transports', `×${s.raid} of its attack`],
              ['Beats', <Links key="b" items={s.counters.map((c) => ({ to: `ship:${c}`, label: SHIP_TITLE[c] }))} />],
              ...(t === 'submarine'
                ? ([['From', `the ${ERAS[SUBMARINE_ERA].name.toLowerCase()} era`]] as [string, string][])
                : []),
            ]}
          />
          <h4 className="enc-sub">Through the eras</h4>
          <Grid
            head={['Era', 'Name', 'Attack', 'Hull', 'Cost', 'Upkeep']}
            rows={ERAS.map((_, i) => {
              if (t === 'submarine' && i < SUBMARINE_ERA) return [ERA_NAMES[i], '—', '', '', '', ''];
              const d = shipDef(t, i);
              return [
                ERA_NAMES[i],
                <span key="n" title={SHIP_LINES[t][i].blurb}>
                  {SHIP_LINES[t][i].name}
                </span>,
                d.attack.toFixed(1),
                d.hull.toFixed(1),
                Math.round(d.cost),
                d.upkeep.toFixed(2),
              ];
            })}
          />
        </>
      ),
    };
  });
  out.push({
    id: 'ship:transport',
    title: SHIP_TITLE.transport,
    icon: SHIP_LINES.transport[0].icon,
    summary: 'A pool of ships on the realm, not in fleets, that carries its armies over the sea.',
    terms: [...new Set(SHIP_LINES.transport.map((l) => l.name))],
    see: ['rule:transports'],
    body: () => (
      <Grid
        head={['Era', 'Name', 'Men each', 'Cost', 'Upkeep']}
        rows={ERAS.map((_, i) => [
          ERA_NAMES[i],
          SHIP_LINES.transport[i].name,
          TRANSPORT_CAPACITY[i],
          Math.round(transportCost(i)),
          transportUpkeep(i).toFixed(2),
        ])}
      />
    ),
  });
  return inCategory('ships', out);
}

// ── Buildings ─────────────────────────────────────────────────────

function buildingEntries(): Entry[] {
  return inCategory(
    'buildings',
    BUILDING_ORDER.map((type) => {
      const b = BUILDINGS[type];
      const e = b.effects;
      const effects = [
        e.tax && `taxes +${pct(e.tax)}`,
        e.levy && `levies +${pct(e.levy)}`,
        e.growth && `growth +${pct(e.growth)}`,
        e.supply && `supply +${pct(e.supply)}`,
        e.fort && `a level of fort`,
        e.research && 'research points',
      ].filter(Boolean);
      return {
        id: `building:${type}`,
        title: b.name,
        icon: b.icon,
        summary: b.blurb,
        terms: b.levels,
        see: ['rule:buildings'],
        body: () => (
          <>
            <Facts
              rows={[
                ['Each level', effects.join(', ')],
                ...(b.coastal ? ([['Needs', 'a coast']] as [string, string][]) : []),
                ...(b.minDev ? ([['Needs', `development ${b.minDev}`]] as [string, string][]) : []),
              ]}
            />
            <Grid
              head={['Level', 'Name', 'Cost', 'Days', 'Needs']}
              rows={b.levels.slice(0, MAX_LEVEL).map((name, i) => {
                const level = i + 1;
                const tech = buildingTech(type, level);
                return [
                  level,
                  name,
                  buildingCost(type, level),
                  buildingDays(type, level),
                  tech ? (
                    <T key="t" to={`tech:${tech.id}`}>
                      {tech.name}
                    </T>
                  ) : level > FREE_LEVELS ? (
                    'not yet known'
                  ) : (
                    ''
                  ),
                ];
              })}
            />
            {type === 'university' && (
              <p className="dim small">
                Universities count in research by the square root of all their levels in the realm.
              </p>
            )}
          </>
        ),
      };
    }),
  );
}

// ── Laws, governments, estates and the council ────────────────────

const LAW_ICON: Record<LevelLaw | 'succession', 'stone-throne' | 'crown' | 'meeple-group' | 'coins-pile' | 'church'> = {
  succession: 'stone-throne',
  crown: 'crown',
  conscription: 'meeple-group',
  taxation: 'coins-pile',
  tolerance: 'church',
};

function lawEntries(): Entry[] {
  const out: Draft[] = [
    {
      id: 'law:succession',
      title: 'Succession',
      icon: LAW_ICON.succession,
      summary: 'Who rules when the ruler dies.',
      terms: ['hereditary', 'elective', 'republic', 'theocratic'],
      see: ['rule:succession', 'rule:laws'],
      body: () => (
        <>
          <Facts rows={Object.values(SUCCESSION_INFO).map((s) => [s.name, s.blurb])} />
          <p className="dim small">Changing the succession costs 15 legitimacy and a point of stability.</p>
        </>
      ),
    },
  ];
  for (const law of Object.keys(LEVEL_LAWS) as LevelLaw[]) {
    const def = LEVEL_LAWS[law];
    out.push({
      id: `law:${law}`,
      title: def.name,
      icon: LAW_ICON[law],
      summary: def.blurb,
      terms: def.levels,
      see: ['rule:laws', law === 'tolerance' ? 'rule:faith' : law === 'crown' ? 'rule:subjects' : 'rule:estates'],
      body: () => <Facts rows={def.levels.map((name, i) => [name, def.effects[i]])} />,
      live: (game) => {
        const c = playing(game);
        return c ? <p>Your realm’s law: {def.levels[c.laws[law]].toLowerCase()}.</p> : null;
      },
    });
  }
  return inCategory('laws', out);
}

function governmentEntries(): Entry[] {
  const reforms = new Map<Government, TechDef>();
  for (const t of TECHS.society) if (t.government) reforms.set(t.government, t);
  return inCategory(
    'governments',
    (Object.keys(GOVERNMENT_INFO) as Government[]).map((g) => {
      const info = GOVERNMENT_INFO[g];
      const tech = reforms.get(g);
      const ideology = ideologyOf(g);
      return {
        id: `gov:${g}`,
        title: info.name,
        icon:
          g === 'democracy'
            ? 'vote'
            : g === 'communist'
              ? 'hammer-sickle'
              : g === 'republic'
                ? 'capitol'
                : 'stone-throne',
        summary: info.blurb,
        terms: ['government', IDEOLOGY_NAMES[ideology]],
        see: ['rule:government', 'rule:estates'],
        body: () => (
          <>
            <Facts
              rows={[
                ['Taxes', info.tax ? signed(info.tax * 100) + '%' : 'as custom allows'],
                ['Levies', info.levy ? signed(info.levy * 100) + '%' : 'as custom allows'],
                [
                  'Succession',
                  successionOptions(g)
                    .map((s) => SUCCESSION_INFO[s].name.toLowerCase())
                    .join(' or '),
                ],
                ['Ideals', IDEOLOGY_NAMES[ideology]],
                ...(g === 'republic' || g === 'democracy'
                  ? ([['Elections', `every ${termYears(g)} years`]] as [string, string][])
                  : []),
                [
                  'Comes with',
                  tech ? (
                    <T key="t" to={`tech:${tech.id}`}>
                      {tech.name}
                    </T>
                  ) : g === 'feudal' ? (
                    'the realms of 1066; tribes, clans and hordes may take it up'
                  ) : (
                    'the realms of 1066'
                  ),
                ],
              ]}
            />
            <h4 className="enc-sub">The estates’ share of power</h4>
            <Grid
              head={ESTATES.map((e) => ESTATE_INFO[e].name)}
              rows={[ESTATES.map((e) => `${ESTATE_WEIGHT[g][e]}`)]}
            />
          </>
        ),
      };
    }),
  );
}

const ESTATE_ICON: Record<EstateId, 'black-knight-helm' | 'church' | 'coins' | 'wheat'> = {
  nobles: 'black-knight-helm',
  clergy: 'church',
  burghers: 'coins',
  commons: 'wheat',
};

function courtEntries(): Entry[] {
  const estates: Draft[] = ESTATES.map((e) => {
    const info = ESTATE_INFO[e];
    return {
      id: `estate:${e}`,
      group: 'Estates',
      title: info.name,
      icon: ESTATE_ICON[e],
      summary: info.blurb,
      terms: [info.tribal ?? '', info.privilege],
      see: ['rule:estates', 'rule:revolts'],
      body: () => (
        <Facts
          rows={[
            ['Their privilege', `${info.privilege}: ${info.privilegeBlurb}`],
            ...(info.tribal ? ([['Among tribes', `the ${info.tribal.toLowerCase()}`]] as [string, string][]) : []),
          ]}
        />
      ),
    };
  });
  const seats: Draft[] = COUNCIL_SEATS.map((seat) => ({
    id: `seat:${seat}`,
    group: 'The council',
    title: SEAT_INFO[seat].name,
    icon: 'organigram',
    summary: `${SEAT_INFO[seat].name}: judged by ${SKILL_NAMES[
      seat === 'chancellor'
        ? 'dip'
        : seat === 'marshal'
          ? 'mar'
          : seat === 'steward'
            ? 'stw'
            : seat === 'spymaster'
              ? 'int'
              : 'lrn'
    ].toLowerCase()}.`,
    terms: SEAT_TASKS[seat].map((t) => TASK_INFO[t].name),
    see: ['rule:council'],
    body: () => <Facts rows={SEAT_TASKS[seat].map((t) => [TASK_INFO[t].name, TASK_INFO[t].blurb])} />,
  }));
  return inCategory('court', [...estates, ...seats]);
}

// ── War and treaties ──────────────────────────────────────────────

const CB_ORDER: CasusBelli[] = [
  'claim',
  'throne',
  'conquest',
  'holy',
  'crusade',
  'coalition',
  'independence',
  'revolt',
];
const PACT_ORDER: PactKind[] = ['alliance', 'nap', 'access', 'guarantee'];
const PACT_ICON: Record<PactKind, 'shaking-hands' | 'peace-dove' | 'open-gate' | 'checked-shield'> = {
  alliance: 'shaking-hands',
  nap: 'peace-dove',
  access: 'open-gate',
  guarantee: 'checked-shield',
};

function warEntries(): Entry[] {
  const causes: Draft[] = CB_ORDER.map((cb) => ({
    id: `cb:${cb}`,
    group: 'Causes for war',
    title: CB_INFO[cb].name,
    icon: cb === 'holy' || cb === 'crusade' ? 'holy-grail' : 'flag-objective',
    summary: CB_INFO[cb].blurb,
    terms: ['casus belli', 'war'],
    see: ['rule:casus-belli', 'rule:peace', 'rule:aggressive-expansion'],
    body: () => (
      <>
        <p>{CB_INFO[cb].blurb}</p>
        <Facts
          rows={[
            [
              'Aggressive expansion',
              AE_FACTOR[cb] ? `×${AE_FACTOR[cb]} for land taken` : 'none for the war’s own goal',
            ],
          ]}
        />
      </>
    ),
  }));
  const pacts: Draft[] = PACT_ORDER.map((kind) => ({
    id: `pact:${kind}`,
    group: 'Treaties',
    title: PACT_INFO[kind].name,
    icon: PACT_ICON[kind],
    summary: PACT_INFO[kind].blurb,
    terms: ['treaty', 'pact'],
    see: ['rule:treaties', 'rule:opinion'],
    body: () => <p>{PACT_INFO[kind].blurb}</p>,
  }));
  return inCategory('war', [...causes, ...pacts]);
}

// ── Faiths and nations ────────────────────────────────────────────

const FAMILY_NAMES: Record<string, string> = {
  african: 'African',
  american: 'American',
  buddhist: 'Buddhist',
  christian: 'Christian',
  dharmic: 'Dharmic',
  east_asian: 'East Asian',
  islamic: 'Islamic',
  jewish: 'Jewish',
  oceanic: 'Oceanic',
  pagan: 'Pagan',
  zoroastrian: 'Zoroastrian',
};
export const familyName = (f: string) => FAMILY_NAMES[f] ?? cap(f.replace(/_/g, ' '));

function faithEntries(): Entry[] {
  return inCategory(
    'faiths',
    faithIds().map((id) => {
      const heresy = HERESIES[id];
      const family = faithFamily(id);
      const head = FAITH_HEADS[id];
      const sites = HOLY_SITES[id] ?? [];
      const great = GREAT_HOLY_WARS.find((g) => g.faith === id);
      const sisters = faithIds().filter((x) => x !== id && faithFamily(x) === family);
      return {
        id: `faith:${id}`,
        group: familyName(family),
        title: faithName(id),
        icon: family === 'islamic' ? 'samara-mosque' : family === 'christian' ? 'church' : 'prayer',
        summary: heresy
          ? `A heresy of the ${faithName(heresy.parent)} faith, from ${heresy.from}.`
          : `A faith of the ${familyName(family)} family.`,
        terms: [familyName(family), heresy ? 'heresy' : ''],
        see: heresy ? ['rule:heresies', `faith:${heresy.parent}`] : ['rule:faith'],
        body: () => (
          <>
            <p>
              <span className="swatch" style={{ background: faithColor(id) }} aria-hidden="true" /> The faith’s colour
              on the faith map.
            </p>
            <Facts
              rows={[
                ['Family', familyName(family)],
                ...(head ? ([['Head of the faith', cap(head.title)]] as [string, string][]) : []),
                ...(sites.length ? ([['Holy places', sites.join(', ')]] as [string, string][]) : []),
                ...(heresy
                  ? ([
                      [
                        'Heresy of',
                        <T key="p" to={`faith:${heresy.parent}`}>
                          {faithName(heresy.parent)}
                        </T>,
                      ],
                      ['Preached from', String(heresy.from)],
                    ] as [string, ReactNode][])
                  : []),
                ...(great
                  ? ([['Great holy war', `${great.name} for ${great.site}, ${great.from} to ${great.until}`]] as [
                      string,
                      string,
                    ][])
                  : []),
                [
                  'Holy wars',
                  family === 'christian' || family === 'islamic'
                    ? 'wages holy war on other families of faiths'
                    : 'does not wage holy wars',
                ],
              ]}
            />
            {sisters.length > 0 && (
              <p>
                Sister faiths: <Links items={sisters.map((x) => ({ to: `faith:${x}`, label: faithName(x) }))} />.
              </p>
            )}
          </>
        ),
      };
    }),
  );
}

function nationEntries(): Entry[] {
  return inCategory(
    'nations',
    NATIONS.map((n) => ({
      id: `nation:${n.id}`,
      title: n.name,
      icon: n.icon,
      summary: n.blurb,
      terms: [n.short, n.adj, n.tag],
      see: ['rule:decisions'],
      body: () => (
        <Facts
          rows={[
            ['Rank', cap(n.rank)],
            ...(n.cultures ? ([['Its peoples', n.cultures.map(cultureName).join(', ')]] as [string, string][]) : []),
            ...(n.families ? ([['Its faiths', n.families.map(familyName).join(', ')]] as [string, string][]) : []),
            ['Heartland', `${n.need} of ${n.provinces.join(', ')}`],
            ...(n.from ? ([['Not before', String(n.from)]] as [string, string][]) : []),
          ]}
        />
      ),
    })),
  );
}

// ── Events, modifiers, traits, plots and plagues ──────────────────

const BLANKS: Record<string, string> = {
  realm: 'the realm',
  land: 'the land',
  adj: 'the realm’s',
  ruler: 'the ruler',
  capital: 'the capital',
  province: 'a province',
  other: 'a neighbour',
  faith: 'the faith',
  plague: 'the pestilence',
};

/** An event's text with its blanks filled by plain words. */
function generic(text: string): string {
  return text.replace(/\{(\w*)\}/g, (_m, key: string, at: number) => {
    const v = BLANKS[key] ?? '…';
    return /(^|[.!?]\s+)$/.test(text.slice(0, at)) ? cap(v) : v;
  });
}

function effectItems(e: EventEffects): ReactNode[] {
  const out: ReactNode[] = [];
  const n = (v: number) => signed(v);
  if (e.gold) out.push(`${e.gold > 0 ? 'Gains' : 'Costs'} ${Math.abs(e.gold)} months of income in gold`);
  if (e.stability) out.push(`Stability ${n(e.stability)}`);
  if (e.legitimacy) out.push(`Legitimacy ${n(e.legitimacy)}`);
  if (e.warExhaustion) out.push(`War weariness ${n(e.warExhaustion)}`);
  if (e.manpower) out.push(`${e.manpower > 0 ? '+' : '−'}${pct(Math.abs(e.manpower))} of the full levies`);
  if (e.dev) out.push(`Development of the province ${n(e.dev)}`);
  for (const [k, v] of Object.entries(e.mood ?? {}) as [EstateId, number][])
    out.push(`${ESTATE_INFO[k].name}: ${n(v)} for recent dealings`);
  if (e.modifier)
    out.push(
      <>
        <T to={`modifier:${e.modifier}`}>{MODIFIERS[e.modifier]?.name ?? e.modifier}</T> for{' '}
        {e.years ?? MODIFIERS[e.modifier]?.years} years
      </>,
    );
  if (e.remove)
    out.push(
      <>
        Ends <T to={`modifier:${e.remove}`}>{MODIFIERS[e.remove]?.name ?? e.remove}</T>
      </>,
    );
  if (e.research) out.push(`${e.research} months of research in every track`);
  if (e.death) out.push(`A ${pct(e.death)} chance that the ruler dies`);
  if (e.opinion) out.push(`What the other realm thinks of us ${n(e.opinion)}`);
  if (e.claim) out.push('A claim on a province of the other realm by our border');
  if (e.run) out.push(SPECIAL_TEXT[e.run]);
  return out;
}

function eventEntries(): Entry[] {
  return inCategory(
    'events',
    EVENTS.map((e) => ({
      id: `event:${e.id}`,
      group: e.mtth > 0 ? 'Events of the realm' : 'Events the world sends',
      title: generic(e.title),
      icon: e.icon,
      summary: `${e.options.map((o) => generic(o.text)).join(', or ')}.`,
      terms: e.options.map((o) => o.text),
      see: ['rule:events'],
      body: () => (
        <>
          <p className="enc-quote">{generic(e.text)}</p>
          <Facts
            rows={[
              [
                'How often',
                e.mtth > 0
                  ? `about once in ${e.mtth} years to a realm that meets its conditions`
                  : 'when the world sends it',
              ],
              ['Again', e.once ? 'never: it happens once' : `not within ${e.cooldown ?? 20} years`],
            ]}
          />
          <h4 className="enc-sub">The choices</h4>
          <ul className="enc-options">
            {e.options.map((o, i) => {
              const items = effectItems(o.effects);
              return (
                <li key={i}>
                  <strong>{generic(o.text)}</strong>
                  {o.when && <span className="dim small"> (only sometimes offered)</span>}
                  {items.length > 0 && (
                    <ul>
                      {items.map((x, j) => (
                        <li key={j}>{x}</li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      ),
    })),
  );
}

function modifierEntries(): Entry[] {
  return inCategory(
    'modifiers',
    Object.entries(MODIFIERS).map(([id, m]) => ({
      id: `modifier:${id}`,
      group: m.bad ? 'Misfortunes' : 'Boons',
      title: m.name,
      icon: m.icon,
      summary: m.blurb,
      terms: Object.keys(m.effects),
      see: ['rule:modifiers'],
      body: () => (
        <>
          <Facts
            rows={[
              ['Lasts', m.years ? `${m.years} years, unless the event says otherwise` : 'until something ends it'],
            ]}
          />
          <ul>
            {(Object.entries(m.effects) as [ModifierEffectKey, number][]).map(([k, v]) => (
              <li key={k}>{MODIFIER_TEXT[k](v)}</li>
            ))}
          </ul>
        </>
      ),
    })),
  );
}

const TRAIT_KIND = { education: 'Education', personality: 'Personality', nature: 'Nature' } as const;

function traitEntries(): Entry[] {
  return inCategory(
    'traits',
    Object.entries(TRAITS)
      .filter(([id]) => !id.startsWith('_'))
      .map(([id, t]) => ({
        id: `trait:${id}`,
        group: TRAIT_KIND[t.kind],
        title: t.name,
        icon: 'crown',
        summary: t.blurb,
        terms: [TRAIT_KIND[t.kind]],
        see: ['rule:characters'],
        body: () => {
          const rows: [string, string][] = [];
          for (const [s, v] of Object.entries(t.skills ?? {}))
            rows.push([SKILL_NAMES[s as keyof typeof SKILL_NAMES], signed(v as number)]);
          if (t.mortality && t.mortality !== 1) rows.push(['Chance of death', `×${t.mortality}`]);
          if (t.aggression) rows.push(['Appetite for war (the AI)', signed(t.aggression)]);
          return rows.length ? <Facts rows={rows} /> : <p>{t.blurb}</p>;
        },
      })),
  );
}

function plotEntries(): Entry[] {
  return inCategory(
    'plots',
    PLOT_ORDER.map((id) => {
      const p = PLOTS[id];
      return {
        id: `plot:${id}`,
        title: p.name,
        icon: p.icon,
        summary: p.blurb,
        terms: ['plot', 'spy'],
        see: ['rule:espionage'],
        body: () => (
          <Facts
            rows={[
              ['Network spent', String(p.network)],
              ['Gold', `${p.gold} months of income`],
              ['Chance of success', `${p.odds}%, with the network just strong enough and spymasters of equal skill`],
              ['Traced back', `${p.exposure}%, twice that if it fails`],
              ['If traced', `the victim holds ${p.anger} against us`],
            ]}
          />
        ),
      };
    }),
  );
}

function plagueEntries(): Entry[] {
  return inCategory(
    'plagues',
    PLAGUES.map((p) => ({
      id: `plague:${p.id}`,
      title: cap(p.name),
      icon: 'plague-doctor-profile',
      summary: `May break out between ${p.from} and ${p.to}.`,
      terms: ['plague', 'pestilence'],
      see: ['rule:plague'],
      body: () => (
        <Facts
          rows={[
            [
              'Breaks out',
              `between ${p.from} and ${p.to}, about once in ${Math.round(1 / p.chance)} months once its time has come`,
            ],
            ['Kills', `${pct(p.severity)} of a province’s development`],
            ['Spreads', `${pct(p.spread)} a month to each neighbour`],
            ['Rages', `${p.months[0]} to ${p.months[1]} months in a province`],
            ['Spares', `a province for ${p.immunity} years once it has passed`],
            ...(p.after ? ([['Follows', cap(PLAGUE_BY_ID[p.after]?.name ?? p.after)]] as [string, string][]) : []),
          ]}
        />
      ),
    })),
  );
}

/** Every entry drawn from the data. */
export function dataEntries(): Entry[] {
  return [
    ...techEntries(),
    ...eraEntries(),
    ...armEntries(),
    ...shipEntries(),
    ...buildingEntries(),
    ...lawEntries(),
    ...governmentEntries(),
    ...courtEntries(),
    ...warEntries(),
    ...faithEntries(),
    ...nationEntries(),
    ...eventEntries(),
    ...modifierEntries(),
    ...traitEntries(),
    ...plotEntries(),
    ...plagueEntries(),
  ];
}
