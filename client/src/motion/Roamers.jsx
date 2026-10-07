import { useEffect, useRef } from "react";
import "./roamers.css";
import { sprite, walkStrip } from "./chars";

// FlexFit Living Cast 2.0
// IMPORTANT: every character is a single composite sprite mounted under one rigid root.
// There are NO independently animated arm/leg DOM nodes. The optional fallback rig below
// is solved from locked joints, so a missing sprite can never produce detached limbs.

const WHO = ["zoro", "naruto", "luffy", "jinwoo", "goku", "gojo"];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reduced = () => document.documentElement.classList.contains("ff-calm") || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const SKIN = {
  zoro: { body: "#3f7f43", hair: "#79c84a", accent: "#d7f9a6", aura: "#22c55e" },
  naruto: { body: "#f97316", hair: "#fbbf24", accent: "#fde68a", aura: "#fb923c" },
  luffy: { body: "#ef4444", hair: "#1f2937", accent: "#fde68a", aura: "#f43f5e" },
  jinwoo: { body: "#171329", hair: "#111827", accent: "#a78bfa", aura: "#8b5cf6" },
  goku: { body: "#2563eb", hair: "#111827", accent: "#fb923c", aura: "#f59e0b" },
  gojo: { body: "#f8fafc", hair: "#c4b5fd", accent: "#a5b4fc", aura: "#a855f7" },
};

function createRig(scale = 1) {
  // Locked local joint offsets. All children derive from the torso root; no free-floating limbs.
  return {
    torso: { x: 0, y: 0 },
    neck: { x: 0, y: -25 * scale },
    head: { x: 0, y: -43 * scale },
    shoulderL: { x: -15 * scale, y: -18 * scale }, shoulderR: { x: 15 * scale, y: -18 * scale },
    elbowL: { x: -24 * scale, y: -2 * scale }, elbowR: { x: 24 * scale, y: -2 * scale },
    handL: { x: -29 * scale, y: 15 * scale }, handR: { x: 29 * scale, y: 15 * scale },
    hipL: { x: -10 * scale, y: 22 * scale }, hipR: { x: 10 * scale, y: 22 * scale },
    kneeL: { x: -13 * scale, y: 43 * scale }, kneeR: { x: 13 * scale, y: 43 * scale },
    footL: { x: -17 * scale, y: 62 * scale }, footR: { x: 17 * scale, y: 62 * scale },
  };
}

function solveRig(root, facing, pose, scale) {
  const r = createRig(scale);
  const lean = pose === "attack" ? 8 : pose === "dodge" ? -6 : pose === "sleep" ? 3 : 0;
  const bob = pose === "walk" ? Math.sin(root.phase * Math.PI * 2) * 2 : 0;
  const point = (p) => ({ x: root.x + (p.x + lean) * facing, y: root.y + p.y + bob });
  return Object.fromEntries(Object.entries(r).map(([k, p]) => [k, point(p)]));
}

const imageCache = new Map();
function getImage(url) {
  if (!url) return null;
  if (imageCache.has(url)) return imageCache.get(url);
  const im = new Image();
  im.decoding = "async";
  im.src = url;
  imageCache.set(url, im);
  return im;
}

