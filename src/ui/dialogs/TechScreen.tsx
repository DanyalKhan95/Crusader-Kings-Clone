/** Technology: the realm's three tracks, what each level brings, and how fast its scholars work. */
import { useEffect, useRef } from 'react';
import { BUILDINGS } from '../../data/buildings';
import { ERAS, eraOfLevel } from '../../data/eras';
import { GOVERNMENT_INFO } from '../../data/politics';
import {
  EFFECT_TEXT,
  TECH_TRACKS,
  TECHS,
  TRACK_INFO,
  type TechDef,
  type TechEffectKey,
  type TechTrack,
} from '../../data/techs';
import { unitDef } from '../../data/units';
import * as cmd from '../../sim/commands';
import type { Country } from '../../sim/types';
import { eraOf, monthsToNext, researchPoints, techCost } from '../../sim/tech';
import { run } from '../actions';
import { useGame } from '../game';
import { Icon } from '../Icon';
import type { IconName } from '../../assets/icons';
import { useStore } from '../store';
import { BreakdownList, WithTip } from '../hud/Tip';
import { Modal } from './Modal';

const TRACK_ICON: Record<TechTrack, IconName> = {
  economy: 'coins-pile',
  military: 'crossed-swords',
  society: 'open-book',
};

function compact(n: number): string {
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : String(Math.floor(n));
}

/** What a level brings, in a few words. */
export function techSummary(t: TechDef): string {
  const bits: string[] = [];
  for (const [k, v] of Object.entries(t.effects ?? {}) as [TechEffectKey, number][]) bits.push(EFFECT_TEXT[k](v));
  if (t.building) bits.push(`builds ${BUILDINGS[t.building[0]].levels[t.building[1] - 1].toLowerCase()}`);
  if (t.government) bits.push(`${GOVERNMENT_INFO[t.government].name.toLowerCase()}`);
  if (t.unit) bits.push(`${unitDef(t.unit, 4).name.toLowerCase()}`);
  if (t.nationalism) bits.push('peoples who do not belong want a state of their own');
  return bits.join(' · ');
}

export function TechScreen() {
  const game = useGame();
  useStore(game.ui, (s) => s.tick);
  const c = game.state.countries[game.state.player];
  if (!c) return null;
  const era = eraOf(c);
  return (
    <Modal title="Technology" kicker={`${ERAS[era].name} era`} wide>
      <ol className="eras" aria-label="Eras">
        {ERAS.map((e, i) => (
          <li key={e.id} className={i === era ? 'current' : i < era ? 'past' : ''} title={e.blurb}>
            <span className="caps">{e.name}</span>
            <span className="num dim small">{e.from}</span>
          </li>
        ))}
      </ol>
      <p className="dim small">
        Each track is learned level by level. A level costs about what an ordinary realm of its day would gather; it
        costs more the further it is ahead of its time, and less once others know it, above all your neighbours.
      </p>
      <div className="tech-columns">
        {TECH_TRACKS.map((track) => (
          <TrackColumn key={track} c={c} track={track} />
        ))}
      </div>
    </Modal>
  );
}

function TrackColumn({ c, track }: { c: Country; track: TechTrack }) {
  const game = useGame();
  const state = game.state;
  const level = c.tech[track];
  const next = TECHS[track][level];
  const points = researchPoints(state, c, track);
  const cost = next ? techCost(state, game.world, c, track) : null;
  const months = next ? monthsToNext(state, game.world, c, track) : 0;
  const focused = c.focus === track;
  const eta = !Number.isFinite(months)
    ? 'more than a century away'
    : months > 18
      ? `in about ${Math.round(months / 12)} years`
      : months > 0
        ? `in ${months} month${months === 1 ? '' : 's'}`
        : 'any day now';
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    listRef.current?.querySelector('li.next')?.scrollIntoView({ block: 'center' });
  }, []);
  return (
    <section className="tech-track" aria-label={TRACK_INFO[track].name}>
      <header className="tech-head">
        <Icon name={TRACK_ICON[track]} />
        <span>
          <span className="display tech-name">{TRACK_INFO[track].name}</span>
          <span className="dim small">
            Level {level} of {TECHS[track].length}
          </span>
        </span>
        <WithTip tip={<BreakdownList title="Research a month" b={points} />}>
          <span className="num tech-rate">+{points.total.toFixed(1)}</span>
        </WithTip>
      </header>
      <button
        className={`btn small ${focused ? 'primary' : 'ghost'}`}
        aria-pressed={focused}
        onClick={() => run(game, cmd.researchFocus(state, focused ? null : track))}
      >
        {focused ? 'The realm’s focus' : 'Make this the focus'}
      </button>
      {next && cost ? (
        <div className="tech-next">
          <span className="caps small">Next</span>
          <span className="tech-next-name">
            {next.name} <span className="dim num">({next.year})</span>
          </span>
          <span className="small">{techSummary(next)}</span>
          <WithTip tip={<BreakdownList title="Cost" b={cost} digits={0} />}>
            <span className="bar tech-bar">
              <span style={{ width: `${Math.min(100, (c.research[track] / cost.total) * 100)}%` }} />
            </span>
          </WithTip>
          <span className="num dim small">
            {compact(c.research[track])} of {compact(cost.total)} · {eta}
          </span>
        </div>
      ) : (
        <p className="small">Every level is learned.</p>
      )}
      <ol className="tech-list" ref={listRef}>
        {TECHS[track].map((t) => {
          const known = t.level <= level;
          const eraStart = ERAS.findIndex((e) => e.firstLevel === t.level);
          return (
            <li key={t.id} className={known ? 'known' : t.level === level + 1 ? 'next' : ''}>
              {eraStart >= 0 && <span className="caps tech-era">{ERAS[eraOfLevel(t.level)].name}</span>}
              <span className="tech-row">
                <span className="tech-row-name">{t.name}</span>
                <span className="num dim small">{t.year}</span>
              </span>
              <span className="dim small">{techSummary(t)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
