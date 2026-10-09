/*
 * Procedural 3D avatar fallback for FlexFit.
 * These are original, stylized training avatars (not exact licensed character models).
 * Drop authorized rigged GLB files into public/chars3d/<id>.glb to use the real models.
 */
export const CHARACTER_3D_MANIFEST = {
  luffy: { label: 'Luffy', outfit: '#c93435', pants: '#315a9a', hair: '#241b17', accent: '#d9a34a', model: 'chars3d/luffy.glb' },
  naruto: { label: 'Naruto', outfit: '#f07822', pants: '#263d71', hair: '#f5b62b', accent: '#e94c42', model: 'chars3d/naruto.glb' },
  asta: { label: 'Asta', outfit: '#25252b', pants: '#25252b', hair: '#f2f0e9', accent: '#c72d35', model: 'chars3d/asta.glb' },
  gojo: { label: 'Gojo', outfit: '#171a2e', pants: '#171a2e', hair: '#e7e6f4', accent: '#7c5cff', model: 'chars3d/gojo.glb' },
  zoro: { label: 'Zoro', outfit: '#2b7252', pants: '#343a42', hair: '#62b879', accent: '#d2d7dd', model: 'chars3d/zoro.glb' },
  jinwoo: { label: 'Sung Jin-Woo', outfit: '#202234', pants: '#171923', hair: '#171923', accent: '#8b5cf6', model: 'chars3d/jinwoo.glb' },
  goku: { label: 'Goku', outfit: '#dd7130', pants: '#345a9d', hair: '#201a18', accent: '#f2c84b', model: 'chars3d/goku.glb' },
};
const mat = (THREE, color, roughness = 0.68, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
function ball(THREE, parent, material, pos, scale, segments = 16) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, segments, Math.max(8, segments >> 1)), material);
  mesh.position.set(...pos); mesh.scale.set(...scale); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function limb(THREE, parent, material, topRadius, bottomRadius, length, pos) {
  const pivot = new THREE.Group(); pivot.position.set(...pos); parent.add(pivot);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(bottomRadius, topRadius, length, 12), material);
  mesh.position.y = -length / 2; mesh.castShadow = true; mesh.receiveShadow = true; pivot.add(mesh);
  ball(THREE, pivot, material, [0, 0, 0], [topRadius * 1.12, topRadius * 1.12, topRadius * 1.12], 12);
  return pivot;
}
export function buildProceduralCharacter(THREE, scene, who = 'gojo') {
  const c = CHARACTER_3D_MANIFEST[who] || CHARACTER_3D_MANIFEST.gojo;
  const root = new THREE.Group(); root.name = `flexfit-${who}-procedural-3d`;
  const skin = mat(THREE, '#e8b18a');
  const outfit = mat(THREE, c.outfit); const pants = mat(THREE, c.pants); const hair = mat(THREE, c.hair); const accent = mat(THREE, c.accent, 0.35, 0.08);
  const dark = mat(THREE, '#24242b'); const white = mat(THREE, '#f5f6fa');
  const torso = new THREE.Group(); torso.position.y = 1.82; root.add(torso);
  ball(THREE, torso, outfit, [0, 0, 0], [0.36, 0.48, 0.23]);
  ball(THREE, torso, accent, [0, 0.04, 0.232], [0.055, 0.30, 0.025], 12);
  const head = new THREE.Group(); head.position.set(0, 0.66, 0); torso.add(head);
  ball(THREE, head, skin, [0, 0, 0], [0.265, 0.30, 0.235], 20);
  ball(THREE, head, hair, [0, 0.20, -0.005], [0.275, 0.16, 0.245], 16);
  // Hair tufts give the fallback model a sculpted silhouette rather than a flat sticker.
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2;
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.19 + (i % 3) * 0.025, 7), hair);
    tuft.position.set(Math.cos(angle) * 0.19, 0.28 + (i % 2) * 0.035, Math.sin(angle) * 0.13);
    tuft.rotation.z = Math.cos(angle) * 0.55; tuft.rotation.x = Math.sin(angle) * 0.45; tuft.castShadow = true; head.add(tuft);
  }
  // Eyes, brows and mouth are 3D details on the face, not an image texture.
  for (const side of [-1, 1]) {
    ball(THREE, head, white, [side * 0.092, -0.025, 0.208], [0.052, 0.033, 0.018], 12);
    ball(THREE, head, dark, [side * 0.092, -0.027, 0.226], [0.021, 0.027, 0.012], 10);
    const brow = ball(THREE, head, hair, [side * 0.092, 0.035, 0.211], [0.057, 0.012, 0.012], 10); brow.rotation.z = side * -0.1;
  }
  ball(THREE, head, dark, [0, -0.105, 0.224], [0.043, 0.012, 0.012], 10);
  const leftArm = limb(THREE, torso, skin, 0.11, 0.075, 0.42, [-0.42, 0.25, 0]);
  const rightArm = limb(THREE, torso, skin, 0.11, 0.075, 0.42, [0.42, 0.25, 0]);
  const leftForearm = limb(THREE, leftArm, outfit, 0.075, 0.055, 0.34, [0, -0.39, 0]);
  const rightForearm = limb(THREE, rightArm, outfit, 0.075, 0.055, 0.34, [0, -0.39, 0]);
  const leftLeg = limb(THREE, root, pants, 0.13, 0.085, 0.49, [-0.18, 1.10, 0]);
  const rightLeg = limb(THREE, root, pants, 0.13, 0.085, 0.49, [0.18, 1.10, 0]);
  for (const [x, leg] of [[-0.18, leftLeg], [0.18, rightLeg]]) {
    ball(THREE, leg, dark, [0, -0.29, 0.09], [0.14, 0.07, 0.22], 12);
  }
  // Character-specific silhouette accents; the GLB replacement supplies canonical detail.
  if (who === 'luffy') {
    const brim = ball(THREE, head, accent, [0, 0.16, 0.07], [0.34, 0.055, 0.30]); brim.position.y = 0.16;
    ball(THREE, head, mat(THREE, '#b82b25'), [0, 0.13, -0.015], [0.26, 0.045, 0.23]);
  } else if (who === 'naruto') {
    const band = ball(THREE, head, dark, [0, 0.12, 0.16], [0.28, 0.055, 0.12]);
    ball(THREE, head, accent, [0, 0.12, 0.27], [0.12, 0.05, 0.025]);
  } else if (who === 'asta') {
    const band = ball(THREE, head, accent, [0, 0.12, 0.17], [0.29, 0.065, 0.10]);
    const emblem = ball(THREE, torso, accent, [0, 0.12, 0.25], [0.11, 0.12, 0.025]);
  } else if (who === 'gojo') {
    const blindfold = ball(THREE, head, dark, [0, -0.015, 0.205], [0.255, 0.07, 0.065]);
  } else if (who === 'zoro') {
    ball(THREE, head, accent, [0, -0.10, 0.21], [0.27, 0.045, 0.055]);
    // A sheathed sword silhouette is parented to the torso and moves with it.
    const sword = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.86, 0.06), mat(THREE, '#b9c4d3', 0.25, 0.6)); sword.position.set(0.45, -0.15, -0.20); sword.rotation.z = -0.42; torso.add(sword);
  } else if (who === 'jinwoo') {
    const coat = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.75, 4), mat(THREE, '#151725')); coat.position.set(0, -0.35, -0.02); coat.rotation.y = Math.PI / 4; torso.add(coat);
    ball(THREE, torso, accent, [0.22, -0.06, 0.20], [0.045, 0.045, 0.035]);
  }
  const parts = { root, torso, head, leftArm, rightArm, leftForearm, rightForearm, leftLeg, rightLeg, who };
  root.scale.setScalar(0.94); root.position.y = -0.5; scene.add(root);
  return parts;
}
export function animateProceduralCharacter(parts, anim = 'idle', pose = 'idle', t = 0) {
  const walk = anim === 'walk' || pose === 'walk' || pose === 'run' || pose === 'climb' || anim === 'dash';
  const fast = pose === 'run' || anim === 'dash';
  const rate = fast ? 11.5 : 6.4; const swing = walk ? Math.sin(t * rate) : 0;
  parts.leftLeg.rotation.x = swing * (walk ? 0.62 : 0.02);
  parts.rightLeg.rotation.x = -swing * (walk ? 0.62 : 0.02);
  parts.leftArm.rotation.x = -swing * (walk ? 0.52 : 0.08);
  parts.rightArm.rotation.x = swing * (walk ? 0.52 : 0.08);
  parts.leftForearm.rotation.x = walk ? -0.18 : 0.02;
  parts.rightForearm.rotation.x = walk ? -0.18 : 0.02;
  parts.root.position.y = -0.5 + (walk ? Math.abs(Math.sin(t * rate * 2)) * 0.045 : Math.sin(t * 2.2) * 0.025);
  parts.root.rotation.y = walk ? Math.sin(t * rate) * 0.10 : Math.sin(t * 0.55) * 0.06;
  parts.torso.rotation.x = 0; parts.torso.rotation.z = 0; parts.head.rotation.x = 0;
  if (anim === 'dance' || pose === 'dance' || pose === 'victory' || pose === 'cheer') {
    parts.leftArm.rotation.z = 0.8 + Math.sin(t * 7) * 0.3; parts.rightArm.rotation.z = -0.8 - Math.sin(t * 7) * 0.3;
    parts.root.rotation.z = Math.sin(t * 7) * 0.13;
  } else if (anim === 'lunge' || anim === 'shake' || pose === 'fight' || anim === 'dash') {
    parts.leftArm.rotation.x = -1.15 + Math.sin(t * 15) * 0.18; parts.rightArm.rotation.x = -1.05 - Math.sin(t * 15) * 0.18;
    parts.torso.rotation.z = Math.sin(t * 13) * 0.08;
  } else if (pose === 'pushup' || anim === 'press') {
    parts.torso.rotation.x = 0.9 + Math.sin(t * 3) * 0.18; parts.leftArm.rotation.x = -0.65; parts.rightArm.rotation.x = -0.65;
  } else if (pose === 'squat' || anim === 'squat') {
    parts.root.position.y -= 0.14 + Math.max(0, Math.sin(t * 2.5)) * 0.10;
    parts.leftLeg.rotation.x = -0.5; parts.rightLeg.rotation.x = -0.5;
  } else if (pose === 'climb' || anim === 'climb') {
    parts.leftArm.rotation.x = -1.9 + Math.sin(t * 5) * 0.5; parts.rightArm.rotation.x = -1.9 - Math.sin(t * 5) * 0.5;
  } else {
    parts.leftArm.rotation.z = 0; parts.rightArm.rotation.z = 0; parts.root.rotation.z = 0;
  }
}
