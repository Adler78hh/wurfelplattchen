// Shapes on the sheet and everything you can do with them.

import { shade } from './color';
import {
  type Grid,
  type LP,
  type Pt,
  add,
  key,
  ringIndex,
  rhombType,
  rot60,
  same,
  sub,
  toXY,
} from './lattice';

export type Kind = 'cube' | 'rhomb' | 'triangle' | 'hexagon' | 'polygon' | 'line';

export interface Part {
  pts: LP[];
  fill: string | null;
}

export interface Shape {
  id: string;
  kind: Kind;
  /** One part, except a cube plate: its three rhombs. A line has one open part. */
  parts: Part[];
  stroke: string | null;
  /** Index into WIDTHS. */
  width: number;
  /**
   * Hand-drawn shapes only: their plane in 3D, chosen by the child (0 lying, 1 wall facing right,
   * 2 wall facing left – like the three rhomb kinds). Missing: the app guesses.
   */
  plane?: 0 | 1 | 2;
  /**
   * Turned cube plates only (lying rhomb at the bottom): a cube seen from below, or an inner corner
   * like the corner of a room. Missing: corner.
   */
  reading?: 'cube' | 'corner';
}

/** A cube plate turned by 60°: its lying rhomb is at the bottom (the common corner is the back one). */
export function isTurned(s: Shape): boolean {
  if (s.kind !== 'cube' || s.parts.length !== 3) return false;
  const c = s.parts[0].pts.find((p) => s.parts.every((pt) => pt.pts.some((q) => q[0] === p[0] && q[1] === p[1])));
  if (!c) return false;
  return s.parts.some((pt) => {
    const lying = pt.pts.length === 4 && [0, 1, 2, 3].some((k) => pt.pts[k][0] === pt.pts[(k + 2) % 4][0] && Math.abs(pt.pts[k][1] - pt.pts[(k + 2) % 4][1]) === 1);
    return lying && pt.pts.some((q) => q[0] === c[0] && q[1] === c[1] + 1);
  });
}

/** How a cube plate appears in 3D. */
export const showsAsCorner = (s: Shape): boolean => isTurned(s) && s.reading !== 'cube';

let counter = 0;
export const newId = (): string => Date.now().toString(36) + '-' + (counter++).toString(36);

/** Fill colours of a cube plate made from one base colour. */
export function cubeFills(faces: LP[][], base: string): Part[] {
  return faces.map((pts) => {
    const t = rhombType(pts);
    return { pts, fill: t === -1 ? base : shade(base, t) };
  });
}

// ------------------------------------------------------------ transforms

export const mapShape = (s: Shape, f: (p: LP) => LP): Shape => ({
  ...s,
  parts: s.parts.map((pt) => ({ ...pt, pts: pt.pts.map(f) })),
});

export const translate = (s: Shape, d: LP): Shape => mapShape(s, (p) => add(p, d));

export const rotate = (s: Shape, c: LP): Shape => {
  // A turned shape lies differently in space: let the app guess its plane again.
  const { plane: _plane, ...rest } = mapShape(s, (p) => rot60(p, c));
  return rest;
};

export function allPts(shapes: Shape[]): LP[] {
  return shapes.flatMap((s) => s.parts.flatMap((p) => p.pts));
}

