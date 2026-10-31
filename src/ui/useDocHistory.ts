// The drawing being edited, its undo/redo history and autosave.
//
// The document and the history live in refs as well, so every handler reads the latest state
// synchronously (several changes can happen within one gesture before React renders again).

import { useEffect, useRef, useState } from 'react';
import type { Shape } from '../geo/shapes';
import type { Doc } from '../model/doc';
import { saveDoc } from '../model/store';

const KEEP = 150;

export function useDocHistory(initial: Doc) {
  const [doc, setDoc] = useState(initial);
  const docRef = useRef(doc);
  const hist = useRef<{ past: Shape[][]; future: Shape[][] }>({ past: [], future: [] });
  const [, setVersion] = useState(0);
  const gestureBase = useRef<Shape[] | null>(null);

  const pushPast = (prev: Shape[]) => {
    hist.current = { past: [...hist.current.past.slice(-(KEEP - 1)), prev], future: [] };
    setVersion((v) => v + 1);
  };

  /** Change the shapes without a history step (inside a gesture). */
  const setShapes = (next: Shape[]) => {
    docRef.current = { ...docRef.current, shapes: next, updated: Date.now() };
    setDoc(docRef.current);
  };
  /** Change other properties (name, view, grid): no history step. */
  const setDocProps = (p: Partial<Doc>) => {
    docRef.current = { ...docRef.current, ...p, updated: Date.now() };
    setDoc(docRef.current);
  };

  /** Change the shapes as one step that can be undone. */
  const commit = (next: Shape[]) => {
    const prev = docRef.current.shapes;
    if (prev === next) return;
    pushPast(prev);
    setShapes(next);
  };

  /** A gesture (painting, erasing, moving) is one step, however many changes it makes. */
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

  const undo = (): boolean => {
    const { past, future } = hist.current;
    if (!past.length) return false;
    hist.current = { past: past.slice(0, -1), future: [docRef.current.shapes, ...future] };
    setVersion((v) => v + 1);
    setShapes(past[past.length - 1]);
    return true;
  };
  const redo = (): boolean => {
    const { past, future } = hist.current;
    if (!future.length) return false;
    hist.current = { past: [...past, docRef.current.shapes], future: future.slice(1) };
    setVersion((v) => v + 1);
    setShapes(future[0]);
    return true;
  };

  // Autosave shortly after every change.
  useEffect(() => {
    const t = setTimeout(() => void saveDoc(doc), 400);
    return () => clearTimeout(t);
  }, [doc]);

  return {
    doc,
    docRef,
    setShapes,
    setDocProps,
    commit,
    begin,
    end,
    cancelGesture,
    undo,
    redo,
    canUndo: hist.current.past.length > 0,
    canRedo: hist.current.future.length > 0,
  };
}
