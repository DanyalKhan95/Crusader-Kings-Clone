import { describe, expect, it } from 'vitest';
import { coaSvg, CURATED, generateCoA, isMetal } from '../src/heraldry/coa';
import { hexToRgb } from '../src/sim/setup';
import { loadData } from './helpers';

describe('coats of arms', () => {
  const { scenario, world } = loadData();
  const family = (religion: string) => world.religions[religion]?.family ?? 'christian';

  it('uses the curated arms of major realms', () => {
    expect(generateCoA('ENG', [200, 40, 40], 'christian')).toBe(CURATED.ENG);
    expect(CURATED.FRA.charge?.kind).toBe('fleur-de-lys');
  });

  it('generates the same arms for the same country every time', () => {
    for (const c of scenario.countries.slice(0, 60)) {
      const a = generateCoA(c.tag, hexToRgb(c.color), family(c.religion));
      const b = generateCoA(c.tag, hexToRgb(c.color), family(c.religion));
      expect(a).toEqual(b);
    }
  });

  it('keeps the rule of tincture on plain fields', () => {
    for (const c of scenario.countries) {
      if (CURATED[c.tag]) continue;
      const coa = generateCoA(c.tag, hexToRgb(c.color), family(c.religion));
      if (coa.div !== 'plain') continue;
      if (coa.ordinary) expect(isMetal(coa.ordinary.t), c.tag).not.toBe(isMetal(coa.t1));
      if (coa.charge && !coa.ordinary) expect(isMetal(coa.charge.t), c.tag).not.toBe(isMetal(coa.t1));
    }
  });

  it('renders SVG with ids unique to each drawing', () => {
    const coa = generateCoA('BYZ', [140, 60, 160], 'christian');
    const a = coaSvg(coa, 64),
      b = coaSvg(coa, 64);
    expect(a.startsWith('<svg')).toBe(true);
    expect(a).toContain('viewBox="0 0 100 120"');
    const id = (s: string) => /clipPath id="([^"]+)"/.exec(s)![1];
    expect(id(a)).not.toBe(id(b));
  });
});
