// The isometric (triangular) lattice.
//
// A lattice point (i, j) sits at  origin + i·e1 + j·e2  with (screen, y down)
//   e1 = (√3/2, 1/2)·s   – down-right
//   e2 = (0, 1)·s        – straight down
// so the three line directions are vertical, 30° falling and 30° rising.
// All shapes store integer lattice points; millimetres only appear when drawing.

export type LP = [number, number];

export interface Pt {
  x: number;
  y: number;
}

export const SQ3 = Math.sqrt(3);

/** Geometry of the lattice on the sheet, in millimetres. */
export interface Grid {
  s: number; // edge length of a triangle
  ox: number;
  oy: number;
}

export const add = (a: LP, b: LP): LP => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: LP, b: LP): LP => [a[0] - b[0], a[1] - b[1]];
export const same = (a: LP, b: LP): boolean => a[0] === b[0] && a[1] === b[1];
export const key = (p: LP): string => `${p[0]},${p[1]}`;

/** Squared length of a lattice vector, in edge lengths. */
export const norm2 = (v: LP): number => v[0] * v[0] + v[0] * v[1] + v[1] * v[1];

export function toXY(g: Grid, p: LP): Pt {
  return { x: g.ox + (p[0] * g.s * SQ3) / 2, y: g.oy + (p[0] / 2 + p[1]) * g.s };
}

/** Fractional lattice coordinates of a sheet point. */
export function toIJ(g: Grid, x: number, y: number): [number, number] {
  const fi = (x - g.ox) / ((g.s * SQ3) / 2);
  const fj = (y - g.oy) / g.s - fi / 2;
  return [fi, fj];
}

/** Lattice vector (as fractional i, j) for a displacement in millimetres. */
export function vecToIJ(g: Grid, dx: number, dy: number): [number, number] {
  const fi = dx / ((g.s * SQ3) / 2);
  return [fi, dy / g.s - fi / 2];
}

/** Nearest lattice point to a fractional position. */
export function roundIJ(fi: number, fj: number): LP {
  let best: LP = [Math.round(fi), Math.round(fj)];
  let bestD = Infinity;
  for (const i of [Math.floor(fi), Math.ceil(fi)]) {
    for (const j of [Math.floor(fj), Math.ceil(fj)]) {
      const d = norm2Frac(fi - i, fj - j);
      if (d < bestD) {
        bestD = d;
        best = [i, j];
      }
    }
  }
  return best;
}

const norm2Frac = (a: number, b: number) => a * a + a * b + b * b;

export function nearestPoint(g: Grid, x: number, y: number): LP {
  const [fi, fj] = toIJ(g, x, y);
  return roundIJ(fi, fj);
}

/** The six neighbours of a point, clockwise from straight up. */
export const RING: LP[] = [
  [0, -1], // up
  [1, -1], // up-right
  [1, 0], // down-right
  [0, 1], // down
  [-1, 1], // down-left
  [-1, 0], // up-left
];

export const ringIndex = (v: LP): number => RING.findIndex((r) => same(r, v));

/** Rotate p by 60° clockwise (on screen) around c. Lattice points stay lattice points. */
export function rot60(p: LP, c: LP): LP {
  const a = p[0] - c[0];
  const b = p[1] - c[1];
  return [c[0] - b, c[1] + a + b];
}

// ---------------------------------------------------------------- shapes

/** Triangle cell: k = 0 points right, k = 1 points left. */
export interface Cell {
  i: number;
  j: number;
  k: 0 | 1;
}

export function cellAt(g: Grid, x: number, y: number): Cell {
  const [fi, fj] = toIJ(g, x, y);
  const i = Math.floor(fi);
  const j = Math.floor(fj);
  return { i, j, k: fi - i + (fj - j) < 1 ? 0 : 1 };
}

export function cellPts(c: Cell): LP[] {
  const { i, j } = c;
  return c.k === 0
    ? [
        [i, j],
        [i + 1, j],
        [i, j + 1],
      ]
    : [
        [i + 1, j],
        [i + 1, j + 1],
        [i, j + 1],
      ];
}

/**
 * Rhomb types, named after the short diagonal d (the edge shared by its two triangles):
 *   0: d = e2       – lying rhomb (the "lid"),           lightest shade
 *   1: d = e1       – standing, right face of a cube,    darkest shade
 *   2: d = e1 − e2  – standing, left face of a cube,     middle shade
 */
export type RhombType = 0 | 1 | 2;

const RHOMB: { d: LP; w1: LP; w2: LP }[] = [
  { d: [0, 1], w1: [1, 0], w2: [-1, 1] },
  { d: [1, 0], w1: [1, -1], w2: [0, 1] },
  { d: [1, -1], w1: [1, 0], w2: [0, -1] },
];

/** Rhomb with short diagonal from p to p + d. Vertex order: p, p+w1, p+d, p+w2. */
export function rhombPts(p: LP, t: RhombType): LP[] {
  const r = RHOMB[t];
  return [p, add(p, r.w1), add(p, r.d), add(p, r.w2)];
}

/** Rhomb of type t whose centre is nearest to (x, y). */
export function rhombAt(g: Grid, x: number, y: number, t: RhombType): LP[] {
  const d = RHOMB[t].d;
  const [fi, fj] = toIJ(g, x, y);
  return rhombPts(roundIJ(fi - d[0] / 2, fj - d[1] / 2), t);
}

/** Type of a 4-point rhomb from its short diagonal, or −1 if it is no unit rhomb. */
export function rhombType(pts: LP[]): RhombType | -1 {
  if (pts.length !== 4) return -1;
  for (const [a, b] of [
    [0, 2],
    [1, 3],
  ]) {
    const v = sub(pts[b], pts[a]);
    if (norm2(v) !== 1) continue;
    if (v[0] === 0) return 0;
    if (v[1] === 0) return 1;
    return 2;
  }
  return -1;
}

export function hexPts(c: LP): LP[] {
  return RING.map((r) => add(c, r));
}

/**
 * Cube plate around centre c, as three rhombs.
 * Variant 0: the lid lies on top (inner "Y" goes down, up-left, up-right).
 * Variant 1: turned by 60°, the lying rhomb is at the bottom.
 */
export function cubeFaces(c: LP, variant: 0 | 1): LP[][] {
  const R = hexPts(c);
  const starts = variant === 0 ? [5, 1, 3] : [0, 2, 4];
  return starts.map((s) => [c, R[s % 6], R[(s + 1) % 6], R[(s + 2) % 6]]);
}

/** All lattice points whose position lies on the sheet. */
export function pointsOnSheet(g: Grid, w: number, h: number): LP[] {
  const out: LP[] = [];
  const di = (g.s * SQ3) / 2;
  const iMax = Math.floor((w - g.ox) / di + 1e-9);
  for (let i = Math.ceil(-g.ox / di - 1e-9); i <= iMax; i++) {
    const j0 = Math.ceil((-g.oy) / g.s - i / 2 - 1e-9);
    const j1 = Math.floor((h - g.oy) / g.s - i / 2 + 1e-9);
    for (let j = j0; j <= j1; j++) out.push([i, j]);
  }
  return out;
}
