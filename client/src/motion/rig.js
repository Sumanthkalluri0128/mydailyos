/* AnimeRig - skeletal IK rig. Hips -> torso -> head, shoulders -> 2-bone arms, hips -> 2-bone legs.
   Hands/feet are PINNED to bars, ropes, floor, holds (IK), so the whole body moves with them.
   AnimeRig.render(who, activity, t) -> SVG markup string.  AnimeRig.ACTS / CHARS list everything. */
/* eslint-disable */
const G = 172, D = Math.PI / 180, S = Math.sin, C = Math.cos;
const A1 = 22, A2 = 21, L1 = 25, L2 = 23, TOR = 32, NECK = 24;
const rot = (a, [x, y]) => [x * C(a * D) - y * S(a * D), x * S(a * D) + y * C(a * D)];
const add = (p, q) => [p[0] + q[0], p[1] + q[1]];
const lerp = (a, b, u) => a + (b - a) * u;
const sm = (u) => u * u * (3 - 2 * u);
const wave = (t, f) => (1 - C(t * f)) / 2;
const f1 = (n) => n.toFixed(1);
const pt = (p) => f1(p[0]) + "," + f1(p[1]);

function ik(a, b, l1, l2, dir) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  let d = Math.hypot(dx, dy) || 0.01;
  const dc = Math.min(Math.max(d, Math.abs(l1 - l2) + 0.5), l1 + l2 - 0.2), ang = Math.atan2(dy, dx);
  const cs = Math.max(-1, Math.min(1, (l1 * l1 + dc * dc - l2 * l2) / (2 * l1 * dc)));
  const a1 = Math.acos(cs) * dir;
  const el = [a[0] + l1 * Math.cos(ang + a1), a[1] + l1 * Math.sin(ang + a1)];
  const end = [a[0] + dc * Math.cos(ang), a[1] + dc * Math.sin(ang)];
  return [el, end];
}

const CHARS = {
  jinwoo: { n: "Jin-Woo", skin: "#ffe0c4", hair: "#16151f", suit: "#2a2a3a", pants: "#1b1b26", shoe: "#0d0d12", acc: "#8b6cff", bg: ["#2b1e5c", "#6d3bd8"], sp: [7, 9] },
  naruto: { n: "Naruto", skin: "#ffd7b0", hair: "#ffd23a", suit: "#ff8a1f", pants: "#ff7a10", shoe: "#2a3b8f", acc: "#2a52d9", bg: ["#ff9f1c", "#ffd36a"], sp: [9, 15], band: "#2a52d9", whisk: 1 },
  luffy: { n: "Luffy", skin: "#ffd7b0", hair: "#1a1a1f", suit: "#e8302e", pants: "#2a63c9", shoe: "#8a5a2b", acc: "#f3d27a", bg: ["#ff5a5a", "#ffa08b"], sp: [5, 5], hat: 1, scar: 1 },
  zoro: { n: "Zoro", skin: "#f0c9a0", hair: "#3fbf5a", suit: "#1f3a2a", pants: "#1a2a20", shoe: "#111", acc: "#d4a73a", bg: ["#16a34a", "#7ee8a8"], sp: [8, 9], ear: 1 },
  goku: { n: "Goku", skin: "#ffd9b8", hair: "#14121a", suit: "#ff7a00", pants: "#ff7a00", shoe: "#2a5ad9", acc: "#2a5ad9", bg: ["#ff8a00", "#ffd166"], sp: [7, 18] },
  gojo: { n: "Gojo", skin: "#ffe5d0", hair: "#f2f2ff", suit: "#1d1d2b", pants: "#1d1d2b", shoe: "#0c0c12", acc: "#7dd3fc", bg: ["#3b2bb5", "#9a8bff"], sp: [9, 13], blind: 1 },
};

