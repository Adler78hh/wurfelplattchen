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

import { type LP, type RhombType, norm2, rhombType, same, sub } from './lattice';
import type { Shape } from './shapes';

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

function placeCubes(shapes: Shape[]): { cubes: Cube3[]; plates: Plate[] } {
  const plates = shapes.map((s, i) => plateOf(s, i)).filter((p): p is Plate => !!p);
  const n = plates.length;
  const edges: { a: number; b: number; w: number; strength: number }[] = [];
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++) {
      const v = sub(plates[b].c, plates[a].c);
      const d = offsetFor(v, plates[b].order > plates[a].order);
      if (d) edges.push({ a, b, w: d[2], strength: norm2(v) });
    }
  // Overlapping plates (face to face) first, then plates that only share an edge.
  edges.sort((p, q) => p.strength - q.strength || p.a - q.a || p.b - q.b);
  const dsu = new Depths(n);
  const bad = new Set<number>();
  for (const e of edges) {
    if (!dsu.join(e.a, e.b, e.w)) {
      bad.add(e.a);
      bad.add(e.b);
    }
  }
  // Depth per plate, then every building stands on the ground (lowest cube at Z = 0).
  const t = plates.map((_, i) => dsu.find(i));
  const low = new Map<number, number>();
  t.forEach(([r, off]) => low.set(r, Math.min(low.get(r) ?? Infinity, off)));
  const cubes = plates.map((p, i): Cube3 => {
    const [r, off] = t[i];
    return {
      id: p.shape.id,
      min: onLine(p.c[0], p.c[1], off - low.get(r)!),
      colors: p.colors,
      stroke: p.shape.stroke,
      impossible: bad.has(i),
    };
  });
  return { cubes, plates };
}

// ------------------------------------------------------------ walls

const centroid = (pts: LP[]): [number, number] => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];

/** Parameter t of the point on the line of sight through (i, j) nearest to the space point r. */
const nearestT = (i: number, j: number, r: V3) => (dot(r, VIEW) - dot(onLine(i, j, 0), VIEW)) / 3;

const BACK: Record<RhombType, V3> = { 0: [0, 0, -1], 1: [-1, 0, 0], 2: [0, -1, 0] };
const VIEW_BACK: V3 = [-1 / Math.sqrt(3), -1 / Math.sqrt(3), -1 / Math.sqrt(3)];

function wallOf(s: Shape, ref: V3): Wall3 {
  const base = { id: s.id, stroke: s.stroke, width: s.width };
  const pts = s.parts[0].pts;
  if (s.kind === 'rhomb') {
    const t = rhombType(pts);
    if (t !== -1) {
      // A lonely cube face: in the plane X, Y or Z = const, at the whole number nearest to the reference.
      const [ci, cj] = centroid(pts);
      const tc = nearestT(ci, cj, ref);
      const axisValue = t === 0 ? Math.round(tc) : t === 1 ? Math.round(ci + cj + tc) : Math.round(cj + tc);
      const tOf = (p: LP) => (t === 0 ? axisValue : t === 1 ? axisValue - p[0] - p[1] : axisValue - p[1]);
      return { ...base, kind: 'face', pts: pts.map((p) => onLine(p[0], p[1], tOf(p))), back: BACK[t], fill: s.parts[0].fill, impossible: true };
    }
  }
  // Everything else: a thin plate facing the viewer through the reference point.
  const plate = (q: LP) => onLine(q[0], q[1], nearestT(q[0], q[1], ref));
  if (s.kind === 'line') return { ...base, kind: 'line', pts: pts.map(plate), back: VIEW_BACK, fill: null, impossible: false };
  return { ...base, kind: 'plate', pts: pts.map(plate), back: VIEW_BACK, fill: s.parts[0].fill, impossible: false };
}

// ------------------------------------------------------------ model

export function buildModel(shapes: Shape[]): Model {
  const { cubes, plates } = placeCubes(shapes);
  const centre = (c: Cube3): V3 => [c.min[0] + 0.5, c.min[1] + 0.5, c.min[2] + 0.5];
  const walls: Wall3[] = [];
  for (const s of shapes) {
    if (s.kind === 'cube' && cubes.some((c) => c.id === s.id)) continue;
    const pts = s.kind === 'cube' ? s.parts.flatMap((p) => p.pts) : s.parts[0].pts;
    const [ci, cj] = centroid(pts);
    // Reference: the cube nearest in the drawing, otherwise a point on the ground.
    let ref: V3 = onLine(ci, cj, 0);
    let best = Infinity;
    plates.forEach((p, k) => {
      const d = (p.c[0] - ci) ** 2 + (p.c[0] - ci) * (p.c[1] - cj) + (p.c[1] - cj) ** 2;
      if (d < best) {
        best = d;
        ref = centre(cubes[k]);
      }
    });
    if (s.kind === 'cube') {
      // A broken plate (should not happen): show its rhombs as walls.
      s.parts.forEach((part, k) => walls.push(wallOf({ ...s, id: s.id + '-' + k, kind: 'rhomb', parts: [part] }, ref)));
    } else {
      walls.push(wallOf(s, ref));
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
