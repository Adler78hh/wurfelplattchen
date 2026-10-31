// The zoomable sheet. One finger or the pen draws, two fingers zoom and move the sheet.

import { type ReactNode, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Pt } from '../geo/lattice';

export interface View {
  scale: number; // screen px per mm
  tx: number;
  ty: number;
}

export interface StageHandle {
  fit(): void;
  zoomBy(f: number): void;
}

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
  children: ReactNode;
  ref?: React.Ref<StageHandle>;
}

const MIN = 0.3;
const MAX = 40;

export function Stage({ w, h, onScale, onDown, onMove, onUp, onCancel, onHover, children, ref }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drawing = useRef<number | null>(null);
  const pinch = useRef<{ d: number; mx: number; my: number; view: View } | null>(null);

  const fit = useCallback(() => {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 20;
    const scale = Math.max(MIN, Math.min((r.width - 2 * pad) / w, (r.height - 2 * pad) / h));
    setView({ scale, tx: (r.width - w * scale) / 2, ty: (r.height - h * scale) / 2 });
  }, [w, h]);

  const zoomAt = useCallback((f: number, cx: number, cy: number) => {
    setView((v) => {
      const scale = Math.max(MIN, Math.min(MAX, v.scale * f));
      const k = scale / v.scale;
      return { scale, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k };
    });
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      fit,
      zoomBy(f: number) {
        const r = box.current!.getBoundingClientRect();
        zoomAt(f, r.width / 2, r.height / 2);
      },
    }),
    [fit, zoomAt],
  );

  // Fit on start and whenever the available space changes size noticeably.
  useEffect(() => {
    fit();
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let last = el.getBoundingClientRect();
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (Math.abs(r.width - last.width) > 40 || Math.abs(r.height - last.height) > 40) fit();
      last = r;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  useEffect(() => onScale?.(view.scale), [view.scale, onScale]);

  // Mouse wheel / trackpad zoom (must not be passive).
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      // Trackpad pinch (ctrlKey) and plain mouse wheels zoom; two-finger trackpad scrolling moves.
      if (e.ctrlKey || e.metaKey || e.deltaMode !== 0 || e.deltaX === 0) {
        zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
        return;
      }
      setView((v) => ({ ...v, tx: v.tx - e.deltaX, ty: v.ty - e.deltaY }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const toSheet = (cx: number, cy: number): Pt => {
    const r = box.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (cx - r.left - v.tx) / v.scale, y: (cy - r.top - v.ty) / v.scale };
  };

  const startPinch = () => {
    const [a, b] = [...pointers.current.values()];
    const r = box.current!.getBoundingClientRect();
    pinch.current = {
      d: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      mx: (a.x + b.x) / 2 - r.left,
      my: (a.y + b.y) / 2 - r.top,
      view: viewRef.current,
    };
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
      const r = box.current!.getBoundingClientRect();
      const p = pinch.current;
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mx = (a.x + b.x) / 2 - r.left;
      const my = (a.y + b.y) / 2 - r.top;
      const scale = Math.max(MIN, Math.min(MAX, (p.view.scale * d) / p.d));
      const k = scale / p.view.scale;
      setView({ scale, tx: mx - (p.mx - p.view.tx) * k, ty: my - (p.my - p.view.ty) * k });
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
        <g transform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}>
          <rect className="sheet-shadow" x={0.8} y={1.4} width={w} height={h} rx={1.5} />
          <rect className="sheet" width={w} height={h} rx={1.5} />
          {children}
        </g>
      </svg>
    </div>
  );
}
