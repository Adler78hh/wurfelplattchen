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
import { type Shape, findCandidates, showsAsCorner } from './shapes';

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
  /** Drawn as a turned plate (seen from below): tapping it in 3D can turn it into a corner. */
  turned: boolean;
  /** Stroke width (index into WIDTHS). */
  width: number;
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
  /** Plane of a face wall: 0 lying, 1 facing right (X), 2 facing left (Y). */
  plane: RhombType | -1;
  /** Hand-drawn shape whose plane the child may change by tapping it in 3D. */
  flippable: boolean;
  /** One of the three walls of a turned cube plate read as an inner corner (the plate's id). */
  cornerOf?: string;
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

/** Centre offsets of plates that overlap (distance 1) or share an edge (distance √3). */
const NEAR: LP[] = [
  [0, -1],
  [1, -1],
  [1, 0],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [1, 1],
  [2, -1],
  [1, -2],
  [-1, -1],
  [-2, 1],
  [-1, 2],
];

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
  /** Plane of a face (rhomb or drawn shape), −1 for cubes. */
  plane: RhombType | -1;
  drawn: boolean;
  /** A turned cube plate read as an inner corner: three walls instead of a cube. */
  corner: boolean;
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
    return delta ? { shape: s, order, c: plate.c, pts, delta, plate, plane: -1, drawn: false, corner: !front && showsAsCorner(s) } : null;
  }
  if (s.kind === 'cube') return null;
  const pts = s.parts[0].pts;
  const t = s.kind === 'rhomb' ? rhombType(pts) : -1;
  if (t === -1) return drawnPiece(s, order);
  // The obtuse corner that is the front corner of its cube: lid → lower one, right face → left one,
  // left face → right one.
  const [a, b] = norm2(sub(pts[2], pts[0])) === 1 ? [pts[0], pts[2]] : [pts[1], pts[3]];
  const c = t === 0 ? (a[1] > b[1] ? a : b) : t === 1 ? (a[0] < b[0] ? a : b) : a[0] > b[0] ? a : b;
  const delta = deltas(c, pts, 1);
  return delta ? { shape: s, order, c, pts, delta, plate: null, plane: t, drawn: false, corner: false } : null;
}

// Axis of a lattice step: X → (1, 0), Y → (−1, 1), Z → (0, −1) (and their multiples), else −1.
function axisOf(v: LP): 0 | 1 | 2 | -1 {
  if (v[1] === 0 && v[0] !== 0) return 0;
  if (v[0] === -v[1] && v[0] !== 0) return 1;
  if (v[0] === 0 && v[1] !== 0) return 2;
  return -1;
}
// Axes lying in each plane: lying (Z = const) holds X and Y, facing right (X = const) Y and Z,
// facing left (Y = const) X and Z.
const PLANE_AXES: [number, number][] = [
  [0, 1],
  [1, 2],
  [0, 2],
];

/** How well each plane fits a hand-drawn shape: total length of its edges that are cube edges there. */
function planeScores(pts: LP[], closed: boolean): number[] {
  const score = [0, 0, 0];
  const n = closed ? pts.length : pts.length - 1;
  for (let k = 0; k < n; k++) {
    const v = sub(pts[(k + 1) % pts.length], pts[k]);
    const ax = axisOf(v);
    if (ax < 0) continue;
    const len = Math.sqrt(norm2(v));
    PLANE_AXES.forEach((axes, plane) => axes.includes(ax) && (score[plane] += len));
  }
  return score;
}

/** Best guess for the plane of a hand-drawn shape: the one in which most of its edges are cube edges. */
export function guessPlane(pts: LP[], closed: boolean): RhombType {
  const score = planeScores(pts, closed);
  let best: RhombType = 0;
  for (const p of [1, 2] as RhombType[]) if (score[p] > score[best] + 1e-9) best = p;
  return best;
}

/**
 * A hand-drawn shape lies flat in one of the three cube planes. Seen from the front it must look
 * exactly as drawn, so each corner's height follows from the first corner's (delta) and the plane.
 */