/* ---------- activities: return a pose. hands(Sl,Sr,Sc,Head) / feet(Hl,Hr) give pinned targets ---------- */
const ACTS = {
  idle: { label: "idle", fn: (t) => { const b = S(t * 2.2); return { hip: [100, 122 + b * 0.8], lean: S(t) * 1.2, head: S(t * 0.9) * 3, face: "open",
    hands: (l, r) => [[l[0] - 5, l[1] + 36 + b], [r[0] + 5, r[1] + 36 + b]], feet: () => [[92, G], [108, G]] }; } },

  pushup: { label: "push up", fn: (t) => { const u = wave(t, 3.2), th = lerp(10, 30, u) * D, F = [44, G - 4];
    const hip = [F[0] + 46 * Math.cos(th), F[1] - 46 * Math.sin(th)];
    return { hip, lean: 90 - th / D, head: 55 - (90 - th / D), look: 1, sw: 2, hw: 2, face: u < 0.3 ? "strain" : "open", ad: [1, 1], kd: [-1, -1],
      hands: (l, r) => [[l[0] + 5, G - 3], [r[0] + 13, G - 3]], feet: () => [F, [F[0] - 3, F[1] + 1]],
      back: () => `<line x1="10" y1="${G + 3}" x2="190" y2="${G + 3}" stroke="#0003" stroke-width="3" stroke-linecap="round"/>` }; } },

  pullup: { label: "pull up", fn: (t) => { const u = wave(t, 2.4), hy = lerp(128, 90, u), by = 60;
    return { hip: [100 + S(t * 1.2) * 1.5, hy], lean: S(t * 2.4) * 1.5, face: u > 0.55 ? "strain" : "open", kd: [1, -1],
      hands: () => [[76, by], [124, by]], feet: () => [[96 + 4 * S(t * 2.4), hy + 41], [104 - 4 * S(t * 2.4), hy + 40]],
      back: () => `<rect x="12" y="${by - 3}" width="176" height="6" rx="3" fill="#cfd4e6"/><rect x="14" y="${by}" width="5" height="${G - by}" fill="#aab1c8"/><rect x="181" y="${by}" width="5" height="${G - by}" fill="#aab1c8"/>` }; } },

  rope: { label: "rope climb", fn: (t) => { const T = 1.8, ph = (t / T) % 1, a = ph * 2 * Math.PI, rel = (u) => (u < 0.5 ? lerp(-36, -8, u * 2) : lerp(-8, -36, sm((u - 0.5) * 2)));
    const hip = [100, 120 + 2 * S(a * 2)], sy = hip[1] - TOR;
    return { hip, lean: 5 * S(a), head: -3 * S(a), face: "strain", kd: [1, -1],
      hands: () => [[98, sy + rel(ph)], [102, sy + rel((ph + 0.5) % 1)]], feet: () => [[96, hip[1] + 36 + 7 * S(a)], [104, hip[1] + 36 - 7 * S(a)]],
      back: () => `<rect x="86" y="0" width="28" height="7" rx="3" fill="#8a93b2"/><line x1="100" y1="6" x2="100" y2="190" stroke="#b98a52" stroke-width="7"/><line x1="100" y1="6" x2="100" y2="190" stroke="#6b4a24" stroke-width="7" stroke-dasharray="3 25" stroke-dashoffset="${f1(-ph * 56)}"/>` }; } },

  climb: { label: "climb", fn: (t) => { const T = 2, ph = (t / T) % 1, a = ph * 2 * Math.PI, rel = (u) => (u < 0.5 ? lerp(-36, -6, u * 2) : lerp(-6, -36, sm((u - 0.5) * 2)));
    const hip = [100, 120 + 2 * S(a * 2)], sy = hip[1] - TOR, off = (ph * 60) % 30;
    let holds = ""; for (let y = -30; y < 200; y += 30) for (const x of [64, 92, 120, 148]) { const yy = y + off + (x % 56 ? 0 : 15); holds += `<ellipse cx="${x + 4}" cy="${f1(yy)}" rx="6" ry="4" fill="#fff6"/>`; }
    return { hip, lean: 4 * S(a), face: "strain", kd: [1, -1],
      hands: () => [[84, sy + rel(ph)], [116, sy + rel((ph + 0.5) % 1)]], feet: () => [[90, hip[1] + 36 + 6 * S(a)], [110, hip[1] + 36 - 6 * S(a)]],
      back: () => `<rect x="46" y="0" width="108" height="${G + 4}" rx="10" fill="#6b4f7a"/><rect x="46" y="0" width="108" height="${G + 4}" rx="10" fill="none" stroke="#fff3" stroke-width="2"/>${holds}` }; } },

  lift: { label: "lift", fn: (t) => { const p = wave(t, 2.8); const hip = [100, 122 + 20 * p];
    return { hip, lean: 8 * p, face: p > 0.4 ? "strain" : "open", kd: [1, -1],
      hands: (l, r) => [[l[0] - 4, l[1] - 6 - 40 * (1 - p)], [r[0] + 4, r[1] - 6 - 40 * (1 - p)]], feet: () => [[80, G], [120, G]],
      front: (c) => [c.hl, c.hr].map((h) => `<rect x="${h[0] - 13}" y="${h[1] - 2}" width="26" height="4" fill="#9aa2bd"/><rect x="${h[0] - 17}" y="${h[1] - 8}" width="7" height="16" rx="2" fill="#4b5170"/><rect x="${h[0] + 10}" y="${h[1] - 8}" width="7" height="16" rx="2" fill="#4b5170"/>`).join("") }; } },

  run: { label: "run", fn: (t) => { const f = t * 9, hip = [100, 131 - 5 * Math.abs(S(f))];
    const ft = (ph) => [100 + 22 * C(ph), G - 16 * Math.max(0, -S(ph))];
    return { hip, lean: 14, head: -6, look: 1, sw: 2, hw: 2, face: "open", ad: [1, 1], kd: [-1, -1],
      hands: (l) => [[l[0] + 20 * C(f + Math.PI), l[1] + 16 + 4 * S(f)], [l[0] + 20 * C(f), l[1] + 16 - 4 * S(f)]],
      feet: () => [ft(f), ft(f + Math.PI)],
      back: () => { const o = f1((t * 120) % 40); return `<line x1="0" y1="${G + 3}" x2="200" y2="${G + 3}" stroke="#fff6" stroke-width="3" stroke-dasharray="14 26" stroke-dashoffset="${o}"/><g stroke="#fff8" stroke-width="3" stroke-linecap="round"><line x1="14" y1="96" x2="40" y2="96"/><line x1="22" y1="112" x2="52" y2="112"/></g>`; } }; } },

  hike: { label: "hike", fn: (t) => { const f = t * 4.4, hip = [100, 128 - 2.5 * Math.abs(S(f))];
    const ft = (ph) => [100 + 17 * C(ph), G - 11 * Math.max(0, -S(ph))];
    return { hip, lean: 7, look: 1, sw: 2, hw: 2, face: "smile", ad: [1, 1], kd: [-1, -1],
      hands: (l) => [[l[0] + 14 * C(f + Math.PI), l[1] + 30], [l[0] + 22 + 4 * C(f), l[1] + 32]], feet: () => [ft(f), ft(f + Math.PI)],
      back: (c) => `<path d="M0 ${G} L40 112 L72 150 L100 96 L140 150 L170 120 L200 ${G}Z" fill="#fff3"/><line x1="${f1(c.hr[0])}" y1="${f1(c.hr[1])}" x2="${f1(c.hr[0] + 8)}" y2="${G}" stroke="#6b4a24" stroke-width="3" stroke-linecap="round"/><rect x="${f1(c.Sc[0] - 22)}" y="${f1(c.Sc[1] - 6)}" width="17" height="30" rx="6" fill="${c.ch.acc}" transform="rotate(7 ${f1(c.Sc[0])} ${f1(c.Sc[1])})"/>` }; } },

  stretch: { label: "stretch", fn: (t) => { const lean = 24 * S(t * 1.6), hip = [100 - lean * 0.45, 122];
    return { hip, lean, head: lean * 0.3, face: "smile", kd: [1, -1],
      hands: (l, r, sc) => { const d = rot(lean * 1.15, [0, -46]); return [[sc[0] + d[0] - 4, sc[1] + d[1]], [sc[0] + d[0] + 4, sc[1] + d[1]]]; }, feet: () => [[82, G], [118, G]] }; } },

  situp: { label: "sit up", fn: (t) => { const u = wave(t, 3), hip = [124, G - 12], lean = lerp(-88, -12, u);
    return { hip, lean, head: -4, look: -1, sw: 3, face: u > 0.6 ? "strain" : "open", ad: [1, 1], kd: [-1, -1],
      hands: (l, r, sc, hd) => [[hd[0] + 3, hd[1] - 4], [hd[0] + 7, hd[1] - 2]], feet: () => [[152, G], [158, G]],
      back: () => `<rect x="10" y="${G - 2}" width="180" height="9" rx="4" fill="#0002"/><rect x="22" y="${G - 6}" width="130" height="7" rx="3" fill="${"#ffffff55"}"/>` }; } },

  meditate: { label: "meditate", fn: (t) => { const fl = 6 * (1 + S(t * 1.2)) / 2, hip = [100, 150 - fl];
    return { hip, lean: 0, face: "calm", kd: [1, -1],
      hands: (l, r) => [[l[0] - 4, hip[1] + 4], [r[0] + 4, hip[1] + 4]], feet: () => [[86, hip[1] + 12], [114, hip[1] + 12]],
      back: (c) => `<circle cx="100" cy="100" r="${f1(56 + 5 * S(t * 2))}" fill="${c.ch.acc}" opacity=".22"/><circle cx="100" cy="100" r="${f1(40 + 4 * S(t * 2 + 1))}" fill="#fff" opacity=".16"/><ellipse cx="100" cy="${G}" rx="46" ry="6" fill="#0003"/>` }; } },

  sleep: { label: "sleep", fn: (t) => { const b = S(t * 1.6) * 1.3, hip = [124, G - 12 + b];
    return { hip, lean: -90, head: 0, sw: 3, face: "sleep", ad: [1, 1], kd: [-1, -1],
      hands: (l, r, sc) => [[sc[0] + 12, sc[1] + 6 + b], [sc[0] + 18, sc[1] + 7 + b]], feet: () => [[168, G - 4], [171, G - 3]],
      back: () => `<rect x="14" y="${G - 14}" width="176" height="20" rx="10" fill="#fff3"/><rect x="38" y="${G - 24}" width="30" height="14" rx="7" fill="#fff"/>`,
      front: () => [0, 1, 2].map((i) => { const k = ((t * 0.5 + i / 3) % 1); return `<text x="${f1(52 + k * 24)}" y="${f1(110 - k * 50)}" font-size="${f1(10 + k * 12)}" font-weight="900" fill="#fff" opacity="${f1(1 - k)}">Z</text>`; }).join("") }; } },

  drink: { label: "drink", fn: (t) => { const u = sm(wave(t, 2)); 
    return { hip: [100, 122], lean: 0, head: -14 * u, face: u > 0.5 ? "happy" : "open", kd: [1, -1],
      hands: (l, r, sc, hd) => [[l[0] - 8, l[1] + 18], [lerp(r[0] + 12, hd[0] + 9, u), lerp(r[1] + 26, hd[1] + 14, u)]], feet: () => [[90, G], [110, G]],
      front: (c) => { const h = c.hr, a = lerp(0, -118, u); return `<g transform="translate(${pt(h)}) rotate(${f1(a)})"><rect x="-6" y="-14" width="12" height="24" rx="4" fill="#bfe9ff" stroke="#fff" stroke-width="1.5"/><rect x="-6" y="${f1(-4 + 8 * u)}" width="12" height="${f1(14 - 8 * u)}" rx="3" fill="#38bdf8"/><rect x="-3.5" y="-18" width="7" height="5" rx="2" fill="#fff"/></g>`; } }; } },

  eat: { label: "eat", fn: (t) => { const u = sm(wave(t, 4)), ch = Math.round(t * 4) % 2;
    return { hip: [100, 124 + 1.5 * S(t * 8)], lean: 2, head: 7 * u, face: u > 0.7 ? "chew" + ch : "happy", kd: [1, -1],
      hands: (l, r, sc, hd) => [[l[0] + 4, l[1] + 26], [lerp(r[0] + 12, hd[0] + 3, u), lerp(r[1] + 24, hd[1] + 14, u)]], feet: () => [[90, G], [110, G]],
      front: (c) => { const h = c.hl, r = c.hr; return `<path d="M${f1(h[0] - 14)} ${f1(h[1] - 3)} h28 a14 12 0 0 1 -28 0z" fill="#fff" stroke="#e6a35a" stroke-width="2"/><ellipse cx="${f1(h[0])}" cy="${f1(h[1] - 3)}" rx="13" ry="3.5" fill="#fff4cf"/><line x1="${f1(r[0] - 2)}" y1="${f1(r[1] + 3)}" x2="${f1(r[0] + 7)}" y2="${f1(r[1] - 15)}" stroke="#8a5a2b" stroke-width="2"/><line x1="${f1(r[0] + 1)}" y1="${f1(r[1] + 3)}" x2="${f1(r[0] + 10)}" y2="${f1(r[1] - 14)}" stroke="#8a5a2b" stroke-width="2"/>`; } }; } },

  study: { label: "study", fn: (t) => { const wr = S(t * 7) * 1.5;
    return { hip: [100, 140], lean: 6, head: 10 + S(t * 1.3) * 3, gaze: 3, face: "open", kd: [1, -1],
      hands: () => [[84, 139], [112 + wr, 138 + wr * 0.4]], feet: () => [[92, G], [110, G]],
      back: () => `<rect x="70" y="148" width="60" height="6" rx="2" fill="#0003"/><rect x="78" y="150" width="6" height="${G - 150}" fill="#0003"/><rect x="116" y="150" width="6" height="${G - 150}" fill="#0003"/>`,
      front: () => { const fl = (t % 3) / 3; return `<rect x="36" y="144" width="128" height="8" rx="3" fill="#c28a4a"/><rect x="40" y="152" width="6" height="${G - 152}" fill="#a06f36"/><rect x="154" y="152" width="6" height="${G - 152}" fill="#a06f36"/><path d="M68 144 l32 -9 l32 9 l-32 5z" fill="#fff" stroke="#c9ccdf"/><path d="M100 135 v14" stroke="#c9ccdf" stroke-width="2"/><path d="M${f1(100 + 30 * (1 - fl))} ${f1(143 - 6 * fl)} l-30 0" stroke="#e5e7f5" stroke-width="1" opacity="${fl > 0.8 ? 1 : 0}"/>`; } }; } },

  jump: { label: "jump", fn: (t) => { const c = (t * 1.9) % 1; let y = 122, air = 0;
    if (c < 0.2) y = lerp(122, 144, sm(c / 0.2)); else if (c < 0.8) { const k = (c - 0.2) / 0.6; air = 4 * k * (1 - k); y = 144 - 40 * air; } else y = lerp(144, 122, sm((c - 0.8) / 0.2));
    return { hip: [100, y], lean: 0, face: air > 0.1 ? "happy" : "strain", kd: [1, -1],
      hands: (l, r) => [[l[0] - 6 - 12 * air, l[1] + 28 - 70 * air], [r[0] + 6 + 12 * air, r[1] + 28 - 70 * air]], feet: () => [[88 + 4 * air, Math.min(G, y + 43 - 4 * air)], [112 - 4 * air, Math.min(G, y + 43 - 4 * air)]],
      back: () => `<ellipse cx="100" cy="${G + 2}" rx="${f1(30 - 14 * air)}" ry="5" fill="#0003"/>` }; } },

  fight: { label: "fight", fn: (t) => { const c = (t * 2.4) % 1, p = Math.sin(((c % 0.5) / 0.5) * Math.PI), front = c < 0.5;
    return { hip: [96 + 5 * p, 128], lean: 10 + 6 * p * (front ? 1 : -1), head: -4, look: 1, sw: 4, hw: 3, face: p > 0.6 ? "strain" : "open", ad: [1, 1], kd: [-1, -1],
      hands: (l, r, sc) => { const g = [sc[0] + 12, sc[1] + 10]; return [front ? [g[0] + 36 * p, g[1] - 8] : [g[0] - 4, g[1] - 2], front ? [g[0] + 4, g[1] + 2] : [g[0] + 38 * p, g[1] - 8]]; }, feet: () => [[78, G], [124, G]],
      front: (c2) => { const h = front ? c2.hl : c2.hr; return p > 0.85 ? `<g transform="translate(${pt([h[0] + 14, h[1]])})"><polygon points="0,-14 4,-4 14,-6 8,2 14,12 3,7 -2,16 -4,6 -14,6 -7,-1 -10,-12 -1,-6" fill="#ffd23a" stroke="#ff7a1a" stroke-width="2"/></g>` : p > 0.2 ? `<g stroke="#fff9" stroke-width="3" stroke-linecap="round"><line x1="${f1(h[0] - 30)}" y1="${f1(h[1] - 5)}" x2="${f1(h[0] - 12)}" y2="${f1(h[1] - 5)}"/><line x1="${f1(h[0] - 34)}" y1="${f1(h[1] + 5)}" x2="${f1(h[0] - 14)}" y2="${f1(h[1] + 5)}"/></g>` : ""; } }; } },

  victory: { label: "victory", fn: (t) => { const b = Math.abs(S(t * 5));
    return { hip: [100, 130 - 5 * b], lean: S(t * 2.5) * 3, face: "happy", kd: [1, -1],
      hands: (l, r) => [[l[0] - 18, l[1] - 22 - 4 * b], [r[0] + 18, r[1] - 22 - 4 * b]], feet: () => [[84, G], [116, G]],
      front: () => [0, 1, 2, 3, 4].map((i) => `<text x="${24 + i * 38}" y="${f1(40 + 14 * S(t * 4 + i * 2))}" font-size="${14 + (i % 2) * 5}" fill="#fff" opacity="${f1(0.5 + 0.5 * S(t * 5 + i))}">✦</text>`).join("") }; } },

  dance: { label: "dance", fn: (t) => { const b = S(t * 6), sw = S(t * 3);
    return { hip: [100 + 9 * sw, 124 - 3 * Math.abs(b)], lean: -9 * sw, head: 8 * sw, face: "happy", kd: [1, -1],
      hands: (l, r) => [[l[0] - 10, l[1] - 4 + 38 * (S(t * 6) > 0 ? 0 : 1) - 30 * (S(t * 6) > 0 ? 1 : 0)], [r[0] + 10, r[1] - 4 + 38 * (S(t * 6) > 0 ? 1 : 0) - 30 * (S(t * 6) > 0 ? 0 : 1)]],
      feet: (l, r) => [[l[0] - 6, G - 7 * Math.max(0, b)], [r[0] + 6, G - 7 * Math.max(0, -b)]],
      front: () => [0, 1, 2].map((i) => { const k = (t * 0.6 + i / 3) % 1; return `<text x="${f1(150 + i * 12)}" y="${f1(90 - k * 60)}" font-size="16" fill="#fff" opacity="${f1(1 - k)}">♪</text>`; }).join("") }; } },
};

