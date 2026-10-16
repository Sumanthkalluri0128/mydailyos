// Roaming companions: two characters that wander along the bottom of the screen, hop, nap at night, react to what you
// log, and can be picked up, dragged and THROWN (gravity + bounces). Tap one to hear how your day is going and to ask
// it things. Everything they say comes from your real data (see talk.js / ctxStore.js).
import { useEffect, useRef, useState } from "react";
import "./stickers.css";
import { ALL, CHARS, dayChar, stickerFor } from "./chars";
import { insights, reactTo, reply, say, CHIPS } from "./talk";
import { getCtx, onCtx, refreshCtx } from "./ctxStore";
import { buzz, fireConfetti } from "./motion";

const SIZE = 84, GRAV = 1900, BOUNCE = 0.46;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const calm = () => document.documentElement.classList.contains("ff-calm") || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const offKey = "ff_companions_off";
export const companionsEnabled = () => { try { return localStorage.getItem(offKey) !== "1"; } catch { return true; } };
export function setCompanionsEnabled(on) { try { localStorage.setItem(offKey, on ? "0" : "1"); } catch { /* ignore */ } window.dispatchEvent(new Event("ff:companions")); }

/** The mood sticker a companion shows while idle, by time of day. */
function idleScene() {
  const h = new Date().getHours();
  if (h >= 23 || h < 5) return "sleep";
  if (h >= 6 && h < 9) return pick(["lift", "drink", "wave"]);
  if (h >= 12 && h < 14) return pick(["eat", "chef", "wave"]);
  if (h >= 19 && h < 22) return pick(["game", "task", "health", "wave"]);
  return pick(["wave", "cheer", "task", "habit", "health"]);
}

export default function Companions() {
  const [on, setOn] = useState(companionsEnabled());
  useEffect(() => { const f = () => setOn(companionsEnabled()); window.addEventListener("ff:companions", f); return () => window.removeEventListener("ff:companions", f); }, []);
  const [authed, setAuthed] = useState(() => !!localStorage.getItem("mydailyos_token"));
  useEffect(() => { const t = setInterval(() => setAuthed(!!localStorage.getItem("mydailyos_token")), 2500); return () => clearInterval(t); }, []);
  if (!on || !authed) return null;
  return <Layer />;
}

