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
}

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

export const rotate = (s: Shape, c: LP): Shape => mapShape(s, (p) => rot60(p, c));

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
function slotsAt(pts: LP[], c: LP): number[] | null {
  const a = ringIndex(sub(pts[1], c));
  const b = ringIndex(sub(pts[3], c));
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
    for (const c of [pts[0], pts[2]]) {
      const slots = slotsAt(pts, c);
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

