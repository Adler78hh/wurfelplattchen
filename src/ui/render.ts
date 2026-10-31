// Shared drawing helpers and an SVG string of a whole drawing (for export, print and thumbnails).

import { WIDTHS } from '../geo/color';
import { type Grid, type LP, SQ3, pointsOnSheet, toXY } from '../geo/lattice';
import type { Shape } from '../geo/shapes';
import { type Doc, gridOf, sheetOf } from '../model/doc';

const f = (n: number) => Math.round(n * 100) / 100;

export function pathD(g: Grid, pts: LP[], closed: boolean): string {
  const d = pts.map((p, i) => {
    const q = toXY(g, p);
    return (i ? 'L' : 'M') + f(q.x) + ' ' + f(q.y);
  });
  return d.join('') + (closed ? 'Z' : '');
}

export const strokeWidth = (g: Grid, w: number) => g.s * (WIDTHS[w] ?? WIDTHS[1]);

export const GRID_DOT = '#8fbfc2';
export const GRID_LINE = '#bcdcde';

/** Grid lines of all three directions, as segments that cover the sheet. */
export function gridSegments(g: Grid, w: number, h: number): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  const di = (g.s * SQ3) / 2;
  for (let i = Math.ceil(-g.ox / di); g.ox + i * di <= w + 1e-6; i++) {
    const x = g.ox + i * di;
    out.push([x, 0, x, h]);
  }
  // Slanted lines through the points (0, j): y = oy + j·s ± (x − ox)/√3.
  const span = (w + g.s) / SQ3;
  const jMin = Math.floor((-span - g.oy) / g.s) - 1;
  const jMax = Math.ceil((h + span - g.oy) / g.s) + 1;
  for (let j = jMin; j <= jMax; j++) {
    const y0 = g.oy + j * g.s;
    for (const sgn of [1, -1]) {
      const ya = y0 + (sgn * (0 - g.ox)) / SQ3;
      const yb = y0 + (sgn * (w - g.ox)) / SQ3;
      if (Math.max(ya, yb) < 0 || Math.min(ya, yb) > h) continue;
      out.push([0, ya, w, yb]);
    }
  }
  return out;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export function shapesSvg(g: Grid, shapes: Shape[]): string {
  return shapes
    .map((s) => {
      const sw = f(strokeWidth(g, s.width));
      const stroke = s.stroke ? `stroke="${s.stroke}" stroke-width="${sw}"` : 'stroke="none"';
      if (s.kind === 'line') {
        return `<path d="${pathD(g, s.parts[0].pts, false)}" fill="none" ${s.stroke ? stroke : `stroke="#4a3a2e" stroke-width="${sw}"`} stroke-linecap="round" stroke-linejoin="round"/>`;
      }
      return s.parts
        .map((p) => `<path d="${pathD(g, p.pts, true)}" fill="${p.fill ?? 'none'}" ${stroke} stroke-linejoin="round"/>`)
        .join('');
    })
    .join('');
}

export function gridSvg(d: Doc): string {
  const g = gridOf(d);
  const { w, h } = sheetOf(d);
  if (d.gridStyle === 'lines') {
    const segs = gridSegments(g, w, h)
      .map(([a, b, c, e]) => `M${f(a)} ${f(b)}L${f(c)} ${f(e)}`)
      .join('');
    return `<path d="${segs}" stroke="${GRID_LINE}" stroke-width="${f(g.s * 0.025)}" fill="none"/>`;
  }
  const r = f(g.s * 0.045);
  return pointsOnSheet(g, w, h)
    .map((p) => {
      const q = toXY(g, p);
      return `<circle cx="${f(q.x)}" cy="${f(q.y)}" r="${r}" fill="${GRID_DOT}"/>`;
    })
    .join('');
}

/** Complete drawing as standalone SVG. Size in mm unless px is given. */
export function docSvg(d: Doc, opts: { grid: boolean; px?: number }): string {
  const { w, h } = sheetOf(d);
  const g = gridOf(d);
  const size = opts.px ? `width="${Math.round(w * opts.px)}" height="${Math.round(h * opts.px)}"` : `width="${w}mm" height="${h}mm"`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" ${size} viewBox="0 0 ${w} ${h}">` +
    `<title>${esc(d.name)}</title>` +
    `<defs><clipPath id="clip-${d.id}"><rect width="${w}" height="${h}"/></clipPath></defs>` +
    `<rect width="${w}" height="${h}" fill="#ffffff"/>` +
    `<g clip-path="url(#clip-${d.id})">` +
    (opts.grid && d.gridVisible ? gridSvg(d) : '') +
    shapesSvg(g, d.shapes) +
    `</g></svg>`
  );
}
