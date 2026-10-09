// Living cast. Usually 2 characters (sometimes 1) roam the whole page and behave by time of day:
//  morning  : runs, push-ups, squats, planks, weigh-ins, rope climbs      noon     : meals, swimming, studying macros
//  afternoon: rope climbs, cycling, parkour over the page's cards, spars  evening  : parkour, power-ups, level-ups, big fights
//  night    : one character sleeps.   Two-character scenes: fights, running races, rope-climb races, parkour.
// Login / signup get their own behaviour (greeters / recruiters). Tap a character for a trick. Submit buttons trigger a celebration.
import { useEffect, useRef, useState } from "react";
import "./roamers.css";
import { CHARS, sprite, walkStrip, runStrip, climbStrip } from "./chars";

const KEYS = Object.keys(CHARS);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const calm = () => document.documentElement.classList.contains("ff-calm") || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const slot = () => { const h = new Date().getHours(); return h >= 22 || h < 5 ? "night" : h < 10 ? "morning" : h < 14 ? "noon" : h < 18 ? "afternoon" : "evening"; };
const authEl = () => document.querySelector(".auth-shell");
const CONF = ["#f43f5e", "#f59e0b", "#22c55e", "#38bdf8", "#a855f7", "#facc15"];
const PETAL = ["#fbcfe8", "#f9a8d4", "#fda4af", "#fecdd3", "#ffffff"];

const EAT = { zoro: "Sake and rice. Perfect.", naruto: "Ichiraku ramen!", luffy: "MEEEAT!!", jinwoo: "Restoring HP…", goku: "Need. More. Food.", gojo: "Sweets break~" };
const ROUT = {
  habit: { pose: "habit", anim: "idle", say: () => "Focus. Breathe. Train." }, drink: { pose: "drink", anim: "eat", say: () => "Hydration check!" },
  eat: { pose: "eat", anim: "eat", say: (w) => EAT[w] }, task: { pose: "task", anim: "idle", say: () => "Ticking off tasks" },
  plan: { pose: "plan", anim: "idle", say: () => "Planning the week" }, dance: { pose: "dance", anim: "dance", say: () => "♪ ♫ ♪" },
  wave: { pose: "wave", anim: "idle", say: () => "Keep your streak alive!" }, scale: { pose: "scale", anim: "idle", say: () => "Weigh-in time" },
  sleep: { pose: "sleep", anim: "snore", say: () => "zZz…" }, walk: { pose: "walk", anim: "walk", say: () => "" },
  pushup: { pose: "pushup", anim: "press", say: () => "Push-ups! 1… 2… 3…" }, squat: { pose: "squat", anim: "squat", say: () => "Squats! Feel the burn" },
  plank: { pose: "plank", anim: "tremble", say: () => "Hold it… hold it…" }, study: { pose: "study", anim: "idle", say: () => "Studying macros…" },
  workout: { pose: "workout", anim: "lift", say: () => "One more rep!" },
  powerup: { pose: "powerup", anim: "pulse", say: () => "POWER UP!!", fx: "power" }, levelup: { pose: "levelup", anim: "rise", say: () => "LEVEL UP!", fx: "level" },
  victory: { pose: "victory", anim: "dance", say: () => "Victory!", fx: "win" }, rest: { pose: "idle", anim: "idle", say: () => "" },
};
const SOLO = {
  morning: ["run", "pushup", "squat", "plank", "scale", "rope", "drink", "workout", "rest"], noon: ["eat", "drink", "study", "swim", "task", "rest"],
  afternoon: ["rope", "cycle", "parkour", "task", "run", "study", "follow", "rest"], evening: ["parkour", "powerup", "levelup", "rope", "dance", "swim", "victory", "follow", "rest"], night: ["sleep"],
};
const DUO = {
  morning: ["race", "pushup", "squat", "ropeRace", "drink"], noon: ["eat", "eat", "swim", "study"],
  afternoon: ["fight", "ropeRace", "parkour", "race", "fight"], evening: ["fight", "fight", "parkour", "ropeRace", "dance", "powerup"], night: ["sleep"],
};

const K = 1.19; // cycle frames are drawn with the body at ~84% of the frame (room for limbs): scale up so they match the still sprites
function Sprite({ src, who, pose, anim, size, cyc, rev }) {
  if (anim === "walk" && (pose === "walk" || pose === "run" || pose === "climb")) { // baked 16-frame cycles: alternating legs, arm swing / reach, weight shift, head bob
    const s2 = size * K;
    return <span className={`rm-strip${rev ? " rev" : ""}`} style={{ width: s2, height: s2, left: -(s2 - size) / 2, top: -(s2 - size), "--cyc": `${cyc}s`, backgroundImage: `url(${pose === "run" ? runStrip(who) : pose === "climb" ? climbStrip(who) : walkStrip(who)})` }} />;
  }
  return <img className={`rm-img rm-${anim}`} src={src} width={size} height={size} alt="" draggable="false" />;
}

