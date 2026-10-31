// The sheet always fills the available space. One finger or the pen draws; two fingers
// zoom and move the drawing *inside* the sheet (reported to the parent in millimetres).

import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { Pt } from '../geo/lattice';

interface Props {
  w: number;
  h: number;
  /** px per mm, for hit tolerances. */
  onScale?: (scale: number) => void;
  onDown(p: Pt): void;
  onMove(p: Pt): void;
  onUp(p: Pt): void;
  onCancel(): void;
  onHover?(p: Pt | null): void;
  /** Zoom the drawing by factor f around sheet point c. */
  onZoom(f: number, c: Pt): void;
  /** Move the drawing by (dx, dy) mm. */
  onPan(dx: number, dy: number): void;
  children: ReactNode;
}

interface Fit {
  scale: number;
  tx: number;
  ty: number;
}

export function Stage({ w, h, onScale, onDown, onMove, onUp, onCancel, onHover, onZoom, onPan, children }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<Fit>({ scale: 1, tx: 0, ty: 0 });
  const fitRef = useRef(fit);
  fitRef.current = fit;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drawing = useRef<number | null>(null);
  const pinch = useRef<{ d: number; mx: number; my: number } | null>(null);
  const cb = useRef({ onZoom, onPan });
  cb.current = { onZoom, onPan };

  // Fit the sheet into the box, now and whenever the box changes size.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      const pad = 16;
      const scale = Math.max(0.1, Math.min((r.width - 2 * pad) / w, (r.height - 2 * pad) / h));
      setFit({ scale, tx: (r.width - w * scale) / 2, ty: (r.height - h * scale) / 2 });
    };
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w, h]);

  useEffect(() => onScale?.(fit.scale), [fit.scale, onScale]);

  const toSheet = (cx: number, cy: number): Pt => {
    const r = box.current!.getBoundingClientRect();
    const f = fitRef.current;
    return { x: (cx - r.left - f.tx) / f.scale, y: (cy - r.top - f.ty) / f.scale };
  };

  // Mouse wheel / trackpad: pinch (ctrlKey) and wheels zoom, two-finger scrolling moves.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = fitRef.current.scale;
      if (e.ctrlKey || e.metaKey || e.deltaMode !== 0 || e.deltaX === 0) {
        cb.current.onZoom(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), toSheet(e.clientX, e.clientY));
      } else {
        cb.current.onPan(-e.deltaX / s, -e.deltaY / s);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const startPinch = () => {
    const [a, b] = [...pointers.current.values()];
    pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };

  const down = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Capture on the container: the element under the finger may be redrawn while drawing.
    box.current?.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      drawing.current = e.pointerId;
      onDown(toSheet(e.clientX, e.clientY));
    } else if (pointers.current.size === 2) {
      if (drawing.current !== null) {
        drawing.current = null;
        onCancel();
      }
      startPinch();
    }
  };

  const move = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) {
      if (e.pointerType !== 'touch') onHover?.(toSheet(e.clientX, e.clientY));
      return;
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const p = pinch.current;
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const s = fitRef.current.scale;
      // Move first, then zoom around the new finger centre.
      if (mx !== p.mx || my !== p.my) cb.current.onPan((mx - p.mx) / s, (my - p.my) / s);
      if (d !== p.d) cb.current.onZoom(d / p.d, toSheet(mx, my));
      pinch.current = { d, mx, my };
    } else if (drawing.current === e.pointerId) {
      onMove(toSheet(e.clientX, e.clientY));
    }
  };

  const up = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    if (drawing.current === e.pointerId) {
      drawing.current = null;
      if (e.type === 'pointercancel') onCancel();
      else onUp(toSheet(e.clientX, e.clientY));
    }
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 2) startPinch();
  };

  return (
    <div
      className="stage"
      ref={box}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onPointerLeave={(e) => e.pointerType !== 'touch' && !pointers.current.size && onHover?.(null)}
    >
      <svg className="stage-svg">
        <g transform={`translate(${fit.tx} ${fit.ty}) scale(${fit.scale})`}>
          <rect className="sheet-shadow" x={0.8} y={1.4} width={w} height={h} rx={1.5} />
          <rect className="sheet" width={w} height={h} rx={1.5} />
          {children}
        </g>
      </svg>
    </div>
  );
}
