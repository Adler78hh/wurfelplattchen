// From the drawing to a 3D model.
//
// Space coordinates (X, Y, Z): Z points up. The drawing is the isometric view from the direction
// (1, 1, 1):  X → down-right (e1), Y → down-left (e2 − e1), Z → up (−e2), so a space point projects
// to the lattice point (i, j) = (X − Y, Y − Z). Everything on one line of sight
// (X, Y, Z) + k·(1, 1, 1) lands on the same lattice point – that is the freedom (the depth) we choose.
//
// Cube plates become unit cubes. A plate around lattice point c is a cube whose space diagonal lies
// on the line of sight through c; its lowest corner is  M(t) = (i + j + t, j + t, t).
// Plates that overlap or touch in the drawing should touch in space, and the plate drawn in front
// should be in front. These wishes fix the depth differences; contradictions (impossible figures)
// are cut and marked. Each connected building is put on the ground.
// Everything else becomes a thin wall: loose rhombs in their natural plane (a cube face standing
// alone), all other shapes as thin plates facing the viewer, placed next to the nearest cube.

import { type LP, type RhombType, key, norm2, rhombType, same, sub } from './lattice';
import { type Shape, findCandidates } from './shapes';

export type V3 = [number, number, number];

export interface Cube3 {
  id: string;
  /** Lowest corner; the cube spans min … min + 1. */
  min: V3;
  /** Colours of the faces across the X, Y and Z axis (front and back alike). */
  colors: { x: string; y: string; z: string };
  stroke: string | null;
  /** Part of a contradiction (impossible figure). */
  impossible: boolean;
}

export interface Wall3 {
  id: string;
  kind: 'face' | 'plate' | 'line';
  /** Polygon (or polyline for lines) in space. */
  pts: V3[];
  /** Unit direction into which the thin wall extends (away from the viewer). */
  back: V3;
  fill: string | null;
  stroke: string | null;
  width: number;
  impossible: boolean;
}

export interface Model {
  cubes: Cube3[];
  walls: Wall3[];
}

const VIEW: V3 = [1, 1, 1];

/** Space point on the line of sight through lattice point (i, j) (also fractional) with parameter t (= Z). */
export const onLine = (i: number, j: number, t: number): V3 => [i + j + t, j + t, t];

/** Projection of a space point to lattice coordinates. */
export const project = (p: V3): [number, number] => [p[0] - p[1], p[1] - p[2]];

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len2 = (a: V3) => dot(a, a);

// ------------------------------------------------------------ cube plates

interface Plate {
  shape: Shape;
  order: number;
  c: LP;
  colors: Cube3['colors'];
}

/** The common corner of the three rhombs and the colour per face direction. */
function plateOf(s: Shape, order: number): Plate | null {
  if (s.kind !== 'cube' || s.parts.length !== 3) return null;
  const c = s.parts[0].pts.find((p) => s.parts.every((pt) => pt.pts.some((q) => same(p, q))));
  if (!c) return null;
  const col: Partial<Record<RhombType, string>> = {};
  for (const part of s.parts) {
    const t = rhombType(part.pts);
    if (t === -1) return null;
    col[t] = part.fill ?? '#ffffff';
  }
  if (col[0] === undefined || col[1] === undefined || col[2] === undefined) return null;
  // Lying rhomb ↔ faces across Z, rhomb with short diagonal e1 ↔ across X, the third ↔ across Y.
  return { shape: s, order, c, colors: { z: col[0], x: col[1], y: col[2] } };
}

/**
 * Space offset between two plates whose centres differ by v in the drawing, or null if they are
 * too far apart to touch. inFront: the second plate is drawn above the first.
 */
export function offsetFor(v: LP, inFront: boolean): V3 | null {
  const n = norm2(v);
  if (n !== 1 && n !== 3) return null;
  const d0: V3 = [v[0] + v[1], v[1], 0];
  let best: V3 | null = null;
  for (let k = -3; k <= 3; k++) {
    const d: V3 = [d0[0] + k, d0[1] + k, d0[2] + k];
    const depth = dot(d, VIEW);
    // Overlapping plates: the one drawn in front must be nearer to the viewer.
    if (n === 1 && (inFront ? depth <= 0 : depth >= 0)) continue;
    if (!best || len2(d) < len2(best)) best = d;
  }
  return best;
}

