import { useMemo } from 'react';
import { coaSvg, generateCoA, type CoA } from '../heraldry/coa';
import { bannerSvg, emblemStyle, flagOf, flagSvg } from '../heraldry/flag';
import { cultureGroup, faithFamily } from '../sim/beliefs';
import { eraOf } from '../sim/tech';
import type { Country } from '../sim/types';

const models = new Map<string, CoA>();

export function coaOf(country: Country, family: string): CoA {
  let c = models.get(country.tag);
  if (!c) models.set(country.tag, (c = generateCoA(country.tag, country.color, family)));
  return c;
}

/**
 * A country's emblem as SVG markup: its arms on a shield, as a banner in the early modern era, or its
 * national flag from the industrial era on. Width in px; shields and banners are 1.2× as tall.
 */
export function emblemSvg(country: Country, size: number): string {
  const family = faithFamily(country.religion) || 'christian';
  const coa = coaOf(country, family);
  const style = emblemStyle(eraOf(country));
  if (style === 'shield') return coaSvg(coa, size);
  if (style === 'banner') return bannerSvg(coa, size);
  return flagSvg(flagOf(country.tag, coa, country.gov, cultureGroup(country.culture), family), size);
}

/** What the emblem looks like now, so views can tell when it changes. */
export function emblemKey(country: Country): string {
  return `${country.tag}:${emblemStyle(eraOf(country))}:${country.gov}`;
}

/**
 * A country's emblem in a box `size` wide and 1.2 × `size` tall. Not memoised on its props: the
 * country object stays the same while its era and government change; the markup is kept until they do.
 */
export function CoatOfArms({
  country,
  size = 40,
  className = '',
}: {
  country: Country;
  size?: number;
  className?: string;
}) {
  const key = emblemKey(country);
  // Fresh markup per instance: the SVG carries clip-path ids that must stay unique in the page.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => emblemSvg(country, size), [key, size]);
  const flag = emblemStyle(eraOf(country)) === 'flag';
  return (
    <span
      className={`coa ${flag ? 'flag' : ''} ${className}`}
      style={{ width: size, height: size * 1.2 }}
      role="img"
      aria-label={`${flag ? 'Flag' : 'Arms'} of ${country.name}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
