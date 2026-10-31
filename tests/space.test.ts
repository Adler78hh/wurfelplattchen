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

  it('the turned plate is an inner corner unless the child chose a cube', () => {
    const c = cube([2, 2], 1);
    const m = buildModel([c]);
    expect(m.cubes).toHaveLength(0);
    expect(m.walls).toHaveLength(3);
    expect(m.walls.every((w) => w.cornerOf === c.id && !w.impossible)).toBe(true);
    // Seen from the front it looks exactly as drawn.
    m.walls.forEach((w, k) => w.pts.forEach((p, n) => expect(project(p)).toEqual(c.parts[k].pts[n])));
    const asCube = buildModel([{ ...c, reading: 'cube' }]);
    expect(asCube.cubes).toHaveLength(1);
    expect(asCube.cubes[0].turned).toBe(true);
    expect(buildModel([cube([2, 2], 0)]).cubes[0].turned).toBe(false);
  });

  it('a loose rhomb becomes a face wall in its plane next to the cube', () => {
    const lid: Shape = { id: newId(), kind: 'rhomb', parts: [{ pts: rhombPts([6, 0], 0), fill: '#ffd166' }], stroke: null, width: 1 };
    const m = buildModel([cube([3, 2]), lid]);
    expect(m.walls).toHaveLength(1);
    const w = m.walls[0];
    expect(w.kind).toBe('face');
    expect(w.impossible).toBe(true);
    expect(new Set(w.pts.map((p) => p[2])).size).toBe(1);
    for (let k = 0; k < 4; k++) expect(project(w.pts[k])).toEqual(rhombPts([6, 0], 0)[k]);
  });

  it('drawn shapes become walls that look the same from the front', () => {
    const tri: Shape = { id: newId(), kind: 'triangle', parts: [{ pts: [[0, 0], [1, 0], [0, 1]], fill: '#93cf7e' }], stroke: null, width: 1 };
    const m = buildModel([tri]);
    const w = m.walls[0];
    expect(w.kind).toBe('face');
    w.pts.forEach((p, k) => {
      const [i, j] = project(p);
      expect(i).toBeCloseTo(tri.parts[0].pts[k][0]);
      expect(j).toBeCloseTo(tri.parts[0].pts[k][1]);
    });
  });
});

describe('loose rhombs', () => {
  it('a split cube plate keeps its three faces exactly where the cube was', async () => {
    const { split } = await import('../src/geo/shapes');
    for (const v of [0, 1] as const) {
      const c = cube([3, 2], v);
      const whole = buildModel([{ ...c, reading: 'cube' }]).cubes[0];
      const parts = buildModel(split([c], [c.id]).shapes);
      expect(parts.cubes).toHaveLength(0);
      expect(parts.walls).toHaveLength(3);
      // Every corner of the walls is a corner of the original cube.
      for (const w of parts.walls)
        for (const p of w.pts)
          for (let k = 0; k < 3; k++) expect([whole.min[k], whole.min[k] + 1]).toContain(p[k]);
      // The lid stays on top of the cube (for the turned plate: the bottom stays at the bottom).
      const lid = parts.walls.find((w) => w.back[2] === -1)!;
      expect(lid.pts.every((p) => p[2] === (v === 0 ? whole.min[2] + 1 : whole.min[2]))).toBe(true);
      expect(parts.walls.some((w) => w.impossible)).toBe(false);
    }
  });

  it('a rhomb sharing an edge with the lid continues the roof at the same height', () => {
    const base = cube([3, 2]);
    // Lid of the neighbour cube behind-left: shares the upper-left edge of the cube's lid.
    const roof: Shape = { id: newId(), kind: 'rhomb', parts: [{ pts: [[2, 2], [1, 2], [2, 1], [3, 1]], fill: '#ffd166' }], stroke: null, width: 1 };
    const m = buildModel([base, roof]);
    expect(m.walls[0].pts.every((p) => p[2] === 1)).toBe(true);
  });
});

