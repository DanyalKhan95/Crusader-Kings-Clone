/** Pieces shared by every view of a country: heading with arms, key facts, names of things. */
import { cultureName as nameOfCulture, faithColor, faithName } from '../sim/beliefs';
import { age, character } from '../sim/characters';
import type { Country } from '../sim/types';
import { CoatOfArms } from './CoatOfArms';
import { GOVERNMENT_NAMES, RANK_NAMES, formatNumber, ordinal } from './format';
import { ranking, standing } from '../sim/score';
import { BreakdownList, WithTip } from './hud/Tip';
import { countryStats, useGame, type CountryStats, type Game } from './game';
import { placeName } from '../sim/places';

export function cultureName(_game: Game, id: string | null | undefined): string {
  return nameOfCulture(id);
}

export function religionName(_game: Game, id: string | null | undefined): string {
  return faithName(id);
}

export function Swatch({ color }: { color: string }) {
  return <span className="swatch" style={{ background: color }} aria-hidden="true" />;
}

export function rulerLine(game: Game, c: Country): string {
  const r = character(game.state, c.ruler);
  if (!r) return 'Ruler unrecorded';
  return `${r.name}, aged ${age(game.state, r)}`;
}

export function CountryHeader({
  country,
  size = 76,
  onLiege,
}: {
  country: Country;
  size?: number;
  onLiege?: (index: number) => void;
}) {
  const game = useGame();
  const liege = country.liege ? game.state.countries[country.liege] : null;
  return (
    <div className="realm-head">
      <CoatOfArms country={country} size={size} />
      <div className="realm-head-text">
        <h2 className="display realm-title">{country.name}</h2>
        <p className="caps realm-sub">
          {RANK_NAMES[country.rank]} · {GOVERNMENT_NAMES[country.gov]}
        </p>
        {liege && (
          <p className="realm-liege">
            Vassal of{' '}
            {onLiege ? (
              <button className="link" onClick={() => onLiege(liege.index)}>
                {liege.name}
              </button>
            ) : (
              liege.name
            )}
          </p>
        )}
      </div>
    </div>
  );
}

export function CountryFacts({ country, stats }: { country: Country; stats?: CountryStats }) {
  const game = useGame();
  const s = stats ?? countryStats(game, country.index);
  const culture = game.world.world.cultures[country.culture];
  const capital = country.capital ? placeName(game.state, country.capital) : null;
  const withVassals = s.realmProvinces > s.provinces;
  return (
    <dl className="facts">
      <div className="wide">
        <dt>Ruler</dt>
        <dd>{rulerLine(game, country)}</dd>
      </div>
      <div>
        <dt>Capital</dt>
        <dd>{capital ?? '—'}</dd>
      </div>
      <div>
        <dt>Provinces</dt>
        <dd className="num">
          {s.provinces}
          {withVassals && <span className="dim"> · {s.realmProvinces} in realm</span>}
        </dd>
      </div>
      <div>
        <dt>Culture</dt>
        <dd>
          {culture && <Swatch color={culture.color} />} {cultureName(game, country.culture)}
        </dd>
      </div>
      <div>
        <dt>Faith</dt>
        <dd>
          <Swatch color={faithColor(country.religion)} /> {religionName(game, country.religion)}
        </dd>
      </div>
      <div>
        <dt>Development</dt>
        <dd className="num">
          {s.development}
          {withVassals && <span className="dim"> · {s.realmDevelopment} in realm</span>}
        </dd>
      </div>
      <div>
        <dt>Land</dt>
        <dd className="num">{formatNumber(s.area)} km²</dd>
      </div>
      {!country.liege && country.alive && !country.rebel && <Standing country={country} />}
    </dl>
  );
}

/** The realm's place among the nations, and what it scores this year. */
function Standing({ country }: { country: Country }) {
  const game = useGame();
  const rank = ranking(game.state).indexOf(country) + 1;
  if (!rank) return null;
  return (
    <div className="wide">
      <dt>Standing</dt>
      <dd>
        <WithTip tip={<BreakdownList title="At the next New Year" b={standing(game.state, country)} />}>
          <span className="num">
            {ordinal(rank)} among the nations · {Math.round(country.score).toLocaleString('en-US')} points
          </span>
        </WithTip>
      </dd>
    </div>
  );
}
