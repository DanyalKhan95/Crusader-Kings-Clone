import { memo, useMemo } from 'react';
import type { Country } from '../game/world';
import { coaSvg, generateCoA, type CoA } from '../heraldry/coa';
import { religionFamily, useGame } from './game';

const models = new Map<string, CoA>();

export function coaOf(country: Country, family: string): CoA {
  let c = models.get(country.tag);
  if (!c) models.set(country.tag, (c = generateCoA(country.tag, country.color, family)));
  return c;
}

/** A country's arms on a heater shield. Width in CSS px; the shield is 1.2× as tall. */
export const CoatOfArms = memo(function CoatOfArms({
  country,
  size = 40,
  className = '',
}: {
  country: Country;
  size?: number;
  className?: string;
}) {
  const game = useGame();
  const family = religionFamily(game, country.religion);
  // Fresh markup per instance: the SVG carries clip-path ids that must stay unique in the page.
  const html = useMemo(() => coaSvg(coaOf(country, family), size), [country, family, size]);
  return (
    <span
      className={`coa ${className}`}
      style={{ width: size, height: size * 1.2 }}
      role="img"
      aria-label={`Arms of ${country.name}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});