describe('hand-drawn shapes', () => {
  const tri = (pts: LP[], plane?: 0 | 1 | 2): Shape => ({ id: newId(), kind: 'triangle', parts: [{ pts, fill: '#4fbfb3' }], stroke: null, width: 1, plane });
  const key3 = (p: number[]) => p.map((x) => x.toFixed(6)).join(',');

  it('guesses the plane from the edges', async () => {
    const { guessPlane } = await import('../src/geo/space');
    // Edges along X and Y only → lying.
    expect(guessPlane([[0, 0], [2, 0], [0, 2], [-2, 2]], true)).toBe(0);
    // Vertical and Y edges → wall facing right (X = const).
    expect(guessPlane([[0, 0], [0, 2], [-1, 3], [-1, 1]], true)).toBe(1);
    // Vertical and X edges → wall facing left (Y = const).
    expect(guessPlane([[0, 0], [0, 2], [1, 2], [1, 0]], true)).toBe(2);
  });

  it('attaches at the edge it shares with a cube, in every plane', () => {
    const base = cube([3, 2]);
    // Right edge of the cube: from R1 (4,1) down to R2 (4,2); a triangle sticking out to the right.
    for (const plane of [0, 1, 2] as const) {
      const t = tri([[4, 1], [4, 2], [5, 1]], plane);
      const m = buildModel([base, t]);
      const c = m.cubes[0].min;
      const corners = new Set<string>();
      for (const dx of [0, 1]) for (const dy of [0, 1]) for (const dz of [0, 1]) corners.add(key3([c[0] + dx, c[1] + dy, c[2] + dz]));
      const w = m.walls[0];
      // Standing walls share the whole edge with the cube; a lying triangle cannot hold a vertical
      // edge, it hangs on at a corner.
      expect(corners.has(key3(w.pts[0]))).toBe(true);
      expect(corners.has(key3(w.pts[1]))).toBe(plane !== 0);
      expect(w.plane).toBe(plane);
      expect(w.flippable).toBe(true);
      // Still looks as drawn.
      w.pts.forEach((p, k) => {
        const [i, j] = project(p);
        expect(i).toBeCloseTo(t.parts[0].pts[k][0]);
        expect(j).toBeCloseTo(t.parts[0].pts[k][1]);
      });
    }
  });

  it('lies flat in its plane', () => {
    const m = buildModel([tri([[0, 0], [1, 0], [0, 1]], 1)]);
    expect(new Set(m.walls[0].pts.map((p) => p[0].toFixed(6))).size).toBe(1);
  });

  it('guesses a standing wall when only that can hold the shared cube edge', () => {
    const m = buildModel([cube([3, 2]), tri([[4, 1], [4, 2], [5, 1]])]);
    expect(m.walls[0].plane).not.toBe(0);
  });
});

describe('tipping figures', () => {
  const poly = (pts: LP[]): Shape => ({ id: newId(), kind: 'polygon', parts: [{ pts, fill: '#a58bd8' }], stroke: null, width: 1 });
  // The four examples from the drawing: a cube and a shape at its lid.
  const cases: [LP, LP[], number][] = [
    [[4, 1], [[2, 1], [4, -1], [4, 0], [3, 1]], 2], // purple flag: table or wall
    [[11, -2], [[9, -2], [10, -3], [11, -3], [10, -2], [9, -1]], 2], // purple step: table or wall
    [[4, 5], [[1, 5], [2, 4], [4, 4], [3, 5]], 1], // pink table
    [[11, 2], [[10, 1], [11, 0], [11, 1], [10, 2]], 1], // pink wall
  ];

  it('knows which shapes have two readings', async () => {
    const { planeChoice } = await import('../src/geo/space');
    for (const [c, pts, n] of cases) {
      const p = poly(pts);
      const choice = planeChoice([cube(c), p], p.id)!;
      expect(choice.options).toHaveLength(n);
      expect(choice.chosen).toBe(false);
      expect(choice.options).toContain(choice.plane);
    }
    expect(planeChoice([cube([4, 4])], 'nope')).toBeNull();
  });

  it('a chosen plane is used and remembered', async () => {
    const { planeChoice } = await import('../src/geo/space');
    const [c, pts] = cases[0];
    const p = { ...poly(pts), plane: 1 as const };
    const choice = planeChoice([cube(c), p], p.id)!;
    expect(choice).toMatchObject({ plane: 1, chosen: true });
    expect(buildModel([cube(c), p]).walls[0].plane).toBe(1);
  });
});