function drawnPiece(s: Shape, order: number, guess?: RhombType): Piece | null {
  const pts = s.parts[0].pts;
  if (pts.length < 2) return null;
  const plane = s.plane ?? guess ?? guessPlane(pts, s.kind !== 'line');
  const o = pts[0];
  const delta = new Map<string, number>();
  for (const p of pts) {
    const v = sub(p, o);
    delta.set(key(p), plane === 0 ? 0 : plane === 1 ? -(v[0] + v[1]) : -v[1]);
  }
  return { shape: s, order, c: o, pts, delta, plate: null, plane, drawn: true, corner: false };
}

interface Placed {
  pieces: Piece[];
  t: number[];
  bad: Set<number>;
}

/** Shared corners of two pieces that can meet in space (all with the same depth step). */
function fits(a: Piece, b: Piece): number {
  const ws: number[] = [];
  for (const [k, da] of a.delta) {
    const db = b.delta.get(k);
    if (db !== undefined) ws.push(da - db);
  }
  return ws.length >= 2 && ws.every((w) => w === ws[0]) ? ws.length : 0;
}

/**
 * Pieces for all shapes. A hand-drawn shape without a chosen plane takes the best-fitting plane;
 * when several fit equally well, the one in which it meets most cube and rhomb edges.
 */
/**
 * The planes that fit a hand-drawn shape best, best first: most edges that are cube edges, then
 * most corners meeting cube and rhomb edges. More than one: a tipping figure – both readings work.
 */
/** Which pieces have a corner at each lattice point – so neighbours are found without comparing all pairs. */
function vertexIndex(pieces: Piece[]): Map<string, number[]> {
  const m = new Map<string, number[]>();
  pieces.forEach((p, i) => {
    for (const k of p.delta.keys()) {
      const list = m.get(k);
      if (list) list.push(i);
      else m.set(k, [i]);
    }
  });
  return m;
}

/** Pieces of `fixed` that share a corner with p. */
function touching(p: Piece, fixed: Piece[], index: Map<string, number[]>): Piece[] {
  const seen = new Set<number>();
  for (const k of p.delta.keys()) for (const i of index.get(k) ?? []) seen.add(i);
  return [...seen].map((i) => fixed[i]);
}

function bestPlanes(s: Shape, order: number, fixed: Piece[], index = vertexIndex(fixed)): { pieces: Piece[]; options: RhombType[] } {
  const pts = s.parts[0].pts;
  const score = planeScores(pts, s.kind !== 'line');
  const top = Math.max(...score);
  const tied = ([0, 1, 2] as RhombType[]).filter((k) => score[k] > top - 1e-9);
  const cands = tied.map((plane) => {
    const piece = drawnPiece(s, order, plane)!;
    return { plane, piece, fit: touching(piece, fixed, index).reduce((sum, f) => sum + fits(piece, f), 0) };
  });
  const bestFit = Math.max(...cands.map((c) => c.fit));
  const best = cands.filter((c) => c.fit === bestFit);
  return { pieces: best.map((c) => c.piece), options: best.map((c) => c.plane) };
}

/** Pieces for all shapes; hand-drawn shapes without a chosen plane get the best-fitting plane. */
function piecesOf(shapes: Shape[]): Piece[] {
  const pieces = shapes.map((s, i) => pieceOf(s, i));
  const fixed = pieces.filter((p): p is Piece => !!p && !p.drawn);
  const index = vertexIndex(fixed);
  return pieces
    .map((p, i) => (!p || !p.drawn || shapes[i].plane !== undefined ? p : bestPlanes(shapes[i], i, fixed, index).pieces[0]))
    .filter((p): p is Piece => !!p);
}

export interface PlaneChoice {
  /** Plane used now (chosen by the child, or the app's guess). */
  plane: RhombType;
  /** The child has chosen it. */
  chosen: boolean;
  /** Planes that fit equally well; two or more: a tipping figure. */
  options: RhombType[];
}

