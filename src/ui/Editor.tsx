// The drawing screen: sheet, tools, colours, selection and history.

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  newId,
  pivotOf,
  recolor,
  reorder,
  rotate,
  sameCell,
  translate,
} from '../geo/shapes';
import { type Doc, GRID_SIZES, gridOf, saveDoc, sheetOf } from '../model/doc';
import { ColorWheel } from './ColorWheel';
import { exportPng, printDoc, saveFile } from './exporting';
import * as I from './icons';
import { GRID_DOT, GRID_LINE, gridSegments, pathD, strokeWidth } from './render';
import { Stage, type StageHandle } from './Stage';

type Tool = 'select' | 'cube' | 'rhomb' | 'triangle' | 'hexagon' | 'pen' | 'paint' | 'erase' | 'pick';
const SHAPE_TOOLS: Tool[] = ['cube', 'rhomb', 'triangle', 'hexagon'];

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
  const [past, setPast] = useState<Shape[][]>([]);
  const [future, setFuture] = useState<Shape[][]>([]);
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

  const [selection, setSelection] = useState<string[]>([]);
  const [faceSel, setFaceSel] = useState<number | null>(null);
  const [focus, setFocus] = useState<{ id: string; p: Pt } | null>(null);
  const [ghost, setGhost] = useState<Shape | null>(null);
  const [poly, setPoly] = useState<LP[]>([]);
  const [cursor, setCursor] = useState<LP | null>(null);
  const [rect, setRect] = useState<{ a: Pt; b: Pt } | null>(null);
  const drag = useRef<Drag | null>(null);
  const scale = useRef(1);
  const stage = useRef<StageHandle>(null);

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
    setPast((p) => [...p.slice(-149), prev]);
    setFuture([]);
    setShapes(next);
  };

  const begin = () => {
    gestureBase.current = docRef.current.shapes;
  };
  const end = () => {
    const base = gestureBase.current;
    gestureBase.current = null;
    if (base && base !== docRef.current.shapes) {
      setPast((p) => [...p.slice(-149), base]);
      setFuture([]);
    }
  };
  const cancelGesture = () => {
    if (gestureBase.current) setShapes(gestureBase.current);
    gestureBase.current = null;
  };

  const undo = () => {
    if (!past.length) return;
    setFuture((f) => [docRef.current.shapes, ...f]);
    setShapes(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
    setSelection([]);
  };
  const redo = () => {
    if (!future.length) return;
    setPast((p) => [...p, docRef.current.shapes]);
    setShapes(future[0]);
    setFuture((f) => f.slice(1));
    setSelection([]);
  };

  // Autosave shortly after every change.
  useEffect(() => {
    const t = setTimeout(() => saveDoc(doc), 400);
    return () => clearTimeout(t);
  }, [doc]);

  const exit = () => {
    finishPen();
    saveDoc(docRef.current);
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
        if (hit.shape.kind === 'rhomb') setFocus({ id: hit.shape.id, p });
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
        commit([...docRef.current.shapes, s]);
        if (s.kind === 'rhomb') setFocus({ id: s.id, p });
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
        commit([...docRef.current.shapes, { id: newId(), kind: 'polygon', parts: [{ pts: cur, fill }], stroke, width }]);
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

  const doMerge = () => {
    if (!active) return;
    const r = merge(shapes, active);
    commit(r.shapes);
    setFocus(null);
    setToolRaw('select');
    setSelection([r.id]);
    setFaceSel(null);
  };

  // ---------------------------------------------------------------- keyboard

  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e: KeyboardEvent) => {
    if (wheel) return;
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
  }, [doc.gridVisible, doc.gridStyle, doc.gridSize, doc.format]);

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

  const toolBtn = (t: Tool, icon: ReactNode, label: string) => (
    <button key={t} className={'tool' + (tool === t ? ' on' : '')} onClick={() => setTool(t)} aria-label={label} title={label}>
      {icon}
    </button>
  );

  const swatch = (c: string, on: boolean, onClick: () => void, label: string, ring = false) => (
    <button key={label} className={'swatch' + (on ? ' on' : '') + (ring ? ' ring' : '')} style={ring ? { borderColor: c } : { background: c }} onClick={onClick} aria-label={label} title={label} />
  );

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
        <button className="round" onClick={undo} disabled={!past.length} aria-label="Rückgängig" title="Rückgängig">
          <I.UndoIcon />
        </button>
        <button className="round" onClick={redo} disabled={!future.length} aria-label="Wiederholen" title="Wiederholen">
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
              <div className="menu-label">Größe</div>
              <div className="seg">
                {GRID_SIZES.map((s, i) => (
                  <button key={s.label} className={doc.gridSize === i ? 'on' : ''} onClick={() => setDocProps({ gridSize: i })}>
                    {s.label}
                  </button>
                ))}
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
        <div className="stage-wrap">
          <Stage ref={stage} w={w} h={h} onScale={onScale} onDown={onDown} onMove={onMove} onUp={onUp} onCancel={onCancel} onHover={onHover}>
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
          <div className="zoom">
            <button className="round small" onClick={() => stage.current?.zoomBy(1.3)} aria-label="Vergrößern">
              <I.PlusIcon />
            </button>
            <button className="round small" onClick={() => stage.current?.zoomBy(1 / 1.3)} aria-label="Verkleinern">
              <I.MinusIcon />
            </button>
            <button className="round small" onClick={() => stage.current?.fit()} aria-label="Ganzes Blatt">
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
          </div>

          <div className="row actions">
            {(tool === 'rhomb' || tool === 'cube') && (
              <button
                className="pill"
                onClick={() => (tool === 'rhomb' ? setRhombT(((rhombT + 1) % 3) as RhombType) : setCubeV(cubeV ? 0 : 1))}
                title="Lage drehen"
              >
                <I.RotateIcon /> Drehen
              </button>
            )}
            <button className={'pill merge' + (active ? ' hot' : '')} disabled={!active} onClick={doMerge} title="Drei Rauten zu einem Würfelplättchen verschmelzen">
              <I.MergeIcon /> Verschmelzen
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
              <button className="pill" onClick={() => commit(reorder(shapes, selection, 1))}>
                <I.FrontIcon /> Nach vorne
              </button>
              <button className="pill" onClick={() => commit(reorder(shapes, selection, -1))}>
                <I.BackLayerIcon /> Nach hinten
              </button>
              <button className="pill danger" onClick={deleteSel}>
                <I.TrashIcon /> Löschen
              </button>
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
              <button key={i} className={'width' + (width === i ? ' on' : '')} onClick={() => applyWidth(i)} aria-label={['Dünn', 'Mittel', 'Dick'][i]} title={['Dünn', 'Mittel', 'Dick'][i]}>
                <span style={{ height: 2 + i * 3 }} />
              </button>
            ))}
          </div>
        </aside>
      </main>

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