describe('star with a turned plate', () => {
  it('the orange corner fits the star without contradiction', async () => {
    const { RING, cubeFaces: faces } = await import('../src/geo/lattice');
    const add = (a: LP, b: LP): LP => [a[0] + b[0], a[1] + b[1]];
    const star: Shape[] = RING.map((u, k) => {
      const v = RING[(k + 1) % 6];
      return { id: 'r' + k, kind: 'rhomb', parts: [{ pts: [[0, 0], u, add(u, v), v], fill: '#ffd166' }], stroke: null, width: 1 };
    });
    // Orange lying rhomb below the star, merged with the two lower rhombs into a turned plate at (0, 1).
    const plate: Shape = { id: 'p', kind: 'cube', parts: cubeFills(faces([0, 1], 1), '#f59a4a'), stroke: null, width: 1 };
    const rest = star.filter((r) => !plate.parts.some((pt) => pt.pts.every((q) => r.parts[0].pts.some((x) => x[0] === q[0] && x[1] === q[1]))));
    expect(rest).toHaveLength(4);
    const m = buildModel([...rest, plate]);
    expect(m.cubes).toHaveLength(0);
    const corner = m.walls.filter((w) => w.cornerOf === 'p');
    expect(corner).toHaveLength(3);
    expect(corner.some((w) => w.impossible)).toBe(false);
  });
});

describe('speed', () => {
  it('handles a big painted picture quickly', () => {
    const shapes: Shape[] = [];
    for (let i = 0; i < 30; i++)
      for (let j = 0; j < 12; j++)
        for (const k of [0, 1] as const) {
          const pts: LP[] = k === 0 ? [[i, j], [i + 1, j], [i, j + 1]] : [[i + 1, j], [i + 1, j + 1], [i, j + 1]];
          shapes.push({ id: `t${i}-${j}-${k}`, kind: 'triangle', parts: [{ pts, fill: '#a58bd8' }], stroke: null, width: 1 });
        }
    for (let i = 0; i < 20; i++) for (let j = 0; j < 5; j++) shapes.push(cube([40 + 2 * i, 3 * j - i]));
    const t0 = performance.now();
    const m = buildModel(shapes);
    const ms = performance.now() - t0;
    expect(m.cubes).toHaveLength(100);
    expect(m.walls).toHaveLength(720);
    expect(ms).toBeLessThan(1500);
  });
});

describe('stacking new cubes', () => {
  const place = async (shapes: Shape[], c: LP) => {
    const { stackCube } = await import('../src/geo/space');
    return stackCube(shapes, cube(c), c);
  };
  const zOf = (shapes: Shape[]) => buildModel(shapes).cubes.map((q) => q.min);

  it('a plate drawn above a cube goes on top', async () => {
    const s = await place([cube([3, 2])], [3, 1]);
    const [a, b] = zOf(s);
    expect(b[2] - a[2]).toBe(1);
  });

  it('a plate drawn up-right of a cube goes behind it, on the ground, and is drawn behind', async () => {
    const base = cube([3, 2]);
    const s = await place([base], [4, 1]);
    expect(s[s.length - 1].id).toBe(base.id); // the new plate was put underneath
    const cubes = buildModel(s).cubes;
    expect(cubes.every((q) => q.min[2] === 0)).toBe(true);
  });

  it('a plate drawn below a cube comes in front on the ground', async () => {
    const s = await place([cube([3, 2])], [3, 3]);
    const cubes = buildModel(s).cubes;
    expect(cubes.every((q) => q.min[2] === 0)).toBe(true);
  });

  it('builds a staircase going back in any order', async () => {
    // Steps going back and up, placed front to back.
    let s: Shape[] = [cube([0, 4])];
    s = await place(s, [1, 2]); // behind (−Y) and up
    const cubes = buildModel(s).cubes;
    expect(cubes.some((q) => q.impossible)).toBe(false);
  });
});