export default function Roamers() {
  const size = useRef(typeof window !== "undefined" && window.innerWidth < 640 ? 70 : 96).current;
  const [cast, setCast] = useState(() => KEYS.map((who) => ({ who, x: -300, y: 200, dur: 0, ease: "e", cyc: 0.8, rev: false, pose: "walk", anim: "idle", flip: 1, say: "", on: false, air: null })));
  const [fxs, setFxs] = useState([]);
  const [ropes, setRopes] = useState([]);
  const api = useRef({});

  useEffect(() => {
    if (calm()) return undefined;
    let alive = true, fighting = false, airN = 0, rid = 0;
    const lock = new Set(), ON = new Set(), P = {};
    KEYS.forEach((k) => { P[k] = { x: -300, y: 200 }; });
    const W = () => window.innerWidth, H = () => window.innerHeight;
    const held = new Set(), POSE = {};
    const set = (who, p, force) => { if (!alive || (held.has(who) && !force)) return; if (p.pose) POSE[who] = p.pose; setCast((c) => c.map((m) => (m.who === who ? { ...m, ...p } : m))); };
    const spot = () => ({ x: rnd(16, Math.max(90, W() - size - 16)), y: rnd(90, Math.max(150, H() - size - 20)) });
    const C = (w) => ({ x: P[w].x + size / 2, y: P[w].y + size / 2 });
    const say = (w, s, ms = 2400) => { set(w, { say: s }); setTimeout(() => set(w, { say: "" }), ms); };
    const fx = (o, ms) => { const id = Math.random(); setFxs((f) => [...f, { id, ...o }]); setTimeout(() => setFxs((f) => f.filter((x) => x.id !== id)), ms); };
    const burst = (p, c, w) => fx({ t: "burst", x: p.x, y: p.y, c, w }, 700);
    const confetti = (p, kind) => fx({ t: "confetti", x: p.x, y: p.y, p: Array.from({ length: kind === "petal" ? 28 : 22 }, () => kind === "petal" ? { petal: 1, dx: rnd(-130, 130), dy: rnd(-150, 60), r: rnd(-360, 360), c: pick(PETAL), d: rnd(0, 400) } : ({ dx: rnd(-170, 170), dy: rnd(-190, 120), r: rnd(-540, 540), c: pick(CONF), d: rnd(0, 150) })) }, kind === "petal" ? 2900 : 1900);
    const quake = () => { document.body.classList.add("rm-quake"); setTimeout(() => document.body.classList.remove("rm-quake"), 700); }; //#web
    const platforms = () => [...document.querySelectorAll(".card, .logger-card, .wt-hero, .wt-log, .wt-history, .profile-section, section")].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 150 && r.top > 72 && r.top < H() - size - 40 && r.left < W() - 80); //#web
    //#mob const quake = () => {}; const platforms = () => [];
    const addRope = (x) => { const id = ++rid; setRopes((r) => [...r, { id, x }]); return id; };
    const delRope = (id) => { setRopes((r) => r.map((q) => (q.id === id ? { ...q, out: true } : q))); setTimeout(() => setRopes((r) => r.filter((q) => q.id !== id)), 900); };

    const dust = (p) => fx({ t: "dust", x: p.x, y: p.y }, 750);
    const cur = { x: -1, y: -1 };
    const onMove = (e) => { cur.x = e.clientX; cur.y = e.clientY; }; window.addEventListener("pointermove", onMove, { passive: true }); //#web
    const move = async (w, to, pose = "walk", speed = 55, anim = "walk") => {
      const from = { ...P[w] }, d = Math.hypot(to.x - from.x, to.y - from.y), dur = Math.max(1.2, d / speed), flip = to.x < from.x ? -1 : 1;
      const gait = pose === "walk" || pose === "run", cyc = Math.min(1.3, Math.max(0.4, (size * (pose === "run" ? 1.0 : 0.55)) / Math.max(speed, 20)));
      if (gait && d > 30) { set(w, { pose: "idle", anim: "crouch", flip }); await sleep(150); }   // anticipation: dip before the first step
      set(w, { x: to.x, y: to.y, dur, ease: "e", pose, anim, flip, cyc });
      P[w] = { x: to.x, y: to.y };
      const t0 = Date.now(), dt = pose === "run" ? setInterval(() => { const k = Math.min(1, (Date.now() - t0) / (dur * 1000)), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; dust({ x: from.x + (to.x - from.x) * e + size / 2, y: from.y + (to.y - from.y) * e + size * 0.92 }); }, 240) : 0;
      await sleep(dur * 1000 + 60); if (dt) clearInterval(dt);
      if (d > 30) { set(w, { anim: "settle" }); await sleep(230); }                                  // settle: small overshoot on stopping
      set(w, { anim: "idle" });
    };
    // a real jump: straight travel underneath, an arc (and optional flips) on top, squash on landing
    const jump = async (w, to, h = 110, flips = 0, pose = "cheer") => {
      const d = Math.hypot(to.x - P[w].x, to.y - P[w].y), ms = Math.max(750, Math.min(1500, 520 + d * 1.1)), dir = to.x < P[w].x ? -1 : 1;
      set(w, { x: to.x, y: to.y, dur: ms / 1000, ease: "l", pose, anim: "idle", flip: dir, air: { n: ++airN, h, ms, rot: flips * 360 * dir } });
      P[w] = { x: to.x, y: to.y }; await sleep(ms + 30);
      set(w, { air: null, ease: "e", anim: "land" }); dust({ x: P[w].x + size * 0.3, y: P[w].y + size * 0.92 }); dust({ x: P[w].x + size * 0.7, y: P[w].y + size * 0.92 }); await sleep(260); set(w, { anim: "idle" });
    };
    const knock = async (a, d) => {
      const nx = Math.min(Math.max(P[d].x + (P[d].x >= P[a].x ? 1 : -1) * 60, 10), W() - size - 10);
      P[d] = { ...P[d], x: nx }; set(d, { x: nx, dur: 0.5, ease: "e", anim: "shake", pose: "sad" });
      await sleep(900); set(d, { anim: "idle", pose: "wave" });
    };
    const arm = (c, t, delay = 0, dy = 0, life = 1200) => fx({ t: "arm", x: c.x, y: c.y + dy, len: Math.hypot(t.x - c.x, t.y - c.y), r: (Math.atan2(t.y - c.y, t.x - c.x) * 180) / Math.PI, delay, life }, life + delay);
    const rush = (img, s, t, delay, life, cls) => fx({ t: "rush", cls, img, x: s.x, y: s.y, dx: t.x - s.x, dy: t.y - s.y, delay, life }, life + delay);
    const stance = (a) => set(a, { pose: "fight", anim: "lunge" });

    const MOVE = {
      naruto: [
        async (a, t, d) => { const c = C(a), h = { x: c.x, y: c.y - size * 0.1 }; stance(a); say(a, "Rasengan!", 3200);
          fx({ t: "charge", x: h.x, y: h.y, life: 1400 }, 1400); await sleep(1400);
          fx({ t: "orb", x: h.x, y: h.y, dx: t.x - h.x, dy: t.y - h.y, life: 1100 }, 1100); await sleep(1050); burst(t, "#38bdf8", "BOOM!"); if (d) await knock(a, d); },
        async (a, t, d) => { const c = C(a); say(a, "Shadow Clone Jutsu!", 3400); burst(c, "#cbd5e1", "POOF!");
          [[-70, -25], [70, -25], [0, 55]].forEach(([ox, oy], i) => rush(sprite("naruto", "walk"), { x: c.x + ox, y: c.y + oy }, t, 500 + i * 350, 1500, "clone"));
          await sleep(2300); burst(t, "#f59e0b", "WHAM!"); if (d) await knock(a, d); },
      ],
      luffy: [
        async (a, t, d) => { const c = C(a); stance(a); say(a, "Gum-Gum Pistol!", 2800); await sleep(800); arm(c, t); await sleep(520); burst(t, "#ef4444", "PISTOL!"); if (d) await knock(a, d); },
        async (a, t, d) => { const c = C(a); stance(a); say(a, "Gum-Gum Bazooka!", 3000); await sleep(900); arm(c, t, 0, -16); arm(c, t, 0, 16); await sleep(540); burst(t, "#f97316", "BAZOOKA!"); if (d) await knock(a, d); },
        async (a, t, d) => { const c = C(a); set(a, { pose: "fight", anim: "shake" }); say(a, "Gum-Gum Gatling!", 3400); await sleep(700);
          for (let i = 0; i < 5; i++) { arm(c, { x: t.x + rnd(-30, 30), y: t.y + rnd(-40, 40) }, 0, rnd(-14, 14), 520); await sleep(260); burst({ x: t.x + rnd(-30, 30), y: t.y + rnd(-30, 30) }, "#ef4444", "!"); }
          if (d) await knock(a, d); },
      ],
      zoro: [
        async (a, t, d) => { const dir = t.x >= C(a).x ? 1 : -1; say(a, "Santoryu… Oni Giri!", 3400); stance(a); await sleep(1000);
          await move(a, { x: t.x - size / 2 - dir * size * 0.55, y: t.y - size / 2 }, "fight", 130, "dash");
          [-38, 0, 38].forEach((r, i) => fx({ t: "slash", x: t.x, y: t.y, r, c: "#22c55e", delay: i * 170 }, 420 + i * 170)); await sleep(600);
          await move(a, { x: t.x - size / 2 + dir * size * 0.7, y: t.y - size / 2 }, "fight", 170, "dash"); if (d) await knock(a, d); },
        async (a, t, d) => { const c = C(a); stance(a); say(a, "108 Pound Phoenix!", 3000); await sleep(1000);
          fx({ t: "crescent", x: c.x, y: c.y, dx: t.x - c.x, dy: t.y - c.y, ang: (Math.atan2(t.y - c.y, t.x - c.x) * 180) / Math.PI + 90, life: 1000 }, 1000); await sleep(950); burst(t, "#22c55e", "SLASH!"); if (d) await knock(a, d); },
      ],
      jinwoo: [
        async (a, t, d) => { const c = C(a); stance(a); say(a, "Arise!", 3200);
          [[-80, 10], [0, -50], [80, 10]].forEach(([ox, oy], i) => rush(sprite("jinwoo", "walk"), { x: c.x + ox, y: c.y + oy }, t, i * 250, 2000, "shade"));
          await sleep(2300); burst(t, "#8b5cf6", "SHADOW ARMY!"); if (d) await knock(a, d); },
        async (a, t, d) => { const dir = t.x >= C(a).x ? 1 : -1; say(a, "Shadow Exchange!", 3000); set(a, { anim: "blink" }); await sleep(900);
          await move(a, { x: t.x - size / 2 - dir * size * 0.6, y: t.y - size / 2 }, "fight", 220, "dash");
          [-28, 28].forEach((r, i) => fx({ t: "slash", x: t.x, y: t.y, r, c: "#a78bfa", delay: i * 180 }, 450 + i * 180)); await sleep(600); burst(t, "#8b5cf6", "STRIKE!"); if (d) await knock(a, d); },
      ],
      goku: [
        async (a, t, d) => { const c = C(a), dir = t.x >= c.x ? 1 : -1, h = { x: c.x + dir * size * 0.3, y: c.y }; stance(a); say(a, "Ka-me-ha-me-HAAA!", 3600);
          fx({ t: "charge", x: h.x, y: h.y, c: "#60a5fa", life: 1500 }, 1500); await sleep(1500);
          fx({ t: "beam", x: h.x, y: h.y, len: Math.hypot(t.x - h.x, t.y - h.y), r: (Math.atan2(t.y - h.y, t.x - h.x) * 180) / Math.PI, life: 1500 }, 1500); await sleep(500); burst(t, "#38bdf8", "KAMEHAMEHA!"); await sleep(500); if (d) await knock(a, d); },
        async (a, t, d) => { const dir = t.x >= C(a).x ? 1 : -1; say(a, "Instant Transmission!", 3200); set(a, { anim: "blink" }); await sleep(900);
          await move(a, { x: t.x - size / 2 - dir * size * 0.6, y: t.y - size / 2 }, "fight", 220, "dash");
          for (let i = 0; i < 4; i++) { burst({ x: t.x + rnd(-26, 26), y: t.y + rnd(-30, 30) }, "#f59e0b", "HYAH!"); await sleep(260); } if (d) await knock(a, d); },
      ],
      gojo: [
        async (a, t, d) => { const c = C(a); stance(a); say(a, "Hollow Purple!", 3200);
          fx({ t: "charge", x: c.x, y: c.y, c: "#a855f7", life: 1500 }, 1500); await sleep(1500);
          fx({ t: "orb", x: c.x, y: c.y, c: "#a855f7", dx: t.x - c.x, dy: t.y - c.y, life: 1100 }, 1100); await sleep(1050); burst(t, "#a855f7", "PURPLE!"); if (d) await knock(a, d); },
        async (a, t, d) => { stance(a); say(a, "Domain Expansion: Unlimited Void!", 3600); fx({ t: "domain", x: 0, y: 0, life: 2600 }, 2600);
          await sleep(900); if (d) set(d, { pose: "sad", anim: "shake" }); await sleep(1500); burst(t, "#6366f1", "VOID!"); if (d) await knock(a, d); },
      ],
    };

    const hold = async (w, ms, look = true) => { const t0 = Date.now(); let side = 0;   // stand around naturally: look at the cursor if it's near, otherwise glance about now and then
      while (alive && Date.now() - t0 < ms) { await sleep(Math.min(700, Math.max(50, ms - (Date.now() - t0))));
        if (POSE[w] === "idle" && Math.random() < 0.3) { set(w, { pose: "blink" }); await sleep(130); set(w, { pose: "idle" }); }   // blink
        if (!look) continue;
        if (cur.x >= 0 && Math.abs(cur.x - C(w).x) < 460) { const f = cur.x < C(w).x ? -1 : 1; if (f !== side) { side = f; set(w, { flip: f }); } }
        else if (Math.random() < 0.15) set(w, { flip: Math.random() < 0.5 ? -1 : 1 }); } };
    // ---- solo activities ----
    const routine = async (w, kind, ms) => {
      const R = ROUT[kind];
      const to = kind === "sleep" ? { x: rnd(20, W() - size - 20), y: H() - size - 16 } : spot();
      await move(w, to, "walk", 50);
      set(w, { pose: R.pose, anim: R.anim, say: R.say(w) });
      const c = C(w);
      if (R.fx === "power") { burst(c, "#f59e0b", "POWER UP!"); quake(); fx({ t: "charge", x: c.x, y: c.y, c: "#f59e0b", life: 1400 }, 1400); }
      if (R.fx === "level") { burst(c, "#facc15", "LEVEL UP!"); confetti(c, "petal"); }
      if (R.fx === "win") { confetti({ x: c.x, y: c.y - 30 }); set(w, { air: { n: ++airN, h: 70, ms: 700, rot: 0 } }); setTimeout(() => set(w, { air: null }), 760); }
      await hold(w, ms || (kind === "sleep" ? 14000 : rnd(6000, 9000)), !["pushup", "squat", "plank", "sleep", "powerup", "levelup", "victory", "eat", "drink"].includes(kind)); set(w, { say: "" });
    };
    const runLaps = async (w) => {
      const y = rnd(H() * 0.3, H() - size - 24); set(w, { y, dur: 0 }); P[w] = { ...P[w], y }; await sleep(60);
      for (let i = 0; i < 3; i++) { const to = { x: i % 2 ? 10 : W() - size - 10, y: y + (i - 1) * 22 }; say(w, `Lap ${i + 1}!`, 1500); await move(w, to, "run", 170); burst({ x: to.x + size / 2, y: to.y + size * 0.85 }, "#cbd5e1", "💨"); }
    };
    const ride = async (w, pose, line, anim) => {
      const y = pose === "swim" ? H() - size - 8 : rnd(H() * 0.4, H() - size - 14);
      set(w, { y, dur: 0 }); P[w] = { ...P[w], y }; await sleep(60); say(w, line, 2200);
      await move(w, { x: P[w].x < W() / 2 ? W() - size - 12 : 12, y }, pose, 70, anim);
      say(w, pose === "swim" ? "Refreshing!" : "Wheee!", 1800); await move(w, { x: P[w].x < W() / 2 ? W() - size - 12 : 12, y }, pose, 70, anim);
    };
    const climbTo = (w, x, toY, speed = 46) => { // one continuous climb: legs step and hands reach (baked cycle), moving up (or down = cycle in reverse) at a steady pace
      const dist = Math.abs(toY - P[w].y), dur = Math.max(0.8, dist / speed);
      P[w] = { x: x - size / 2, y: toY };
      set(w, { x: x - size / 2, y: toY, dur, ease: "l", pose: "climb", anim: "walk", flip: 1, cyc: Math.min(1.4, (size * 0.46) / speed), rev: toY > POSEY[w] }); POSEY[w] = toY;
      return dur; };
    const POSEY = {};
    const ropeClimb = async (w) => { // walks to the spot first, THEN the rope drops; climbs bottom → top, cheers, climbs top → bottom, backflips off
      const x = rnd(W() * 0.15, W() * 0.85), bottom = H() - size - 8, top = 46;
      await move(w, { x: x - size / 2, y: bottom }, "walk", 60); POSEY[w] = bottom;
      say(w, "Time to climb!", 1800); const id = addRope(x); await sleep(1300);
      say(w, "Bottom to top!", 2000); let d = climbTo(w, x, top); await sleep(d * 1000 + 120);
      set(w, { anim: "idle", rev: false }); say(w, "Made it!", 2000); burst({ x, y: top + size * 0.4 }, "#facc15", "TOP!"); confetti({ x, y: top + 40 }, "petal"); await sleep(1900);
      say(w, "Now back down!", 2000); d = climbTo(w, x, bottom - 130); await sleep(d * 1000 + 120); set(w, { anim: "idle", rev: false });
      await jump(w, { x: Math.min(Math.max(x + rnd(-170, 170) - size / 2, 10), W() - size - 10), y: bottom }, 70, 1, "victory"); say(w, "Stuck the landing!", 1800);
      delRope(id); await sleep(900);
    };
    const ropeRace = async (a, b) => {
      const xs = [W() * rnd(0.22, 0.38), W() * rnd(0.62, 0.78)], bottom = H() - size - 8, top = 46, who = [a, b];
      await Promise.all(who.map((w, i) => move(w, { x: xs[i] - size / 2, y: bottom }, "walk", 65))); who.forEach((w) => { POSEY[w] = bottom; });
      const ids = xs.map(addRope); say(a, "Race you to the top!", 2200); say(b, "You're on!", 2200); await sleep(2600); say(a, "3… 2… 1… GO!", 1800); await sleep(1900);
      const sp = [rnd(40, 60), rnd(40, 60)], dur = who.map((w, i) => climbTo(w, xs[i], top, sp[i])), win = dur[0] <= dur[1] ? a : b, lose = win === a ? b : a, tw = Math.min(...dur), tl = Math.max(...dur);
      await sleep(tw * 1000 + 100); set(win, { anim: "idle", rev: false, say: "I win!" }); confetti(C(win), "petal"); burst(C(win), "#facc15", "WINNER!");
      await sleep((tl - tw) * 1000 + 120); set(lose, { anim: "idle", rev: false, say: "So close!" }); await sleep(2000);
      who.forEach((w, i) => { const d2 = climbTo(w, xs[i], bottom - 20, 70); }); await sleep(4200); who.forEach((w) => set(w, { anim: "idle", rev: false, say: "" })); ids.forEach(delRope); await sleep(700);
    };
    const parkour = async (w) => { // hop from card to card across the page, then flip back down to the floor
      let spots = platforms().sort(() => Math.random() - 0.5).slice(0, 3).map((r) => ({ x: Math.min(Math.max(r.left + rnd(8, Math.max(9, r.width - size - 8)), 6), W() - size - 6), y: r.top - size + 8 }));
      if (spots.length < 2) spots = Array.from({ length: 3 }, () => ({ x: rnd(30, W() - size - 30), y: rnd(H() * 0.3, H() - size - 30) }));
      await move(w, { x: spots[0].x, y: H() - size - 12 }, "walk", 70);
      for (const s of spots) { say(w, pick(["Hup!", "Hya!", "Parkour!", "Whoa!"]), 1200); await jump(w, s, Math.min(190, 70 + Math.abs(s.y - P[w].y) * 0.4), Math.random() < 0.4 ? 1 : 0); await sleep(650); }
      set(w, { pose: "victory", anim: "dance", say: "Nailed it!" }); confetti({ x: C(w).x, y: C(w).y - 30 }); await sleep(1600);
      await jump(w, { x: rnd(40, W() - size - 40), y: H() - size - 12 }, 130, 1);
    };
    const follow = async (w) => { if (cur.x < 0) return routine(w, "wave");   // trots after the mouse pointer
      say(w, "Wait for me!", 2000);
      for (let i = 0; i < 4 && alive; i++) { const to = { x: Math.min(Math.max(cur.x + rnd(-120, 120) - size / 2, 10), W() - size - 10), y: Math.min(Math.max(cur.y - size * 0.6 + rnd(-40, 40), 70), H() - size - 12) }; await move(w, to, "walk", 85); set(w, { flip: cur.x < C(w).x ? -1 : 1 }); await sleep(900); }
      set(w, { pose: "cheer", anim: "dance", say: "Caught up!" }); await sleep(1500); };
    const meet = async (a, b) => { const mid = { x: rnd(W() * 0.3, W() * 0.6), y: rnd(H() * 0.35, H() * 0.65) }, gap = size * 1.1;
      await Promise.all([move(a, { x: mid.x - gap, y: mid.y }), move(b, { x: mid.x + gap, y: mid.y })]);
      set(a, { flip: 1, pose: "wave", anim: "idle", say: pick(["Hey!", "Morning!", "You again?"]) }); set(b, { flip: -1, pose: "wave", anim: "idle", say: pick(["Hey hey!", "Ready to train?", "Good to see you!"]) });
      await sleep(2400); set(a, { say: "" }); set(b, { say: "" }); };
    const race = async (a, b) => {
      const ly = Math.min(H() - size - 20, Math.max(100, H() * 0.4)), lane = [ly, Math.min(H() - size - 12, ly + size * 0.9)], end = W() - size - 20;
      await Promise.all([move(a, { x: 20, y: lane[0] }, "walk", 60), move(b, { x: 20, y: lane[1] }, "walk", 60)]);
      say(a, "Ready…", 1200); await sleep(1300); say(b, "Set…", 1200); await sleep(1300); say(a, "GO!", 1200);
      const sa = rnd(130, 175), sb = rnd(130, 175), win = sa >= sb ? a : b, lose = win === a ? b : a;
      await Promise.all([move(a, { x: end, y: lane[0] }, "run", sa), move(b, { x: end, y: lane[1] }, "run", sb)]);
      set(win, { pose: "victory", anim: "dance", say: "Winner!" }); confetti(C(win)); set(lose, { pose: "sad", anim: "shake", say: "Rematch!" }); await sleep(2800);
    };
    const doKind = (w, kind) => kind === "follow" ? follow(w) : kind === "rope" ? ropeClimb(w) : kind === "parkour" ? parkour(w) : kind === "run" ? runLaps(w) : kind === "cycle" ? ride(w, "cycle", "Ring ring!", "ride") : kind === "swim" ? ride(w, "swim", "Splash!", "swimbob") : routine(w, kind);

    const fight = async (a, b) => {
      fighting = true;
      const mid = { x: rnd(W() * 0.35, W() * 0.6), y: rnd(H() * 0.35, H() * 0.6) }, gap = Math.min(280, W() * 0.4);
      const place = () => Promise.all([move(a, { x: mid.x - gap / 2 - size / 2, y: mid.y }, "walk", 55), move(b, { x: mid.x + gap / 2 - size / 2, y: mid.y }, "walk", 55)]).then(() => { set(a, { flip: 1 }); set(b, { flip: -1 }); });
      await place(); say(a, "Let's settle this!"); stance(a); await sleep(1500); say(b, "Bring it on!"); stance(b); await sleep(1800);
      let att = a, def = b;
      for (let i = 0; i < 4; i++) { await pick(MOVE[att])(att, C(def), def); [att, def] = [def, att]; await sleep(800); await place(); }
      set(a, { pose: "cheer", anim: "dance" }); say(a, "Good fight!", 3000); set(b, { pose: "wave", anim: "idle" }); say(b, "Rematch later!", 3000);
      await sleep(3200); fighting = false;
    };

    // a click on a primary button = celebration: confetti + everyone on screen cheers
    const celebrate = (p) => { if (fighting) return; confetti(p);
      ON.forEach((w) => { if (lock.has(w)) return; set(w, { pose: "victory", anim: "dance", say: pick(["Logged! 🎉", "Nice work!", "Streak alive!", "Keep it up!"]), air: { n: ++airN, h: 60, ms: 700, rot: 0 } }); setTimeout(() => set(w, { air: null }), 760); }); };
    const onClick = (e) => { const b = e.target.closest?.("button.primary-button, button[type=submit], .add-log-button"); if (!b) return; const r = b.getBoundingClientRect(); celebrate({ x: r.left + r.width / 2, y: r.top }); }; //#web
    document.addEventListener("click", onClick, true); //#web
    //#mob let seenCheer = 0; const cheerWatch = setInterval(() => { if (AUTH.cheerAt && AUTH.cheerAt !== seenCheer) { seenCheer = AUTH.cheerAt; celebrate({ x: W() / 2, y: H() * 0.78 }); } }, 400);

    // ---- login / signup: the cast reacts to the form ----
    const authScene = async () => {
      const [L, R] = [...KEYS].sort(() => Math.random() - 0.5).slice(0, 2);
      const spots = () => {
        const el = authEl(); if (!el) return null;
        const r = (el.querySelector(".auth-card") || el).getBoundingClientRect();
        if (r.left > size + 18 && W() - r.right > size + 18) { const y = Math.min(H() - size - 12, Math.max(70, r.top + r.height * 0.5)); return { L: { x: r.left - size - 10, y }, R: { x: r.right + 10, y } }; }
        const y = Math.max(52, r.top - size * 0.7); return { L: { x: 6, y }, R: { x: W() - size - 6, y } }; // narrow screens: peek over the card's top corners
      };
      [L, R].forEach((w, i) => { P[w] = { x: i ? W() + 30 : -size - 30, y: H() * 0.5 }; ON.add(w); set(w, { on: true, x: P[w].x, y: P[w].y, dur: 0, say: "" }); });
      await sleep(80);
      let s = spots(); if (!s) return;
      await Promise.all([move(L, s.L, "run", 120), move(R, s.R, "run", 120)]); set(L, { flip: 1 }); set(R, { flip: -1 });
      let lastInput = 0; const onInput = () => { lastInput = Date.now(); }; document.addEventListener("input", onInput, true);
      let prev = "", tick = 0;
      const GREET = [["wave", "cheer"], ["task", "wave"], ["dance", "dance"], ["habit", "wave"]];
      while (alive && authEl()) {
        const el = authEl(), m = el.dataset.mode || "login";
        const st = el.querySelector(".auth-error") ? "error" : document.activeElement?.type === "password" ? "pw" : Date.now() - lastInput < 1500 ? "typing" : "idle";
        const key = m + st;
        s = spots() || s;
        if (m === "forgot") set(R, { on: false });
        if (key !== prev || (st === "idle" && tick % 8 === 0)) {
          const first = key !== prev; prev = key;
          if (m !== "forgot") set(R, { on: true });
          if (st === "error") { set(L, { pose: "sad", anim: "shake", say: "Hmm, check that…", flip: 1 }); set(R, { pose: "sad", anim: "shake", say: "Try again!", flip: -1 }); }
          else if (st === "pw") { set(L, { pose: "habit", anim: "idle", say: "Not looking! 🙈", flip: -1 }); set(R, { pose: "habit", anim: "idle", say: "Eyes closed!", flip: 1 }); }
          else if (st === "typing") { set(L, { pose: "cheer", anim: "dance", say: m === "signup" ? "Great name!" : "Nice!", flip: 1 }); set(R, { pose: "cheer", anim: "dance", say: "Keep going!", flip: -1 }); }
          else if (m === "forgot") { set(L, { pose: tick % 2 ? "wave" : "sad", anim: "idle", say: "No worries, we'll help!", flip: 1 }); }
          else if (m === "login") { const [pa, pb] = first ? ["wave", "cheer"] : pick(GREET); set(L, { pose: pa, anim: pa === "dance" ? "dance" : "idle", say: first ? "Welcome back!" : "", flip: 1 }); set(R, { pose: pb, anim: pb === "dance" ? "dance" : "idle", say: first ? "Ready to train?" : "", flip: -1 });
            if (!first && tick % 16 === 8) jump(pick([L, R]), { x: P[L].x, y: P[L].y }, 80, 1, "cheer").catch(() => {}); }
          else { // signup: recruiters patrol up and down the form, then spar to show what training looks like
            if (first || tick % 16 === 0) { say(L, "Join the crew!"); say(R, "Day one starts now!"); }
            if (tick % 16 === 8) { set(L, { pose: "fight", anim: "lunge", say: "Train with us!", flip: 1 }); set(R, { pose: "fight", anim: "lunge", flip: -1 }); burst({ x: s.L.x + size * 1.1, y: s.L.y + size * 0.4 }, "#f59e0b", "HYAH!"); }
            else { move(L, { x: s.L.x, y: Math.min(H() - size - 10, Math.max(70, s.L.y + rnd(-90, 90))) }, "walk", 32); move(R, { x: s.R.x, y: Math.min(H() - size - 10, Math.max(70, s.R.y + rnd(-90, 90))) }, "walk", 32); }
          }
        }
        await sleep(500); tick++;
      }
      document.removeEventListener("input", onInput, true);
      await Promise.all([L, R].map((w, i) => move(w, { x: i ? W() + 40 : -size - 40, y: P[w].y }, "run", 120)));
      [L, R].forEach((w) => { ON.delete(w); set(w, { on: false, say: "" }); });
    };

    const director = async () => {
      await sleep(900);
      while (alive) {
        if (authEl()) { await authScene(); continue; }
        const sl = slot(), n = sl === "night" || Math.random() < 0.3 ? 1 : 2;
        const who = [...KEYS].sort(() => Math.random() - 0.5).slice(0, n);
        const fromLeft = Math.random() < 0.5;
        who.forEach((w, i) => { const x = fromLeft ? -size - 30 - i * 60 : W() + 30 + i * 60; P[w] = { x, y: rnd(120, H() - size - 40) }; ON.add(w); set(w, { on: true, x: P[w].x, y: P[w].y, dur: 0, say: "", air: null }); });
        await sleep(80);
        if (n === 2) { const k = pick(DUO[sl]); if (k === "fight") await fight(who[0], who[1]); else if (k === "race") await race(who[0], who[1]); else if (k === "ropeRace") await ropeRace(who[0], who[1]); else { if (k !== "sleep" && Math.random() < 0.55) await meet(who[0], who[1]); await Promise.all(who.map((w) => doKind(w, k))); } }
        else await doKind(who[0], pick(SOLO[sl]));
        await Promise.all(who.map((w) => move(w, { x: Math.random() < 0.5 ? -size - 40 : W() + 40, y: P[w].y }, "walk", 55)));
        who.forEach((w) => { ON.delete(w); set(w, { on: false, say: "" }); });
        await sleep(authEl() ? 200 : rnd(3000, 6000));
      }
    };

    api.current.poke = async (w) => { // tap: stroll somewhere new, then a trick: signature move, backflip or power-up
      if (lock.has(w) || fighting || authEl()) return; lock.add(w);
      await move(w, spot(), "walk", 80);
      const c = C(w), dir = c.x > W() / 2 ? -1 : 1, t = { x: c.x + dir * 240, y: c.y }; set(w, { flip: dir });
      const trick = pick(["move", "move", "flip", "power"]);
      if (trick === "move") await pick(MOVE[w])(w, t, null);
      else if (trick === "flip") { say(w, "Watch this!", 1500); await jump(w, { x: Math.min(Math.max(P[w].x + dir * 200, 10), W() - size - 10), y: P[w].y }, 150, 2); }
      else { const R = ROUT.powerup; set(w, { pose: R.pose, anim: R.anim, say: R.say(w) }); burst(c, "#f59e0b", "POWER UP!"); quake(); await sleep(2200); }
      set(w, { pose: "victory", anim: "dance" }); await sleep(1600); set(w, { pose: "walk", anim: "idle" }); lock.delete(w);
    };
    const drag = { who: null, moved: false, sx: 0, sy: 0, dx: 0, dy: 0 };
    api.current.dragStart = (w, px, py) => { if (!ON.has(w) || authEl() || fighting) return; Object.assign(drag, { who: w, moved: false, sx: px, sy: py, dx: px - P[w].x, dy: py - P[w].y }); };
    api.current.dragMove = (px, py) => { const w = drag.who; if (!w) return; if (!drag.moved && Math.hypot(px - drag.sx, py - drag.sy) < 6) return;
      if (!drag.moved) { drag.moved = true; held.add(w); set(w, { pose: "cheer", anim: "dangle", dur: 0, say: pick(["Whoa!", "Put me down!", "Wheee!", "Hey hey hey!"]), air: null, flip: 1 }, true); }   // picked up: arms up, dangling
      const x = Math.min(Math.max(px - drag.dx, -10), W() - size + 10), y = Math.min(Math.max(py - drag.dy, 0), H() - size); P[w] = { x, y }; set(w, { x, y, dur: 0 }, true); };
    api.current.dragEnd = async () => { const w = drag.who; if (!w) return; drag.who = null; api.current.wasDrag = drag.moved; if (!drag.moved) return;
      const ground = H() - size - 12, fall = Math.max(0.35, Math.sqrt(Math.max(0, ground - P[w].y)) / 22); held.delete(w);   // dropped: falls with gravity, lands with a squash
      P[w] = { ...P[w], y: ground }; set(w, { y: ground, dur: fall, ease: "i", pose: "cheer", anim: "idle", say: "" }, true); await sleep(fall * 1000);
      dust({ x: P[w].x + size * 0.3, y: P[w].y + size * 0.92 }); dust({ x: P[w].x + size * 0.7, y: P[w].y + size * 0.92 }); set(w, { pose: "idle", anim: "land", say: pick(["Ouch!", "Haha!", "Again!", "Nice flight!"]) }, true); await sleep(1100); set(w, { say: "" }); };
    const onDragMove = (e) => api.current.dragMove(e.clientX, e.clientY), onDragEnd = () => api.current.dragEnd();
    window.addEventListener("pointermove", onDragMove); window.addEventListener("pointerup", onDragEnd); //#web
    const hovering = new Set();
    api.current.hover = async (w) => { if (!ON.has(w) || lock.has(w) || fighting || authEl() || hovering.has(w)) return; hovering.add(w);   // point at one and it greets you
      set(w, { pose: "wave", anim: "idle", say: pick(["Hey!", "Oh, hi!", "👋", "Need a hand?"]), air: { n: ++airN, h: 34, ms: 520, rot: 0 } }); setTimeout(() => set(w, { air: null }), 560); await sleep(2200); hovering.delete(w); };
    director();
    return () => { alive = false; document.removeEventListener("click", onClick, true); window.removeEventListener("pointermove", onMove); window.removeEventListener("pointermove", onDragMove); window.removeEventListener("pointerup", onDragEnd); };
  }, [size]);

  const fxView = (f) => {
    const st = { left: f.x, top: f.y, "--dx": `${f.dx || 0}px`, "--dy": `${f.dy || 0}px`, "--life": `${f.life || 600}ms`, "--d": `${f.delay || 0}ms`, "--c": f.c || "#38bdf8", "--ang": `${f.ang || 0}deg`, "--w": `${size * 0.8}px` };
    if (["arm", "slash", "beam"].includes(f.t)) return <span key={f.id} className={`fx fx-rot fx-rot-${f.t}`} style={{ ...st, transform: `rotate(${f.r}deg)` }}><i style={{ width: f.len }} /></span>;
    if (f.t === "burst") return <span key={f.id} className="fx fx-burst" style={st}><b>{f.w}</b></span>;
    if (f.t === "confetti") return <span key={f.id} className="fx fx-confetti" style={st}>{f.p.map((q, i) => <i key={i} className={q.petal ? "petal" : ""} style={{ "--dx": `${q.dx}px`, "--dy": `${q.dy + 150}px`, "--r": `${q.r}deg`, background: q.c, animationDelay: `${q.d}ms` }} />)}</span>;
    if (f.t === "rush") return <span key={f.id} className={`fx fx-rush fx-${f.cls}`} style={st}><img src={f.img} alt="" draggable="false" /></span>;
    return <span key={f.id} className={`fx fx-${f.t}`} style={st}><i /></span>;
  };

  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  return (
    <div className="rm-layer" aria-hidden="true">
      {ropes.map((q) => <span key={q.id} className={`rm-rope${q.out ? " out" : ""}`} style={{ left: q.x }} />)}
      {cast.map((m) => (
        <button key={m.who} type="button" tabIndex={-1} title={CHARS[m.who]} className={`rm-c${m.on ? " on" : ""}`} onPointerDown={(e) => api.current.dragStart?.(m.who, e.clientX, e.clientY)} onClick={() => { if (api.current.wasDrag) { api.current.wasDrag = false; return; } api.current.poke?.(m.who); }} onMouseEnter={() => api.current.hover?.(m.who)}
          style={{ zIndex: Math.round(m.y), transformOrigin: "50% 100%", transform: `translate(${m.x}px, ${m.y}px) scale(${(0.82 + 0.28 * Math.min(1, Math.max(0, m.y / vh))).toFixed(3)})`, transition: `transform ${m.dur}s ${m.ease === "l" ? "linear" : m.ease === "i" ? "cubic-bezier(.5,0,.9,.6)" : "ease-in-out"}, opacity .4s`, "--sz": `${size}px` }}>
          {m.pose !== "climb" && <span className="rm-shadow" />}
          {m.say && <span className="rm-say">{m.say}</span>}
          <span key={m.air ? m.air.n : "g"} className={m.air ? "rm-air" : "rm-ground"} style={m.air ? { "--h": `${m.air.h}px`, "--ms": `${m.air.ms}ms`, "--rot": `${m.air.rot}deg` } : undefined}>
            <span className="rm-f" style={{ transform: `scaleX(${m.flip})` }}>
              <span key={m.pose} className="rm-pop"><Sprite src={sprite(m.who, m.pose)} who={m.who} pose={m.pose} anim={m.anim} size={size} cyc={m.cyc} rev={m.rev} /></span>
            </span>
          </span>
        </button>
      ))}
      {fxs.map(fxView)}
    </div>
  );
}
