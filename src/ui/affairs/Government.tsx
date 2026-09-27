/** Government and laws: legitimacy, the form of government and its reforms, the laws, the estates and factions. */
import type { Country } from '../../sim/types';
import { LawsTab } from '../hud/PoliticsPanel';

export function GovernmentScreen({ c }: { c: Country }) {
  return (
    <div className="affairs-grid">
      <div className="affairs-flow">
        <LawsTab c={c} />
      </div>
    </div>
  );
}