/** Lattice point nearest to the middle of the shapes, as the pivot for turning them. */
export function pivotOf(g: Grid, shapes: Shape[], round: (x: number, y: number) => LP): LP {
  const pts = allPts(shapes).map((p) => toXY(g, p));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return round((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2);
}

// ------------------------------------------------------------ hit testing

function inPoly(pt: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

/** Index of the part under the point, or −1. */
export function hitPart(g: Grid, s: Shape, p: Pt, tol: number): number {
  if (s.kind === 'line') {
    const pts = s.parts[0].pts.map((q) => toXY(g, q));
    for (let i = 1; i < pts.length; i++) if (segDist(p, pts[i - 1], pts[i]) <= tol) return 0;
    return -1;
  }
  return s.parts.findIndex((pt) => inPoly(p, pt.pts.map((q) => toXY(g, q))));
}

/** Topmost shape under the point. */
export function hitShape(g: Grid, shapes: Shape[], p: Pt, tol: number): { shape: Shape; part: number } | null {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const part = hitPart(g, shapes[i], p, tol);
    if (part >= 0) return { shape: shapes[i], part };
  }
  return null;
}

// ------------------------------------------------------------ merging rhombs

export interface Candidate {
  center: LP;
  ids: string[];
}

/** 60° slots (0–5) a rhomb covers around one of its obtuse corners. */
function slotsAt(pts: LP[], k: number): number[] | null {
  const c = pts[k];
  const a = ringIndex(sub(pts[(k + 1) % 4], c));
  const b = ringIndex(sub(pts[(k + 3) % 4], c));
  if (a < 0 || b < 0) return null;
  if ((b - a + 6) % 6 === 2) return [a, (a + 1) % 6];
  if ((a - b + 6) % 6 === 2) return [b, (b + 1) % 6];
  return null;
}

/** Groups of three loose rhombs that together form a cube hexagon. */
export function findCandidates(shapes: Shape[]): Candidate[] {
  const byCenter = new Map<string, { center: LP; items: { id: string; slots: number[] }[] }>();
  for (const s of shapes) {
    if (s.kind !== 'rhomb') continue;
    const pts = s.parts[0].pts;
    if (rhombType(pts) < 0) continue;
    // Its two obtuse corners (120°), wherever they are in the list of corners.
    for (let n = 0; n < 4; n++) {
      const c = pts[n];
      const slots = slotsAt(pts, n);
      if (!slots) continue;
      const k = key(c);
      if (!byCenter.has(k)) byCenter.set(k, { center: c, items: [] });
      byCenter.get(k)!.items.push({ id: s.id, slots });
    }
  }
  const out: Candidate[] = [];
  for (const { center, items } of byCenter.values()) {
    if (items.length < 3) continue;
    const found = new Set<string>();
    for (let a = 0; a < items.length; a++)
      for (let b = a + 1; b < items.length; b++)
        for (let c = b + 1; c < items.length; c++) {
          const slots = new Set([...items[a].slots, ...items[b].slots, ...items[c].slots]);
          if (slots.size !== 6) continue;
          const ids = [items[a].id, items[b].id, items[c].id];
          const k = [...ids].sort().join('|');
          if (found.has(k)) continue;
          found.add(k);
          out.push({ center, ids });
        }
  }
  return out;
}

/** Replace the three rhombs by one cube plate (it takes the place of the topmost rhomb). */
export function merge(shapes: Shape[], cand: Candidate): { shapes: Shape[]; id: string } {
  const idx = cand.ids.map((id) => shapes.findIndex((s) => s.id === id));
  if (idx.some((i) => i < 0)) return { shapes, id: '' };
  const top = Math.max(...idx);
  const rhombs = idx.map((i) => shapes[i]);
  const cube: Shape = {
    id: newId(),
    kind: 'cube',
    parts: rhombs.map((r) => ({ pts: r.parts[0].pts, fill: r.parts[0].fill })),
    stroke: shapes[top].stroke,
    width: shapes[top].width,
  };
  const out: Shape[] = [];
  shapes.forEach((s, i) => {
    if (i === top) out.push(cube);
    else if (!idx.includes(i)) out.push(s);
  });
  return { shapes: out, id: cube.id };
}

/** Replace cube plates by their three rhombs, in the same place of the stacking order. */
export function split(shapes: Shape[], ids: string[]): { shapes: Shape[]; ids: string[] } {
  const out: Shape[] = [];
  const made: string[] = [];
  for (const s of shapes) {
    if (s.kind !== 'cube' || !ids.includes(s.id)) {
      out.push(s);
      continue;
    }
    for (const part of s.parts) {
      const r: Shape = { id: newId(), kind: 'rhomb', parts: [{ pts: part.pts, fill: part.fill }], stroke: s.stroke, width: s.width };
      out.push(r);
      made.push(r.id);
    }
  }
  return { shapes: out, ids: made };
}

// ------------------------------------------------------------ editing

/** Give the shapes a new fill. Cube plates get the three shades of it. */
export function recolor(s: Shape, fill: string): Shape {
  if (s.kind === 'line') return s;
  if (s.kind === 'cube') return { ...s, parts: cubeFills(s.parts.map((p) => p.pts), fill) };
  return { ...s, parts: s.parts.map((p) => ({ ...p, fill })) };
}

export function sameCell(a: LP[], b: LP[]): boolean {
  return a.length === b.length && a.every((p) => b.some((q) => same(p, q)));
}

/** Move the selected shapes to the front (dir 1) or the back (dir −1). */
export function reorder(shapes: Shape[], ids: string[], dir: 1 | -1): Shape[] {
  const sel = shapes.filter((s) => ids.includes(s.id));
  const rest = shapes.filter((s) => !ids.includes(s.id));
  return dir === 1 ? [...rest, ...sel] : [...sel, ...rest];
}

/** Lattice vector that moves a copy to the right of the original, clear of it. */
export function copyOffset(shapes: Shape[]): LP {
  const is = allPts(shapes).map((p) => p[0]);
  const w = Math.max(...is) - Math.min(...is);
  const n = Math.max(1, Math.ceil((w + 1) / 2));
  return [2 * n, -n]; // n hexagon widths to the right
}


// ------------------------------------------------------------ two triangles → rhomb

export interface TrianglePair {
  ids: [string, string];
  /** The rhomb they form; its short diagonal is the shared edge. */
  pts: LP[];
}

/** Pairs of triangles that share an edge and so form a rhomb. */
export function findTrianglePairs(shapes: Shape[]): TrianglePair[] {
  const byEdge = new Map<string, { id: string; a: LP; b: LP; other: LP }[]>();
  for (const s of shapes) {
    if (s.kind !== 'triangle' || s.parts[0].pts.length !== 3) continue;
    const t = s.parts[0].pts;
    for (let k = 0; k < 3; k++) {
      const a = t[k];
      const b = t[(k + 1) % 3];
      const ek = [key(a), key(b)].sort().join('|');
      const list = byEdge.get(ek) ?? [];
      list.push({ id: s.id, a, b, other: t[(k + 2) % 3] });
      byEdge.set(ek, list);
    }
  }
  const out: TrianglePair[] = [];
  for (const list of byEdge.values()) {
    if (list.length !== 2 || list[0].id === list[1].id) continue;
    const [x, y] = list;
    out.push({ ids: [x.id, y.id], pts: [x.a, x.other, x.b, y.other] });
  }
  return out;
}

/** Replace the two triangles by one rhomb (it takes the place of the upper triangle). */
export function mergeTriangles(shapes: Shape[], pair: TrianglePair): { shapes: Shape[]; id: string } {
  const idx = pair.ids.map((id) => shapes.findIndex((s) => s.id === id));
  if (idx.some((i) => i < 0)) return { shapes, id: '' };
  const top = Math.max(...idx);
  const t = shapes[top];
  const rhomb: Shape = { id: newId(), kind: 'rhomb', parts: [{ pts: pair.pts, fill: t.parts[0].fill }], stroke: t.stroke, width: t.width };
  const out: Shape[] = [];
  shapes.forEach((s, i) => {
    if (i === top) out.push(rhomb);
    else if (!idx.includes(i)) out.push(s);
  });
  return { shapes: out, id: rhomb.id };
}
