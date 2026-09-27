/** Words that lead to the encyclopedia: a term in running text, or a line under a breakdown. */
import type { ReactNode } from 'react';
import { openEncyclopedia } from '../actions';
import { useGame } from '../game';
import { Icon } from '../Icon';

/** A word that opens its entry in the encyclopedia (or goes to it, inside the encyclopedia). */
export function Term({ to, children }: { to: string; children: ReactNode }) {
  const game = useGame();
  return (
    <button
      type="button"
      className="term"
      data-entry={to}
      onClick={(e) => {
        e.stopPropagation();
        openEncyclopedia(game, to);
      }}
    >
      {children}
    </button>
  );
}

/** "More in the encyclopedia", under a breakdown or at the end of a tip. */
export function MoreAbout({ to, label = 'More in the encyclopedia' }: { to: string; label?: string }) {
  return (
    <p className="tip-more">
      <Icon name="open-book" />
      <Term to={to}>{label}</Term>
    </p>
  );
}
