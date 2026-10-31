// A drawing, its sheet and grid, the gallery in the browser and the file format.

import { isHex } from '../geo/color';
import { type Grid, SQ3 } from '../geo/lattice';
import type { Kind, Shape } from '../geo/shapes';

export type FormatId = 'a4q' | 'a4h' | 'square';
export type GridStyle = 'points' | 'lines';

export const FORMATS: Record<FormatId, { label: string; w: number; h: number }> = {
  a4q: { label: 'A4 quer', w: 297, h: 210 },
  a4h: { label: 'A4 hoch', w: 210, h: 297 },
  square: { label: 'Quadrat', w: 210, h: 210 },
};

/** Edge length of a triangle in mm: start value and zoom limits. */
export const S_DEFAULT = 19;
export const S_MIN = 6;
export const S_MAX = 70;

export interface Doc {
  id: string;
  name: string;
  format: FormatId;
  /** Where the lattice lies on the sheet: triangle size and origin, in mm. Zooming changes it. */
  view: Grid;
  gridStyle: GridStyle;
  gridVisible: boolean;
  shapes: Shape[];
  updated: number;
}

/** Lattice of size s centred on the sheet. */
export function centredView(format: FormatId, s = S_DEFAULT): Grid {
  const { w, h } = FORMATS[format];
  const di = (s * SQ3) / 2;
  return { s, ox: (w % di) / 2, oy: (h % s) / 2 };
}

export function newDoc(format: FormatId, gridStyle: GridStyle, name: string): Doc {
  return {
    id: 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name,
    format,
    view: centredView(format),
    gridStyle,
    gridVisible: true,
    shapes: [],
    updated: Date.now(),
  };
}

export const sheetOf = (d: Pick<Doc, 'format'>) => FORMATS[d.format];

export const gridOf = (d: Pick<Doc, 'view'>): Grid => d.view;

/** Zoom the drawing by factor f around sheet point (cx, cy), within the limits. */
export function zoomView(v: Grid, f: number, cx: number, cy: number): Grid {
  const s = Math.max(S_MIN, Math.min(S_MAX, v.s * f));
  const k = s / v.s;
  return { s, ox: cx - (cx - v.ox) * k, oy: cy - (cy - v.oy) * k };
}

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const OLD_SIZES = [13, 19, 27];

/** Accept drawings saved before zooming existed (they had a grid size index). */
function viewOf(d: { format: FormatId; view?: unknown; gridSize?: unknown }): Grid {
  const v = d.view as Grid | undefined;
  if (v && isNum(v.s) && isNum(v.ox) && isNum(v.oy) && v.s >= S_MIN && v.s <= S_MAX) return { s: v.s, ox: v.ox, oy: v.oy };
  const i = typeof d.gridSize === 'number' ? d.gridSize : 1;
  return centredView(d.format, OLD_SIZES[i] ?? S_DEFAULT);
}

// ------------------------------------------------------------ gallery storage

/** A stored drawing, made fit for this version (older ones had a grid size instead of a view). */
export function normalizeDoc(d: Doc): Doc | null {
  if (!d || !(d.format in FORMATS) || !Array.isArray(d.shapes)) return null;
  return { ...d, view: viewOf(d) };
}

// The gallery itself lives in src/model/store.ts (IndexedDB, with localStorage as fallback).

// ------------------------------------------------------------ file format

const FILE_TAG = 'wuerfelplaettchen';

export function toFile(d: Doc): string {
  return JSON.stringify({ app: FILE_TAG, version: 1, doc: d });
}

const KINDS: Kind[] = ['cube', 'rhomb', 'triangle', 'hexagon', 'polygon', 'line'];
const isInt = (n: unknown) => typeof n === 'number' && Number.isInteger(n);

function validShape(s: unknown): s is Shape {
  const x = s as Shape;
  return (
    !!x &&
    typeof x.id === 'string' &&
    KINDS.includes(x.kind) &&
    Array.isArray(x.parts) &&
    x.parts.length > 0 &&
    x.parts.every(
      (p) =>
        Array.isArray(p.pts) &&
        p.pts.length >= 2 &&
        p.pts.every((q) => Array.isArray(q) && isInt(q[0]) && isInt(q[1])) &&
        (p.fill === null || isHex(p.fill)),
    ) &&
    (x.stroke === null || isHex(x.stroke)) &&
    isInt(x.width) &&
    (x.plane === undefined || x.plane === 0 || x.plane === 1 || x.plane === 2) &&
    (x.reading === undefined || x.reading === 'cube' || x.reading === 'corner')
  );
}

/** Read a saved file; returns null if it is not a Würfelplättchen drawing. */
export function fromFile(text: string): Doc | null {
  try {
    const data = JSON.parse(text);
    const d = data?.doc as Doc;
    if (data?.app !== FILE_TAG || !d || !(d.format in FORMATS)) return null;
    if (!Array.isArray(d.shapes) || !d.shapes.every(validShape)) return null;
    return {
      ...newDoc(d.format, d.gridStyle === 'lines' ? 'lines' : 'points', String(d.name || 'Bild')),
      view: viewOf(d),
      gridVisible: d.gridVisible !== false,
      shapes: d.shapes,
    };
  } catch {
    return null;
  }
}