/** Union-find that keeps the depth difference to the root. */
class Depths {
  parent: number[];
  pot: number[]; // t[x] − t[parent[x]]
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.pot = new Array(n).fill(0);
  }
  /** Root of x and t[x] − t[root]; shortens the paths on the way. */
  find(x: number): [number, number] {
    const p = this.parent[x];
    if (p === x) return [x, 0];
    const [r, off] = this.find(p);
    this.pot[x] += off;
    this.parent[x] = r;
    return [r, this.pot[x]];
  }
  /** Ask for t[b] − t[a] = w. Returns false on a contradiction. */
  join(a: number, b: number, w: number): boolean {
    const [ra, pa] = this.find(a);
    const [rb, pb] = this.find(b);
    if (ra === rb) return pb - pa === w;
    this.parent[rb] = ra;
    this.pot[rb] = pa + w - pb;
    return true;
  }
}

/**
 * A piece whose depth is solved: a cube plate, or a loose rhomb read as one visible face of a unit
 * cube (its "virtual" cube). c is the lattice point of the cube's space diagonal; every drawn
 * vertex p lies at space point onLine(p, t + delta(p)), t being the Z of the cube's lowest corner.
 */
interface Piece {
  shape: Shape;
  order: number;
  c: LP;
  pts: LP[];
  delta: Map<string, number>;
  plate: Plate | null;
  rhomb: RhombType | -1;
}

// Z offset of the cube corner seen at hexagon corner R0 … R5 (up, up-right, down-right, down, down-left, up-left).
const RING_DELTA = [1, 1, 0, 0, 0, 1];
const RING_VEC: LP[] = [
  [0, -1],
  [1, -1],
  [1, 0],
  [0, 1],
  [-1, 1],
  [-1, 0],
];

function deltas(c: LP, pts: LP[], centre: number): Map<string, number> | null {
  const m = new Map<string, number>();
  for (const p of pts) {
    const v = sub(p, c);
    if (v[0] === 0 && v[1] === 0) m.set(key(p), centre);
    else {
      const k = RING_VEC.findIndex((r) => same(r, v));
      if (k < 0) return null;
      m.set(key(p), RING_DELTA[k]);
    }
  }
  return m;
}

function pieceOf(s: Shape, order: number): Piece | null {
  const plate = plateOf(s, order);
  if (plate) {
    const pts = s.parts.flatMap((p) => p.pts);
    // Lid on top (front corner in the middle) or turned by 60° (back corner in the middle).
    const lid = s.parts.find((p) => rhombType(p.pts) === 0)!;
    const front = lid.pts.some((p) => same(sub(p, plate.c), [0, -1]));
    const delta = deltas(plate.c, pts, front ? 1 : 0);
    return delta ? { shape: s, order, c: plate.c, pts, delta, plate, rhomb: -1 } : null;
  }
  if (s.kind !== 'rhomb') return null;
  const pts = s.parts[0].pts;
  const t = rhombType(pts);
  if (t === -1) return null;
  // The obtuse corner that is the front corner of its cube: lid → lower one, right face → left one,
  // left face → right one.
  const [a, b] = norm2(sub(pts[2], pts[0])) === 1 ? [pts[0], pts[2]] : [pts[1], pts[3]];
  const c = t === 0 ? (a[1] > b[1] ? a : b) : t === 1 ? (a[0] < b[0] ? a : b) : a[0] > b[0] ? a : b;
  const delta = deltas(c, pts, 1);
  return delta ? { shape: s, order, c, pts, delta, plate: null, rhomb: t } : null;
}

interface Placed {
  pieces: Piece[];
  t: number[];
  bad: Set<number>;
}

function placePieces(shapes: Shape[]): Placed {
  const pieces = shapes.map((s, i) => pieceOf(s, i)).filter((p): p is Piece => !!p);
  const n = pieces.length;
  const edges: { a: number; b: number; w: number; strength: number }[] = [];
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++) {
      const A = pieces[a];
      const B = pieces[b];
      if (A.plate && B.plate) {
        // Two cubes: touching in the drawing → touching in space, the one drawn on top in front.
        const v = sub(B.c, A.c);
        const d = offsetFor(v, B.order > A.order);
        if (d) edges.push({ a, b, w: d[2], strength: norm2(v) });
        continue;
      }
      // With a loose rhomb: shared corners of the drawing must meet in space.
      const ws: number[] = [];
      for (const [k, da] of A.delta) {
        const db = B.delta.get(k);
        if (db !== undefined) ws.push(da - db);
      }
      if (ws.length >= 2 && ws.every((w) => w === ws[0])) edges.push({ a, b, w: ws[0], strength: 2 });
    }
  // Overlapping cubes first, then pieces sharing an edge with a rhomb, then cubes side by side.
  edges.sort((p, q) => p.strength - q.strength || p.a - q.a || p.b - q.b);
  const dsu = new Depths(n);
  const bad = new Set<number>();
  for (const e of edges) {
    if (!dsu.join(e.a, e.b, e.w)) {
      bad.add(e.a);
      bad.add(e.b);
    }
  }
  // Every connected group stands on the ground: its lowest point at Z = 0.
  const found = pieces.map((_, i) => dsu.find(i));
  const lowest = (i: number) => found[i][1] + Math.min(...pieces[i].delta.values(), pieces[i].plate ? 0 : Infinity);
  const low = new Map<number, number>();
  found.forEach(([r], i) => low.set(r, Math.min(low.get(r) ?? Infinity, lowest(i))));
  return { pieces, t: found.map(([r, off]) => off - low.get(r)!), bad };
}

