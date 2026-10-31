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
}

export default function View3D({ name, shapes, onClose }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const model = useMemo(() => buildModel(shapes), [shapes]);
  const [mark, setMark] = useState(false);
  const [failed, setFailed] = useState(false);
  const api = useRef<{ iso(): void; save(): void; setMark(on: boolean): void } | null>(null);
  const impossibleCount = model.cubes.filter((c) => c.impossible).length + model.walls.filter((w) => w.impossible).length;
  const empty = !model.cubes.length && !model.walls.length;

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
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    controls.minZoom = 0.2;
    controls.maxZoom = 8;

    const { group, marks } = buildScene(model);
    scene.add(group);

    // Frame the model: centre and size.
    const b = bounds(model)!;
    const centre = toThree([(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]);
    const radius = Math.max(1.5, toThree([b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]]).length() / 2);

    // Soft ground grid under everything.
    const size = Math.ceil(radius * 1.6) * 2 + 4;
    const ground = new THREE.GridHelper(size, size, 0xbcdcde, 0xd8ecec);
    ground.position.set(Math.round(centre.x), b.min[2] - 0.001, Math.round(centre.z));
    scene.add(ground);

    let view = { w: 1, h: 1 };
    const resize = () => {
      const r = el.getBoundingClientRect();
      view = { w: Math.max(1, r.width), h: Math.max(1, r.height) };
      renderer.setSize(view.w, view.h);
      const aspect = view.w / view.h;
      const half = radius * 0.8;
      camera.left = -half * Math.max(1, aspect);
      camera.right = half * Math.max(1, aspect);
      camera.top = half / Math.min(1, aspect);
      camera.bottom = -half / Math.min(1, aspect);
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    ro?.observe(el);

    controls.target.copy(centre);
    camera.position.copy(centre).addScaledVector(ISO_DIR, radius * 6);
    camera.up.set(0, 1, 0);
    camera.lookAt(centre);
    controls.update();

    // Smoothly turn the camera to a direction (and zoom/target).
    let anim: { from: THREE.Spherical; to: THREE.Spherical; z0: number; z1: number; t0: THREE.Vector3; t1: THREE.Vector3; start: number; dur: number } | null = null;
    const turnTo = (dir: THREE.Vector3, dur = 900, zoom = 1, target = centre) => {
      const from = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
      const to = new THREE.Spherical().setFromVector3(dir.clone().multiplyScalar(from.radius));
      // Shortest way around.
      while (to.theta - from.theta > Math.PI) to.theta -= 2 * Math.PI;
      while (from.theta - to.theta > Math.PI) to.theta += 2 * Math.PI;
      anim = { from, to, z0: camera.zoom, z1: zoom, t0: controls.target.clone(), t1: target.clone(), start: performance.now(), dur };
    };

    let raf = 0;
    const loop = (now: number) => {
      if (anim) {
        const k = Math.min(1, (now - anim.start) / anim.dur);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        const s = new THREE.Spherical(anim.from.radius, anim.from.phi + (anim.to.phi - anim.from.phi) * e, anim.from.theta + (anim.to.theta - anim.from.theta) * e);
        controls.target.lerpVectors(anim.t0, anim.t1, e);
        camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(s));
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

    // After opening: turn a little away from the drawing so you notice it is 3D.
    const reveal = setTimeout(() => turnTo(new THREE.Vector3(1.9, 1.15, 0.55).normalize(), 1400), 500);

    api.current = {
      iso: () => turnTo(ISO_DIR, 900, 1, centre),
      save: () => {
        renderer.render(scene, camera);
        renderer.domElement.toBlob((blob) => {
          if (!blob) return;
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = (name.replace(/[\\/:*?"<>|]+/g, '').trim() || 'Bild') + ' 3D.png';
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 10000);
        }, 'image/png');
      },
      setMark: (on) => marks(on),
    };

    return () => {
      clearTimeout(reveal);
      cancelAnimationFrame(raf);
      ro?.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        mats.forEach((x) => x.dispose());
      });
      renderer.dispose();
      renderer.domElement.remove();
      api.current = null;
    };
  }, [model, empty, name]);

  useEffect(() => api.current?.setMark(mark), [mark]);

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
            <button className="pill" onClick={() => api.current?.iso()} title="So drehen, wie es gezeichnet ist">
              <I.CubeIcon /> Wie gezeichnet
            </button>
            <button className={'pill' + (mark ? ' on' : '')} onClick={() => setMark(!mark)} disabled={!impossibleCount} title="Unmögliche Teile hervorheben: lose Rauten und Würfel, die nicht zusammenpassen">
              <I.MagicIcon /> Unmögliches{impossibleCount ? ` (${impossibleCount})` : ''}
            </button>
            <button className="round" onClick={() => api.current?.save()} aria-label="3D-Bild speichern" title="3D-Bild speichern">
              <I.ShareIcon />
            </button>
          </>
        )}
      </header>
      <div className="view3d-stage">
        <div className="view3d-canvas" ref={host} />
        {empty && <p className="view3d-msg">Hier ist noch nichts zu sehen. Setze Würfelplättchen, dann werden daraus Würfel.</p>}
        {failed && <p className="view3d-msg">Dieses Gerät kann leider keine 3D-Grafik anzeigen.</p>}
        {!empty && !failed && <p className="view3d-hint">Ein Finger dreht · zwei Finger zoomen</p>}
      </div>
    </div>
  );
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
