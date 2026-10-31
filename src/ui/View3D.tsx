// 3D view of the drawing: cube plates become cubes, everything else thin walls.
// One finger turns, two fingers zoom and move. Loaded only when opened (three.js is large).
//
// Space (X, Y, Z) with Z up maps to three.js as (x, y, z) = (X, Z, Y); the drawing is the view
// from three.js direction (1, 1, 1).

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { type Model, type V3, bounds, buildModel } from '../geo/space';
import type { Shape } from '../geo/shapes';
import * as I from './icons';

const MARK = '#ff6a3d';
const toThree = (p: V3) => new THREE.Vector3(p[0], p[2], p[1]);
const ISO_DIR = new THREE.Vector3(1, 1, 1).normalize();

interface Props {
  name: string;
  shapes: Shape[];
  onClose(): void;
  /** A hand-drawn shape was tapped: turn it into its next plane. */
  onFlip(id: string, plane: 0 | 1 | 2): void;
  /** A turned cube plate was tapped: switch between cube and inner corner. */
  onReading(id: string, reading: 'cube' | 'corner'): void;
  /** Building: put a new cube into the space cell with this lowest corner. */
  onAddCube(min: V3): void;
  /** Building: take this cube plate away. */
  onRemoveCube(id: string): void;
  /** Colour of new cubes (shown on the button). */
  buildColor: string;
}

interface Ctx {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  controls: OrbitControls;
  content: THREE.Group | null;
  marks: ((on: boolean) => void) | null;
  centre: THREE.Vector3;
  turnTo(dir: THREE.Vector3, dur?: number, zoom?: number, target?: THREE.Vector3): void;
}

