// The drawing screen: sheet, tools, colours, selection and history.

import { type ReactNode, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FILLS, STROKES, WIDTHS } from '../geo/color';
import {
  type LP,
  type Pt,
  type RhombType,
  cellAt,
  cellPts,
  cubeFaces,
  hexPts,
  key,
  nearestPoint,
  pointsOnSheet,
  toIJ,
  rhombAt,
  roundIJ,
  same,
  toXY,
  vecToIJ,
} from '../geo/lattice';
import {
  type Candidate,
  type Shape,
  copyOffset,
  cubeFills,
  findCandidates,
  hitShape,
  merge,
  split,
  findTrianglePairs,
  mergeTriangles,
  nearestCorner,
  repeatRow,
  rowStep,
  rotateCopies,
  type TrianglePair,
  isTurned,
  showsAsCorner,
  newId,
  pivotOf,
  recolor,
  reorder,
  rotate,
  sameCell,
  translate,
} from '../geo/shapes';
import { type Doc, centredView, gridOf, sheetOf, zoomView } from '../model/doc';
import { saveDoc } from '../model/store';
import { ColorWheel } from './ColorWheel';
import { exportPng, printDoc, saveFile } from './exporting';
import * as I from './icons';
import { GRID_DOT, GRID_LINE, gridSegments, pathD, strokeWidth } from './render';
import { type Fit, Stage } from './Stage';
import { type PlaneChoice, insertCubeAt, planeChoice, project, stackCube } from '../geo/space';

const View3D = lazy(() => import('./View3D'));

type Tool = 'select' | 'cube' | 'rhomb' | 'triangle' | 'hexagon' | 'pen' | 'paint' | 'erase' | 'pick';
const SHAPE_TOOLS: Tool[] = ['cube', 'rhomb', 'triangle', 'hexagon'];
const PLANE_NAMES: Record<RhombType, string> = { 0: 'Tisch', 1: 'Wand', 2: 'Wand' };
const PLANE_TITLES: Record<RhombType, string> = {
  0: 'Liegt wie ein Tisch (wie der Würfeldeckel)',
  1: 'Steht als Wand (wie die rechte Würfelseite)',
  2: 'Steht als Wand (wie die linke Würfelseite)',
};

type Drag =
  | { mode: 'move'; start: Pt; base: Shape[]; ids: string[]; d: LP; moved: boolean }
  | { mode: 'rect'; start: Pt }
  | { mode: 'place' }
  | { mode: 'paint'; done: Set<string> }
  | { mode: 'erase' }
  | { mode: 'pen'; started: boolean };

interface Props {
  initial: Doc;
  onExit(doc: Doc): void;
}

