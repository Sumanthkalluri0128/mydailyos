import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CHARACTER_3D_MANIFEST, animateProceduralCharacter, buildProceduralCharacter } from './three/createCharacterScene';

/** Transparent real-time 3D character canvas. Uses an authorized GLB when present,
 * otherwise an articulated procedural 3D avatar while the asset is being supplied. */
export default function Character3D({ who, pose = 'idle', anim = 'idle', size = 96, active = true }) {
  const hostRef = useRef(null);
  const stateRef = useRef({ pose, anim });
  stateRef.current = { pose, anim };

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !active) return undefined;
    let disposed = false, frame = 0, parts = null, mixer = null, modelRoot = null, action = null;
    const manifest = CHARACTER_3D_MANIFEST[who] || CHARACTER_3D_MANIFEST.gojo;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 1.0, 3.8); camera.lookAt(0, 0.78, 0);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(size, size, false); renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0); renderer.shadowMap.enabled = true;
    host.replaceChildren(renderer.domElement);
    renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%'; renderer.domElement.style.display = 'block';
    scene.add(new THREE.HemisphereLight(0xe9f2ff, 0x343044, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 3.1); key.position.set(-3, 5, 5); key.castShadow = true; scene.add(key);
    const rim = new THREE.DirectionalLight(manifest.accent, 1.8); rim.position.set(3, 2, -3); scene.add(rim);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.65, 32), new THREE.MeshBasicMaterial({ color: 0x171827, transparent: true, opacity: 0.19, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = -0.49; scene.add(shadow);
    parts = buildProceduralCharacter(THREE, scene, who);
    // Preserve the model's animation clips in a closure because glTF scene nodes do not expose them.
    let clips = [];
    const start = performance.now(); let last = start, lastState = '';
    const resize = () => {
      const w = Math.max(1, host.clientWidth || size), h = Math.max(1, host.clientHeight || size);
      camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h, false);
    };
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null; observer?.observe(host);
    const tick = (now) => {
      if (disposed) return;
      frame = requestAnimationFrame(tick);
      const s = stateRef.current, key = `${s.anim}|${s.pose}`;
      if (key !== lastState) { lastState = key; if (parts) { /* procedural joints react directly to state */ } else if (mixer && modelRoot) {
        const name = `${s.anim} ${s.pose}`.toLowerCase();
        const chosen = clips.find((c) => name.split(/\s+/).some((word) => c.name.toLowerCase().includes(word))) || clips.find((c) => /idle|stand/i.test(c.name)) || clips[0];
        if (chosen && action?.getClip() !== chosen) { action?.fadeOut(0.12); action = mixer.clipAction(chosen); action.reset().fadeIn(0.12).play(); }
      } }
      const elapsed = (now - start) / 1000;
      if (parts) animateProceduralCharacter(parts, s.anim, s.pose, elapsed);
      if (mixer) mixer.update(Math.min(0.05, (now - last) / 1000));
      if (modelRoot) { modelRoot.rotation.y = Math.sin(elapsed * 0.35) * 0.05; }
      last = now; renderer.render(scene, camera);
    };
    // Load GLB once, retaining its animation clips and replacing the procedural fallback on success.
    const loader = new GLTFLoader();
    loader.load(`${import.meta.env.BASE_URL}${manifest.model}`, (gltf) => {
      if (disposed) return;
      clips = gltf.animations || [];
      if (parts?.root) scene.remove(parts.root);
      parts = null; modelRoot = gltf.scene; modelRoot.position.set(0, -0.5, 0); modelRoot.scale.setScalar(1);
      modelRoot.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); scene.add(modelRoot);
      if (clips.length) { mixer = new THREE.AnimationMixer(modelRoot); const s = stateRef.current; const query = `${s.anim} ${s.pose}`.toLowerCase(); const clip = clips.find((c) => query.split(/\s+/).some((word) => c.name.toLowerCase().includes(word))) || clips.find((c) => /idle|stand/i.test(c.name)) || clips[0]; if (clip) { action = mixer.clipAction(clip); action.play(); } }
    }, undefined, () => {});
    frame = requestAnimationFrame(tick);
    return () => { disposed = true; cancelAnimationFrame(frame); observer?.disconnect(); mixer?.stopAllAction(); renderer.dispose(); scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => m.dispose()); } }); host.replaceChildren(); };
  }, [who, size, active]);

  return <span ref={hostRef} className="rm-3d-host" aria-label={`${CHARACTER_3D_MANIFEST[who]?.label || who} 3D character`} style={{ display: active ? 'block' : 'none', width: size, height: size, pointerEvents: 'none' }} />;
}
