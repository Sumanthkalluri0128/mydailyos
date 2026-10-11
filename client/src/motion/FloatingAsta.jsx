// Floating 3D Goku: a toon-shaded model that hovers in the corner and does workout moves.
// Click / tap to switch exercise. Hidden in calm mode or when the user prefers reduced motion.
// three.js is loaded lazily so it never slows the first paint.
import { useEffect, useRef, useState } from "react";

const EX = [
  { n: "Idle", T: 3 }, { n: "Squats", T: 1.6 }, { n: "Push-ups", T: 1.4 },
  { n: "Jumping jacks", T: 0.9 }, { n: "Shadow boxing", T: 0.6 }, { n: "Sword swing", T: 1.8 },
];
// The rig is in the mesh's own Z-up space: he faces -y, his left is +x. Arms hang by rotating about y (left +, right -),
// swing forward about z (left -, right +); legs swing forward about x (negative) and the knee folds the other way.
const A = 1.25;
const PI2 = Math.PI * 2;
function pose(i, p) {
  const a = p * PI2, sn = Math.sin(a), d = (1 - Math.cos(a)) / 2;
  const R = { y: 0, rx: 0, ry: 0, rz: 0, z: 0 }; // whole-body transform
  const B = { Shoulder_L: [0, A, 0], Shoulder_R: [0, -A, 0] }; // bone name -> [rx, ry, rz]
  let hy = 0, hx = 0; // hips offset (up, forward-back) in mesh units
  if (i === 0) { B.Chest = [0.03 * Math.sin(a * 2), 0, 0]; B.Head = [0, 0, 0.12 * sn]; B.Shoulder_L = [0, A + 0.04 * sn, 0]; B.Shoulder_R = [0, -A - 0.04 * sn, 0]; }
  if (i === 1) {
    B.Hip_L = [-1.1 * d, 0, 0]; B.Hip_R = [-1.1 * d, 0, 0]; B.Knee_L = [2 * d, 0, 0]; B.Knee_R = [2 * d, 0, 0]; B.Ankle_L = [-0.9 * d, 0, 0]; B.Ankle_R = [-0.9 * d, 0, 0];
    B.Spine = [-0.25 * d, 0, 0]; B.Shoulder_L = [0, A * (1 - d), -1.45 * d]; B.Shoulder_R = [0, -A * (1 - d), 1.45 * d]; hy = -0.11 * d; hx = 0.03 * d;
  }
  if (i === 2) {
    R.rx = -1.35; R.y = -0.9 - d * 0.45; B.Shoulder_L = [0, 0, -1.5]; B.Shoulder_R = [0, 0, 1.5];
    B.Elbow_L = [0, 0, 0.5 * d]; B.Elbow_R = [0, 0, -0.5 * d]; B.Head = [0.3, 0, 0];
  }
  if (i === 3) {
    const h = Math.abs(Math.sin(a / 2)), s = (1 - Math.cos(a)) / 2; // s: 0 = feet together, arms down; 1 = feet apart, arms up
    B.Shoulder_L = [0, A - 2.75 * s, 0]; B.Shoulder_R = [0, -(A - 2.75 * s), 0]; B.Hip_L = [0, -0.5 * s, 0]; B.Hip_R = [0, 0.5 * s, 0];
    B.Knee_L = [0.25 * h, 0, 0]; B.Knee_R = [0.25 * h, 0, 0]; hy = h * 0.1; R.y = h * 0.1;
  }
  if (i === 4) {
    const pl = Math.max(0, sn), pr = Math.max(0, -sn);
    B.Shoulder_L = [0, 0.35, -(0.9 + 0.65 * pl)]; B.Shoulder_R = [0, -0.35, 0.9 + 0.65 * pr];
    B.Elbow_L = [0, 0, 0.9 * (1 - pl)]; B.Elbow_R = [0, 0, -0.9 * (1 - pr)];
    B.Spine = [0, 0, 0.35 * sn]; B.Head = [0, 0, -0.2 * sn];
    B.Hip_L = [-0.35, 0, 0]; B.Hip_R = [-0.35, 0, 0]; B.Knee_L = [0.7, 0, 0]; B.Knee_R = [0.7, 0, 0]; B.Ankle_L = [-0.35, 0, 0]; B.Ankle_R = [-0.35, 0, 0];
    hy = -0.04 + Math.abs(sn) * 0.012;
  }
  if (i === 5) {
    const e = Math.sin(a - Math.PI / 2) * 0.5 + 0.5; // 0 = staff raised overhead, 1 = staff chopped forward
    B.Shoulder_R = [0, -1.5 * (1 - e) - 0.2, 1.4 * e]; B.Shoulder_L = [0, A - 0.5 * (1 - e), -0.5 * e]; B.Spine = [0, 0, 0.6 * (e - 0.5)];
    B.Hip_L = [-0.3 * e, 0, 0]; B.Hip_R = [-0.3 * e, 0, 0]; B.Knee_L = [0.5 * e, 0, 0]; B.Knee_R = [0.5 * e, 0, 0]; B.Ankle_L = [-0.2 * e, 0, 0]; B.Ankle_R = [-0.2 * e, 0, 0]; hy = -0.05 * e;
    R.ry = (e - 0.5) * 0.5;
  }
  return { R, B, hy, hx };
}