/** How a hand-drawn shape lies in 3D and which planes would fit equally well; null for other shapes. */
export function planeChoice(shapes: Shape[], id: string): PlaneChoice | null {
  const i = shapes.findIndex((s) => s.id === id);
  const s = shapes[i];
  if (!s || s.kind === 'cube' || s.kind === 'rhomb' || s.parts[0].pts.length < 2) return null;
  const fixed = shapes.map((x, k) => (x.kind === 'cube' || x.kind === 'rhomb' ? pieceOf(x, k) : null)).filter((p): p is Piece => !!p);
  const { options } = bestPlanes(s, i, fixed);
  return { plane: s.plane ?? options[0], chosen: s.plane !== undefined, options };
}

function placePieces(shapes: Shape[]): Placed {
  const pieces = piecesOf(shapes);
  const n = pieces.length;
  const edges: { a: number; b: number; w: number; strength: number; front?: boolean }[] = [];
  const isCube = (p: Piece) => !!p.plate && !p.corner;

  // Two cubes: touching in the drawing → touching in space, the one drawn on top in front.
  const byCentre = new Map<string, number[]>();
  pieces.forEach((p, i) => {
    if (!isCube(p)) return;
    const k = key(p.c);
    byCentre.set(k, [...(byCentre.get(k) ?? []), i]);
  });
  for (let a = 0; a < n; a++) {
    if (!isCube(pieces[a])) continue;
    for (const v of NEAR) {
      for (const b of byCentre.get(key([pieces[a].c[0] + v[0], pieces[a].c[1] + v[1]])) ?? []) {
        if (b <= a) continue;
        const front = pieces[b].order > pieces[a].order;
        const d = offsetFor(v, front);
        // Overlapping plates whose cubes would share a face are the surest hint; touching only along
        // an edge (|d|² = 2) is less sure – such cubes may also stand further apart.
        if (d) edges.push({ a, b, w: d[2], strength: norm2(v) === 1 ? (len2(d) === 1 ? 1 : 2.5) : 3, front: norm2(v) === 1 ? front : undefined });
      }
    }
  }

  // With a rhomb, a corner or a drawn shape: shared corners of the drawing must meet in space.
  const done = new Set<string>();
  for (const list of vertexIndex(pieces).values())
    for (let x = 0; x < list.length; x++)
      for (let y = x + 1; y < list.length; y++) {
        const a = Math.min(list[x], list[y]);
        const b = Math.max(list[x], list[y]);
        const A = pieces[a];
        const B = pieces[b];
        if (isCube(A) && isCube(B)) continue;
        const pair = a + ',' + b;
        if (done.has(pair)) continue;
        done.add(pair);
        const ws: number[] = [];
        for (const [k, da] of A.delta) {
          const db = B.delta.get(k);
          if (db !== undefined) ws.push(da - db);
        }
        if (ws.length >= 2 && ws.every((w) => w === ws[0])) edges.push({ a, b, w: ws[0], strength: 2 });
        // Touching in one corner only (or an edge that cannot meet in this plane): hold on at a corner,
        // but a clash there is no contradiction.
        else if (ws.length >= 1) edges.push({ a, b, w: ws[0], strength: 4 });
      }
  // Cubes sharing a face first, then pieces sharing an edge, other overlapping cubes, cubes side by
  // side, and single shared corners last.
  edges.sort((p, q) => p.strength - q.strength || p.a - q.a || p.b - q.b);
  // Firm: cubes whose plates overlap so that they can share a face touch face to face, and shared
  // edges with rhombs or drawn shapes meet exactly. A clash there is an impossible figure (like the
  // Penrose triangle) – unless the cubes are merely placed apart with front and back still right.
  // Everything else is only a wish, used where it fits: overlapping cubes that would only touch along
  // an edge, plates side by side, single shared corners.
  const dsu = new Depths(n);
  const bad = new Set<number>();
  const soft = edges.filter((e) => e.strength > 2);
  const held = new Set<(typeof edges)[number]>();
  for (const e of edges) {
    if (e.strength > 2) continue;
    if (dsu.join(e.a, e.b, e.w)) {
      held.add(e);
      continue;
    }
    if (e.front !== undefined) {
      const [, pa] = dsu.find(e.a);
      const [, pb] = dsu.find(e.b);
      const v = sub(pieces[e.b].c, pieces[e.a].c);
      // Depth along the line of sight of a cube at lattice point c: c.i + 2·c.j + 3·t.
      if (v[0] + 2 * v[1] + 3 * (pb - pa) > 0 === e.front) continue;
    }
    bad.add(e.a);
    bad.add(e.b);
  }
  // Soft wishes, where they fit.
  for (const e of soft) dsu.join(e.a, e.b, e.w);
  const found = pieces.map((_, i) => dsu.find(i));
  const t = found.map(([, off]) => off);

  // Is there any arrangement at all in which every cube drawn on top of another is nearer to the
  // viewer and all firm links hold? As differences t[b] − t[a] ≥ L; a set of demands that goes round
  // in a circle and adds up to more than nothing can never hold – an impossible figure. (Only checked,
  // the places above stay as they are. Depth of a cube at lattice point c: c.i + 2·c.j + 3·t.)
  const need: { a: number; b: number; L: number }[] = [];
  for (const e of edges) {
    if (e.front !== undefined) {
      const [x, y] = e.front ? [e.b, e.a] : [e.a, e.b]; // x is drawn on top of y
      const v = sub(pieces[x].c, pieces[y].c);
      need.push({ a: y, b: x, L: Math.ceil((1 - v[0] - 2 * v[1]) / 3) });
    }
    if (held.has(e)) need.push({ a: e.a, b: e.b, L: e.w }, { a: e.b, b: e.a, L: -e.w });
  }
  const probe = new Array(n).fill(0);
  // Where a firm link clashed, that is the place of the trick – mark only there; otherwise the
  // whole circle of demands.
  const firmClash = bad.size > 0;
  for (let round = 0; round <= n; round++) {
    let changed = false;
    for (const d of need)
      if (probe[d.b] < probe[d.a] + d.L) {
        probe[d.b] = probe[d.a] + d.L;
        changed = true;
        if (round === n && !firmClash) {
          bad.add(d.a);
          bad.add(d.b);
        }
      }
    if (!changed) break;
  }

  // Every connected group stands on the ground: its lowest point at Z = 0.
  const lowest = (i: number) => t[i] + Math.min(...pieces[i].delta.values());
  const low = new Map<number, number>();
  found.forEach(([r], i) => low.set(r, Math.min(low.get(r) ?? Infinity, lowest(i))));
  return { pieces, t: t.map((x, i) => x - low.get(found[i][0])!), bad };
}

