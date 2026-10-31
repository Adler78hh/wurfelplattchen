// What is drawn on the sheet: the grid and the shapes (SVG, in millimetres).

import { memo } from 'react';
import { STROKES } from '../geo/color';
import { type Grid, key, pointsOnSheet, toXY } from '../geo/lattice';
import type { Shape } from '../geo/shapes';
import { GRID_DOT, GRID_LINE, gridSegments, pathD, strokeWidth } from './render';

export const GridLayer = memo(function GridLayer({ g, w, h, style }: { g: Grid; w: number; h: number; style: 'points' | 'lines' }) {
  if (style === 'lines') {
    const d = gridSegments(g, w, h)
      .map(([a, b, c, e]) => `M${a} ${b}L${c} ${e}`)
      .join('');
    return <path d={d} stroke={GRID_LINE} strokeWidth={g.s * 0.025} fill="none" />;
  }
  return (
    <>
      {pointsOnSheet(g, w, h).map((p) => {
        const q = toXY(g, p);
        return <circle key={key(p)} cx={q.x} cy={q.y} r={g.s * 0.05} fill={GRID_DOT} />;
      })}
    </>
  );
});

/** One shape. `tag` marks real shapes with data-kind (not the preview while placing). */
export function ShapeView({ s, g, tag = true }: { s: Shape; g: Grid; tag?: boolean }) {
  const sw = strokeWidth(g, s.width);
  if (s.kind === 'line')
    return (
      <path
        data-kind={tag ? 'line' : undefined}
        d={pathD(g, s.parts[0].pts, false)}
        fill="none"
        stroke={s.stroke ?? STROKES[0]}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  return (
    <g data-kind={tag ? s.kind : undefined}>
      {s.parts.map((p, i) => (
        <path key={i} d={pathD(g, p.pts, true)} fill={p.fill ?? 'none'} stroke={s.stroke ?? 'none'} strokeWidth={sw} strokeLinejoin="round" />
      ))}
    </g>
  );
}

/** Outline of a shape for highlighting (selection, merge candidates). */
export function Outline({ s, g, cls, extra = 0 }: { s: Shape; g: Grid; cls: string; extra?: number }) {
  return (
    <>
      {s.parts.map((p, i) => (
        <path key={i} className={cls} d={pathD(g, p.pts, s.kind !== 'line')} strokeWidth={strokeWidth(g, 1) + extra} />
      ))}
    </>
  );
}
