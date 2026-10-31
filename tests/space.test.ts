import { describe, expect, it } from 'vitest';
import { type LP, cubeFaces, rhombPts } from '../src/geo/lattice';
import { type Shape, cubeFills, newId } from '../src/geo/shapes';
import { buildModel, offsetFor, onLine, project } from '../src/geo/space';

const cube = (c: LP, v: 0 | 1 = 0, color = '#6aa9e0'): Shape => ({ id: newId(), kind: 'cube', parts: cubeFills(cubeFaces(c, v), color), stroke: '#4a3a2e', width: 1 });

describe('space', () => {
  it('projects the line of sight to one lattice point', () => {
    for (const t of [-2, 0, 3]) expect(project(onLine(4, -1, t))).toEqual([4, -1]);
  });

  it('puts a single cube on the ground below its plate', () => {
    const m = buildModel([cube([3, 2])]);
    expect(m.cubes).toHaveLength(1);
    expect(m.cubes[0].min).toEqual([5, 2, 0]);
    expect(m.cubes[0].colors.z).toBe('#6aa9e0');
  });

  it('a plate drawn above and in front stacks on top', () => {
    const m = buildModel([cube([3, 2]), cube([3, 1])]);
    const [a, b] = m.cubes;
    expect([b.min[0] - a.min[0], b.min[1] - a.min[1], b.min[2] - a.min[2]]).toEqual([0, 0, 1]);
    expect(m.cubes.some((c) => c.impossible)).toBe(false);
  });

  it('the same plate drawn behind sits behind on the ground', () => {
    const m = buildModel([cube([3, 1]), cube([3, 2])]);
    expect(m.cubes.map((c) => c.min[2])).toEqual([0, 0]);
  });

  it('plates side by side stay side by side', () => {
    const m = buildModel([cube([3, 2]), cube([5, 1])]);
    expect(m.cubes[1].min[2]).toBe(m.cubes[0].min[2]);
    expect(offsetFor([2, -1], true)).toEqual([1, -1, 0]);
  });

  it('a staircase climbs', () => {
    // Each step one to the right (+X) and one up (+Z): drawing offset (1, −1).
    const m = buildModel([cube([0, 3]), cube([1, 2]), cube([2, 1])]);
    expect(m.cubes.map((c) => c.min[2])).toEqual([0, 1, 2]);
  });

  it('marks contradictions of an impossible figure', () => {
    // Three mutually overlapping plates whose front/behind wishes cannot all hold.
    const m = buildModel([cube([0, 0]), cube([1, -1]), cube([1, 0])]);
    expect(m.cubes.filter((c) => c.impossible).length).toBeGreaterThan(0);
  });

  it('the turned plate is also a cube', () => {
    const m = buildModel([cube([2, 2], 1)]);
    expect(m.cubes).toHaveLength(1);
  });

  it('a loose rhomb becomes a face wall in its plane next to the cube', () => {
    const lid: Shape = { id: newId(), kind: 'rhomb', parts: [{ pts: rhombPts([6, 0], 0), fill: '#ffd166' }], stroke: null, width: 1 };
    const m = buildModel([cube([3, 2]), lid]);
    expect(m.walls).toHaveLength(1);
    const w = m.walls[0];
    expect(w.kind).toBe('face');
    expect(new Set(w.pts.map((p) => p[2])).size).toBe(1);
    for (let k = 0; k < 4; k++) expect(project(w.pts[k])).toEqual(rhombPts([6, 0], 0)[k]);
  });

  it('other shapes become plates that look the same from the front', () => {
    const tri: Shape = { id: newId(), kind: 'triangle', parts: [{ pts: [[0, 0], [1, 0], [0, 1]], fill: '#93cf7e' }], stroke: null, width: 1 };
    const m = buildModel([tri]);
    const w = m.walls[0];
    expect(w.kind).toBe('plate');
    w.pts.forEach((p, k) => {
      const [i, j] = project(p);
      expect(i).toBeCloseTo(tri.parts[0].pts[k][0]);
      expect(j).toBeCloseTo(tri.parts[0].pts[k][1]);
    });
  });
});
