// Living cast. Usually 2 characters (sometimes 1) wander the whole page at a slow walk and behave by time of day:
// morning workouts + water, midday meals, afternoon tasks/spars, evening fights + dancing, night sleep.
// Fights use each hero's real techniques with visible effects: Rasengan / Shadow Clones, Gum-Gum Pistol / Bazooka / Gatling,
// Oni Giri / flying slash, Shadow Army (Arise) / Shadow Exchange. Tap a character to make them show a move.
import { useEffect, useRef, useState } from "react";
import "./roamers.css";
import { CHARS, sprite } from "./chars";

const KEYS = Object.keys(CHARS);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const calm = () => document.documentElement.classList.contains("ff-calm") || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const slot = () => { const h = new Date().getHours(); return h >= 22 || h < 5 ? "night" : h < 10 ? "morning" : h < 14 ? "noon" : h < 18 ? "afternoon" : "evening"; };

const EAT = { zoro: "Sake and rice. Perfect.", naruto: "Ichiraku ramen!", luffy: "MEEEAT!!", jinwoo: "Restoring HP…" };
const ROUT = {
  lift: { pose: "lift", anim: "lift", say: () => "Morning reps!" }, drink: { pose: "drink", anim: "eat", say: () => "Hydration check!" },
  eat: { pose: "eat", anim: "eat", say: (w) => EAT[w] }, task: { pose: "task", anim: "idle", say: () => "Ticking off tasks" },
  plan: { pose: "plan", anim: "idle", say: () => "Planning the week" }, dance: { pose: "cheer", anim: "dance", say: () => "♪ ♫ ♪" },
  wave: { pose: "wave", anim: "idle", say: () => "Keep your streak alive!" }, scale: { pose: "scale", anim: "idle", say: () => "Weigh-in time" },
  sleep: { pose: "sad", anim: "sleep", say: () => "zZz…" }, walk: { pose: "walk", anim: "walk", say: () => "" },
};
const SOLO = { morning: ["lift", "drink", "wave", "scale"], noon: ["eat", "drink", "task"], afternoon: ["task", "plan", "walk", "lift"], evening: ["dance", "lift", "wave"], night: ["sleep"] };
const DUO = { morning: ["lift", "lift", "drink", "fight"], noon: ["eat", "eat", "fight"], afternoon: ["fight", "task", "fight"], evening: ["fight", "fight", "dance"], night: ["sleep"] };

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
    const move = async (w, to, pose = "walk", speed = 55) => {
      const d = Math.hypot(to.x - P[w].x, to.y - P[w].y), dur = Math.max(1.2, d / speed);
      set(w, { x: to.x, y: to.y, dur, pose, anim: "walk", flip: to.x < P[w].x ? -1 : 1 });
      P[w] = { x: to.x, y: to.y };
      await sleep(dur * 1000 + 60); set(w, { anim: "idle" });
    };
    const knock = async (a, d) => {
      const nx = Math.min(Math.max(P[d].x + (P[d].x >= P[a].x ? 1 : -1) * 60, 10), W() - size - 10);
      P[d] = { ...P[d], x: nx }; set(d, { x: nx, dur: 0.5, anim: "shake", pose: "sad" });
      await sleep(900); set(d, { anim: "idle", pose: "walk" });
    };
    const arm = (c, t, delay = 0, dy = 0, life = 1200) => fx({ t: "arm", x: c.x, y: c.y + dy, len: Math.hypot(t.x - c.x, t.y - c.y), r: (Math.atan2(t.y - c.y, t.x - c.x) * 180) / Math.PI, delay, life }, life + delay);
    const rush = (img, s, t, delay, life, cls) => fx({ t: "rush", cls, img, x: s.x, y: s.y, dx: t.x - s.x, dy: t.y - s.y, delay, life }, life + delay);

    const MOVE = {
      naruto: [
        async (a, t, d) => { const c = C(a), h = { x: c.x, y: c.y - size * 0.2 }; set(a, { pose: "lift", anim: "lift" }); say(a, "Rasengan!", 3200);
          fx({ t: "charge", x: h.x, y: h.y, life: 1400 }, 1400); await sleep(1400);
          fx({ t: "orb", x: h.x, y: h.y, dx: t.x - h.x, dy: t.y - h.y, life: 1100 }, 1100); await sleep(1050); burst(t, "#38bdf8", "BOOM!"); if (d) await knock(a, d); },
        async (a, t, d) => { const c = C(a); say(a, "Shadow Clone Jutsu!", 3400); burst(c, "#cbd5e1", "POOF!");
          [[-70, -25], [70, -25], [0, 55]].forEach(([ox, oy], i) => rush(sprite("naruto", "walk"), { x: c.x + ox, y: c.y + oy }, t, 500 + i * 350, 1500, "clone"));
          await sleep(2300); burst(t, "#f59e0b", "WHAM!"); if (d) await knock(a, d); },
      ],
      luffy: [
        async (a, t, d) => { const c = C(a); set(a, { pose: "lift", anim: "lift" }); say(a, "Gum-Gum Pistol!", 2800); await sleep(800); arm(c, t); await sleep(520); burst(t, "#ef4444", "PISTOL!"); if (d) await knock(a, d); },
        async (a, t, d) => { const c = C(a); set(a, { pose: "lift", anim: "lift" }); say(a, "Gum-Gum Bazooka!", 3000); await sleep(900); arm(c, t, 0, -16); arm(c, t, 0, 16); await sleep(540); burst(t, "#f97316", "BAZOOKA!"); if (d) await knock(a, d); },
        async (a, t, d) => { const c = C(a); set(a, { pose: "lift", anim: "shake" }); say(a, "Gum-Gum Gatling!", 3400); await sleep(700);
          for (let i = 0; i < 5; i++) { arm(c, { x: t.x + rnd(-30, 30), y: t.y + rnd(-40, 40) }, 0, rnd(-14, 14), 520); await sleep(260); burst({ x: t.x + rnd(-30, 30), y: t.y + rnd(-30, 30) }, "#ef4444", "!"); }
          if (d) await knock(a, d); },
      ],
      zoro: [
        async (a, t, d) => { const dir = t.x >= C(a).x ? 1 : -1; say(a, "Santoryu… Oni Giri!", 3400); set(a, { pose: "lift", anim: "lift" }); await sleep(1000);
          await move(a, { x: t.x - size / 2 - dir * size * 0.55, y: t.y - size / 2 }, "walk", 130);
          [-38, 0, 38].forEach((r, i) => fx({ t: "slash", x: t.x, y: t.y, r, delay: i * 170 }, 420 + i * 170)); await sleep(600);
          await move(a, { x: t.x - size / 2 + dir * size * 0.7, y: t.y - size / 2 }, "walk", 170); if (d) await knock(a, d); },
        async (a, t, d) => { const c = C(a); set(a, { pose: "lift", anim: "lift" }); say(a, "108 Pound Phoenix!", 3000); await sleep(1000);
          fx({ t: "crescent", x: c.x, y: c.y, dx: t.x - c.x, dy: t.y - c.y, ang: (Math.atan2(t.y - c.y, t.x - c.x) * 180) / Math.PI + 90, life: 1000 }, 1000); await sleep(950); burst(t, "#22c55e", "SLASH!"); if (d) await knock(a, d); },
      ],
      jinwoo: [
        async (a, t, d) => { const c = C(a); set(a, { pose: "lift", anim: "lift" }); say(a, "Arise!", 3200);
          [[-80, 10], [0, -50], [80, 10]].forEach(([ox, oy], i) => rush(sprite("jinwoo", "walk"), { x: c.x + ox, y: c.y + oy }, t, i * 250, 2000, "shade"));
          await sleep(2300); burst(t, "#8b5cf6", "SHADOW ARMY!"); if (d) await knock(a, d); },
        async (a, t, d) => { const dir = t.x >= C(a).x ? 1 : -1; say(a, "Shadow Exchange!", 3000); set(a, { anim: "blink" }); await sleep(900);
          await move(a, { x: t.x - size / 2 - dir * size * 0.6, y: t.y - size / 2 }, "walk", 220);
          [-28, 28].forEach((r, i) => fx({ t: "slash", x: t.x, y: t.y, r, c: "#a78bfa", delay: i * 180 }, 450 + i * 180)); await sleep(600); burst(t, "#8b5cf6", "STRIKE!"); if (d) await knock(a, d); },
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
      await place(); say(a, "Let's settle this!"); await sleep(1500); say(b, "Bring it on!"); await sleep(1800);
      let att = a, def = b;
      for (let i = 0; i < 4; i++) { await pick(MOVE[att])(att, C(def), def); [att, def] = [def, att]; await sleep(800); await place(); }
      set(a, { pose: "cheer", anim: "dance" }); say(a, "Good fight!", 3000); set(b, { pose: "wave", anim: "idle" }); say(b, "Rematch later!", 3000);
      await sleep(3200); fighting = false;
    };

    const director = async () => {
      await sleep(1200);
      while (alive) {
        const sl = slot(), n = sl === "night" || Math.random() < 0.3 ? 1 : 2;
        const who = [...KEYS].sort(() => Math.random() - 0.5).slice(0, n);
        const fromLeft = Math.random() < 0.5;
        who.forEach((w, i) => { const x = fromLeft ? -size - 30 - i * 60 : W() + 30 + i * 60; P[w] = { x, y: rnd(120, H() - size - 40) }; set(w, { on: true, x: P[w].x, y: P[w].y, dur: 0, say: "" }); });
        await sleep(80);
        if (n === 2) { const k = pick(DUO[sl]); if (k === "fight") await fight(who[0], who[1]); else await Promise.all(who.map((w) => routine(w, k))); }
        else await routine(who[0], pick(SOLO[sl]));
        await Promise.all(who.map((w) => move(w, { x: Math.random() < 0.5 ? -size - 40 : W() + 40, y: P[w].y }, "walk", 55)));
        who.forEach((w) => set(w, { on: false, say: "" }));
        await sleep(rnd(3000, 6000));
      }
    };

    api.current.poke = async (w) => { // tap: stroll somewhere new, then show a signature move at thin air
      if (lock.has(w) || fighting) return; lock.add(w);
      await move(w, spot(), "walk", 80);
      const c = C(w), dir = c.x > W() / 2 ? -1 : 1, t = { x: c.x + dir * 240, y: c.y }; set(w, { flip: dir });
      await pick(MOVE[w])(w, t, null); set(w, { pose: "cheer", anim: "dance" }); await sleep(1800); set(w, { pose: "walk", anim: "idle" }); lock.delete(w);
    };
    director();
    return () => { alive = false; };
  }, [size]);

  const fxView = (f) => {
    const st = { left: f.x, top: f.y, "--dx": `${f.dx || 0}px`, "--dy": `${f.dy || 0}px`, "--life": `${f.life || 600}ms`, "--d": `${f.delay || 0}ms`, "--c": f.c || "#22c55e", "--ang": `${f.ang || 0}deg`, "--w": `${size * 0.8}px` };
    if (f.t === "arm" || f.t === "slash") return <span key={f.id} className={`fx fx-rot fx-rot-${f.t}`} style={{ ...st, transform: `rotate(${f.r}deg)` }}><i style={{ width: f.len }} /></span>;
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
            <img className={`rm-img rm-${m.anim}`} src={sprite(m.who, m.pose)} width={size} height={size} alt="" draggable="false" />
          </span>
        </button>
      ))}
      {fxs.map(fxView)}
    </div>
  );
}