export function Editor({ initial, onExit }: Props) {
  const [doc, setDoc] = useState(initial);
  const docRef = useRef(doc);
  // History lives in a ref (read synchronously by every handler); the counter re-renders the buttons.
  const hist = useRef<{ past: Shape[][]; future: Shape[][] }>({ past: [], future: [] });
  const [, setHistVersion] = useState(0);
  const pushPast = (prev: Shape[]) => {
    hist.current = { past: [...hist.current.past.slice(-149), prev], future: [] };
    setHistVersion((v) => v + 1);
  };
  const gestureBase = useRef<Shape[] | null>(null);

  const [tool, setToolRaw] = useState<Tool>('cube');
  const prevTool = useRef<Tool>('cube');
  const [rhombT, setRhombT] = useState<RhombType>(0);
  const [cubeV, setCubeV] = useState<0 | 1>(0);
  const [fill, setFill] = useState(FILLS[2]);
  const [stroke, setStroke] = useState<string | null>(STROKES[0]);
  const [width, setWidth] = useState(1);
  const [customFill, setCustomFill] = useState<string | null>(null);
  const [customStroke, setCustomStroke] = useState<string | null>(null);
  const [wheel, setWheel] = useState<null | 'fill' | 'stroke'>(null);
  const [menu, setMenu] = useState<null | 'grid' | 'export'>(null);
  const [show3d, setShow3d] = useState(false);
  const [fit, setFit] = useState<Fit | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  /**
   * A shape that can be read two ways was just made: ask whether it lies or stands (drawn shapes),
   * or whether a turned cube plate is a cube or a corner.
   */
  const [ask, setAsk] = useState<{ id: string; kind: 'plane'; options: RhombType[] } | { id: string; kind: 'reading' } | null>(null);

  const [selection, setSelection] = useState<string[]>([]);
  const [faceSel, setFaceSel] = useState<number | null>(null);
  const [focus, setFocus] = useState<{ id: string; p: Pt } | null>(null);
  /** Where the selection was last tapped: the centre for "Stern". */
  const lastTap = useRef<Pt | null>(null);
  const [ghost, setGhost] = useState<Shape | null>(null);
  const [poly, setPoly] = useState<LP[]>([]);
  const [cursor, setCursor] = useState<LP | null>(null);
  const [rect, setRect] = useState<{ a: Pt; b: Pt } | null>(null);
  const drag = useRef<Drag | null>(null);
  const scale = useRef(1);

  const g = gridOf(doc);
  const { w, h } = sheetOf(doc);
  const shapes = doc.shapes;

  // ---------------------------------------------------------------- document & history

  const setShapes = (next: Shape[]) => {
    docRef.current = { ...docRef.current, shapes: next, updated: Date.now() };
    setDoc(docRef.current);
  };
  const setDocProps = (p: Partial<Doc>) => {
    docRef.current = { ...docRef.current, ...p, updated: Date.now() };
    setDoc(docRef.current);
  };

  const commit = (next: Shape[]) => {
    const prev = docRef.current.shapes;
    if (prev === next) return;
    pushPast(prev);
    setShapes(next);
  };

  const begin = () => {
    gestureBase.current = docRef.current.shapes;
  };
  const end = () => {
    const base = gestureBase.current;
    gestureBase.current = null;
    if (base && base !== docRef.current.shapes) pushPast(base);
  };
  const cancelGesture = () => {
    if (gestureBase.current) setShapes(gestureBase.current);
    gestureBase.current = null;
  };

  const undo = () => {
    const { past, future } = hist.current;
    if (!past.length) return;
    hist.current = { past: past.slice(0, -1), future: [docRef.current.shapes, ...future] };
    setHistVersion((v) => v + 1);
    setShapes(past[past.length - 1]);
    setAsk(null);
    setSelection([]);
    setFaceSel(null);
  };
  const redo = () => {
    const { past, future } = hist.current;
    if (!future.length) return;
    hist.current = { past: [...past, docRef.current.shapes], future: future.slice(1) };
    setHistVersion((v) => v + 1);
    setShapes(future[0]);
    setSelection([]);
    setFaceSel(null);
  };

  // Autosave shortly after every change.
  useEffect(() => {
    const t = setTimeout(() => void saveDoc(doc), 400);
    return () => clearTimeout(t);
  }, [doc]);

  const exit = async () => {
    finishPen();
    await saveDoc(docRef.current);
    onExit(docRef.current);
  };

  // ---------------------------------------------------------------- tools

  const lineStroke = () => stroke ?? STROKES[0];

  const polyRef = useRef<LP[]>([]);
  polyRef.current = poly;
  const setPolyNow = (p: LP[]) => {
    polyRef.current = p;
    setPoly(p);
  };

  const finishPen = () => {
    const cur = polyRef.current;
    if (cur.length >= 2) {
      commit([...docRef.current.shapes, { id: newId(), kind: 'line', parts: [{ pts: cur, fill: null }], stroke: lineStroke(), width }]);
    }
    setPolyNow([]);
    setCursor(null);
  };

  const setTool = (t: Tool) => {
    setAsk(null);
    if (t !== tool) {
      if (poly.length) finishPen();
      if (t === 'pick') prevTool.current = tool;
      if (t !== 'select') {
        setSelection([]);
        setFaceSel(null);
      }
    }
    setGhost(null);
    setToolRaw(t);
  };

  const makeShape = (t: Tool, p: Pt): Shape | null => {
    const base = { id: newId(), stroke, width };
    switch (t) {
      case 'cube':
        return { ...base, kind: 'cube', parts: cubeFills(cubeFaces(nearestPoint(g, p.x, p.y), cubeV), fill) };
      case 'rhomb':
        return { ...base, kind: 'rhomb', parts: [{ pts: rhombAt(g, p.x, p.y, rhombT), fill }] };
      case 'triangle':
        return { ...base, kind: 'triangle', parts: [{ pts: cellPts(cellAt(g, p.x, p.y)), fill }] };
      case 'hexagon':
        return { ...base, kind: 'hexagon', parts: [{ pts: hexPts(nearestPoint(g, p.x, p.y)), fill }] };
      default:
        return null;
    }
  };

  const tol = () => 12 / scale.current;
  const onSheet = (p: Pt) => p.x >= 0 && p.y >= 0 && p.x <= w && p.y <= h;

  const paintAt = (p: Pt, done: Set<string>) => {
    if (!onSheet(p)) return;
    const c = cellAt(g, p.x, p.y);
    const k = `${c.i},${c.j},${c.k}`;
    if (done.has(k)) return;
    done.add(k);
    const pts = cellPts(c);
    const cur = docRef.current.shapes;
    const i = cur.findIndex((s) => s.kind === 'triangle' && sameCell(s.parts[0].pts, pts));
    if (i >= 0) {
      if (cur[i].parts[0].fill === fill) return;
      const next = [...cur];
      next[i] = recolor(cur[i], fill);
      setShapes(next);
    } else {
      setShapes([...cur, { id: newId(), kind: 'triangle', parts: [{ pts, fill }], stroke, width }]);
    }
  };

  const eraseAt = (p: Pt) => {
    const hit = hitShape(g, docRef.current.shapes, p, tol());
    if (hit) setShapes(docRef.current.shapes.filter((s) => s !== hit.shape));
  };

  const onDown = (p: Pt) => {
    setMenu(null);
    setAsk(null);
    if (SHAPE_TOOLS.includes(tool)) {
      drag.current = { mode: 'place' };
      setGhost(makeShape(tool, p));
    } else if (tool === 'pen') {
      const q = nearestPoint(g, p.x, p.y);
      const started = poly.length === 0;
      if (started) setPolyNow([q]);
      setCursor(q);
      drag.current = { mode: 'pen', started };
    } else if (tool === 'paint') {
      begin();
      const done = new Set<string>();
      drag.current = { mode: 'paint', done };
      paintAt(p, done);
    } else if (tool === 'erase') {
      begin();
      drag.current = { mode: 'erase' };
      eraseAt(p);
    } else if (tool === 'pick') {
      const hit = hitShape(g, shapes, p, tol());
      if (hit) {
        const c = hit.shape.kind === 'line' ? hit.shape.stroke : hit.shape.parts[hit.part].fill;
        if (c) setFill(c);
      }
      setToolRaw(prevTool.current === 'pick' ? 'cube' : prevTool.current);
    } else if (tool === 'select') {
      const hit = hitShape(g, shapes, p, tol());
      if (hit) {
        const ids = selection.includes(hit.shape.id) ? selection : [hit.shape.id];
        if (ids !== selection) {
          setSelection(ids);
          setFaceSel(null);
        }
        if (hit.shape.kind === 'rhomb' || hit.shape.kind === 'triangle') setFocus({ id: hit.shape.id, p });
        lastTap.current = p;
        drag.current = { mode: 'move', start: p, base: shapes, ids, d: [0, 0], moved: false };
      } else {
        drag.current = { mode: 'rect', start: p };
        setRect({ a: p, b: p });
      }
    }
  };

  const onMove = (p: Pt) => {
    const d = drag.current;
    if (!d) return;
    if (d.mode === 'place') setGhost(makeShape(tool, p));
    else if (d.mode === 'pen') setCursor(nearestPoint(g, p.x, p.y));
    else if (d.mode === 'paint') paintAt(p, d.done);
    else if (d.mode === 'erase') eraseAt(p);
    else if (d.mode === 'rect') setRect({ a: d.start, b: p });
    else if (d.mode === 'move') {
      const [fi, fj] = vecToIJ(g, p.x - d.start.x, p.y - d.start.y);
      const v = roundIJ(fi, fj);
      if (same(v, d.d)) return;
      if (!d.moved) begin();
      d.moved = true;
      d.d = v;
      setShapes(d.base.map((s) => (d.ids.includes(s.id) ? translate(s, v) : s)));
    }
  };

  const onUp = (p: Pt) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.mode === 'place') {
      const s = makeShape(tool, p);
      setGhost(null);
      if (s && onSheet(p)) {
        // A cube plate goes to the right depth in the stack (behind cubes that stand in front of it).
        if (s.kind === 'cube' && !isTurned(s)) commit(stackCube(docRef.current.shapes, s, nearestPoint(g, p.x, p.y)));
        else commit([...docRef.current.shapes, s]);
        if (isTurned(s)) setAsk({ id: s.id, kind: 'reading' });
        if (s.kind === 'rhomb' || s.kind === 'triangle') setFocus({ id: s.id, p });
      }
    } else if (d.mode === 'pen') {
      const q = nearestPoint(g, p.x, p.y);
      setCursor(null);
      const cur = polyRef.current;
      if (!cur.length) return;
      const last = cur[cur.length - 1];
      if (same(q, last)) {
        // Tapping the last point again ends an open line.
        if (!d.started && cur.length >= 2) finishPen();
      } else if (same(q, cur[0]) && cur.length >= 3) {
        const made: Shape = { id: newId(), kind: 'polygon', parts: [{ pts: cur, fill }], stroke, width };
        const next = [...docRef.current.shapes, made];
        commit(next);
        const choice = planeChoice(next, made.id);
        if (choice && choice.options.length > 1) setAsk({ id: made.id, kind: 'plane', options: choice.options });
        setPolyNow([]);
      } else {
        setPolyNow([...cur, q]);
      }
    } else if (d.mode === 'paint' || d.mode === 'erase') {
      end();
    } else if (d.mode === 'move') {
      if (d.moved) end();
    } else if (d.mode === 'rect') {
      setRect(null);
      if (Math.hypot(p.x - d.start.x, p.y - d.start.y) < 2) {
        setSelection([]);
        setFaceSel(null);
        return;
      }
      const x0 = Math.min(p.x, d.start.x);
      const x1 = Math.max(p.x, d.start.x);
      const y0 = Math.min(p.y, d.start.y);
      const y1 = Math.max(p.y, d.start.y);
      const inside = (q: LP) => {
        const r = toXY(g, q);
        return r.x >= x0 && r.x <= x1 && r.y >= y0 && r.y <= y1;
      };
      setSelection(docRef.current.shapes.filter((s) => s.parts.every((pt) => pt.pts.every(inside))).map((s) => s.id));
      setFaceSel(null);
    }
  };

  const onCancel = () => {
    const d = drag.current;
    drag.current = null;
    setGhost(null);
    setRect(null);
    setCursor(null);
    if (d?.mode === 'pen' && d.started) setPolyNow([]);
    cancelGesture();
  };

  const onHover = (p: Pt | null) => {
    if (drag.current) return;
    if (p && SHAPE_TOOLS.includes(tool) && onSheet(p)) setGhost(makeShape(tool, p));
    else setGhost(null);
    if (tool === 'pen' && poly.length) setCursor(p ? nearestPoint(g, p.x, p.y) : null);
  };

  // ---------------------------------------------------------------- selection actions

  const selShapes = shapes.filter((s) => selection.includes(s.id));
  const singleCube = selShapes.length === 1 && selShapes[0].kind === 'cube' ? selShapes[0] : null;

  // Lying or standing: hand-drawn shapes only.
  const drawnSel = selShapes.length > 0 && selShapes.every((s) => s.kind !== 'cube' && s.kind !== 'rhomb');
  const choices: PlaneChoice[] = drawnSel ? selShapes.map((s) => planeChoice(shapes, s.id)).filter((c): c is PlaneChoice => !!c) : [];
  const shownPlane = choices.length && choices.every((c) => c.plane === choices[0].plane) ? choices[0].plane : null;
  const setReading = (reading: 'cube' | 'corner', id: string) => {
    commit(docRef.current.shapes.map((s) => (s.id === id ? { ...s, reading } : s)));
    setAsk(null);
  };
  const setPlane = (plane: RhombType, ids: string[]) => {
    commit(docRef.current.shapes.map((s) => (ids.includes(s.id) ? { ...s, plane } : s)));
    setAsk(null);
  };

  const applyFill = (c: string) => {
    setFill(c);
    if (!selShapes.length) return;
    commit(
      shapes.map((s) => {
        if (!selection.includes(s.id)) return s;
        if (singleCube && faceSel !== null) return { ...s, parts: s.parts.map((p, i) => (i === faceSel ? { ...p, fill: c } : p)) };
        return recolor(s, c);
      }),
    );
  };
  const applyStroke = (c: string | null) => {
    setStroke(c);
    if (selShapes.length) commit(shapes.map((s) => (selection.includes(s.id) ? { ...s, stroke: s.kind === 'line' ? (c ?? s.stroke) : c } : s)));
  };
  const applyWidth = (i: number) => {
    setWidth(i);
    if (selShapes.length) commit(shapes.map((s) => (selection.includes(s.id) ? { ...s, width: i } : s)));
  };

  const copySel = () => {
    if (!selShapes.length) return;
    const off = copyOffset(selShapes);
    const clones = selShapes.map((s) => ({ ...translate(s, off), id: newId() }));
    commit([...shapes, ...clones]);
    setSelection(clones.map((s) => s.id));
  };
  // Repeating patterns: a row to the right, or a star turned round a corner.
  const rowSel = () => {
    if (!selShapes.length) return;
    const clones = repeatRow(selShapes, rowStep(selShapes), 3);
    commit([...shapes, ...clones]);
    setSelection([...selection, ...clones.map((s) => s.id)]);
  };
  const starSel = (n: 3 | 6) => {
    if (!selShapes.length) return;
    const tap = lastTap.current;
    const c = (tap && nearestCorner(selShapes, ...toIJ(g, tap.x, tap.y))) || pivotOf(g, selShapes, (x, y) => nearestPoint(g, x, y));
    const clones = rotateCopies(selShapes, c, n);
    commit([...shapes, ...clones]);
    setSelection([...selection, ...clones.map((s) => s.id)]);
  };
  const rotateSel = () => {
    if (!selShapes.length) return;
    const c = pivotOf(g, selShapes, (x, y) => nearestPoint(g, x, y));
    commit(shapes.map((s) => (selection.includes(s.id) ? rotate(s, c) : s)));
  };
  const deleteSel = () => {
    if (!selShapes.length) return;
    commit(shapes.filter((s) => !selection.includes(s.id)));
    setSelection([]);
  };

  // ---------------------------------------------------------------- merging rhombs into a cube plate

  const candidates = useMemo(() => findCandidates(shapes), [shapes]);
  const active: Candidate | null = useMemo(() => {
    if (!candidates.length) return null;
    const fid = focus?.id ?? (selection.length === 1 ? selection[0] : null);
    const mine = fid ? candidates.filter((c) => c.ids.includes(fid)) : [];
    if (!mine.length) return candidates[candidates.length - 1];
    if (!focus) return mine[0];
    const dist = (c: Candidate) => {
      const q = toXY(g, c.center);
      return Math.hypot(q.x - focus.p.x, q.y - focus.p.y);
    };
    return mine.reduce((a, b) => (dist(b) < dist(a) ? b : a));
  }, [candidates, focus, selection, g.s]);

  // Two triangles that form a rhomb – offered when one of them was just set or is selected.
  const triPairs = useMemo(() => findTrianglePairs(shapes), [shapes]);
  const activeTri: TrianglePair | null = useMemo(() => {
    if (active) return null;
    const fid = focus?.id ?? (selection.length === 1 ? selection[0] : null);
    const mine = fid ? triPairs.filter((t) => t.ids.includes(fid)) : [];
    if (!mine.length) return null;
    if (!focus) return mine[0];
    const dist = (t: TrianglePair) => {
      const a = toXY(g, t.pts[0]);
      const b = toXY(g, t.pts[2]);
      return Math.hypot((a.x + b.x) / 2 - focus.p.x, (a.y + b.y) / 2 - focus.p.y);
    };
    return mine.reduce((x, y) => (dist(y) < dist(x) ? y : x));
  }, [triPairs, active, focus, selection, g.s]);
  const doMergeTriangles = () => {
    if (!activeTri) return;
    const r = mergeTriangles(shapes, activeTri);
    commit(r.shapes);
    setFocus(null);
    setToolRaw('select');
    setSelection([r.id]);
    setFaceSel(null);
  };

  const cubeIds = selShapes.filter((s) => s.kind === 'cube').map((s) => s.id);
  const doSplit = () => {
    if (!cubeIds.length) return;
    const r = split(shapes, cubeIds);
    commit(r.shapes);
    setFocus(null);
    setSelection(r.ids);
    setFaceSel(null);
  };

  const doMerge = () => {
    if (!active) return;
    const r = merge(shapes, active);
    commit(r.shapes);
    const made = r.shapes.find((x) => x.id === r.id);
    if (made && isTurned(made)) setAsk({ id: r.id, kind: 'reading' });
    setFocus(null);
    setToolRaw('select');
    setSelection([r.id]);
    setFaceSel(null);
  };

  // ---------------------------------------------------------------- keyboard

  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e: KeyboardEvent) => {
    if (wheel || show3d) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      deleteSel();
    } else if (e.key === 'Escape') {
      setSelection([]);
      setPolyNow([]);
      setMenu(null);
    } else if (e.key === 'Enter' && poly.length) {
      finishPen();
    }
  };
  useEffect(() => {
    const f = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, []);

  // Zooming and moving change only where the lattice lies on the sheet; the sheet stays put.
  const zoom = (f: number, c: Pt) => setDocProps({ view: zoomView(docRef.current.view, f, c.x, c.y) });
  const pan = (dx: number, dy: number) => {
    const v = docRef.current.view;
    setDocProps({ view: { ...v, ox: v.ox + dx, oy: v.oy + dy } });
  };

  const onScale = useCallback((s: number) => {
    scale.current = s;
  }, []);

  // ---------------------------------------------------------------- drawing

  const grid = useMemo(() => {
    if (!doc.gridVisible) return null;
    if (doc.gridStyle === 'lines') {
      const d = gridSegments(g, w, h)
        .map(([a, b, c, e]) => `M${a} ${b}L${c} ${e}`)
        .join('');
      return <path d={d} stroke={GRID_LINE} strokeWidth={g.s * 0.025} fill="none" />;
    }
    return pointsOnSheet(g, w, h).map((p) => {
      const q = toXY(g, p);
      return <circle key={key(p)} cx={q.x} cy={q.y} r={g.s * 0.05} fill={GRID_DOT} />;
    });
  }, [doc.gridVisible, doc.gridStyle, doc.view, doc.format]);

  const drawShape = (s: Shape, extra?: Partial<React.SVGProps<SVGPathElement>>) => {
    const sw = strokeWidth(g, s.width);
    if (s.kind === 'line')
      return <path key={s.id} d={pathD(g, s.parts[0].pts, false)} fill="none" stroke={s.stroke ?? STROKES[0]} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" {...extra} />;
    return (
      <g key={s.id}>
        {s.parts.map((p, i) => (
          <path key={i} d={pathD(g, p.pts, true)} fill={p.fill ?? 'none'} stroke={s.stroke ?? 'none'} strokeWidth={sw} strokeLinejoin="round" {...extra} />
        ))}
      </g>
    );
  };

  const outline = (s: Shape, cls: string, extraW = 0) =>
    s.parts.map((p, i) => <path key={s.id + i} className={cls} d={pathD(g, p.pts, s.kind !== 'line')} strokeWidth={strokeWidth(g, 1) + extraW} />);

  const candShapes = (c: Candidate) => c.ids.map((id) => shapes.find((s) => s.id === id)).filter((s): s is Shape => !!s);

  // ---------------------------------------------------------------- UI pieces

  // Pressing the rhomb or cube button again turns the shape by 60° (clockwise).
  const RHOMB_NEXT: Record<RhombType, RhombType> = { 0: 2, 2: 1, 1: 0 };
  const pressTool = (t: Tool) => {
    if (t === tool && t === 'rhomb') setRhombT(RHOMB_NEXT[rhombT]);
    else if (t === tool && t === 'cube') setCubeV(cubeV ? 0 : 1);
    else setTool(t);
  };

  const toolBtn = (t: Tool, icon: ReactNode, label: string) => (
    <button key={t} className={'tool' + (tool === t ? ' on' : '')} onClick={() => pressTool(t)} aria-label={label} title={label}>
      {icon}
    </button>
  );

  const swatch = (c: string, on: boolean, onClick: () => void, label: string, ring = false) => (
    <button key={label} className={'swatch' + (on ? ' on' : '') + (ring ? ' ring' : '')} style={ring ? { borderColor: c } : { background: c }} onClick={onClick} aria-label={label} title={label} />
  );

  /** Speech bubble next to a freshly made tipping figure or turned cube plate. */
  const askBubble = () => {
    const sh = shapes.find((x) => x.id === ask!.id);
    if (!sh || !fit) return null;
    const pts = sh.parts.flatMap((p) => p.pts).map((q) => toXY(g, q));
    const cx = pts.reduce((a, q) => a + q.x, 0) / pts.length;
    const top = Math.min(...pts.map((q) => q.y));
    const W = wrapRef.current?.clientWidth ?? 600;
    const x = Math.max(130, Math.min(W - 130, fit.tx + cx * fit.scale));
    const y = Math.max(8, fit.ty + top * fit.scale - 10);
    const a = ask!;
    return (
      <div className={'ask' + (y < 140 ? ' below' : '')} style={{ left: x, top: y < 140 ? fit.ty + Math.max(...pts.map((q) => q.y)) * fit.scale + 10 : y }}>
        <div className="ask-q">{a.kind === 'plane' ? 'Liegt sie oder steht sie?' : 'Würfel oder Ecke?'}</div>
        <div className="ask-row">
          {a.kind === 'plane'
            ? a.options.map((pl) => (
                <button key={pl} className="plane-btn" onClick={() => setPlane(pl, [a.id])} title={PLANE_TITLES[pl]} aria-label={PLANE_TITLES[pl]}>
                  <I.RhombIcon type={pl} />
                  <span>{PLANE_NAMES[pl]}</span>
                </button>
              ))
            : readingButtons(sh, (r) => setReading(r, a.id))}
          <button className="ask-x" onClick={() => setAsk(null)} aria-label="Später">
            <I.CloseIcon />
          </button>
        </div>
      </div>
    );
  };

  /** "Würfel" (seen from below) or "Ecke" (inner corner) for a turned cube plate. */
  const readingButtons = (sh: Shape, pick: (r: 'cube' | 'corner') => void, highlight = false) => {
    const corner = showsAsCorner(sh);
    return (
      <>
        <button className={'plane-btn' + (highlight && !corner ? ' on' : '')} onClick={() => pick('cube')} title="Ein Würfel, von unten gesehen" aria-label="Würfel">
          <I.CubeIcon variant={0} colors={[sh.parts[0].fill ?? '#ffd166', sh.parts[1].fill ?? '#b39248', sh.parts[2].fill ?? '#ffe3a1']} />
          <span>Würfel</span>
        </button>
        <button className={'plane-btn' + (highlight && corner ? ' on' : '')} onClick={() => pick('corner')} title="Eine Ecke wie in einem Zimmer: Boden und zwei Wände" aria-label="Ecke">
          <I.CubeIcon variant={1} colors={[sh.parts[0].fill ?? '#ffd166', sh.parts[1].fill ?? '#b39248', sh.parts[2].fill ?? '#ffe3a1']} />
          <span>Ecke</span>
        </button>
      </>
    );
  };

  const curFill = singleCube && faceSel !== null ? singleCube.parts[faceSel].fill : fill;

  return (
    <div className="app editor">
      <header className="topbar">
        <button className="round" onClick={exit} aria-label="Zur Galerie" title="Zur Galerie">
          <I.BackIcon />
        </button>
        <button
          className="title"
          onClick={() => {
            const n = window.prompt('Wie soll dein Bild heißen?', doc.name);
            if (n && n.trim()) setDocProps({ name: n.trim().slice(0, 60) });
          }}
          title="Namen ändern"
        >
          {doc.name}
        </button>
        <span className="grow" />
        <button
          className="pill three-d"
          onClick={() => {
            finishPen();
            setMenu(null);
            setShow3d(true);
          }}
          title="3D-Ansicht"
        >
          <I.ThreeDIcon /> <span className="lbl">3D</span>
        </button>
        <button className="round top-history" onClick={undo} disabled={!hist.current.past.length} aria-label="Rückgängig" title="Rückgängig">
          <I.UndoIcon />
        </button>
        <button className="round top-history" onClick={redo} disabled={!hist.current.future.length} aria-label="Wiederholen" title="Wiederholen">
          <I.RedoIcon />
        </button>
        <div className="menu-anchor">
          <button className={'round' + (menu === 'grid' ? ' on' : '')} onClick={() => setMenu(menu === 'grid' ? null : 'grid')} aria-label="Raster" title="Raster">
            <I.GridIcon style={doc.gridVisible ? doc.gridStyle : 'off'} />
          </button>
          {menu === 'grid' && (
            <div className="menu">
              <div className="menu-label">Raster</div>
              <div className="seg">
                <button className={doc.gridVisible && doc.gridStyle === 'points' ? 'on' : ''} onClick={() => setDocProps({ gridStyle: 'points', gridVisible: true })}>
                  <I.GridIcon style="points" /> Punkte
                </button>
                <button className={doc.gridVisible && doc.gridStyle === 'lines' ? 'on' : ''} onClick={() => setDocProps({ gridStyle: 'lines', gridVisible: true })}>
                  <I.GridIcon style="lines" /> Linien
                </button>
                <button className={!doc.gridVisible ? 'on' : ''} onClick={() => setDocProps({ gridVisible: false })}>
                  <I.GridIcon style="off" /> Aus
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="menu-anchor">
          <button className={'round' + (menu === 'export' ? ' on' : '')} onClick={() => setMenu(menu === 'export' ? null : 'export')} aria-label="Speichern und Teilen" title="Speichern und Teilen">
            <I.ShareIcon />
          </button>
          {menu === 'export' && (
            <div className="menu right">
              <button
                onClick={() => {
                  setMenu(null);
                  exportPng(docRef.current, false).catch((e) => alert(String(e)));
                }}
              >
                Als Bild speichern (PNG)
              </button>
              <button
                onClick={() => {
                  setMenu(null);
                  printDoc(docRef.current, false);
                }}
              >
                Drucken / PDF
              </button>
              <button
                onClick={() => {
                  setMenu(null);
                  printDoc({ ...docRef.current, gridVisible: true }, true);
                }}
              >
                Drucken mit Raster
              </button>
              <button
                onClick={() => {
                  setMenu(null);
                  printDoc({ ...docRef.current, shapes: [], gridVisible: true }, true);
                }}
              >
                Leeres Raster drucken (Arbeitsblatt)
              </button>
              <button
                onClick={() => {
                  setMenu(null);
                  saveFile(docRef.current);
                }}
              >
                Als Datei speichern
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="work">
        <div className="stage-wrap" ref={wrapRef}>
          <Stage w={w} h={h} onScale={onScale} onFit={setFit} onDown={onDown} onMove={onMove} onUp={onUp} onCancel={onCancel} onHover={onHover} onZoom={zoom} onPan={pan}>
            <defs>
              <clipPath id="sheet-clip">
                <rect width={w} height={h} rx={1.5} />
              </clipPath>
            </defs>
            <g clipPath="url(#sheet-clip)">
              {grid}
              {shapes.map((s) => drawShape(s))}
              {ghost && <g className="ghost">{drawShape(ghost)}</g>}
            </g>
            {candidates.map((c, i) => (
              <g key={i} className={'cand' + (c === active ? ' active' : '')}>
                {candShapes(c).map((s) => outline(s, 'cand-line', g.s * 0.06))}
              </g>
            ))}
            {activeTri && (
              <g className="cand active">
                {activeTri.ids.map((id) => shapes.find((x) => x.id === id)).map((x) => x && outline(x, 'cand-line', g.s * 0.06))}
              </g>
            )}
            {selShapes.map((s) => outline(s, 'sel-line'))}
            {singleCube && faceSel !== null && <path className="face-line" d={pathD(g, singleCube.parts[faceSel].pts, true)} strokeWidth={g.s * 0.09} />}
            {poly.length > 0 && (
              <g className="pen">
                <path d={pathD(g, poly, false)} strokeWidth={strokeWidth(g, width)} stroke={lineStroke()} fill="none" />
                {cursor && <path d={pathD(g, [poly[poly.length - 1], cursor], false)} className="pen-next" strokeWidth={g.s * 0.05} />}
                {poly.length >= 3 && <circle className="pen-close" cx={toXY(g, poly[0]).x} cy={toXY(g, poly[0]).y} r={g.s * 0.22} />}
                {poly.map((p, i) => (
                  <circle key={i} cx={toXY(g, p).x} cy={toXY(g, p).y} r={g.s * 0.09} className="pen-dot" />
                ))}
              </g>
            )}
            {rect && (
              <rect
                className="sel-rect"
                x={Math.min(rect.a.x, rect.b.x)}
                y={Math.min(rect.a.y, rect.b.y)}
                width={Math.abs(rect.a.x - rect.b.x)}
                height={Math.abs(rect.a.y - rect.b.y)}
                strokeWidth={g.s * 0.04}
              />
            )}
          </Stage>
          {ask && fit && askBubble()}
          <div className="zoom">
            <button className="round small" onClick={() => zoom(1.3, { x: w / 2, y: h / 2 })} aria-label="Hineinzoomen" title="Hineinzoomen">
              <I.PlusIcon />
            </button>
            <button className="round small" onClick={() => zoom(1 / 1.3, { x: w / 2, y: h / 2 })} aria-label="Herauszoomen" title="Herauszoomen">
              <I.MinusIcon />
            </button>
            <button className="round small" onClick={() => setDocProps({ view: centredView(doc.format) })} aria-label="Zoom zurücksetzen" title="Zoom zurücksetzen">
              <I.FitIcon />
            </button>
          </div>
        </div>

        <aside className="panel">
          <div className="row tools">
            {toolBtn('select', <I.SelectIcon />, 'Auswählen')}
            <span className="sep" />
            {toolBtn('cube', <I.CubeIcon variant={cubeV} />, 'Würfelplättchen')}
            {toolBtn('rhomb', <I.RhombIcon type={rhombT} />, 'Raute')}
            {toolBtn('triangle', <I.TriangleIcon />, 'Dreieck')}
            {toolBtn('hexagon', <I.HexIcon />, 'Sechseck')}
            <span className="sep" />
            {toolBtn('pen', <I.PenIcon />, 'Streckenzug')}
            {toolBtn('paint', <I.BrushIcon />, 'Ausmalen')}
            {toolBtn('erase', <I.EraserIcon />, 'Radiergummi')}
            {toolBtn('pick', <I.PipetteIcon />, 'Farbe aufnehmen')}
            <span className="sep" />
            <button className="tool" onClick={undo} disabled={!hist.current.past.length} aria-label="Rückgängig" title="Rückgängig">
              <I.UndoIcon />
            </button>
            <button className="tool danger" onClick={deleteSel} disabled={!selShapes.length} aria-label="Auswahl löschen" title="Auswahl löschen">
              <I.TrashIcon />
            </button>
          </div>

          <div className="row actions">
            <button
              className={'pill merge' + (active || activeTri ? ' hot' : '')}
              disabled={!active && !activeTri}
              onClick={active ? doMerge : doMergeTriangles}
              title={activeTri ? 'Zwei Dreiecke zu einer Raute verschmelzen' : 'Drei Rauten zu einem Würfelplättchen verschmelzen'}
            >
              <I.MergeIcon /> Verschmelzen
            </button>
            <button className={'pill split' + (cubeIds.length ? ' ready' : '')} disabled={!cubeIds.length} onClick={doSplit} title="Würfelplättchen in drei Rauten teilen">
              <I.SplitIcon /> Teilen
            </button>
            {tool === 'pen' && poly.length > 0 && (
              <>
                <button className="pill" onClick={finishPen} disabled={poly.length < 2}>
                  <I.CheckIcon /> Linie fertig
                </button>
                <button className="pill" onClick={() => setPolyNow([])}>
                  <I.CloseIcon /> Abbrechen
                </button>
              </>
            )}
            {tool === 'pen' && !poly.length && <span className="hint">Tippe Punkte nacheinander an. Zurück zum ersten Punkt schließt die Form.</span>}
            {tool === 'paint' && <span className="hint">Tippe oder wische über die Dreiecke.</span>}
          </div>

          {selShapes.length > 0 && (
            <div className="row selbar">
              <button className="pill" onClick={copySel}>
                <I.CopyIcon /> Kopieren
              </button>
              <button className="pill" onClick={rotateSel}>
                <I.RotateIcon /> Drehen
              </button>
              <button className="pill" onClick={rowSel} title="Noch dreimal nach rechts">
                <I.RowIcon /> Reihe
              </button>
              <button className="pill" onClick={() => starSel(3)} title="Drei Stück im Kreis um die angetippte Ecke">
                <I.StarIcon n={3} /> Stern ×3
              </button>
              <button className="pill" onClick={() => starSel(6)} title="Sechs Stück im Kreis um die angetippte Ecke">
                <I.StarIcon n={6} /> Stern ×6
              </button>
              <button className="pill" onClick={() => commit(reorder(shapes, selection, 1))}>
                <I.FrontIcon /> Nach vorne
              </button>
              <button className="pill" onClick={() => commit(reorder(shapes, selection, -1))}>
                <I.BackLayerIcon /> Nach hinten
              </button>
            </div>
          )}

          {drawnSel && choices.length > 0 && (
            <div className="row planes">
              <span className="label">Lage in 3D</span>
              {([0, 2, 1] as RhombType[]).map((pl) => (
                <button key={pl} className={'plane-btn' + (shownPlane === pl ? ' on' : '')} onClick={() => setPlane(pl, selection)} title={PLANE_TITLES[pl]} aria-label={PLANE_TITLES[pl]}>
                  <I.RhombIcon type={pl} />
                  <span>{PLANE_NAMES[pl]}</span>
                </button>
              ))}
              <span className="hint">
                {choices.some((c) => c.chosen)
                  ? 'Du hast die Lage gewählt.'
                  : choices.some((c) => c.options.length > 1)
                    ? 'Kippfigur! Sie kann liegen oder stehen – du entscheidest.'
                    : 'Die App hat die Lage gewählt.'}
              </span>
            </div>
          )}

          {singleCube && isTurned(singleCube) && (
            <div className="row planes">
              <span className="label">In 3D</span>
              {readingButtons(singleCube, (r) => setReading(r, singleCube.id), true)}
              <span className="hint">{singleCube.reading ? 'Du hast gewählt.' : 'Gedrehtes Plättchen: Würfel von unten oder Zimmerecke – du entscheidest.'}</span>
            </div>
          )}

          {singleCube && (
            <div className="row faces">
              <span className="label">Seiten</span>
              {singleCube.parts.map((p, i) => (
                <button
                  key={i}
                  className={'face' + (faceSel === i ? ' on' : '')}
                  style={{ background: p.fill ?? '#fff' }}
                  onClick={() => setFaceSel(faceSel === i ? null : i)}
                  aria-label={`Seite ${i + 1}`}
                />
              ))}
              <span className="hint">{faceSel === null ? 'Farbe wählen färbt alle drei Seiten. Tippe eine Seite an, um sie einzeln zu färben.' : 'Jetzt eine Farbe für diese Seite wählen.'}</span>
            </div>
          )}

          <div className="row colors">
            <span className="label">Füllung</span>
            {FILLS.map((c) => swatch(c, curFill === c, () => applyFill(c), 'Füllung ' + c))}
            {customFill && swatch(customFill, curFill === customFill, () => applyFill(customFill), 'Eigene Füllfarbe')}
            <button className="swatch wheel-btn" onClick={() => setWheel('fill')} aria-label="Eigene Farbe" title="Eigene Farbe">
              <I.WheelIcon />
            </button>
          </div>

          <div className="row colors">
            <span className="label">Rand</span>
            <button className={'swatch none' + (stroke === null ? ' on' : '')} onClick={() => applyStroke(null)} aria-label="Kein Rand" title="Kein Rand">
              <I.NoneIcon />
            </button>
            {STROKES.map((c) => swatch(c, stroke === c, () => applyStroke(c), 'Rand ' + c, true))}
            {customStroke && swatch(customStroke, stroke === customStroke, () => applyStroke(customStroke), 'Eigene Randfarbe', true)}
            <button className="swatch wheel-btn" onClick={() => setWheel('stroke')} aria-label="Eigene Randfarbe" title="Eigene Randfarbe">
              <I.WheelIcon />
            </button>
            <span className="sep" />
            {WIDTHS.map((_, i) => (
              <button key={i} className={'width' + (width === i ? ' on' : '')} onClick={() => applyWidth(i)} aria-label={'Linie ' + ['dünn', 'mittel', 'dick'][i]} title={'Linie ' + ['dünn', 'mittel', 'dick'][i]}>
                <span style={{ height: 2 + i * 3 }} />
              </button>
            ))}
          </div>
        </aside>
      </main>

      {show3d && (
        <div className="overlay">
          <Suspense fallback={<p className="view3d-msg">3D wird geladen …</p>}>
            <View3D
              name={doc.name}
              shapes={doc.shapes}
              onClose={() => setShow3d(false)}
              onFlip={(id, plane) => commit(docRef.current.shapes.map((s) => (s.id === id ? { ...s, plane } : s)))}
              onReading={(id, reading) => commit(docRef.current.shapes.map((s) => (s.id === id ? { ...s, reading } : s)))}
              buildColor={fill}
              onAddCube={(min) => {
                const c = project(min) as LP;
                const plate: Shape = { id: newId(), kind: 'cube', parts: cubeFills(cubeFaces(c, 0), fill), stroke, width };
                commit(insertCubeAt(docRef.current.shapes, plate, min));
              }}
              onRemoveCube={(id) => commit(docRef.current.shapes.filter((s) => s.id !== id))}
            />
          </Suspense>
        </div>
      )}

      {wheel && (
        <ColorWheel
          title={wheel === 'fill' ? 'Eigene Füllfarbe' : 'Eigene Randfarbe'}
          initial={(wheel === 'fill' ? customFill ?? fill : customStroke ?? stroke) ?? '#4fbfb3'}
          onClose={() => setWheel(null)}
          onPick={(c) => {
            if (wheel === 'fill') {
              setCustomFill(c);
              applyFill(c);
            } else {
              setCustomStroke(c);
              applyStroke(c);
            }
            setWheel(null);
          }}
        />
      )}
    </div>
  );
}
