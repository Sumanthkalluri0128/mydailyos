// Floating 3D Goku: a toon-shaded model that hovers in the corner and does workout moves.
// Click / tap to switch exercise. Hidden in calm mode or when the user prefers reduced motion.
// three.js is loaded lazily so it never slows the first paint.
import { useEffect, useRef, useState } from "react";

const EX = [
  { n: "Idle", T: 3 }, { n: "Squats", T: 1.6 }, { n: "Push-ups", T: 1.4 },
  { n: "Jumping jacks", T: 0.9 }, { n: "Shadow boxing", T: 0.6 }, { n: "Sword swing", T: 1.8 },
];
function pose(i, p) {
  const a = p * Math.PI * 2, t = { y: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, z: 0 };
  if (i === 1) { const d = (1 - Math.cos(a)) / 2; t.y = -d * 0.9; t.sy = 1 - d * 0.18; t.sx = 1 + d * 0.1; }
  if (i === 2) { const d = (1 - Math.cos(a)) / 2; t.rx = -1.35; t.y = -0.9 - d * 0.45; }
  if (i === 3) { const h = Math.abs(Math.sin(a / 2)); t.y = h * 0.8; t.sx = 1 + Math.sin(a) * 0.12; t.sy = 1 + h * 0.06; t.rz = Math.sin(a) * 0.06; }
  if (i === 4) { t.ry = Math.sin(a) * 0.55; t.z = Math.max(0, Math.sin(a)) * 0.7; t.rz = Math.sin(a) * 0.08; t.y = Math.abs(Math.sin(a)) * 0.08; }
  if (i === 5) { const e = Math.sin(a - Math.PI / 2) * 0.5 + 0.5; t.ry = e * Math.PI * 2; t.rz = Math.sin(a) * 0.25; t.z = Math.sin(a / 2) * 0.5; }
  return t;
}
const calm = () => document.documentElement.classList.contains("ff-calm") || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function FloatingAsta({ src = "/models/goku.glb", size = 240 }) {
  const box = useRef(null);
  const exRef = useRef(0);
  const [label, setLabel] = useState("Idle");
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (calm()) { setHidden(true); return; }
    let raf = 0, dead = false, cleanup = () => {};
    (async () => {
      const THREE = await import("three");
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      if (dead || !box.current) return;
      const el = box.current;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setSize(size, size);
      el.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 50); cam.position.set(0, 0.2, 9);
      scene.add(new THREE.AmbientLight(0xffffff, 0.9));
      const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(3, 4, 5); scene.add(key);
      const r1 = new THREE.DirectionalLight(0xff4d8d, 0.6); r1.position.set(-5, 2, -4); scene.add(r1);
      const r2 = new THREE.DirectionalLight(0x3de0ff, 0.6); r2.position.set(5, 1, -4); scene.add(r2);
      const fl = new THREE.Group(), ex = new THREE.Group(), model = new THREE.Group();
      scene.add(fl); fl.add(ex); ex.add(model);
      const grad = new THREE.DataTexture(new Uint8Array([70, 150, 255]), 3, 1, THREE.RedFormat);
      grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
      new GLTFLoader().load(src, (g) => {
        if (dead) return;
        g.scene.traverse((o) => { if (o.isMesh) {
          const m = o.material;
          if (m.name === "Power_Pole_Sheathed") { o.visible = false; return; } // keep only the extended staff
          o.material = new THREE.MeshToonMaterial({ color: m.color ? m.color.clone() : 0xffffff, map: m.map || null,
            vertexColors: !!o.geometry.attributes.color, gradientMap: grad, side: THREE.DoubleSide });
        } });
        model.add(g.scene);
        const b = new THREE.Box3().setFromObject(model), s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
        const k = 4 / s.y; model.scale.setScalar(k); model.position.set(-c.x * k, -c.y * k, -c.z * k);
      });
      const S = { y: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, z: 0 };
      let phase = 0, last = 0, lastEx = 0, t0 = performance.now();
      const loop = (now) => {
        raf = requestAnimationFrame(loop);
        if (document.hidden) { t0 = now; return; }
        const dt = Math.min((now - t0) / 1000, 0.05); t0 = now; const t = now / 1000;
        if (exRef.current !== lastEx) { lastEx = exRef.current; phase = 0; }
        const hover = Math.sin(t * 1.6) * 0.18;
        fl.position.y = hover; fl.rotation.y = Math.sin(t * 0.7) * 0.25; fl.rotation.z = Math.sin(t * 0.9) * 0.03;
        phase += dt / EX[lastEx].T;
        const tg = pose(lastEx, phase), kk = Math.min(1, dt * 10);
        for (const key2 in S) S[key2] += (tg[key2] - S[key2]) * kk;
        ex.position.set(0, S.y, S.z); ex.rotation.set(S.rx, S.ry, S.rz); ex.scale.set(S.sx, S.sy, S.sx);
        renderer.render(scene, cam);
      };
      raf = requestAnimationFrame(loop);
      cleanup = () => { cancelAnimationFrame(raf); renderer.dispose(); renderer.domElement.remove(); };
    })();
    return () => { dead = true; cancelAnimationFrame(raf); cleanup(); };
  }, [src, size]);

  if (hidden) return null;
  const next = () => { exRef.current = (exRef.current + 1) % EX.length; setLabel(EX[exRef.current].n); };
  return (
    <button type="button" className="fa-wrap" onClick={next} aria-label={`Goku: ${label}. Tap to change exercise`}
      style={{ width: size, height: size }}>
      <span ref={box} className="fa-canvas" />
      <span className="fa-tag">{label}</span>
    </button>
  );
}