export default function View3D({ name, shapes, onClose, onFlip, onReading, onAddCube, onRemoveCube, buildColor }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const model = useMemo(() => buildModel(shapes), [shapes]);
  const [mark, setMark] = useState(false);
  const [failed, setFailed] = useState(false);
  const ctx = useRef<Ctx | null>(null);
  const markRef = useRef(mark);
  markRef.current = mark;
  const flipRef = useRef(onFlip);
  flipRef.current = onFlip;
  const readingRef = useRef(onReading);
  readingRef.current = onReading;
  const [build, setBuild] = useState(false);
  const buildRef = useRef(build);
  buildRef.current = build;
  const addRef = useRef(onAddCube);
  addRef.current = onAddCube;
  const removeRef = useRef(onRemoveCube);
  removeRef.current = onRemoveCube;
  const floorRef = useRef(0);
  const flipPlanes = useRef(new Map<string, 0 | 1 | 2>());
  const impossibleCount = model.cubes.filter((c) => c.impossible).length + model.walls.filter((w) => w.impossible).length;
  const canFlip = model.walls.some((w) => w.flippable || w.cornerOf) || model.cubes.some((c) => c.turned);
  const empty = !model.cubes.length && !model.walls.length;

  // Renderer, camera and controls live as long as the view is open.
  useEffect(() => {
    const el = host.current;
    if (!el || empty) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1000, 1000);
    camera.up.set(0, 1, 0);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    controls.minZoom = 0.2;
    controls.maxZoom = 8;

    const resize = () => {
      const r = el.getBoundingClientRect();
      renderer.setSize(Math.max(1, r.width), Math.max(1, r.height));
      const aspect = Math.max(1, r.width) / Math.max(1, r.height);
      const half = (camera.userData.radius ?? 3) * 0.8;
      camera.left = -half * Math.max(1, aspect);
      camera.right = half * Math.max(1, aspect);
      camera.top = half / Math.min(1, aspect);
      camera.bottom = -half / Math.min(1, aspect);
      camera.updateProjectionMatrix();
    };
    camera.userData.resize = resize;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    ro?.observe(el);

    // Smoothly turn the camera to a direction (and zoom/target).
    let anim: { from: THREE.Spherical; to: THREE.Spherical; z0: number; z1: number; t0: THREE.Vector3; t1: THREE.Vector3; start: number; dur: number } | null = null;
    const c: Ctx = {
      renderer,
      scene,
      camera,
      controls,
      content: null,
      marks: null,
      centre: new THREE.Vector3(),
      turnTo(dir, dur = 900, zoom = 1, target = c.centre) {
        const from = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
        const to = new THREE.Spherical().setFromVector3(dir.clone().multiplyScalar(from.radius));
        // Shortest way around.
        while (to.theta - from.theta > Math.PI) to.theta -= 2 * Math.PI;
        while (from.theta - to.theta > Math.PI) to.theta += 2 * Math.PI;
        anim = { from, to, z0: camera.zoom, z1: zoom, t0: controls.target.clone(), t1: target.clone(), start: performance.now(), dur };
      },
    };
    ctx.current = c;

    let raf = 0;
    const loop = (now: number) => {
      if (anim) {
        const k = Math.min(1, (now - anim.start) / anim.dur);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        const sph = new THREE.Spherical(anim.from.radius, anim.from.phi + (anim.to.phi - anim.from.phi) * e, anim.from.theta + (anim.to.theta - anim.from.theta) * e);
        controls.target.lerpVectors(anim.t0, anim.t1, e);
        camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph));
        camera.zoom = anim.z0 + (anim.z1 - anim.z0) * e;
        camera.updateProjectionMatrix();
        camera.lookAt(controls.target);
        if (k >= 1) anim = null;
      } else {
        controls.update();
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    controls.addEventListener('start', () => (anim = null));

    // A short tap (not a turn) on a hand-drawn shape flips it into its next plane.
    let down: { x: number; y: number; t: number } | null = null;
    const pick = (e: { clientX: number; clientY: number }) => {
      const r = renderer.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      return ray;
    };
    // Long press while building: take the cube away.
    let press = 0;
    let pressed = false;
    const onDown = (e: PointerEvent) => {
      down = e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
      pressed = false;
      clearTimeout(press);
      if (!buildRef.current || !down || !c.content) return;
      const at = { clientX: e.clientX, clientY: e.clientY };
      press = window.setTimeout(() => {
        if (!down || !c.content) return;
        const hit = pick(at).intersectObjects(c.content.children, false).find((h) => h.object.userData.solid);
        const id = hit?.object.userData.cubeId as string | undefined;
        if (!id) return;
        pressed = true;
        navigator.vibrate?.(30);
        removeRef.current(id);
      }, 550);
    };
    const onMove = (e: PointerEvent) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) clearTimeout(press);
    };
    const onUp = (e: PointerEvent) => {
      clearTimeout(press);
      if (!down || !c.content || pressed) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const quick = performance.now() - down.t < 450;
      down = null;
      if (moved > 8 || !quick) return;
      const ray = pick(e);
      const hit = ray.intersectObjects(c.content.children, false).find((h) => h.object.userData.solid);
      const data = hit?.object.userData ?? {};
      if (buildRef.current) {
        // Building: a new cube next to the tapped cube face, or on the tapped ground.
        if (data.cubeMin && hit?.face) {
          const n = hit.face.normal; // three.js (x, y, z) = space (X, Z, Y)
          const m = data.cubeMin as V3;
          const cell: V3 = [m[0] + Math.round(n.x), m[1] + Math.round(n.z), m[2] + Math.round(n.y)];
          if (cell[2] >= floorRef.current) addRef.current(cell);
          return;
        }
        if (hit) return;
        const p = new THREE.Vector3();
        if (ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -floorRef.current), p)) addRef.current([Math.floor(p.x), Math.floor(p.z), floorRef.current]);
        return;
      }
      if (data.turnedCube) return readingRef.current(data.turnedCube, 'corner');
      if (data.cornerOf) return readingRef.current(data.cornerOf, 'cube');
      const id = data.flipId as string | undefined;
      if (!id) return;
      const plane = flipPlanes.current.get(id);
      if (plane !== undefined) flipRef.current(id, ((plane + 1) % 3) as 0 | 1 | 2);
    };
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);

    // After opening: turn a little away from the drawing so you notice it is 3D.
    const reveal = setTimeout(() => c.turnTo(new THREE.Vector3(1.9, 1.15, 0.55).normalize(), 1400), 500);

    return () => {
      clearTimeout(reveal);
      cancelAnimationFrame(raf);
      ro?.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointermove', onMove);
      clearTimeout(press);
      renderer.domElement.removeEventListener('pointerup', onUp);
      controls.dispose();
      disposeTree(scene);
      renderer.dispose();
      renderer.domElement.remove();
      ctx.current = null;
    };
  }, [empty]);

  // (Re)build the bodies whenever the drawing changes – the camera stays where it is.
  useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    const first = !c.content;
    if (c.content) {
      c.scene.remove(c.content);
      disposeTree(c.content);
    }
    const { group, marks } = buildScene(model);
    flipPlanes.current = new Map(model.walls.filter((w) => w.flippable && w.plane !== -1).map((w) => [w.id, w.plane as 0 | 1 | 2]));

    // Soft ground grid under everything.
    const b = bounds(model)!;
    const centre = toThree([(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]);
    const radius = Math.max(1.5, toThree([b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]]).length() / 2);
    const size = Math.ceil(radius * 1.6) * 2 + 4;
    const ground = new THREE.GridHelper(size, size, 0xbcdcde, 0xd8ecec);
    floorRef.current = Math.min(0, Math.round(b.min[2]));
    ground.position.set(Math.round(centre.x), floorRef.current - 0.001, Math.round(centre.z));
    group.add(ground);

    c.scene.add(group);
    c.content = group;
    c.marks = marks;
    marks(markRef.current);
    c.centre.copy(centre);
    if (first) {
      // Frame the model, looking along the direction of the drawing.
      c.camera.userData.radius = radius;
      c.camera.userData.resize();
      c.controls.target.copy(centre);
      c.camera.position.copy(centre).addScaledVector(ISO_DIR, radius * 6);
      c.camera.lookAt(centre);
      c.controls.update();
    }
  }, [model, failed]);

  useEffect(() => ctx.current?.marks?.(mark), [mark]);

  const save = () => {
    const c = ctx.current;
    if (!c) return;
    c.renderer.render(c.scene, c.camera);
    c.renderer.domElement.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (name.replace(/[\\/:*?"<>|]+/g, '').trim() || 'Bild') + ' 3D.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    }, 'image/png');
  };

  return (
    <div className="view3d">
      <header className="topbar">
        <button className="round" onClick={onClose} aria-label="Zurück zur Zeichnung" title="Zurück zur Zeichnung">
          <I.BackIcon />
        </button>
        <span className="title static">{name} · 3D</span>
        <span className="grow" />
        {!empty && !failed && (
          <>
            <button className={'pill build' + (build ? ' on' : '')} onClick={() => setBuild(!build)} aria-label="Bauen" title="Bauen: Würfel anbauen und wegnehmen">
              <span className="build-dot" style={{ background: buildColor }} /> <span className="lbl">Bauen</span>
            </button>
            <button className="pill" onClick={() => ctx.current?.turnTo(ISO_DIR)} aria-label="Wie gezeichnet" title="So drehen, wie es gezeichnet ist">
              <I.CubeIcon /> <span className="lbl">Wie gezeichnet</span>
            </button>
            <button
              className={'pill' + (mark ? ' on' : '')}
              onClick={() => setMark(!mark)}
              disabled={!impossibleCount}
              aria-label="Unmögliches"
              title="Unmögliche Teile hervorheben: lose Rauten und Würfel, die nicht zusammenpassen"
            >
              <I.MagicIcon /> <span className="lbl">Unmögliches</span>
              {impossibleCount ? ` (${impossibleCount})` : ''}
            </button>
            <button className="round" onClick={save} aria-label="3D-Bild speichern" title="3D-Bild speichern">
              <I.ShareIcon />
            </button>
          </>
        )}
      </header>
      <div className="view3d-stage">
        <div className="view3d-canvas" ref={host} />
        {empty && <p className="view3d-msg">Hier ist noch nichts zu sehen. Setze Würfelplättchen, dann werden daraus Würfel.</p>}
        {failed && <p className="view3d-msg">Dieses Gerät kann leider keine 3D-Grafik anzeigen.</p>}
        {!empty && !failed && (
          <p className={'view3d-hint' + (build ? ' building' : '')}>
            {build
              ? 'Bauen: Würfelseite oder Boden antippen = neuer Würfel · lange drücken = wegnehmen'
              : 'Ein Finger dreht · zwei Finger zoomen' + (canFlip ? ' · Fläche oder gedrehtes Plättchen antippen: umklappen' : '')}
          </p>
        )}
      </div>
    </div>
  );
}

function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose?.();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    mats.forEach((x) => x.dispose());
  });
}

