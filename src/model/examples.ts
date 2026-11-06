// Example pictures for the gallery, built from cubes in space so that stacking and 3D are right.

import { type LP, cubeFaces, toIJ } from '../geo/lattice';
import { type Shape, cubeFills, newId, translate } from '../geo/shapes';
import { type V3, project } from '../geo/space';
import { type Doc, type FormatId, newDoc, sheetOf } from './doc';

const STROKE = '#4a3a2e';

const plate = (c: LP, color: string, turned = false): Shape => ({
  id: newId(),
  kind: 'cube',
  parts: cubeFills(cubeFaces(c, turned ? 1 : 0), color),
  stroke: STROKE,
  width: 1,
});

const depth = (v: V3) => v[0] + v[1] + v[2];

/**
 * Cubes at space cells (lowest corners), drawn back to front. A cube hidden completely behind a
 * nearer one (same place in the drawing) is left out – nobody would draw it.
 */
function cubes(cells: { at: V3; color: string }[]): Shape[] {
  const front = new Map<string, { at: V3; color: string }>();
  for (const c of cells) {
    const k = project(c.at).join(',');
    const seen = front.get(k);
    if (!seen || depth(c.at) > depth(seen.at)) front.set(k, c);
  }
  return [...front.values()].sort((a, b) => depth(a.at) - depth(b.at)).map((c) => plate(project(c.at) as LP, c.color));
}

/** Move the shapes into the middle of the sheet. */
function centred(d: Doc, shapes: Shape[]): Doc {
  const pts = shapes.flatMap((s) => s.parts.flatMap((p) => p.pts));
  const ci = (Math.min(...pts.map((p) => p[0])) + Math.max(...pts.map((p) => p[0]))) / 2;
  const cj = (Math.min(...pts.map((p) => p[1] + p[0] / 2)) + Math.max(...pts.map((p) => p[1] + p[0] / 2))) / 2 - ci / 2;
  const { w, h } = sheetOf(d);
  const [mi, mj] = toIJ(d.view, w / 2, h / 2);
  const di = Math.round(mi - ci);
  const dj = Math.round(mj - cj + (mi - ci - di) / 2);
  return { ...d, shapes: shapes.map((s) => translate(s, [di, dj])) };
}

function example(name: string, shapes: Shape[], format: FormatId = 'a4q'): Doc {
  return centred(newDoc(format, 'points', name), shapes);
}

const RED = '#e8665c';
const ORANGE = '#f59a4a';
const YELLOW = '#ffd166';
const GREEN = '#93cf7e';
const TEAL = '#327a86'; // Petrol
const BLUE = '#6aa9e0';
const LILAC = '#a58bd8';
const PINK = '#f4a6c8';

function staircase(): Doc {
  const cells: { at: V3; color: string }[] = [];
  const colors = [RED, ORANGE, YELLOW, GREEN];
  for (let step = 0; step < 4; step++)
    for (let z = 0; z <= step; z++) for (let x = 0; x < 2; x++) cells.push({ at: [x, -step, z], color: colors[step] });
  return example('Treppe', cubes(cells));
}

function city(): Doc {
  // Towers in a row along the street (side by side), each standing alone.
  const towers: [number, number, number, string][] = [
    [0, 0, 2, BLUE],
    [2, -2, 4, RED],
    [4, -4, 1, YELLOW],
    [6, -6, 3, LILAC],
    [8, -8, 2, GREEN],
    [1, 1, 1, PINK],
    [5, -3, 1, TEAL],
  ];
  const cells: { at: V3; color: string }[] = [];
  for (const [x, y, h, color] of towers) for (let z = 0; z < h; z++) cells.push({ at: [x, y, z], color });
  return example('Würfelstadt', cubes(cells));
}

/** Three cubes round a centre with three loose rhombs between them: the Vasarely tumbling star. */
function tippingStar(): Doc {
  const ring: LP[] = [
    [0, -1],
    [1, -1],
    [1, 0],
    [0, 1],
    [-1, 1],
    [-1, 0],
  ];
  const shapes: Shape[] = [];
  for (const k of [0, 2, 4]) shapes.push(plate(ring[k], PINK));
  // The rhombs left over between the cubes (lying rhomb of the turned plates around the other corners).
  const used = new Set(shapes.flatMap((s) => s.parts.map((p) => p.pts.map((q) => q.join(',')).sort().join('|'))));
  for (const k of [1, 3, 5])
    for (const pts of cubeFaces(ring[k], 1)) {
      const id = pts.map((q) => q.join(',')).sort().join('|');
      if (used.has(id)) continue;
      used.add(id);
      shapes.push({ id: newId(), kind: 'rhomb', parts: [{ pts, fill: YELLOW }], stroke: STROKE, width: 1 });
    }
  return example('Kippstern', shapes);
}

/** A triangle of cubes that cannot exist: the last cube is drawn in front of the first. */
function impossibleTriangle(): Doc {
  const n = 4;
  const cells: { at: V3; color: string }[] = [{ at: [0, 0, 0], color: RED }];
  for (let k = 1; k <= n; k++) cells.push({ at: [k, 0, 0], color: RED });
  for (let k = 1; k <= n; k++) cells.push({ at: [n, 0, k], color: YELLOW });
  for (let k = 1; k < n; k++) cells.push({ at: [n, k, n], color: BLUE });
  // Drawn along the path (each step comes nearer), but the first cube on top of all.
  const shapes = cells.map((c) => plate(project(c.at) as LP, c.color));
  return example('Unmögliches Dreieck', [...shapes.slice(1), shapes[0]]);
}

/** Cubes and turned plates in turn: is it a cube or a corner? */
function cubesOrCorners(): Doc {
  const shapes: Shape[] = [];
  for (let k = 0; k < 6; k++) shapes.push(plate([2 * k, -k], k % 2 ? TEAL : ORANGE, k % 2 === 1));
  return example('Würfel oder Ecke?', shapes);
}

/** The classic pattern of cubes (tumbling blocks). */
function blocks(): Doc {
  const shapes: Shape[] = [];
  const colors = [BLUE, YELLOW, RED];
  for (let a = 0; a < 5; a++) for (let b = 0; b < 4; b++) shapes.push(plate([2 * a + b, -a + b], colors[(a + b) % 3]));
  return example('Würfelmuster', shapes);
}

export interface Example {
  key: string;
  make(): Doc;
}

export const EXAMPLES: Example[] = [
  { key: 'treppe', make: staircase },
  { key: 'stadt', make: city },
  { key: 'stern', make: tippingStar },
  { key: 'dreieck', make: impossibleTriangle },
  { key: 'ecken', make: cubesOrCorners },
  { key: 'muster', make: blocks },
];
