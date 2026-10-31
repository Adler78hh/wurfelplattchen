import { describe, expect, it } from 'vitest';
import { toXY } from '../src/geo/lattice';
import { buildModel } from '../src/geo/space';
import { sheetOf } from '../src/model/doc';
import { EXAMPLES } from '../src/model/examples';

describe('example pictures', () => {
  it('all lie on their sheet and can be shown in 3D', () => {
    for (const ex of EXAMPLES) {
      const d = ex.make();
      const { w, h } = sheetOf(d);
      for (const s of d.shapes)
        for (const p of s.parts.flatMap((q) => q.pts)) {
          const q = toXY(d.view, p);
          expect(q.x, ex.key).toBeGreaterThanOrEqual(0);
          expect(q.x, ex.key).toBeLessThanOrEqual(w);
          expect(q.y, ex.key).toBeGreaterThanOrEqual(0);
          expect(q.y, ex.key).toBeLessThanOrEqual(h);
        }
      const m = buildModel(d.shapes);
      expect(m.cubes.length + m.walls.length, ex.key).toBeGreaterThan(0);
    }
  });

  it('only the impossible triangle is impossible', () => {
    for (const ex of EXAMPLES) {
      const m = buildModel(ex.make().shapes);
      const bad = m.cubes.some((c) => c.impossible);
      expect(bad, ex.key).toBe(ex.key === 'dreieck');
    }
  });

  it('the staircase climbs and the city stands on the ground', () => {
    const stairs = buildModel(EXAMPLES.find((e) => e.key === 'treppe')!.make().shapes);
    expect(Math.max(...stairs.cubes.map((c) => c.min[2]))).toBe(3);
    const city = buildModel(EXAMPLES.find((e) => e.key === 'stadt')!.make().shapes);
    expect(Math.min(...city.cubes.map((c) => c.min[2]))).toBe(0);
    expect(Math.max(...city.cubes.map((c) => c.min[2]))).toBe(3); // the red tower has four cubes
  });
});