// Fallback for models with no skeleton: move the whole figure instead of individual bones.
function bodyPose(i, p) {
  const a = p * PI2, t = { y: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, z: 0 };
  if (i === 1) { const d = (1 - Math.cos(a)) / 2; t.y = -d * 0.9; t.sy = 1 - d * 0.18; t.sx = 1 + d * 0.1; }
  if (i === 2) { const d = (1 - Math.cos(a)) / 2; t.rx = -1.35; t.y = -0.9 - d * 0.45; }
  if (i === 3) { const h = Math.abs(Math.sin(a / 2)); t.y = h * 0.8; t.sx = 1 + Math.sin(a) * 0.12; t.sy = 1 + h * 0.06; t.rz = Math.sin(a) * 0.06; }
  if (i === 4) { t.ry = Math.sin(a) * 0.55; t.z = Math.max(0, Math.sin(a)) * 0.7; t.rz = Math.sin(a) * 0.08; t.y = Math.abs(Math.sin(a)) * 0.08; }
  if (i === 5) { const e = Math.sin(a - Math.PI / 2) * 0.5 + 0.5; t.ry = e * PI2; t.rz = Math.sin(a) * 0.25; t.z = Math.sin(a / 2) * 0.5; }
  return t;
}

// ---- Add characters here. `rigged` models use bone animation; others fall back to whole-body motion. ----
export const CHARACTERS = [
  { id: "goku", name: "Kid Goku", src: "/models/goku-rigged.glb" },
  // { id: "asta", name: "Asta", src: "/models/asta.glb" },
];
const calm = () => document.documentElement.classList.contains("ff-calm") || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const store = { get: () => { try { return localStorage.getItem("ff-char"); } catch { return null; } }, set: (v) => { try { localStorage.setItem("ff-char", v); } catch {} } };

