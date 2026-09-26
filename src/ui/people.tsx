/** Characters: a compact card with age, skills and traits. */
import { TRAITS } from '../data/traits';
import { age, skill, SKILL_NAMES, visibleTraits } from '../sim/characters';
import { SKILLS, type Character, type Skill } from '../sim/types';
import { useGame } from './game';

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

export function CharacterCard({ c, role, highlight }: { c: Character | undefined; role: string; highlight?: Skill }) {
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
    <div className="person">
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
  );
}