ACTS.sad = { label: "sad", fn: (t) => { const b = S(t * 1.4);
  return { hip: [100, 128 + b * 0.8], lean: 7, head: 16 + b * 2, face: "sad", kd: [1, -1],
    hands: (l, r) => [[l[0] - 2, l[1] + 34 + b], [r[0] + 2, r[1] + 34 + b]], feet: () => [[92, G], [108, G]] }; } };
ACTS.wave = { label: "wave", fn: (t) => { const w = S(t * 9);
  return { hip: [100, 122 + S(t * 2.2) * 0.8], lean: 2, head: 4, face: "happy", kd: [1, -1],
    hands: (l, r) => [[l[0] - 5, l[1] + 36], [r[0] + 22 + 5 * w, r[1] - 26 + 3 * Math.abs(w)]], feet: () => [[92, G], [108, G]] }; } };
const STILL = { pullup: 0.7, pushup: 0.7, situp: 0.7, rope: 0.45, climb: 0.45, run: 0.3, jump: 0.45, lift: 0.1, fight: 0.1, hike: 0.3 };
const stillT = (a) => STILL[a] ?? 0.5;

/* ---------- drawing ---------- */
function hairPath(n, h) {
  const r = 21; let pts = [];
  for (let i = 0; i < n; i++) {
    const a0 = (180 + (180 / n) * i) * D, a1 = (180 + (180 / n) * (i + 0.5)) * D, ht = h * (0.72 + 0.28 * (((i * 37) % 5) / 4));
    pts.push([22 * Math.cos(a0), 22 * Math.sin(a0)], [(r + ht) * Math.cos(a1), (r + ht) * Math.sin(a1) - 2]);
  }
  pts.push([22, -1]);
  return "M-22,-1 " + pts.map((p) => "L" + pt(p)).join(" ") + " L21,-2 Q12,-17 4,-9 Q0,-14 -4,-9 Q-12,-17 -21,-2Z";
}

