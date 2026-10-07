// Living cast. Usually 2 characters (sometimes 1) wander the page at a slow walk, with legs and arms swinging, and behave by time of day.
// Fights use each hero's own fight sticker plus their real techniques. On the login / signup screens they act differently:
// login = greeters (they look away while you type your password), signup = recruiters (patrol and spar beside the form).
import { useEffect, useRef, useState } from "react";
import "./roamers.css";
import { CHARS, sprite } from "./chars";

const KEYS = Object.keys(CHARS);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const calm = () => document.documentElement.classList.contains("ff-calm") || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const slot = () => { const h = new Date().getHours(); return h >= 22 || h < 5 ? "night" : h < 10 ? "morning" : h < 14 ? "noon" : h < 18 ? "afternoon" : "evening"; };
const authEl = () => document.querySelector(".auth-shell");

const EAT = { zoro: "Sake and rice. Perfect.", naruto: "Ichiraku ramen!", luffy: "MEEEAT!!", jinwoo: "Restoring HP…", goku: "Need. More. Food.", gojo: "Sweets break~" };
const ROUT = {
  habit: { pose: "habit", anim: "idle", say: () => "Focus. Breathe. Train." }, drink: { pose: "drink", anim: "eat", say: () => "Hydration check!" },
  eat: { pose: "eat", anim: "eat", say: (w) => EAT[w] }, task: { pose: "task", anim: "idle", say: () => "Ticking off tasks" },
  plan: { pose: "plan", anim: "idle", say: () => "Planning the week" }, dance: { pose: "dance", anim: "dance", say: () => "♪ ♫ ♪" },
  wave: { pose: "wave", anim: "idle", say: () => "Keep your streak alive!" }, scale: { pose: "scale", anim: "idle", say: () => "Weigh-in time" },
  sleep: { pose: "sleep", anim: "snore", say: () => "zZz…" }, walk: { pose: "walk", anim: "walk", say: () => "" },
};
const SOLO = { morning: ["habit", "drink", "wave", "scale"], noon: ["eat", "drink", "task"], afternoon: ["task", "plan", "walk", "habit"], evening: ["dance", "habit", "wave"], night: ["sleep"] };
const DUO = { morning: ["habit", "habit", "drink", "fight"], noon: ["eat", "eat", "fight"], afternoon: ["fight", "task", "fight"], evening: ["fight", "fight", "dance"], night: ["sleep"] };

function Sprite({ src, walk, anim, size }) {
  if (!walk) return <img className={`rm-img rm-${anim}`} src={src} width={size} height={size} alt="" draggable="false" />;
  const I = (c) => <img className={`rm-p ${c}`} src={src} alt="" draggable="false" />; // one sprite, cut into body / 2 arms / 2 legs that swing
  return <span className="rm-walker" style={{ width: size, height: size }}>{I("rm-body")}{I("rm-arm rm-arm-l")}{I("rm-arm rm-arm-r")}{I("rm-leg rm-leg-l")}{I("rm-leg rm-leg-r")}</span>;
}