// ------------------------------------------------------------ walls

const centroid = (pts: LP[]): [number, number] => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];

/** Parameter t of the point on the line of sight through (i, j) nearest to the space point r. */
const nearestT = (i: number, j: number, r: V3) => (dot(r, VIEW) - dot(onLine(i, j, 0), VIEW)) / 3;

const BACK: Record<RhombType, V3> = { 0: [0, 0, -1], 1: [-1, 0, 0], 2: [0, -1, 0] };
const VIEW_BACK: V3 = [-1 / Math.sqrt(3), -1 / Math.sqrt(3), -1 / Math.sqrt(3)];

/** A loose rhomb or hand-drawn shape: a thin wall in its plane. */
function faceWall(p: Piece, t: number, impossible: boolean): Wall3 {
  const s = p.shape;
  const plane = p.plane as RhombType;
  return {
    id: s.id,
    kind: s.kind === 'line' ? 'line' : 'face',
    pts: p.pts.map((q) => onLine(q[0], q[1], t + p.delta.get(key(q))!)),
    back: BACK[plane],
    fill: s.kind === 'line' ? null : s.parts[0].fill,
    stroke: s.stroke,
    width: s.width,
    impossible,
    plane,
    flippable: p.drawn,
  };
}

/** Any other shape: a thin plate facing the viewer through the reference point. */
function plateWall(s: Shape, ref: V3): Wall3 {
  const base = { id: s.id, stroke: s.stroke, width: s.width, back: VIEW_BACK, impossible: false, plane: -1 as const, flippable: false };
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
      if (p.corner) {
        // Inner corner: the three rhombs as walls, exactly where they are drawn.
        s.parts.forEach((part, k) => {
          const plane = rhombType(part.pts) as RhombType;
          walls.push({
            id: s.id + '#' + k,
            kind: 'face',
            pts: part.pts.map((q) => onLine(q[0], q[1], t[i] + p.delta.get(key(q))!)),
            back: BACK[plane],
            fill: part.fill,
            stroke: s.stroke,
            width: s.width,
            impossible: bad.has(i),
            plane,
            flippable: false,
            cornerOf: s.id,
          });
        });
      } else if (p.plate) {
        const lid = s.parts.find((q) => rhombType(q.pts) === 0);
        const turned = !!lid && lid.pts.some((q) => same(sub(q, p.c), [0, 1]));
        cubes.push({ id: s.id, min: onLine(p.c[0], p.c[1], t[i]), colors: p.plate.colors, stroke: s.stroke, impossible: bad.has(i), turned, width: s.width });
      }
      else walls.push(faceWall(p, t[i], bad.has(i) || (!p.drawn && !corner.has(s.id))));
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

// ------------------------------------------------------------ stacking new cubes

const cellKey = (m: V3) => m.join(',');
const FACES: V3[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/**
 * Put a cube plate whose cube should sit in the space cell `min` (lowest corner) into the drawing:
 * behind every overlapping plate whose cube is nearer to the viewer, in front of the others.
 */
export function insertCubeAt(shapes: Shape[], plate: Shape, min: V3): Shape[] {
  const m = buildModel(shapes);
  const c = project(min);
  const order = new Map(shapes.map((s, i) => [s.id, i]));
  let after = -1; // must come after these (they are behind)
  let before = shapes.length; // must come before these (they are in front)
  for (const q of m.cubes) {
    const qc = project(q.min);
    if (norm2([c[0] - qc[0], c[1] - qc[1]]) !== 1) continue; // only overlapping plates matter
    const i = order.get(q.id)!;
    if (dot(min, VIEW) > dot(q.min, VIEW)) after = Math.max(after, i);
    else before = Math.min(before, i);
  }
  const at = after < before ? (before < shapes.length ? before : shapes.length) : shapes.length;
  return [...shapes.slice(0, at), plate, ...shapes.slice(at)];
}

/**
 * A new cube plate at lattice point c: choose the most natural space cell for it – resting against
 * other cubes and standing on something – and put it into the drawing at the right depth.
 */
export function stackCube(shapes: Shape[], plate: Shape, c: LP): Shape[] {
  const m = buildModel(shapes);
  if (!m.cubes.length) return [...shapes, plate];
  const occupied = new Set(m.cubes.map((q) => cellKey(q.min)));
  const floor = Math.min(...m.cubes.map((q) => q.min[2]));
  const cands = new Map<string, V3>();
  for (const q of m.cubes) {
    const qc = project(q.min);
    const v: LP = [c[0] - qc[0], c[1] - qc[1]];
    const n = norm2(v);
    if (n !== 1 && n !== 3) continue;
    const d0: V3 = [v[0] + v[1], v[1], 0];
    for (let k = -3; k <= 3; k++) {
      const d: V3 = [d0[0] + k, d0[1] + k, d0[2] + k];
      if (len2(d) > 2) continue;
      const cell: V3 = [q.min[0] + d[0], q.min[1] + d[1], q.min[2] + d[2]];
      cands.set(cellKey(cell), cell);
    }
  }
  let best: V3 | null = null;
  let bestScore = -Infinity;
  for (const cell of cands.values()) {
    if (cell[2] < floor || occupied.has(cellKey(cell))) continue;
    const faces = FACES.filter((f) => occupied.has(cellKey([cell[0] + f[0], cell[1] + f[1], cell[2] + f[2]]))).length;
    const stands = cell[2] === floor || occupied.has(cellKey([cell[0], cell[1], cell[2] - 1]));
    // Touching faces count most, then standing on something; ties: nearer to the viewer.
    const score = faces * 2 + (stands ? 1 : 0) + dot(cell, VIEW) * 1e-3;
    if (score > bestScore) {
      bestScore = score;
      best = cell;
    }
  }
  return best ? insertCubeAt(shapes, plate, best) : [...shapes, plate];
}
