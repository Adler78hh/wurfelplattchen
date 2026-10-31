import { describe, expect, it } from 'vitest';
import { shade } from '../src/geo/color';
import {
  type Grid,
  type LP,
  type RhombType,
  cellAt,
  cellPts,
  cubeFaces,
  hexPts,
  nearestPoint,
  norm2,
  rhombAt,
  rhombPts,
  rhombType,
  rot60,
  sub,
  toXY,
} from '../src/geo/lattice';
import { type Shape, copyOffset, cubeFills, findCandidates, merge, newId, rotate, translate } from '../src/geo/shapes';
import { fromFile, newDoc, toFile } from '../src/model/doc';

const g: Grid = { s: 10, ox: 5, oy: 3 };
const rhomb = (p: LP, t: RhombType, fill = '#ffd166'): Shape => ({ id: newId(), kind: 'rhomb', parts: [{ pts: rhombPts(p, t), fill }], stroke: '#000000', width: 1 });

const edgeLen = (a: LP, b: LP) => {
  const p = toXY(g, a);
  const q = toXY(g, b);
  return Math.hypot(p.x - q.x, p.y - q.y);
};

describe('lattice', () => {
  it('neighbours are one edge apart', () => {
    for (const p of hexPts([3, 4])) expect(edgeLen(p, [3, 4])).toBeCloseTo(10);
  });

  it('snaps to the nearest point', () => {
    const q = toXY(g, [2, 5]);
    expect(nearestPoint(g, q.x + 2, q.y - 3)).toEqual([2, 5]);
  });

  it('finds the triangle cell under a point', () => {
    const c = cellAt(g, toXY(g, [1, 1]).x + 2, toXY(g, [1, 1]).y + 3);
    const pts = cellPts(c).map((p) => toXY(g, p));
    const cx = pts.reduce((a, p) => a + p.x, 0) / 3;
    expect(Math.abs(cx - (toXY(g, [1, 1]).x + 2))).toBeLessThan(10);
    for (let i = 0; i < 3; i++) expect(edgeLen(cellPts(c)[i], cellPts(c)[(i + 1) % 3])).toBeCloseTo(10);
  });

  it('turns by 60° six times back to the start', () => {
    let p: LP = [4, -1];
    for (let k = 0; k < 6; k++) p = rot60(p, [1, 1]);
    expect(p).toEqual([4, -1]);
    expect(norm2(sub(rot60([2, 1], [1, 1]), [1, 1]))).toBe(1);
  });

  it('rhombs have unit edges and know their type', () => {
    for (const t of [0, 1, 2] as RhombType[]) {
      const pts = rhombPts([2, 2], t);
      for (let i = 0; i < 4; i++) expect(edgeLen(pts[i], pts[(i + 1) % 4])).toBeCloseTo(10);
      expect(rhombType(pts)).toBe(t);
      const c = toXY(g, pts[0]);
      const d = toXY(g, pts[2]);
      expect(rhombAt(g, (c.x + d.x) / 2, (c.y + d.y) / 2, t)).toEqual(pts);
    }
  });

  it('a cube plate is three different rhombs', () => {
    for (const v of [0, 1] as const) {
      const faces = cubeFaces([0, 0], v);
      expect(new Set(faces.map(rhombType))).toEqual(new Set([0, 1, 2]));
    }
  });

  it('shades a cube light, middle and dark', () => {
    const parts = cubeFills(cubeFaces([0, 0], 0), '#6aa9e0');
    const lid = parts.find((p) => rhombType(p.pts) === 0)!;
    expect(lid.fill).toBe(shade('#6aa9e0', 0));
  });
});

