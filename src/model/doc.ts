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

/** Edge length of a triangle in mm. */
export const GRID_SIZES = [
  { label: 'Fein', s: 13 },
  { label: 'Mittel', s: 19 },
  { label: 'Grob', s: 27 },
];

export interface Doc {
  id: string;
  name: string;
  format: FormatId;
  gridSize: number; // index into GRID_SIZES
  gridStyle: GridStyle;
  gridVisible: boolean;
  shapes: Shape[];
  updated: number;
}

export function newDoc(format: FormatId, gridSize: number, gridStyle: GridStyle, name: string): Doc {
  return {
    id: 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name,
    format,
    gridSize,
    gridStyle,
    gridVisible: true,
    shapes: [],
    updated: Date.now(),
  };
}

export const sheetOf = (d: Pick<Doc, 'format'>) => FORMATS[d.format];

/** The lattice is centred on the sheet. */
export function gridOf(d: Pick<Doc, 'format' | 'gridSize'>): Grid {
  const { w, h } = sheetOf(d);
  const s = GRID_SIZES[d.gridSize]?.s ?? GRID_SIZES[1].s;
  const di = (s * SQ3) / 2;
  return { s, ox: (w % di) / 2, oy: (h % s) / 2 };
}

// ------------------------------------------------------------ gallery storage

const INDEX = 'wp-index';
const DOC = (id: string) => 'wp-doc-' + id;

function read<T>(k: string): T | null {
  try {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function listDocs(): Doc[] {
  const ids = read<string[]>(INDEX) ?? [];
  return ids
    .map((id) => read<Doc>(DOC(id)))
    .filter((d): d is Doc => !!d)
    .sort((a, b) => b.updated - a.updated);
}

export function saveDoc(d: Doc): boolean {
  try {
    localStorage.setItem(DOC(d.id), JSON.stringify(d));
    const ids = read<string[]>(INDEX) ?? [];
    if (!ids.includes(d.id)) localStorage.setItem(INDEX, JSON.stringify([...ids, d.id]));
    return true;
  } catch {
    return false;
  }
}

export function deleteDoc(id: string): void {
  try {
    localStorage.removeItem(DOC(id));
    const ids = read<string[]>(INDEX) ?? [];
    localStorage.setItem(INDEX, JSON.stringify(ids.filter((x) => x !== id)));
  } catch {
    /* nothing to do */
  }
}

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
    isInt(x.width)
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
      ...newDoc(d.format, isInt(d.gridSize) ? Math.min(2, Math.max(0, d.gridSize)) : 1, d.gridStyle === 'lines' ? 'lines' : 'points', String(d.name || 'Bild')),
      gridVisible: d.gridVisible !== false,
      shapes: d.shapes,
    };
  } catch {
    return null;
  }
}
