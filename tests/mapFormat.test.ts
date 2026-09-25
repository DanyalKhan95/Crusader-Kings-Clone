import { describe, expect, it } from 'vitest';
import { decodeMap, encodeMap, ringCoordinates, type MapGeometry } from '../src/shared/mapFormat';
import { loadGeometry, mapBytes } from './helpers';

/** Two unit squares sharing an edge, as arcs: 1 = shared edge, 2 and 3 = the outer boundaries. */
function tinyMap(): MapGeometry {
  const arc = (...pts: number[]) => new Float32Array(pts);
  const lod = [arc(1, 0, 1, 1), arc(1, 1, 0, 1, 0, 0, 1, 0), arc(1, 0, 2, 0, 2, 1, 1, 1)];
  return {
    width: 4,
    height: 2,
    regionCount: 2,
    arcLeft: new Uint16Array([1, 1, 2]),
    arcRight: new Uint16Array([2, 0, 0]),
    lods: [lod, lod, lod],
    polygons: [[], [[new Int32Array([0, 1])]], [[new Int32Array([~0, 2])]]],
    rivers: [{ width: 2, points: new Float32Array([0.25, 0.5, 1.75, 0.5]) }],
  };
}

describe('map format', () => {
  it('round-trips a small map exactly (to quarter units)', () => {
    const g = tinyMap();
    const back = decodeMap(encodeMap(g));
    expect(back.regionCount).toBe(2);
    expect([...back.arcLeft]).toEqual([1, 1, 2]);
    expect([...back.arcRight]).toEqual([2, 0, 0]);
    expect([...back.lods[0][1]]).toEqual([...g.lods[0][1]]);
    expect(back.polygons[2][0][0][0]).toBe(~0);
    expect([...back.rivers[0].points]).toEqual([0.25, 0.5, 1.75, 0.5]);
  });

  it('walks rings through forward and reversed arcs', () => {
    const g = tinyMap();
    // Region 2: shared edge reversed (1,1 → 1,0), then its outer boundary back to the start.
    expect(ringCoordinates(g, 0, g.polygons[2][0][0])).toEqual([1, 1, 1, 0, 2, 0, 2, 1]);
  });

  it('re-encodes the shipped map byte for byte', () => {
    const bytes = mapBytes();
    const again = encodeMap(decodeMap(bytes));
    expect(again.length).toBe(bytes.length);
    expect(Buffer.from(again).equals(Buffer.from(bytes))).toBe(true);
  });

  it('gives every region a real outline at full detail', () => {
    // Islets a pixel wide may collapse to a line when simplified; each region still needs one
    // outer ring with an area, and collapsed rings must stay rare.
    const g = loadGeometry();
    let rings = 0,
      collapsed = 0;
    for (let r = 1; r <= g.regionCount; r++) {
      let outlines = 0;
      for (const poly of g.polygons[r])
        poly.forEach((ring, i) => {
          rings++;
          const points = ringCoordinates(g, 0, ring).length / 2;
          if (points < 3) collapsed++;
          else if (i === 0) outlines++;
        });
      expect(outlines, `region ${r}`).toBeGreaterThan(0);
    }
    expect(collapsed / rings).toBeLessThan(0.05);
  });
});