// ------------------------------------------------------------ scene

function buildScene(model: Model) {
  const group = new THREE.Group();
  const marked: { mats: THREE.Material[]; edges: THREE.LineBasicMaterial; stroke: THREE.Color; impossible: boolean }[] = [];

  const basic = (color: string) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color), polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const lineMat = (color: string | null) => new THREE.LineBasicMaterial({ color: new THREE.Color(color ?? '#4a3a2e'), transparent: true, opacity: color ? 1 : 0 });

  // Cubes: unlit colours, so the view "wie gezeichnet" looks exactly like the drawing.
  const box = new THREE.BoxGeometry(1, 1, 1);
  const boxEdges = new THREE.EdgesGeometry(box);
  for (const c of model.cubes) {
    // BoxGeometry face order: +x, −x, +y, −y, +z, −z  (three.js y = space Z, z = space Y).
    const mats = [c.colors.x, c.colors.x, c.colors.z, c.colors.z, c.colors.y, c.colors.y].map(basic);
    const mesh = new THREE.Mesh(box, mats);
    mesh.userData.solid = true;
    mesh.userData.cubeId = c.id;
    mesh.userData.cubeMin = c.min;
    if (c.turned) mesh.userData.turnedCube = c.id;
    const p = toThree([c.min[0] + 0.5, c.min[1] + 0.5, c.min[2] + 0.5]);
    mesh.position.copy(p);
    const edges = lineMat(c.stroke);
    const lines = new THREE.LineSegments(boxEdges, edges);
    lines.position.copy(p);
    group.add(mesh, lines);
    marked.push({ mats, edges, stroke: edges.color.clone(), impossible: c.impossible });
  }

  // Walls: thin prisms behind the drawn polygon.
  const THICK = 0.06;
  for (const w of model.walls) {
    const pts = w.pts.map(toThree);
    const back = toThree(w.back).multiplyScalar(THICK);
    if (w.kind === 'line') {
      const mat = basic(w.stroke ?? '#4a3a2e');
      const r = 0.03 + 0.03 * w.width;
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1];
        const d = pts[k].clone().sub(a);
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 8), mat);
        cyl.position.copy(a).addScaledVector(d, 0.5);
        cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
        cyl.userData.solid = true;
        if (w.flippable) cyl.userData.flipId = w.id;
        group.add(cyl);
      }
      marked.push({ mats: [mat], edges: lineMat(null), stroke: new THREE.Color(0), impossible: false });
      continue;
    }
    const geo = prism(pts, back);
    const mat = basic(w.fill ?? '#ffffff');
    mat.side = THREE.DoubleSide;
    if (!w.fill) {
      mat.transparent = true;
      mat.opacity = 0;
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.solid = true;
    if (w.flippable) mesh.userData.flipId = w.id;
    if (w.cornerOf) mesh.userData.cornerOf = w.cornerOf;
    const edges = lineMat(w.stroke);
    const lines = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), edges);
    group.add(mesh, lines);
    marked.push({ mats: [mat], edges, stroke: edges.color.clone(), impossible: w.impossible });
  }

  // Remember how everything looks unmarked.
  const base = marked.map((m) => ({ opacity: m.mats.map((x) => (x as THREE.MeshBasicMaterial).opacity), edge: m.edges.opacity }));

  /** Highlight the impossible parts: they keep their colours and get a bright edge, the rest fades. */
  const marks = (on: boolean) => {
    marked.forEach((m, k) => {
      const fade = on && !m.impossible;
      m.mats.forEach((x, i) => {
        const mm = x as THREE.MeshBasicMaterial;
        const o = base[k].opacity[i];
        mm.transparent = o < 1 || fade;
        mm.opacity = fade ? o * 0.15 : o;
        mm.depthWrite = !mm.transparent;
        mm.needsUpdate = true;
      });
      const hot = on && m.impossible;
      m.edges.color.copy(hot ? new THREE.Color(MARK) : m.stroke);
      m.edges.opacity = hot ? 1 : fade ? base[k].edge * 0.15 : base[k].edge;
    });
  };
  return { group, marks };
}