// ------------------------------------------------------------ walls

const centroid = (pts: LP[]): [number, number] => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];

/** Parameter t of the point on the line of sight through (i, j) nearest to the space point r. */
const nearestT = (i: number, j: number, r: V3) => (dot(r, VIEW) - dot(onLine(i, j, 0), VIEW)) / 3;

const BACK: Record<RhombType, V3> = { 0: [0, 0, -1], 1: [-1, 0, 0], 2: [0, -1, 0] };
const VIEW_BACK: V3 = [-1 / Math.sqrt(3), -1 / Math.sqrt(3), -1 / Math.sqrt(3)];

/** A loose rhomb: one face of its (virtual) cube, as a thin wall. */
function faceWall(p: Piece, t: number, impossible: boolean): Wall3 {
  const s = p.shape;
  return {
    id: s.id,
    kind: 'face',
    pts: p.pts.map((q) => onLine(q[0], q[1], t + p.delta.get(key(q))!)),
    back: BACK[p.rhomb as RhombType],
    fill: s.parts[0].fill,
    stroke: s.stroke,
    width: s.width,
    impossible,
  };
}

/** Any other shape: a thin plate facing the viewer through the reference point. */
function plateWall(s: Shape, ref: V3): Wall3 {
  const base = { id: s.id, stroke: s.stroke, width: s.width, back: VIEW_BACK, impossible: false };
  const pts = s.parts[0].pts.map((q) => onLine(q[0], q[1], nearestT(q[0], q[1], ref)));
  if (s.kind === 'line') return { ...base, kind: 'line', pts, fill: null };
  return { ...base, kind: 'plate', pts, fill: s.parts[0].fill };
}

// ------------------------------------------------------------ model

export function buildModel(shapes: Shape[]): Model {
  const { pieces, t, bad } = placePieces(shapes);
  // Loose rhombs count as impossible walls, unless three of them form a whole cube corner.
  const corner = new Set(findCandidates(shapes).flatMap((c) => c.ids));
  const cubes: Cube3[] = [];
  const walls: Wall3[] = [];
  const byId = new Map(pieces.map((p, i) => [p.shape.id, i]));
  const centre = (i: number): V3 => {
    const m = onLine(pieces[i].c[0], pieces[i].c[1], t[i]);
    return [m[0] + 0.5, m[1] + 0.5, m[2] + 0.5];
  };
  for (const s of shapes) {
    const i = byId.get(s.id);
    if (i !== undefined) {
      const p = pieces[i];
      if (p.plate) cubes.push({ id: s.id, min: onLine(p.c[0], p.c[1], t[i]), colors: p.plate.colors, stroke: s.stroke, impossible: bad.has(i) });
      else walls.push(faceWall(p, t[i], bad.has(i) || !corner.has(s.id)));
      continue;
    }
    // Everything else stands next to the piece nearest in the drawing (or on the ground).
    const pts = s.parts.flatMap((p) => p.pts);
    const [ci, cj] = centroid(pts);
    let ref: V3 = onLine(ci, cj, 0);
    let best = Infinity;
    pieces.forEach((p, k) => {
      const d = (p.c[0] - ci) ** 2 + (p.c[0] - ci) * (p.c[1] - cj) + (p.c[1] - cj) ** 2;
      if (d < best) {
        best = d;
        ref = centre(k);
      }
    });
    if (s.kind === 'cube' || s.kind === 'rhomb') {
      // A broken plate or odd rhomb (should not happen): show it as plates.
      s.parts.forEach((part, k) => walls.push(plateWall({ ...s, id: s.id + '-' + k, kind: 'polygon', parts: [part] }, ref)));
    } else {
      walls.push(plateWall(s, ref));
    }
  }
  return { cubes, walls };
}

/** Bounding box of the model in space. */
export function bounds(m: Model): { min: V3; max: V3 } | null {
  const pts: V3[] = [...m.cubes.flatMap((c) => [c.min, [c.min[0] + 1, c.min[1] + 1, c.min[2] + 1] as V3]), ...m.walls.flatMap((w) => w.pts)];
  if (!pts.length) return null;
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const p of pts)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], p[k]);
      max[k] = Math.max(max[k], p[k]);
    }
  return { min, max };
}