function face(p, ch, t) {
  const lk = (p.look || 0) * 6, gz = p.gaze || 0, ey = -1 + gz, ex = [-8 + lk, 8 + lk], f = p.face || "open";
  let s = "";
  const eye = (x) => `<ellipse cx="${f1(x)}" cy="${ey}" rx="3.6" ry="4.6" fill="#1d1d2b"/><circle cx="${f1(x + 1.2)}" cy="${ey - 1.8}" r="1.4" fill="#fff"/>`;
  const arc = (x, up) => `<path d="M${f1(x - 4)} ${ey + (up ? 2 : -1)} q4 ${up ? -6 : 6} 8 0" stroke="#1d1d2b" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
  const blink = (t * 1) % 4 > 3.85;
  if (ch.blind) s += `<rect x="-22" y="-8" width="44" height="12" rx="3" fill="#15151f"/>`;
  else if (f === "sleep" || f === "calm" || blink) s += ex.map((x) => arc(x, false)).join("");
  else if (f === "strain") s += ex.map((x, i) => `<path d="M${f1(x - 4)} ${ey - 3} l${i ? -1 : 1}0 0" stroke="none"/><path d="${i ? `M${f1(x + 4)} ${ey - 3} L${f1(x - 3)} ${ey} L${f1(x + 4)} ${ey + 3}` : `M${f1(x - 4)} ${ey - 3} L${f1(x + 3)} ${ey} L${f1(x - 4)} ${ey + 3}`}" stroke="#1d1d2b" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join("");
  else if (f === "happy") s += ex.map((x) => arc(x, true)).join("");
  else if (f === "sad") s += ex.map((x, i) => eye(x) + `<path d="M${f1(x - 5)} ${ey - 8 + (i ? 0 : 3)} L${f1(x + 5)} ${ey - 8 + (i ? 3 : 0)}" stroke="#1d1d2b" stroke-width="2" stroke-linecap="round"/>`).join("");
  else s += ex.map(eye).join("");
  if (ch.scar) s += `<path d="M-13 3 l5 5 M-12 8 l4 -5" stroke="#b5503a" stroke-width="1.6"/>`;
  if (ch.whisk) s += `<g stroke="#8a4a1e" stroke-width="1.4"><path d="M-17 6h7M-17 10h7M17 6h-7M17 10h-7"/></g>`;
  const my = 9 + gz * 0.6, mx = lk * 0.6;
  if (f === "strain") s += `<rect x="${f1(mx - 6)}" y="${my}" width="12" height="6" rx="2" fill="#fff" stroke="#1d1d2b" stroke-width="1.6"/>`;
  else if (f === "happy") s += `<path d="M${f1(mx - 6)} ${my} q6 11 12 0z" fill="#8a1c2b" stroke="#1d1d2b" stroke-width="1.4"/>`;
  else if (f === "sad") s += `<path d="M${f1(mx - 5)} ${my + 5} q5 -5 10 0" stroke="#1d1d2b" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M${f1(mx + 14)} ${ey + 3} q2 5 0 8 q-3 -3 0 -8z" fill="#7cc4ff"/>`;
  else if (f === "chew0") s += `<ellipse cx="${f1(mx)}" cy="${my + 2}" rx="4.5" ry="4" fill="#8a1c2b"/>`;
  else if (f === "chew1") s += `<path d="M${f1(mx - 5)} ${my + 2} q5 3 10 0" stroke="#1d1d2b" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  else if (f === "calm" || f === "sleep") s += `<path d="M${f1(mx - 3)} ${my + 2} q3 2 6 0" stroke="#1d1d2b" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  else s += `<path d="M${f1(mx - 5)} ${my} q5 5 10 0" stroke="#1d1d2b" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  if (f === "strain") s += `<path d="M20 -14 q3 5 0 8 q-3 -3 0 -8z" fill="#7cc4ff"/>`;
  return s;
}

function render(who, act, t, o = {}) {
  const ch = CHARS[who] || CHARS.naruto, A = ACTS[act] || ACTS.idle, p = A.fn(t || 0, ch);
  const sw = p.sw ?? 11, hw = p.hw ?? 7, lean = p.lean || 0, hip = p.hip;
  const Sc = add(hip, rot(lean, [0, -TOR])), Sl = add(Sc, rot(lean, [-sw, 0])), Sr = add(Sc, rot(lean, [sw, 0]));
  const Hd = add(Sc, rot(lean + (p.head || 0), [0, -NECK]));
  const Hl = [hip[0] - hw, hip[1]], Hr = [hip[0] + hw, hip[1]];
  const [hl, hr] = p.hands(Sl, Sr, Sc, Hd), [fl, fr] = p.feet(Hl, Hr);
  const ad = p.ad || [1, -1], kd = p.kd || [1, -1];
  const [elL, hL] = ik(Sl, hl, A1, A2, ad[0]), [elR, hR] = ik(Sr, hr, A1, A2, ad[1]);
  const [knL, fL] = ik(Hl, fl, L1, L2, kd[0]), [knR, fR] = ik(Hr, fr, L1, L2, kd[1]);
  const c = { hl: hL, hr: hR, Sc, Hd, hip, fl: fL, fr: fR, ch, t };
  const limb = (a, m, b, col, w) => `<polyline points="${pt(a)} ${pt(m)} ${pt(b)}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const leg = (h, k, f) => limb(h, k, f, ch.pants, 11) + `<ellipse cx="${f1(f[0] + 2)}" cy="${f1(f[1] + 1)}" rx="8" ry="4.5" fill="${ch.shoe}"/>`;
  const arm = (s, e, h) => limb(s, e, h, ch.suit, 9) + `<circle cx="${f1(h[0])}" cy="${f1(h[1])}" r="5.2" fill="${ch.skin}"/>`;
  const T1 = `<line x1="${f1(hip[0])}" y1="${f1(hip[1])}" x2="${f1(Sc[0])}" y2="${f1(Sc[1])}" stroke="${ch.suit}" stroke-width="25" stroke-linecap="round"/><line x1="${f1(hip[0])}" y1="${f1(hip[1])}" x2="${f1((hip[0] * 3 + Sc[0]) / 4)}" y2="${f1((hip[1] * 3 + Sc[1]) / 4)}" stroke="${ch.acc}" stroke-width="7" stroke-linecap="round" opacity=".9"/>`;
  const hr_ = hairPath(ch.sp[0], ch.sp[1]);
  const hd = `<g transform="translate(${pt(Hd)}) rotate(${f1(lean + (p.head || 0))})">` +
    `<circle r="22" fill="${ch.skin}"/>` +
    (ch.ear ? `<circle cx="-22" cy="4" r="2.4" fill="#e6c34a"/><circle cx="-22" cy="9" r="2.4" fill="#e6c34a"/><circle cx="-22" cy="14" r="2.4" fill="#e6c34a"/>` : "") +
    face(p, ch, c.t) + `<path d="${hr_}" fill="${ch.hair}" stroke="#0004" stroke-width="1.2" stroke-linejoin="round"/>` +
    (ch.band ? `<rect x="-22" y="-13" width="44" height="8" rx="2" fill="${ch.band}"/><rect x="-8" y="-13" width="16" height="8" rx="1.5" fill="#cfd6e8"/>` : "") +
    (ch.hat ? `<ellipse cy="-14" rx="34" ry="8" fill="#f1d27a" stroke="#b58a2a" stroke-width="1.5"/><path d="M-19 -14 q0 -22 19 -22 q19 0 19 22z" fill="#f1d27a" stroke="#b58a2a" stroke-width="1.5"/><rect x="-19" y="-21" width="38" height="6" fill="#d32f2f"/>` : "") + `</g>`;
  const sh = `<ellipse cx="${f1(Math.min(hip[0], 100))}" cy="${G + 4}" rx="34" ry="5" fill="#0002"/>`;
  const defs = o.bg === false ? "" : `<defs><linearGradient id="bg-${who}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${ch.bg[0]}"/><stop offset="1" stop-color="${ch.bg[1]}"/></linearGradient></defs><rect width="200" height="190" rx="22" fill="url(#bg-${who})"/>`;
  return `<svg viewBox="0 0 200 190"${o.size ? ` width="${o.size}" height="${o.size}"` : ""} xmlns="http://www.w3.org/2000/svg">${defs}${p.back ? p.back(c) : ""}${sh}${leg(Hr, knR, fR)}${leg(Hl, knL, fL)}${arm(Sr, elR, hR)}${T1}${arm(Sl, elL, hL)}${hd}${p.front ? p.front(c) : ""}</svg>`;
}

export { render, ACTS, CHARS, stillT };
export default { render, ACTS, CHARS, stillT };