function Layer() {
  const who = useRef(null);
  if (!who.current) { const a = dayChar(); who.current = [a, pick(ALL.filter((k) => k !== a))]; }
  const [view, setView] = useState(() => who.current.map((w, i) => ({ w, scene: idleScene(), seed: i, bubble: null, zzz: false })));
  const viewRef = useRef(view); viewRef.current = view;
  const els = useRef([]);
  const sim = useRef(who.current.map((w, i) => ({ x: 40 + i * 120, y: 0, vx: 0, vy: 0, dir: 1, mode: "idle", until: 0, squash: 0, t: rnd(0, 6), drag: null })));
  const bubbleTimers = useRef([]);

  const patch = (i, p) => setView((v) => v.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const showBubble = (i, bubble, ms = 8000, scene) => {
    patch(i, { bubble, ...(scene ? { scene, seed: Date.now() % 997 } : {}) });
    clearTimeout(bubbleTimers.current[i]);
    bubbleTimers.current[i] = setTimeout(() => patch(i, { bubble: null }), ms);
  };
  const hop = (i, power = 520) => { const s = sim.current[i]; if (s.y <= 1 && s.mode !== "drag") { s.vy = power; s.squash = 0.35; } };

  // --- physics + wandering loop
  useEffect(() => {
    if (calm()) return undefined;
    let raf = 0, last = performance.now();
    const floor = () => Math.max(0, parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cp-floor")) || 70);
    const step = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const W = window.innerWidth, H = window.innerHeight, F = floor();
      sim.current.forEach((s, i) => {
        s.t += dt;
        if (s.mode === "drag") { /* position set by pointer */ }
        else {
          // vertical: s.y = height above the floor
          if (s.y > 0 || s.vy !== 0) {
            s.vy -= GRAV * dt; s.y += s.vy * dt;
            if (s.y <= 0) { s.y = 0; if (Math.abs(s.vy) > 260) { s.vy = -s.vy * BOUNCE; s.squash = Math.min(0.45, Math.abs(s.vy) / 1400 + 0.2); } else { s.vy = 0; if (s.mode === "fly") { s.mode = "idle"; s.until = now + 600; s.vx = 0; } } }
          }
          if (s.mode === "fly") { s.x += s.vx * dt; if (s.x < 0) { s.x = 0; s.vx = Math.abs(s.vx) * 0.6; } if (s.x > W - SIZE) { s.x = W - SIZE; s.vx = -Math.abs(s.vx) * 0.6; } s.vx *= s.y <= 0 ? 0.9 : 0.995; if (s.y > H - F - SIZE) { s.y = H - F - SIZE; s.vy = -Math.abs(s.vy) * 0.4; } }
          else if (s.mode === "walk") { s.x += s.dir * 46 * dt; if (s.x < 6) { s.x = 6; s.dir = 1; } if (s.x > W - SIZE - 6) { s.x = W - SIZE - 6; s.dir = -1; } if (now > s.until) { s.mode = "idle"; s.until = now + rnd(2500, 7000); if (Math.random() < 0.6) patch(i, { scene: idleScene(), seed: Math.floor(rnd(0, 99)), zzz: false }); } }
          else if (s.mode === "idle" && now > s.until && !viewRef.current[i].bubble) {
            const sleepy = new Date().getHours() >= 23 || new Date().getHours() < 5;
            if (sleepy) { s.until = now + 8000; patch(i, { scene: "sleep", zzz: true }); }
            else { s.mode = "walk"; s.dir = Math.random() < 0.5 ? -1 : 1; s.until = now + rnd(2200, 5200); patch(i, { zzz: false }); }
          }
        }
        s.squash *= Math.pow(0.0008, dt);
        const walking = s.mode === "walk";
        const bob = walking ? Math.abs(Math.sin(s.t * 9)) * 7 : s.mode === "idle" ? Math.sin(s.t * 2.2) * 1.5 : 0;
        const sq = s.squash;
        const sx = 1 + sq * 0.6 - (s.vy > 0 ? 0.08 : 0), sy = 1 - sq * 0.55 + (s.vy > 200 ? 0.1 : 0);
        const el = els.current[i];
        if (el) el.style.transform = `translate3d(${s.x}px, ${H - F - SIZE - s.y - bob}px, 0) scaleX(${s.dir < 0 && s.mode !== "drag" ? -1 : 1}) scale(${sx.toFixed(3)}, ${sy.toFixed(3)}) rotate(${s.mode === "fly" ? Math.max(-25, Math.min(25, s.vx * 0.03)) : s.mode === "drag" ? Math.sin(s.t * 14) * 6 : walking ? Math.sin(s.t * 9) * 4 : 0}deg)`;
        const bubbleEl = el?.querySelector(".cp-bubble");
        if (bubbleEl) { // keep the bubble on screen and un-mirrored
          const bx = s.x + SIZE / 2; const half = Math.min(125, W * 0.36);
          const shift = Math.max(half - bx + 6, Math.min(0, W - bx - half - 6));
          bubbleEl.style.setProperty("--bubx", `calc(-50% + ${shift}px)`); bubbleEl.style.setProperty("--tail", `calc(50% - ${shift}px)`);
          bubbleEl.style.scale = s.dir < 0 && s.mode !== "drag" ? "-1 1" : "1 1";
        }
      });
      raf = requestAnimationFrame(step);
    };
    sim.current.forEach((s, i) => { s.x = rnd(20, Math.max(40, window.innerWidth - 140)); s.mode = "idle"; s.until = performance.now() + 1000 + i * 1500; });
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  // --- reactions to what the person logs (the app's toast event), with fresh numbers from the server
  useEffect(() => {
    let timer = 0;
    const onToast = (e) => {
      const d = e.detail || {};
      if (!d.message || /offline|sync/i.test(d.message)) return;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const i = Math.floor(Math.random() * 2);
        if (d.type === "success") await refreshCtx(true);
        const r = reactTo(d.message, d.type || "success", getCtx(), who.current[i]);
        showBubble(i, { text: r.text, who: CHARS[who.current[i]] }, 6000, ({ drink: "drink", eat: "eat", lift: "lift", sad: "sad", party: "victory", thumbs: "habit" })[r.mood] || "cheer");
        hop(i, 560); buzz(10);
        if (/goal|level|streak/i.test(d.message)) fireConfetti?.({ count: 50 });
      }, 700);
    };
    window.addEventListener("mydailyos:toast", onToast);
    return () => { window.removeEventListener("mydailyos:toast", onToast); clearTimeout(timer); };
  }, []);

  // --- they speak up now and then, using real progress
  useEffect(() => {
    refreshCtx();
    const unsub = onCtx(() => {});
    const t = setInterval(() => {
      if (document.hidden || viewRef.current.some((v) => v.bubble)) return;
      const i = Math.floor(Math.random() * 2), w = who.current[i];
      refreshCtx().then((ctx) => {
        const ins = insights(ctx, w);
        const line = ins.length ? ins[Math.floor(Math.random() * Math.min(3, ins.length))] : { mood: "hype", text: say(w, "hype") };
        showBubble(i, { text: line.text, who: CHARS[w] }, 7000, ({ drink: "drink", eat: "eat", lift: "lift", sad: "sad", party: "victory", sleep: "sleep" })[line.mood] || undefined);
        hop(i, 380);
      });
    }, 45000 + Math.random() * 30000);
    return () => { clearInterval(t); unsub(); };
  }, []);

  // --- pointer: tap, double tap, drag & throw
  const down = (i) => (e) => {
    const s = sim.current[i]; e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId);
    s.drag = { sx: e.clientX, sy: e.clientY, ox: s.x, oy: s.y, pts: [{ x: e.clientX, y: e.clientY, t: performance.now() }], moved: false, t0: performance.now() };
  };
  const move = (i) => (e) => {
    const s = sim.current[i], d = s.drag; if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) > 7) { d.moved = true; s.mode = "drag"; s.vy = 0; s.vx = 0; patch(i, { bubble: null, scene: "shock", seed: 1 }); buzz(8); }
    if (d.moved) {
      s.x = Math.max(0, Math.min(window.innerWidth - SIZE, d.ox + dx)); s.y = Math.max(0, d.oy - dy);
      d.pts.push({ x: e.clientX, y: e.clientY, t: performance.now() }); if (d.pts.length > 6) d.pts.shift();
    }
  };
  const lastTap = useRef([0, 0]);
  const up = (i) => (e) => {
    const s = sim.current[i], d = s.drag; s.drag = null; if (!d) return;
    const w = who.current[i];
    if (d.moved) {
      const a = d.pts[0], b = d.pts[d.pts.length - 1], dt = Math.max(0.016, (b.t - a.t) / 1000);
      s.vx = Math.max(-1400, Math.min(1400, (b.x - a.x) / dt)); s.vy = Math.max(-900, Math.min(1500, -(b.y - a.y) / dt));
      s.mode = "fly"; s.squash = 0;
      const speed = Math.hypot(s.vx, s.vy);
      patch(i, { scene: speed > 900 ? "shock" : "cheer", seed: 2 });
      setTimeout(() => patch(i, { scene: idleScene() }), 1800);
      if (speed > 1100) setTimeout(() => showBubble(i, { text: pick(["Whoaaa!", "I can fly?!", "Again again!", "Wheee!"]), who: CHARS[w] }, 2200), 200);
      return;
    }
    const now = performance.now();
    if (now - lastTap.current[i] < 320) { // double tap: celebrate
      fireConfetti({ from: e.currentTarget, count: 60 }); hop(i, 760); buzz([14, 30, 14]);
      patch(i, { scene: "victory", seed: Date.now() % 97 }); setTimeout(() => patch(i, { scene: idleScene() }), 2600);
      lastTap.current[i] = 0; return;
    }
    lastTap.current[i] = now;
    hop(i, 520); buzz(12);
    s.mode = "idle"; s.until = performance.now() + 9000;
    refreshCtx().then((ctx) => {
      const ins = insights(ctx, w); const k = (viewRef.current[i].seed || 0);
      const line = ins.length ? ins[k % ins.length] : { mood: "hype", text: say(w, "hype") };
      showBubble(i, { text: line.text, who: CHARS[w], chips: true }, 12000, ({ drink: "drink", eat: "eat", lift: "lift", sad: "sad", party: "victory", sleep: "sleep", think: "think", angry: "angry" })[line.mood] || "cheer");
      patch(i, { seed: k + 1 });
    });
  };
  const ask = (i, chip) => {
    const w = who.current[i]; const r = reply(chip, w, getCtx());
    showBubble(i, { text: r.text, who: CHARS[w], chips: true }, 14000, ({ party: "victory", laugh: "cheer", think: "think", drink: "drink", eat: "eat", lift: "lift", sad: "sad" })[r.mood] || "cheer");
    hop(i, 420);
  };

  return (
    <div className="cp-layer" aria-live="polite">
      {view.map((v, i) => {
        const st = stickerFor(v.w, v.scene, v.seed);
        return (
          <div key={v.w} ref={(el) => { els.current[i] = el; }} className={`cp ${sim.current[i]?.mode === "drag" ? "is-drag" : ""}`} style={{ width: SIZE, height: SIZE }}
            onPointerDown={down(i)} onPointerMove={move(i)} onPointerUp={up(i)} onPointerCancel={up(i)} role="button" aria-label={`${CHARS[v.w]} — tap to chat, drag to throw`}>
            <i className="cp-shadow" />
            <img src={st.src} alt="" width={SIZE} height={SIZE} draggable="false" />
            {v.zzz && <span className="cp-zzz">Z z z</span>}
            {v.bubble && (
              <div className="cp-bubble" onPointerDown={(e) => e.stopPropagation()} role="status">
                <b>{v.bubble.who}</b>{v.bubble.text}
                {v.bubble.chips && <div className="cp-chips">{CHIPS.map((c) => <button key={c} type="button" onClick={() => ask(i, c)}>{c}</button>)}</div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