function drawFallbackRig(ctx, c, rig, skin, alpha = 1) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.lineCap = "round"; ctx.lineJoin = "round";
  const line = (a, b, w, color) => { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(rig[a].x, rig[a].y); ctx.lineTo(rig[b].x, rig[b].y); ctx.stroke(); };
  line("shoulderL", "elbowL", 8, skin.body); line("elbowL", "handL", 7, skin.accent);
  line("shoulderR", "elbowR", 8, skin.body); line("elbowR", "handR", 7, skin.accent);
  line("hipL", "kneeL", 9, skin.body); line("kneeL", "footL", 8, skin.accent);
  line("hipR", "kneeR", 9, skin.body); line("kneeR", "footR", 8, skin.accent);
  ctx.fillStyle = skin.body; ctx.beginPath(); ctx.roundRect(rig.torso.x - 17, rig.torso.y - 12, 34, 42, 12); ctx.fill();
  ctx.fillStyle = skin.hair; ctx.beginPath(); ctx.arc(rig.head.x, rig.head.y, 16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = skin.accent; ctx.beginPath(); ctx.arc(rig.head.x + 5, rig.head.y + 3, 5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function poseFor(state) {
  if (state === "sleep") return "sleep";
  if (state === "fight" || state === "attack" || state === "dodge") return "fight";
  if (state === "climb") return "walk";
  return state === "walk" ? "walk" : pick(["wave", "habit", "cheer", "task"]);
}

export default function Roamers() {
  const canvasRef = useRef(null);
  const charsRef = useRef([]);
  const fxRef = useRef([]);
  const nextSpawn = useRef(performance.now() + 1500);
  const fightLock = useRef(false);

  useEffect(() => {
    if (reduced()) return undefined;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { alpha: true });
    let raf = 0, alive = true, last = performance.now();

    const size = () => window.innerWidth < 640 ? 78 : 104;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`; canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize(); window.addEventListener("resize", resize);

    const makeChar = (who, fromLeft = true) => {
      const s = size();
      return { id: `${who}-${Math.random()}`, who, x: fromLeft ? -s : window.innerWidth + s, y: rand(120, Math.max(140, window.innerHeight - s - 30)),
        tx: rand(30, window.innerWidth - s - 30), ty: rand(90, window.innerHeight - s - 20), state: "walk", stateAt: performance.now(), stateUntil: performance.now() + rand(4000, 7000), speed: rand(28, 54), facing: fromLeft ? 1 : -1,
        phase: Math.random(), energy: 1, climb: null, pose: "walk", frame: 0, asleepUntil: 0 };
    };

    const setState = (c, state, duration = rand(1800, 5000)) => { c.state = state; c.stateAt = performance.now(); c.pose = poseFor(state); c.stateUntil = performance.now() + duration; };
    const addFx = (x, y, kind, color, text = "") => fxRef.current.push({ x, y, kind, color, text, t: performance.now(), life: kind === "impact" ? 650 : 900 });

    const climbTarget = () => {
      const candidates = [
        { x: rand(10, 24), y: rand(100, window.innerHeight - 150), w: 4, h: 120, edge: "left" },
        { x: window.innerWidth - 24, y: rand(100, window.innerHeight - 150), w: 4, h: 120, edge: "right" },
      ];
      document.querySelectorAll("button, [role='button'], .card, .glass, .panel, section").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > 100 && r.height > 50 && r.bottom > 60 && r.top < window.innerHeight - 40) {
          candidates.push({ x: r.left, y: r.top, w: r.width, h: r.height, edge: "element" });
        }
      });
      return pick(candidates);
    };

    const chooseAction = (c) => {
      const now = performance.now();
      if (now < c.stateUntil) return;
      if (c.energy < 0.18 && Math.random() < 0.65) { setState(c, "sleep", rand(5000, 9000)); c.asleepUntil = now + rand(5000, 9000); return; }
      const roll = Math.random();
      if (roll < 0.10) { c.tx = rand(25, window.innerWidth - size() - 25); c.ty = rand(90, window.innerHeight - size() - 25); setState(c, "climb", rand(3500, 7000)); c.climb = climbTarget(); return; }
      if (roll < 0.25) { setState(c, "idle", rand(1600, 4200)); return; }
      if (roll < 0.34) { setState(c, "sleep", rand(3500, 7000)); c.asleepUntil = now + rand(3500, 7000); return; }
      c.tx = rand(25, Math.max(26, window.innerWidth - size() - 25)); c.ty = rand(80, Math.max(90, window.innerHeight - size() - 25)); setState(c, "walk", rand(4000, 8500));
    };

    const beginFight = (a, b) => {
      if (fightLock.current || a.state === "sleep" || b.state === "sleep") return;
      fightLock.current = true;
      const midX = clamp((a.x + b.x) / 2, 100, window.innerWidth - 100);
      const y = clamp((a.y + b.y) / 2, 90, window.innerHeight - 160);
      a.tx = midX - 65; a.ty = y; b.tx = midX + 65; b.ty = y;
      a.facing = 1; b.facing = -1; setState(a, "fight", 900); setState(b, "fight", 900);
      a.energy -= 0.08; b.energy -= 0.08;
      setTimeout(() => {
        if (!alive) return;
        let attacker = Math.random() < 0.5 ? a : b;
        let defender = attacker === a ? b : a;
        let round = 0;
        const step = () => {
          if (!alive || round >= 6) {
            setState(a, "idle", 1800); setState(b, "idle", 1800); fightLock.current = false; return;
          }
          attacker.state = "attack"; attacker.pose = "fight"; defender.state = Math.random() < 0.45 ? "dodge" : "fight"; defender.pose = "fight";
          addFx(defender.x + size() / 2, defender.y + size() * .45, Math.random() < .5 ? "impact" : "spark", SKIN[attacker.who].aura, pick(["POW!", "WHAM!", "HYAH!", "!"]));
          attacker.energy -= .035; defender.energy -= .05;
          round++; [attacker, defender] = [defender, attacker];
          setTimeout(step, 480 + Math.random() * 260);
        };
        step();
      }, 850);
    };

    const update = (c, dt, now) => {
      const s = size();
      c.phase += dt * (c.state === "walk" || c.state === "climb" ? 5 : 1.5);
      c.energy = clamp(c.energy + dt * 0.018, 0, 1);
      chooseAction(c);
      if (c.state === "sleep") return;
      if (c.state === "idle" || c.state === "fight" || c.state === "attack" || c.state === "dodge") return;

      if (c.state === "climb" && c.climb) {
        const r = c.climb;
        if (r.edge === "left" || r.edge === "right") { c.tx = r.edge === "left" ? 10 : window.innerWidth - s - 10; c.ty = clamp(c.y + Math.sin(now / 700) * 32, 70, window.innerHeight - s - 30); }
        else {
          const top = r.y - s * .7, bottom = r.y + r.h - s * .25;
          c.tx = clamp(c.x + (c.x < r.x + r.w / 2 ? 1 : -1) * 18, r.x - 10, r.x + r.w - s + 10);
          c.ty = clamp(c.y + (Math.sin(now / 500) > 0 ? 1 : -1) * 22, top, bottom);
        }
      }

      const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy);
      if (d > 2) { const step = c.speed * dt; c.x += dx / d * Math.min(step, d); c.y += dy / d * Math.min(step, d); if (Math.abs(dx) > 3) c.facing = dx > 0 ? 1 : -1; }
      c.x = clamp(c.x, -s, window.innerWidth); c.y = clamp(c.y, 55, window.innerHeight - s + 10);
      if (c.x > 15 && c.x < window.innerWidth - s - 15 && Math.random() < dt * .08) c.energy -= .006;
    };

    const drawFx = (now) => {
      fxRef.current = fxRef.current.filter((f) => now - f.t < f.life);
      fxRef.current.forEach((f) => {
        const p = clamp((now - f.t) / f.life, 0, 1); ctx.save(); ctx.globalAlpha = 1 - p;
        ctx.strokeStyle = f.color; ctx.fillStyle = f.color; ctx.lineWidth = 4;
        if (f.kind === "impact") { ctx.font = "900 14px system-ui"; ctx.textAlign = "center"; ctx.fillText(f.text, f.x, f.y - p * 25); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx.beginPath(); ctx.moveTo(f.x + Math.cos(a) * 8, f.y + Math.sin(a) * 8); ctx.lineTo(f.x + Math.cos(a) * (25 + p * 18), f.y + Math.sin(a) * (25 + p * 18)); ctx.stroke(); } }
        else { ctx.beginPath(); ctx.arc(f.x, f.y, 8 + p * 24, 0, Math.PI * 2); ctx.stroke(); }
        ctx.restore();
      });
    };

    const drawChar = (c, now) => {
      const s = size(), bob = c.state === "walk" ? Math.sin(c.phase * Math.PI * 2) * 3 : c.state === "sleep" ? Math.sin(c.phase * Math.PI * 2) * 1.5 : 0;
      const rig = solveRig({ x: c.x + s / 2, y: c.y + s * .72, phase: c.phase }, c.facing, c.state, s / 100);
      const isWalkStrip = c.state === "walk" || c.state === "climb";
      const url = isWalkStrip ? walkStrip(c.who) : sprite(c.who, c.pose || poseFor(c.state));
      const im = getImage(url);
      ctx.save(); ctx.translate(c.x + s / 2, c.y + s / 2 + bob); ctx.scale(c.facing, 1);
      if (c.state === "sleep") { ctx.globalAlpha = .95; ctx.rotate(Math.sin(now / 900) * .025); }
      if (c.state === "attack") { ctx.translate(7, 0); ctx.rotate(Math.sin(now / 80) * .06); }
      if (c.state === "dodge") { ctx.translate(-5, 0); ctx.rotate(-.08); }
      if (c.state === "fight") { ctx.translate(0, Math.sin(now / 80) * 1.5); }
      ctx.shadowColor = SKIN[c.who].aura; ctx.shadowBlur = c.state === "attack" ? 16 : 6;
      if (im && im.complete && im.naturalWidth) {
        if (isWalkStrip && im.naturalWidth >= im.naturalHeight * 2) {
          // The walk sheet is an 8-frame row of complete, rigid character stickers.
          // Crop exactly one frame so the other seven characters are NEVER rendered.
          const frames = 8;
          const frame = Math.floor(c.phase * 1.15) % frames;
          const fw = im.naturalWidth / frames;
          ctx.drawImage(im, frame * fw, 0, fw, im.naturalHeight, -s / 2, -s / 2, s, s);
        } else {
          ctx.drawImage(im, -s / 2, -s / 2, s, s);
        }
      } else { ctx.shadowBlur = 0; drawFallbackRig(ctx, { x: 0, y: 0 }, Object.fromEntries(Object.entries(rig).map(([k, p]) => [k, { x: p.x - (c.x + s / 2), y: p.y - (c.y + s / 2) }])), SKIN[c.who]); }
      if (c.state === "sleep") { ctx.shadowBlur = 0; ctx.fillStyle = "#334155"; ctx.font = "800 14px system-ui"; ctx.fillText("z", s * .22, -s * .28); ctx.fillText("Z", s * .35, -s * .42); }
      ctx.restore();
    };

    const spawn = () => {
      if (charsRef.current.length >= 2) return;
      const n = Math.min(2 - charsRef.current.length, Math.random() < .42 ? 2 : 1);
      const used = new Set(charsRef.current.map((c) => c.who));
      for (let i = 0; i < n; i++) { const pool = WHO.filter((w) => !used.has(w)); const c = makeChar(pick(pool.length ? pool : WHO), Math.random() < .5); used.add(c.who); charsRef.current.push(c); }
    };

    const tick = (now) => {
      if (!alive) return;
      const dt = Math.min(.04, (now - last) / 1000); last = now;
      if (now >= nextSpawn.current && charsRef.current.length < 2) { spawn(); nextSpawn.current = now + rand(8000, 15000); }
      charsRef.current.forEach((c) => update(c, dt, now));
      if (charsRef.current.length === 2 && !fightLock.current) {
        const [a, b] = charsRef.current, d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 150 && Math.random() < dt * .55) beginFight(a, b);
      }
      // Remove a cast member after a long natural rest so the scene stays light.
      charsRef.current = charsRef.current.filter((c) => !(c.state === "sleep" && now - c.stateAt > 11000 && Math.random() < dt * .5));
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      drawFx(now); charsRef.current.forEach((c) => drawChar(c, now));
      raf = requestAnimationFrame(tick);
    };

    spawn(); raf = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener("resize", resize); charsRef.current = []; fxRef.current = []; };
  }, []);

  return <canvas ref={canvasRef} className="rm-canvas" aria-hidden="true" />;
}
