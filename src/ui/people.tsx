/** Characters: portraits, and a compact card with age, skills and traits. */
import { useMemo } from 'react';
import { TRAITS } from '../data/traits';
import { age, skill, SKILL_NAMES, visibleTraits } from '../sim/characters';
import { SKILLS, type Character, type Skill } from '../sim/types';
import { religionFamily, useGame } from './game';
import { portraitSvg, type PortraitRole } from './portrait';

/** A character's likeness; it ages with them. */
export function Portrait({ c, role, size = 56 }: { c: Character; role: PortraitRole; size?: number }) {
  const game = useGame();
  const country = game.state.countries[c.country];
  const years = age(game.state, c);
  const html = useMemo(
    () =>
      country
        ? portraitSvg(
            {
              c,
              country,
              age: years,
              role,
              faith: religionFamily(game, country.religion),
              group: game.world.world.cultures[country.culture]?.group ?? '',
            },
            size,
          )
        : '',
    // The face changes only with the years, the office and the realm's colours.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [c.id, years, role, size, country?.colorHex, country?.gov],
  );
  return (
    <span
      className="portrait"
      style={{ width: size, height: size * 1.2 }}
      role="img"
      aria-label={`Portrait of ${c.name}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

const SKILL_SHORT: Record<Skill, string> = { dip: 'Dip', mar: 'Mar', stw: 'Stw', int: 'Int', lrn: 'Lrn' };

export function Skills({ c, highlight }: { c: Character; highlight?: Skill }) {
  return (
    <ul className="skills" aria-label="Skills">
      {SKILLS.map((s) => (
        <li key={s} className={s === highlight ? 'hl' : ''} title={SKILL_NAMES[s]}>
          <span className="caps">{SKILL_SHORT[s]}</span>
          <span className="num">{skill(c, s)}</span>
        </li>
      ))}
    </ul>
  );
}

export function Traits({ c }: { c: Character }) {
  const traits = visibleTraits(c);
  if (!traits.length) return null;
  return (
    <ul className="traits">
      {traits.map((t) => (
        <li key={t} title={TRAITS[t]?.blurb}>
          {TRAITS[t]?.name ?? t}
        </li>
      ))}
    </ul>
  );
}

export function CharacterCard({
  c,
  role,
  highlight,
  portrait,
}: {
  c: Character | undefined;
  role: string;
  highlight?: Skill;
  portrait?: PortraitRole;
}) {
  const game = useGame();
  if (!c) {
    return (
      <div className="person empty">
        <span className="caps person-role">{role}</span>
        <span className="dim">Vacant</span>
      </div>
    );
  }
  return (
    <div className={`person ${portrait ? 'with-portrait' : ''}`}>
      {portrait && <Portrait c={c} role={portrait} />}
      <div className="person-body">
        <div className="person-head">
          <span className="caps person-role">{role}</span>
          <span className="person-name">{c.name}</span>
          <span className="dim person-age">
            {c.female ? 'She' : 'He'} is {age(game.state, c)}
          </span>
        </div>
        <Skills c={c} highlight={highlight} />
        <Traits c={c} />
      </div>
    </div>
  );
}