/** Thin prism: the polygon and a copy moved by `back`, with side walls. Works for concave polygons. */
function prism(pts: THREE.Vector3[], back: THREE.Vector3): THREE.BufferGeometry {
  const n = pts.length;
  // Plane basis for triangulation.
  const o = pts[0];
  const normal = new THREE.Vector3();
  for (let k = 0; k < n; k++) {
    const a = pts[k].clone().sub(o);
    const b = pts[(k + 1) % n].clone().sub(o);
    normal.add(a.cross(b));
  }
  if (normal.lengthSq() < 1e-12) normal.copy(back).negate();
  normal.normalize();
  const u = new THREE.Vector3().subVectors(pts[1], o).normalize();
  const v = new THREE.Vector3().crossVectors(normal, u);
  const flat = pts.map((p) => new THREE.Vector2(p.clone().sub(o).dot(u), p.clone().sub(o).dot(v)));
  const tris = THREE.ShapeUtils.triangulateShape(flat, []);
  const pos: number[] = [];
  const push = (p: THREE.Vector3) => pos.push(p.x, p.y, p.z);
  const backPts = pts.map((p) => p.clone().add(back));
  for (const [a, b, c] of tris) {
    push(pts[a]);
    push(pts[b]);
    push(pts[c]);
    push(backPts[a]);
    push(backPts[c]);
    push(backPts[b]);
  }
  for (let k = 0; k < n; k++) {
    const a = pts[k];
    const b = pts[(k + 1) % n];
    const a2 = backPts[k];
    const b2 = backPts[(k + 1) % n];
    push(a);
    push(a2);
    push(b);
    push(b);
    push(a2);
    push(b2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
