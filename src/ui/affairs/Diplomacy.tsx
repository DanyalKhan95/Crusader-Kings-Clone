/**
 * Diplomacy: the realms of the world as the realm sees them (what each thinks of it and it of them,
 * how wary they are, how strong, and the treaties between), then the realm's own wars, treaties,
 * subjects, claims and coalitions.
 */
import { useMemo, useState } from 'react';
import { RELATION_INFO, relationTo } from '../../game/mapModes';
import { formatMen } from '../../render/units';
import { hasPact, memory, opinion, PACT_INFO } from '../../sim/diplomacy';
import { atWar, strengthOf, topLiege } from '../../sim/queries';
import type { Country, PactKind } from '../../sim/types';
import { selectCountry } from '../actions';
import { CoatOfArms } from '../CoatOfArms';
import { useGame, type Game } from '../game';
import { Icon } from '../Icon';
import { DiplomacyTab, OpinionValue, PACT_ICON } from '../hud/DiplomacyPanel';

const PACT_KINDS: PactKind[] = ['alliance', 'nap', 'access', 'guarantee'];

type Show = 'near' | 'all';
type SortKey = 'theirs' | 'ours' | 'wary' | 'men' | 'name';

/** Independent realms that border the realm, or are bound to it by a treaty or a war. */
function neighbours(game: Game, c: Country): Set<number> {
  const { state, world } = game;
  const mine = topLiege(state, c.index);
  const out = new Set<number>();
  state.provinces.forEach((p, id) => {
    if (!p?.owner || topLiege(state, p.owner) !== mine) return;
    for (const [n] of world.region(id).adj) {
      const o = state.provinces[n]?.owner;
      if (o) {
        const t = topLiege(state, o);
        if (t !== mine) out.add(t);
      }
    }
  });
  for (const p of state.pacts) if (p.a === mine || p.b === mine) out.add(p.a === mine ? p.b : p.a);
  for (const x of state.countries) if (x?.alive && !x.liege && atWar(state, mine, x.index)) out.add(x.index);
  return out;
}

export function DiplomacyScreen({ c }: { c: Country }) {
  return (
    <div className="affairs-grid">
      <Realms c={c} />
      <div className="affairs-flow">
        <DiplomacyTab c={c} />
      </div>
    </div>
  );
}

function Realms({ c }: { c: Country }) {
  const game = useGame();
  const { state, world } = game;
  const [show, setShow] = useState<Show>('near');
  const [sort, setSort] = useState<SortKey>('theirs');
  const [all, setAll] = useState(false);
  const month = Math.floor(state.day / 30);
  // Opinions are weighed afresh once a month: the table stays still while the days run.
  const rows = useMemo(() => {
    const near = neighbours(game, c);
    return state.countries
      .filter((x): x is Country => !!x?.alive && !x.liege && !x.rebel && x.index !== c.index)
      .filter((x) => show === 'all' || near.has(x.index))
      .map((x) => ({
        x,
        rel: relationTo(state, c.index, x.index),
        theirs: opinion(state, world, x.index, c.index),
        ours: opinion(state, world, c.index, x.index),
        wary: memory(state, x.index, topLiege(state, c.index), 'ae'),
        men: strengthOf(state, x.index),
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- weighed once a month
  }, [game, c.index, show, month]);
  const value = (r: (typeof rows)[number]): number =>
    sort === 'theirs' ? r.theirs.total : sort === 'ours' ? r.ours.total : sort === 'wary' ? -r.wary : r.men;
  const sorted = [...rows].sort((a, b) => (sort === 'name' ? a.x.name.localeCompare(b.x.name) : value(b) - value(a)));
  const shown = all ? sorted : sorted.slice(0, 40);
  const head = (key: SortKey, label: string, num = true) => (
    <th
      scope="col"
      className={num ? 'num' : ''}
      aria-sort={sort === key ? (key === 'name' ? 'ascending' : 'descending') : 'none'}
    >
      <button className={`sort ${sort === key ? 'on' : ''}`} onClick={() => setSort(key)}>
        {label}
      </button>
    </th>
  );
  return (
    <section className="affairs-card wide">
      <div className="affairs-card-head">
        <h3 className="section-title">The realms of the world</h3>
        <div className="segmented" role="radiogroup" aria-label="Which realms">
          <button role="radio" aria-checked={show === 'near'} onClick={() => setShow('near')}>
            Neighbours and treaties
          </button>
          <button role="radio" aria-checked={show === 'all'} onClick={() => setShow('all')}>
            Every realm
          </button>
        </div>
      </div>
      {rows.length ? (
        <div className="affairs-table-wrap tall">
          <table className="affairs-table">
            <thead>
              <tr>
                {head('name', 'Realm', false)}
                <th scope="col">Relation</th>
                {head('theirs', 'Of us')}
                {head('ours', 'Ours of them')}
                {head('wary', 'Wary')}
                {head('men', 'Men')}
                <th scope="col">Treaties</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.x.index} className={r.rel === 'war' ? 'hostile' : ''}>
                  <td>
                    <button className="ledger-realm" onClick={() => selectCountry(game, r.x.index, true)}>
                      <CoatOfArms country={r.x} size={20} />
                      <span>{r.x.name}</span>
                    </button>
                  </td>
                  <td>
                    {r.rel !== 'neutral' && (
                      <span className="relation">
                        <span
                          className="swatch"
                          style={{ background: RELATION_INFO[r.rel].color }}
                          aria-hidden="true"
                        />
                        {RELATION_INFO[r.rel].name}
                      </span>
                    )}
                  </td>
                  <td className="num">
                    <OpinionValue b={r.theirs} title={`${r.x.short} thinks of us`} />
                  </td>
                  <td className="num">
                    <OpinionValue b={r.ours} title={`We think of ${r.x.short}`} />
                  </td>
                  <td className={`num ${r.wary < -1 ? 'bad' : 'dim'}`}>{r.wary < -1 ? Math.round(r.wary) : '—'}</td>
                  <td className="num">{formatMen(r.men)}</td>
                  <td>
                    <span className="treaty-icons">
                      {PACT_KINDS.filter(
                        (k) => hasPact(state, k, c.index, r.x.index) || hasPact(state, k, r.x.index, c.index),
                      ).map((k) => (
                        <span key={k} title={PACT_INFO[k].name}>
                          <Icon name={PACT_ICON[k]} />
                          <span className="sr-only">{PACT_INFO[k].name}</span>
                        </span>
                      ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="dim small">No realm borders yours, and none is bound to you.</p>
      )}
      {sorted.length > 40 && (
        <button className="btn small" onClick={() => setAll(!all)}>
          {all ? 'Show the first forty' : `Show all ${sorted.length}`}
        </button>
      )}
    </section>
  );
}
