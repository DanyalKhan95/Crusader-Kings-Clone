/** Faith and culture: the state faith and its head, holy wars and holy places, and the realm's faiths and peoples. */
import type { Country } from '../../sim/types';
import { FaithTab } from '../hud/FaithPanel';

export function FaithScreen({ c }: { c: Country }) {
  return (
    <div className="affairs-grid">
      <div className="affairs-flow">
        <FaithTab c={c} />
      </div>
    </div>
  );
}
