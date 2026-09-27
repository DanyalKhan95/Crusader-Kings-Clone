/**
 * A realm in the side panel: what the player can do with it, its intrigue and its facts. The
 * player's own realm has screens of its own over the map (src/ui/affairs).
 */
import { useMemo } from 'react';
import { provincesOf } from '../../sim/queries';
import type { Country } from '../../sim/types';
import { openScreen, selectCountry } from '../actions';
import { CoatOfArms } from '../CoatOfArms';
import { capitalize } from '../format';
import { countryStats, useGame } from '../game';
import { Icon } from '../Icon';
import { withKey } from '../keys';
import { CountryFacts, CountryHeader } from '../realm';
import { useStore } from '../store';
import { ForeignDiplomacy } from './DiplomacyPanel';
import { ColoniesSection } from './NavyPanel';
import { IntrigueSection, ModifiersSection } from './RealmAffairs';
import { goToProvince } from './SidePanel';

export function CountryView({ index }: { index: number }) {
  const game = useGame();
  const player = useStore(game.ui, (s) => s.player);
  const c = game.state.countries[index];
  if (!c) return null;
  const mine = index === player;
  const open = (i: number) => selectCountry(game, i, true);
  return (
    <div className="sp-body">
      <div className="sp-head">
        {mine && <p className="caps sp-kicker your-realm">Your realm</p>}
        {!c.alive && <p className="caps sp-kicker">Fallen</p>}
        <CountryHeader country={c} onLiege={open} />
      </div>
      {mine ? (
        <button className="btn primary" onClick={() => openScreen(game, 'realm')}>
          <Icon name="crown" /> {withKey('The realm’s affairs', 'screen:realm')}
        </button>
      ) : (
        <>
          <ForeignDiplomacy c={c} />
          <IntrigueSection c={c} />
        </>
      )}
      <RealmFacts c={c} />
    </div>
  );
}

/** The facts of a realm, what it carries, its vassals and colonies, and its richest land. */
function RealmFacts({ c }: { c: Country }) {
  const game = useGame();
  const stats = useMemo(() => countryStats(game, c.index), [game, c.index]);
  const best = useMemo(
    () =>
      [...provincesOf(game.state, c.index)]
        .sort((a, b) => game.state.provinces[b].dev - game.state.provinces[a].dev)
        .slice(0, 8),
    [game, c.index],
  );
  const open = (i: number) => selectCountry(game, i, true);
  return (
    <>
      <CountryFacts country={c} stats={stats} />
      <ModifiersSection c={c} />
      {stats.vassals.length > 0 && (
        <section className="sp-section">
          <h3 className="section-title">Vassals · {stats.vassals.length}</h3>
          <ul className="chips">
            {stats.vassals.map((v) => (
              <li key={v.index}>
                <button className="chip with-coa" onClick={() => open(v.index)}>
                  <CoatOfArms country={v} size={16} />
                  {capitalize(v.short)}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <ColoniesSection c={c} />
      {best.length > 0 && (
        <section className="sp-section">
          <h3 className="section-title">Richest provinces</h3>
          <ul className="ranked">
            {best.map((id) => (
              <li key={id}>
                <button className="ranked-row" onClick={() => goToProvince(game, id)}>
                  <span>{game.world.region(id).name}</span>
                  <span className="num dim">{game.state.provinces[id].dev}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