export default function Roamers() {
  const size = useRef(typeof window !== "undefined" && window.innerWidth < 640 ? 70 : 96).current;
  const [cast, setCast] = useState(() => KEYS.map((who) => ({ who, x: -300, y: 200, dur: 0, pose: "walk", anim: "idle", flip: 1, say: "", on: false })));
  const [fxs, setFxs] = useState([]);
  const api = useRef({});

  useEffect(() => {
    if (calm()) return undefined;
    let alive = true, fighting = false;
    const lock = new Set(), P = {};
    KEYS.forEach((k) => { P[k] = { x: -300, y: 200 }; });
    const W = () => window.innerWidth, H = () => window.innerHeight;
    const set = (who, p) => alive && setCast((c) => c.map((m) => (m.who === who ? { ...m, ...p } : m)));
    const spot = () => ({ x: rnd(16, Math.max(90, W() - size - 16)), y: rnd(90, Math.max(150, H() - size - 20)) });
    const C = (w) => ({ x: P[w].x + size / 2, y: P[w].y + size / 2 });
    const say = (w, s, ms = 2400) => { set(w, { say: s }); setTimeout(() => set(w, { say: "" }), ms); };
    const fx = (o, ms) => { const id = Math.random(); setFxs((f) => [...f, { id, ...o }]); setTimeout(() => setFxs((f) => f.filter((x) => x.id !== id)), ms); };
    const burst = (p, c, w) => fx({ t: "burst", x: p.x, y: p.y, c, w }, 700);
    const move = async (w, to, pose = "walk", speed = 55, anim = "walk") => {
      const d = Math.hypot(to.x - P[w].x, to.y - P[w].y), dur = Math.max(1.2, d / speed);
      set(w, { x: to.x, y: to.y, dur, pose, anim, flip: to.x < P[w].x ? -1 : 1 });
      P[w] = { x: to.x, y: to.y };
      await sleep(dur * 1000 + 60); set(w, { anim: "idle" });
    };
    const knock = async (a, d) => {
      const nx = Math.min(Math.max(P[d].x + (P[d].x >= P[a].x ? 1 : -1) * 60, 10), W() - size - 10);
      P[d] = { ...P[d], x: nx }; set(d, { x: nx, dur: 0.5, anim: "shake", pose: "sad" });
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

    const routine = async (w, kind) => {
      const R = ROUT[kind];
      const to = kind === "sleep" ? { x: rnd(20, W() - size - 20), y: H() - size - 16 } : spot();
      await move(w, to, "walk", 50);
      set(w, { pose: R.pose, anim: R.anim, say: R.say(w) });
      await sleep(kind === "sleep" ? 14000 : rnd(6000, 9000)); set(w, { say: "" });
    };

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

    // ---- login / signup: the cast reacts to the form ----
    const authScene = async () => {
      const [L, R] = [...KEYS].sort(() => Math.random() - 0.5).slice(0, 2);
      const spots = () => {
        const el = authEl(); if (!el) return null;
        const r = (el.querySelector(".auth-card") || el).getBoundingClientRect();
        if (r.left > size + 18 && W() - r.right > size + 18) { const y = Math.min(H() - size - 12, Math.max(70, r.top + r.height * 0.5)); return { L: { x: r.left - size - 10, y }, R: { x: r.right + 10, y } }; }
        const y = Math.max(52, r.top - size * 0.7); return { L: { x: 6, y }, R: { x: W() - size - 6, y } }; // narrow screens: peek over the card's top corners
      };
      [L, R].forEach((w, i) => { P[w] = { x: i ? W() + 30 : -size - 30, y: H() * 0.5 }; set(w, { on: true, x: P[w].x, y: P[w].y, dur: 0, say: "" }); });
      await sleep(80);
      let s = spots(); if (!s) return;
      await Promise.all([move(L, s.L, "walk", 90), move(R, s.R, "walk", 90)]); set(L, { flip: 1 }); set(R, { flip: -1 });
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
          else if (m === "login") { const [pa, pb] = first ? ["wave", "cheer"] : pick(GREET); set(L, { pose: pa, anim: pa === "dance" ? "dance" : "idle", say: first ? "Welcome back!" : "", flip: 1 }); set(R, { pose: pb, anim: pb === "dance" ? "dance" : "idle", say: first ? "Ready to train?" : "", flip: -1 }); }
          else { // signup: recruiters patrol up and down the form, then spar to show what training looks like
            if (first || tick % 16 === 0) { say(L, "Join the crew!"); say(R, "Day one starts now!"); }
            if (tick % 16 === 8) { set(L, { pose: "fight", anim: "lunge", say: "Train with us!", flip: 1 }); set(R, { pose: "fight", anim: "lunge", flip: -1 }); burst({ x: s.L.x + size * 1.1, y: s.L.y + size * 0.4 }, "#f59e0b", "HYAH!"); }
            else { move(L, { x: s.L.x, y: Math.min(H() - size - 10, Math.max(70, s.L.y + rnd(-90, 90))) }, "walk", 32); move(R, { x: s.R.x, y: Math.min(H() - size - 10, Math.max(70, s.R.y + rnd(-90, 90))) }, "walk", 32); }
          }
        }
        await sleep(500); tick++;
      }
      document.removeEventListener("input", onInput, true);
      await Promise.all([L, R].map((w, i) => move(w, { x: i ? W() + 40 : -size - 40, y: P[w].y }, "walk", 90)));
      [L, R].forEach((w) => set(w, { on: false, say: "" }));
    };

    const director = async () => {
      await sleep(900);
      while (alive) {
        if (authEl()) { await authScene(); continue; }
        const sl = slot(), n = sl === "night" || Math.random() < 0.3 ? 1 : 2;
        const who = [...KEYS].sort(() => Math.random() - 0.5).slice(0, n);
        const fromLeft = Math.random() < 0.5;
        who.forEach((w, i) => { const x = fromLeft ? -size - 30 - i * 60 : W() + 30 + i * 60; P[w] = { x, y: rnd(120, H() - size - 40) }; set(w, { on: true, x: P[w].x, y: P[w].y, dur: 0, say: "" }); });
        await sleep(80);
        if (n === 2) { const k = pick(DUO[sl]); if (k === "fight") await fight(who[0], who[1]); else await Promise.all(who.map((w) => routine(w, k))); }
        else await routine(who[0], pick(SOLO[sl]));
        await Promise.all(who.map((w) => move(w, { x: Math.random() < 0.5 ? -size - 40 : W() + 40, y: P[w].y }, "walk", 55)));
        who.forEach((w) => set(w, { on: false, say: "" }));
        await sleep(authEl() ? 200 : rnd(3000, 6000));
      }
    };

    api.current.poke = async (w) => { // tap: stroll somewhere new (legs swinging), then show a signature move
      if (lock.has(w) || fighting || authEl()) return; lock.add(w);
      await move(w, spot(), "walk", 80);
      const c = C(w), dir = c.x > W() / 2 ? -1 : 1, t = { x: c.x + dir * 240, y: c.y }; set(w, { flip: dir });
      await pick(MOVE[w])(w, t, null); set(w, { pose: "cheer", anim: "dance" }); await sleep(1800); set(w, { pose: "walk", anim: "idle" }); lock.delete(w);
    };
    director();
    return () => { alive = false; };
  }, [size]);

  const fxView = (f) => {
    const st = { left: f.x, top: f.y, "--dx": `${f.dx || 0}px`, "--dy": `${f.dy || 0}px`, "--life": `${f.life || 600}ms`, "--d": `${f.delay || 0}ms`, "--c": f.c || "#38bdf8", "--ang": `${f.ang || 0}deg`, "--w": `${size * 0.8}px` };
    if (["arm", "slash", "beam"].includes(f.t)) return <span key={f.id} className={`fx fx-rot fx-rot-${f.t}`} style={{ ...st, transform: `rotate(${f.r}deg)` }}><i style={{ width: f.len }} /></span>;
    if (f.t === "burst") return <span key={f.id} className="fx fx-burst" style={st}><b>{f.w}</b></span>;
    if (f.t === "rush") return <span key={f.id} className={`fx fx-rush fx-${f.cls}`} style={st}><img src={f.img} alt="" draggable="false" /></span>;
    return <span key={f.id} className={`fx fx-${f.t}`} style={st}><i /></span>;
  };

  return (
    <div className="rm-layer" aria-hidden="true">
      {cast.map((m) => (
        <button key={m.who} type="button" tabIndex={-1} title={CHARS[m.who]} className={`rm-c${m.on ? " on" : ""}`} onClick={() => api.current.poke?.(m.who)}
          style={{ transform: `translate(${m.x}px, ${m.y}px)`, transition: `transform ${m.dur}s ease-in-out, opacity .4s`, "--sz": `${size}px` }}>
          {m.say && <span className="rm-say">{m.say}</span>}
          <span className="rm-f" style={{ transform: `scaleX(${m.flip})` }}>
            <Sprite src={sprite(m.who, m.pose)} walk={m.pose === "walk" && m.anim === "walk"} anim={m.anim} size={size} />
          </span>
        </button>
      ))}
      {fxs.map(fxView)}
    </div>
  );
}
