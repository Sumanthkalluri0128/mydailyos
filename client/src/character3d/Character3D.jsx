import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CHARACTER_MANIFEST } from './characterManifest';
import './character3d.css';

/** WebGL/Three.js rigged-model stage. Model assets are deliberately external files, not sticker fallbacks. */
export default function Character3D({ character = 'luffy', action = 'Idle', className = '', onAssetMissing }) {
  const hostRef = useRef(null);
  const [status, setStatus] = useState('loading');
  const cfg = CHARACTER_MANIFEST[character] || CHARACTER_MANIFEST.luffy;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    let alive = true, frame = 0, mixer = null, model = null, renderer = null;
    const scene = new THREE.Scene();
    scene.background = null;
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 1.35, 4.3);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3b4260, 2.0));
    const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(3, 5, 4); scene.add(key);
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      host.appendChild(renderer.domElement);
    } catch (err) { setStatus('webgl-unavailable'); return undefined; }
    const resize = () => { if (!alive) return; const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize); ro.observe(host); resize();
    new GLTFLoader().load(cfg.model, (gltf) => {
      if (!alive) return;
      model = gltf.scene; model.position.y = -1.05; model.scale.setScalar(1.55); scene.add(model);
      if (gltf.animations?.length) {
        mixer = new THREE.AnimationMixer(model);
        const normalized = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
        const clip = gltf.animations.find((a) => normalized(a.name) === normalized(action)) || gltf.animations.find((a) => normalized(a.name).includes(normalized(action))) || gltf.animations[0];
        if (clip) mixer.clipAction(clip).reset().play();
      }
      setStatus('ready');
    }, undefined, () => { if (alive) { setStatus('asset-missing'); onAssetMissing?.(character, cfg.model); } });
    const clock = new THREE.Clock();
    const render = () => { if (!alive) return; frame = requestAnimationFrame(render); const dt = Math.min(clock.getDelta(), 0.05); mixer?.update(dt); if (model && !mixer) model.rotation.y += dt * 0.18; renderer.render(scene, camera); };
    render();
    return () => { alive = false; cancelAnimationFrame(frame); ro.disconnect(); mixer?.stopAllAction(); renderer?.dispose(); if (renderer?.domElement.parentNode === host) host.removeChild(renderer.domElement); scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); }); };
  }, [cfg.model, character, action, onAssetMissing]);

  return <div className={`character3d ${className}`} ref={hostRef} data-character={character} data-status={status} aria-label={`${cfg.label}, ${action}`} role="img">
    {status !== 'ready' && <div className="character3d-status" aria-live="polite">{status === 'asset-missing' ? `${cfg.label} 3D model not installed` : status === 'webgl-unavailable' ? '3D graphics are unavailable on this device' : `Loading ${cfg.label}…`}</div>}
  </div>;
}
