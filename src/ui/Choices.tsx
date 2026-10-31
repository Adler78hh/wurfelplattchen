// How a shape is meant in 3D: lying or standing (hand-drawn shapes), cube or corner (turned cube
// plates). As button rows below the sheet and as a speech bubble right after drawing.

import type { Grid, RhombType } from '../geo/lattice';
import { toXY } from '../geo/lattice';
import { type Shape, showsAsCorner } from '../geo/shapes';
import * as I from './icons';
import type { Fit } from './Stage';

export const PLANE_NAMES: Record<RhombType, string> = { 0: 'Tisch', 1: 'Wand', 2: 'Wand' };
export const PLANE_TITLES: Record<RhombType, string> = {
  0: 'Liegt wie ein Tisch (wie der Würfeldeckel)',
  1: 'Steht als Wand (wie die rechte Würfelseite)',
  2: 'Steht als Wand (wie die linke Würfelseite)',
};

export type Reading = 'cube' | 'corner';

export type Ask = { id: string; kind: 'plane'; options: RhombType[] } | { id: string; kind: 'reading' };

export function PlaneButtons({ planes, on, pick }: { planes: RhombType[]; on?: RhombType | null; pick(p: RhombType): void }) {
  return (
    <>
      {planes.map((pl) => (
        <button key={pl} className={'plane-btn' + (on === pl ? ' on' : '')} onClick={() => pick(pl)} title={PLANE_TITLES[pl]} aria-label={PLANE_TITLES[pl]}>
          <I.RhombIcon type={pl} />
          <span>{PLANE_NAMES[pl]}</span>
        </button>
      ))}
    </>
  );
}

/** "Würfel" (seen from below) or "Ecke" (inner corner) for a turned cube plate. */
export function ReadingButtons({ shape, pick, highlight = false }: { shape: Shape; pick(r: Reading): void; highlight?: boolean }) {
  const corner = showsAsCorner(shape);
  const colors = [shape.parts[0].fill ?? '#ffd166', shape.parts[1].fill ?? '#b39248', shape.parts[2].fill ?? '#ffe3a1'];
  return (
    <>
      <button className={'plane-btn' + (highlight && !corner ? ' on' : '')} onClick={() => pick('cube')} title="Ein Würfel, von unten gesehen" aria-label="Würfel">
        <I.CubeIcon variant={0} colors={colors} />
        <span>Würfel</span>
      </button>
      <button className={'plane-btn' + (highlight && corner ? ' on' : '')} onClick={() => pick('corner')} title="Eine Ecke wie in einem Zimmer: Boden und zwei Wände" aria-label="Ecke">
        <I.CubeIcon variant={1} colors={colors} />
        <span>Ecke</span>
      </button>
    </>
  );
}

interface BubbleProps {
  ask: Ask;
  shape: Shape;
  grid: Grid;
  fit: Fit;
  /** Width of the area the bubble must stay inside. */
  width: number;
  onPlane(p: RhombType): void;
  onReading(r: Reading): void;
  onClose(): void;
}

/** Speech bubble next to a freshly made tipping figure or turned cube plate. */
export function AskBubble({ ask, shape, grid, fit, width, onPlane, onReading, onClose }: BubbleProps) {
  const pts = shape.parts.flatMap((p) => p.pts).map((q) => toXY(grid, q));
  const cx = pts.reduce((a, q) => a + q.x, 0) / pts.length;
  const top = Math.min(...pts.map((q) => q.y));
  const bottom = Math.max(...pts.map((q) => q.y));
  const x = Math.max(130, Math.min(width - 130, fit.tx + cx * fit.scale));
  const y = Math.max(8, fit.ty + top * fit.scale - 10);
  // Not enough room above the shape: show the bubble below it.
  const below = y < 140;
  return (
    <div className={'ask' + (below ? ' below' : '')} style={{ left: x, top: below ? fit.ty + bottom * fit.scale + 10 : y }}>
      <div className="ask-q">{ask.kind === 'plane' ? 'Liegt sie oder steht sie?' : 'Würfel oder Ecke?'}</div>
      <div className="ask-row">
        {ask.kind === 'plane' ? <PlaneButtons planes={ask.options} pick={onPlane} /> : <ReadingButtons shape={shape} pick={onReading} />}
        <button className="ask-x" onClick={onClose} aria-label="Später">
          <I.CloseIcon />
        </button>
      </div>
    </div>
  );
}
