/** Pieces shared by every view of a country: heading with arms, key facts, names of things. */
import type { Country } from '../game/world';
import { CoatOfArms } from './CoatOfArms';
import { GOVERNMENT_NAMES, RANK_NAMES, formatNumber } from './format';
import { countryStats, useGame, type CountryStats, type Game } from './game';

export function cultureName(game: Game, id: string | null | undefined): string {
  return (id && game.world.world.cultures[id]?.name) || 'Unknown';
}

export function religionName(game: Game, id: string | null | undefined): string {
  return (id && game.world.world.religions[id]?.name) || 'Unknown';
}

export function Swatch({ color }: { color: string }) {
  return <span className="swatch" style={{ background: color }} aria-hidden="true" />;
}

export function rulerLine(c: Country): string {
  if (!c.ruler) return 'Ruler unrecorded';
  return `${c.ruler.name}, aged ${c.ruler.age}`;
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
  const religion = game.world.world.religions[country.religion];
  const capital = country.capital ? game.world.region(country.capital) : null;
  const withVassals = s.realmProvinces > s.provinces;
  return (
    <dl className="facts">
      <div className="wide">
        <dt>Ruler</dt>
        <dd>{rulerLine(country)}</dd>
      </div>
      <div>
        <dt>Capital</dt>
        <dd>{capital?.name ?? '—'}</dd>
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
          {religion && <Swatch color={religion.color} />} {religionName(game, country.religion)}
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
    </dl>
  );
}