export default function FloatingAsta({ size = 240 }) {
  const box = useRef(null), exRef = useRef(0), fileRef = useRef(null);
  const [label, setLabel] = useState("Idle");
  const [hidden, setHidden] = useState(false);
  const [menu, setMenu] = useState(false);
  const [custom, setCustom] = useState([]); // user-uploaded models (this session only)
  const [active, setActive] = useState(() => store.get() || CHARACTERS[0].id);
  const all = [...CHARACTERS, ...custom];
  const cur = all.find((c) => c.id === active) || all[0];
  const src = cur.src;

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
      const bones = {}, hipsBase = new THREE.Vector3(), curB = {};
      let rigged = false;
      const fl = new THREE.Group(), ex = new THREE.Group(), model = new THREE.Group();
      scene.add(fl); fl.add(ex); ex.add(model);
      const grad = new THREE.DataTexture(new Uint8Array([70, 150, 255]), 3, 1, THREE.RedFormat);
      grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
      new GLTFLoader().load(src, (g) => {
        if (dead) return;
        g.scene.traverse((o) => {
          if (o.isBone) bones[o.name] = o;
          if (o.isMesh) {
            const m = o.material; o.frustumCulled = false;
            if (m.name === "Power_Pole_Sheathed") { o.visible = false; return; }
            o.material = new THREE.MeshToonMaterial({ color: m.color ? m.color.clone() : 0xffffff, map: m.map || null,
              vertexColors: !!o.geometry.attributes.color, gradientMap: grad, side: THREE.DoubleSide });
          }
        });
        rigged = !!bones.Hips && !!bones.Shoulder_L;
        if (bones.Hips) hipsBase.copy(bones.Hips.position);
        model.add(g.scene);
        if (!rigged) { // guess "up" for unrigged models: if depth is the longest side, assume Z-up
          const sz = new THREE.Box3().setFromObject(g.scene).getSize(new THREE.Vector3());
          if (sz.z > sz.y * 1.2 && sz.z > sz.x) model.rotation.x = -Math.PI / 2;
        }
        model.updateMatrixWorld(true);
        const b = new THREE.Box3().setFromObject(model), s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
        const k = 4 / s.y; model.scale.setScalar(k); model.position.set(-c.x * k, -c.y * k, -c.z * k);
      });
      const S = { y: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, z: 0 }; let hyS = 0, hxS = 0;
      let phase = 0, lastEx = 0, t0 = performance.now();
      const loop = (now) => {
        raf = requestAnimationFrame(loop);
        if (document.hidden) { t0 = now; return; }
        const dt = Math.min((now - t0) / 1000, 0.05); t0 = now; const t = now / 1000;
        if (exRef.current !== lastEx) { lastEx = exRef.current; phase = 0; }
        fl.position.y = Math.sin(t * 1.6) * 0.18; fl.rotation.y = Math.sin(t * 0.7) * 0.25; fl.rotation.z = Math.sin(t * 0.9) * 0.03;
        phase += dt / EX[lastEx].T;
        const kk = Math.min(1, dt * 10);
        if (rigged) {
          const P = pose(lastEx, phase);
          for (const key2 in S) S[key2] += ((P.R[key2] ?? (key2 === "sx" || key2 === "sy" ? 1 : 0)) - S[key2]) * kk;
          ex.position.set(0, S.y, S.z); ex.rotation.set(S.rx, S.ry, S.rz); ex.scale.set(1, 1, 1);
          for (const n in bones) {
            const c = curB[n] || (curB[n] = [0, 0, 0]), tgt = P.B[n] || [0, 0, 0];
            for (let q = 0; q < 3; q++) c[q] += (tgt[q] - c[q]) * kk;
            if (n !== "Hips") bones[n].rotation.set(c[0], c[1], c[2]);
          }
          hyS += (P.hy - hyS) * kk; hxS += (P.hx - hxS) * kk;
          if (bones.Hips) bones.Hips.position.set(hipsBase.x, hipsBase.y + hxS, hipsBase.z + hyS);
        } else {
          const tg = bodyPose(lastEx, phase);
          for (const key2 in S) S[key2] += (tg[key2] - S[key2]) * kk;
          ex.position.set(0, S.y, S.z); ex.rotation.set(S.rx, S.ry, S.rz); ex.scale.set(S.sx, S.sy, S.sx);
        }
        renderer.render(scene, cam);
      };
      raf = requestAnimationFrame(loop);
      cleanup = () => { cancelAnimationFrame(raf); renderer.dispose(); renderer.domElement.remove(); };
    })();
    return () => { dead = true; cancelAnimationFrame(raf); cleanup(); };
  }, [src, size]);

  useEffect(() => () => custom.forEach((c) => URL.revokeObjectURL(c.src)), []); // eslint-disable-line
  if (hidden) return null;
  const next = () => { exRef.current = (exRef.current + 1) % EX.length; setLabel(EX[exRef.current].n); };
  const pick = (id) => { setActive(id); if (!id.startsWith("custom-")) store.set(id); setMenu(false); };
  const onFile = (e) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    const id = "custom-" + Date.now();
    setCustom((c) => [...c, { id, name: f.name.replace(/\.(glb|gltf)$/i, ""), src: URL.createObjectURL(f) }]);
    setActive(id); setMenu(false);
  };
  return (
    <div className="fa-root" style={{ width: size, height: size }}>
      <button type="button" className="fa-wrap" onClick={next} aria-label={`${cur.name}: ${label}. Tap to change exercise`}>
        <span ref={box} className="fa-canvas" />
        <span className="fa-tag">{label}</span>
      </button>
      <button type="button" className="fa-swap" onClick={() => setMenu((m) => !m)} aria-label="Change character" aria-expanded={menu}>⇄</button>
      {menu && (
        <div className="fa-menu" role="menu">
          {all.map((c) => (
            <button key={c.id} type="button" role="menuitem" className={c.id === cur.id ? "on" : ""} onClick={() => pick(c.id)}>{c.name}</button>
          ))}
          <button type="button" role="menuitem" onClick={() => fileRef.current?.click()}>+ Add .glb</button>
        </div>
      )}
      <input ref={fileRef} type="file" accept=".glb,.gltf,model/gltf-binary" hidden onChange={onFile} />
    </div>
  );
}