describe('merging rhombs', () => {
  it('finds three rhombs forming a cube', () => {
    const shapes = cubeFaces([5, 5], 0).map((pts) => ({ ...rhomb([0, 0], 0), id: newId(), parts: [{ pts, fill: '#ffd166' }] }));
    const c = findCandidates(shapes);
    expect(c).toHaveLength(1);
    expect(c[0].center).toEqual([5, 5]);
    const r = merge(shapes, c[0]);
    expect(r.shapes).toHaveLength(1);
    expect(r.shapes[0].kind).toBe('cube');
    expect(r.shapes[0].parts).toHaveLength(3);
  });

  it('works for the turned cube and after rotating', () => {
    let shapes: Shape[] = cubeFaces([5, 5], 1).map((pts) => ({ ...rhomb([0, 0], 0), id: newId(), parts: [{ pts, fill: '#ffd166' }] }));
    expect(findCandidates(shapes)).toHaveLength(1);
    shapes = shapes.map((s) => rotate(translate(s, [2, -1]), [0, 0]));
    expect(findCandidates(shapes)).toHaveLength(1);
  });

  it('ignores two rhombs of the same kind', () => {
    const shapes = [rhomb([0, 0], 0), rhomb([0, 1], 0), rhomb([0, 0], 1)];
    expect(findCandidates(shapes)).toHaveLength(0);
  });

  it('finds both readings of the Vasarely star', () => {
    // Six cube plates around the origin share rhombs: count candidates in a hexagon of 12 rhombs.
    const shapes: Shape[] = [];
    for (const c of hexPts([0, 0]).filter((_, i) => i % 2 === 0)) for (const pts of cubeFaces(c, 0)) shapes.push({ ...rhomb([0, 0], 0), id: newId(), parts: [{ pts, fill: '#ffd166' }] });
    expect(findCandidates(shapes).length).toBeGreaterThanOrEqual(3);
  });
});

describe('copy and file', () => {
  it('places a copy next to the original', () => {
    const s = { ...rhomb([0, 0], 0) };
    const off = copyOffset([s]);
    expect(off[0]).toBeGreaterThan(0);
    expect(toXY(g, off).y).toBeCloseTo(toXY(g, [0, 0]).y);
  });

  it('saves and loads a drawing', () => {
    const d = { ...newDoc('a4q', 'points', 'Test'), shapes: [rhomb([1, 1], 2)] };
    const back = fromFile(toFile(d))!;
    expect(back.shapes).toEqual(d.shapes);
    expect(back.name).toBe('Test');
    expect(fromFile('{"app":"x"}')).toBeNull();
    expect(fromFile('kein json')).toBeNull();
  });
});

describe('zoom', () => {
  it('keeps the point under the fingers in place', async () => {
    const { zoomView, centredView, S_MAX, S_MIN } = await import('../src/model/doc');
    const v = centredView('a4q');
    const z = zoomView(v, 2, 100, 80);
    const before = toXY(v, [3, 2]);
    const after = toXY(z, [3, 2]);
    expect(after.x - 100).toBeCloseTo((before.x - 100) * 2);
    expect(after.y - 80).toBeCloseTo((before.y - 80) * 2);
    expect(zoomView(v, 100, 0, 0).s).toBe(S_MAX);
    expect(zoomView(v, 0.01, 0, 0).s).toBe(S_MIN);
  });

  it('opens drawings saved with the old grid size', () => {
    const old = { ...newDoc('a4q', 'points', 'Alt'), view: undefined, gridSize: 2 } as unknown as Parameters<typeof toFile>[0];
    expect(fromFile(toFile(old))!.view.s).toBe(27);
  });
});

describe('splitting', () => {
  it('turns a cube plate back into three rhombs and merging restores it', async () => {
    const { split } = await import('../src/geo/shapes');
    const cube: Shape = { id: newId(), kind: 'cube', parts: cubeFills(cubeFaces([4, 4], 0), '#6aa9e0'), stroke: '#4a3a2e', width: 2 };
    const before = rhomb([0, 0], 0);
    const after = rhomb([9, 9], 1);
    const r = split([before, cube, after], [cube.id]);
    expect(r.shapes.map((s) => s.kind)).toEqual(['rhomb', 'rhomb', 'rhomb', 'rhomb', 'rhomb']);
    expect(r.ids).toHaveLength(3);
    expect(r.shapes.slice(1, 4).map((s) => s.parts[0].fill)).toEqual(cube.parts.map((p) => p.fill));
    expect(r.shapes[1].width).toBe(2);
    const c = findCandidates(r.shapes);
    expect(c).toHaveLength(1);
    const back = merge(r.shapes, c[0]).shapes;
    expect(back[1].kind).toBe('cube');
    expect(back[1].parts.map((p) => p.fill)).toEqual(cube.parts.map((p) => p.fill));
  });
});
