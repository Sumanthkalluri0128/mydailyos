// Roaming companion. ONE character lives along the bottom of the screen and changes every few minutes (or when you pick one):
//  • wander, hop, nap at night; you can PICK THEM UP, DRAG and THROW them (gravity + bounces)
//  • tap = pet (hearts, "bond" grows) · double-tap = celebrate · tap again for comments from your real data + chat chips
//  • EAT what you log: log a meal / water and the food drops from the top, they run over and eat it
//  • PLAY BALL: drag/flick the ball, they chase and kick it back · FOLLOW ME: they trail your finger/cursor
//  • TAGS IN a different character every few minutes · or SWAP to any of the 13 yourself
// Bond levels are remembered per character (localStorage). Everything they say comes from talk.js / ctxStore.js.
import { useEffect, useRef, useState } from "react";
import "./stickers.css";
import { ALL, CHARS, dayChar, stickerFor } from "./chars";
import { insights, reactTo, reply, say } from "./talk";
import { getCtx, refreshCtx } from "./ctxStore";
import { buzz, fireConfetti } from "./motion";

const SIZE = 84, GRAV = 1900, BOUNCE = 0.46, ITEM = 34;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const calm = () => document.documentElement.classList.contains("ff-calm") || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const offKey = "ff_companions_off", castKey = "ff_companions_cast", bondKey = "ff_bond";
export const companionsEnabled = () => { try { return localStorage.getItem(offKey) !== "1"; } catch { return true; } };
export function setCompanionsEnabled(on) { try { localStorage.setItem(offKey, on ? "0" : "1"); } catch { /* ignore */ } window.dispatchEvent(new Event("ff:companions")); }

// ---- bond: how close you are to each character (grows when you pet, feed and play)
const loadBond = () => { try { return JSON.parse(localStorage.getItem(bondKey)) || {}; } catch { return {}; } };
export const bondLevel = (xp = 0) => Math.floor(Math.sqrt(xp / 6)) + 1;
function addBond(who, n) {
  const b = loadBond(); const before = bondLevel(b[who]); b[who] = (b[who] || 0) + n;
  try { localStorage.setItem(bondKey, JSON.stringify(b)); } catch { /* ignore */ }
  const after = bondLevel(b[who]); return { level: after, up: after > before, xp: b[who] };
}
const loadCast = () => { try { const c = JSON.parse(localStorage.getItem(castKey)); if (Array.isArray(c) && ALL.includes(c[0])) return [c[0]]; } catch { /* ignore */ } return [dayChar()]; };

function idleScene() {
  const h = new Date().getHours();
  if (h >= 23 || h < 5) return "sleep";
  if (h >= 6 && h < 9) return pick(["lift", "drink", "wave"]);
  if (h >= 12 && h < 14) return pick(["eat", "chef", "wave"]);
  if (h >= 19 && h < 22) return pick(["game", "task", "health", "wave"]);
  return pick(["wave", "cheer", "task", "habit", "health"]);
}
const MOOD_SCENE = { drink: "drink", eat: "eat", lift: "lift", sad: "sad", party: "victory", thumbs: "habit", sleep: "sleep", think: "think", angry: "angry", laugh: "cheer", hype: "cheer" };
const CHIP_SET = ["Ask me anything 💬", "How am I doing?", "What's next?", "Play ball ⚽", "Follow me 👣", "Swap me 🔄"];
// Questions about your data go to the full assistant (it reads your whole day, week and goals); fun chips stay local.
const TO_ASSISTANT = { "How am I doing?": "How am I doing today?", "What's next?": "What should I do next?", "Motivate me": "I need motivation" };
const FOODS = ["🍛", "🍜", "🍔", "🍱", "🥗", "🍎", "🍕", "🥪"];

export default function Companions() {
  const [on, setOn] = useState(companionsEnabled());
  useEffect(() => { const f = () => setOn(companionsEnabled()); window.addEventListener("ff:companions", f); return () => window.removeEventListener("ff:companions", f); }, []);
  const [authed, setAuthed] = useState(() => !!localStorage.getItem("mydailyos_token"));
  useEffect(() => { const t = setInterval(() => setAuthed(!!localStorage.getItem("mydailyos_token")), 2500); return () => clearInterval(t); }, []);
  if (!on || !authed) return null;
  return <Layer />;
}

function Layer() {
  const cast = useRef(loadCast());
  const [view, setView] = useState(() => cast.current.map((w, i) => ({ w, scene: idleScene(), seed: i, bubble: null, zzz: false, bond: bondLevel(loadBond()[w]) })));
  const viewRef = useRef(view); viewRef.current = view;
  const els = useRef([]);
  const sim = useRef(cast.current.map((w, i) => ({ x: 40 + i * 120, y: 0, vx: 0, vy: 0, dir: 1, mode: "idle", until: 0, squash: 0, t: rnd(0, 6), drag: null, target: null, cd: 0 })));
  const timers = useRef([]);
  const items = useRef([]);            // falling food / water / the ball: {id, kind, emoji, x, y, vx, vy, rest}
  const [itemList, setItemList] = useState([]);
  const itemEls = useRef({});
  const [fx, setFx] = useState([]);    // floating hearts / words
  const pointer = useRef({ x: 0, on: false });
  const follow = useRef(0);
  const lastTouch = useRef(performance.now());
  const swapRef = useRef(null);
  const lastTap = useRef([0, 0]); const tapRun = useRef([0, 0]);

  const patch = (i, p) => setView((v) => v.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const showBubble = (i, bubble, ms = 8000, scene) => {
    patch(i, { bubble, ...(scene ? { scene, seed: Date.now() % 997 } : {}) });
    clearTimeout(timers.current[i]);
    timers.current[i] = setTimeout(() => patch(i, { bubble: null }), ms);
  };
  const hop = (i, power = 520) => { const s = sim.current[i]; if (s.y <= 1 && s.mode !== "drag") { s.vy = power; s.squash = 0.35; } };
  const burst = (i, text, n = 1) => {
    const s = sim.current[i]; const H = window.innerHeight; const F = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cp-floor")) || 76;
    const made = Array.from({ length: n }, (_, k) => ({ id: `${Date.now()}-${i}-${k}-${Math.random()}`, text, x: s.x + SIZE / 2 + (k - (n - 1) / 2) * 22, y: H - F - SIZE - s.y - 10 }));
    setFx((f) => [...f.slice(-14), ...made]);
    setTimeout(() => setFx((f) => f.filter((x) => !made.includes(x))), 1400);
  };
  const feelBond = (i, n, note) => {
    const w = sim.current[i] && viewRef.current[i].w; const r = addBond(w, n);
    patch(i, { bond: r.level });
    if (r.up) { burst(i, "💖", 3); fireConfetti({ count: 40 }); showBubble(i, { text: `Bond level ${r.level}! ${note || "We're getting closer!"}`, who: CHARS[w] }, 4500, "victory"); }
  };

  // ---- the world: physics + wandering + items + games
  useEffect(() => {
    if (calm()) return undefined;
    let raf = 0, last = performance.now();
    const floor = () => Math.max(0, parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cp-floor")) || 76);
    const walkTo = (s, x, speed, onArrive, ms = 7000) => { s.target = { x, speed, onArrive, until: performance.now() + ms }; s.mode = "walk"; s.until = performance.now() + ms; };

    const step = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const W = window.innerWidth, H = window.innerHeight, F = floor();
      const S = sim.current;

      // items (food, water, ball)
      items.current.forEach((it) => {
        if (it.drag) return;
        it.vy -= GRAV * dt; it.y += it.vy * dt; it.x += it.vx * dt;
        if (it.x < 0) { it.x = 0; it.vx = Math.abs(it.vx) * 0.7; } if (it.x > W - ITEM) { it.x = W - ITEM; it.vx = -Math.abs(it.vx) * 0.7; }
        if (it.y <= 0) { it.y = 0; if (Math.abs(it.vy) > 140) it.vy = -it.vy * (it.kind === "ball" ? 0.78 : 0.3); else it.vy = 0; it.vx *= it.kind === "ball" ? 0.985 : 0.8; it.rest = Math.abs(it.vy) < 5; }
        it.spin = (it.spin || 0) + it.vx * dt * 1.2;
        const el = itemEls.current[it.id]; if (el) el.style.transform = `translate3d(${it.x}px, ${H - F - ITEM - it.y}px, 0) rotate(${it.kind === "ball" ? it.spin : 0}deg)`;
      });
      const ball = items.current.find((it) => it.kind === "ball");
      const food = items.current.filter((it) => it.kind !== "ball" && it.rest);

      S.forEach((s, i) => {
        s.t += dt;
        const idleish = s.mode === "idle" || s.mode === "walk";
        // goals the companions give themselves
        if (idleish && !viewRef.current[i].bubble) {
          if (follow.current > now && pointer.current.on) s.target = { x: Math.max(0, Math.min(W - SIZE, pointer.current.x - SIZE / 2)), speed: 150, follow: true, until: now + 400 };
          else if (food.length && !s.target) { const nearest = [...food].sort((a, b) => Math.abs(a.x - s.x) - Math.abs(b.x - s.x))[0]; const mine = S.map((o, k) => (k !== i && o.target?.item === nearest ? 1 : 0)).reduce((a, b) => a + b, 0); if (!mine) { s.target = { x: nearest.x - 20, speed: 120, item: nearest, until: now + 9000 }; s.mode = "walk"; } }
          else if (ball && !s.target && Math.abs(ball.x - s.x) < W) { const others = S.some((o, k) => k !== i && o.target?.chase && Math.abs(o.x - ball.x) < Math.abs(s.x - ball.x)); if (!others) s.target = { x: ball.x - (s.x < ball.x ? 38 : -38), speed: 125, chase: true, until: now + 900 }; }
        }
        if (s.mode !== "drag") {
          if (s.y > 0 || s.vy !== 0) {
            s.vy -= GRAV * dt; s.y += s.vy * dt;
            if (s.y <= 0) { s.y = 0; if (Math.abs(s.vy) > 260) { s.vy = -s.vy * BOUNCE; s.squash = Math.min(0.45, Math.abs(s.vy) / 1400 + 0.2); } else { s.vy = 0; if (s.mode === "fly") { s.mode = "idle"; s.until = now + 600; s.vx = 0; } } }
          }
          if (s.mode === "fly") { s.x += s.vx * dt; if (s.x < 0) { s.x = 0; s.vx = Math.abs(s.vx) * 0.6; } if (s.x > W - SIZE) { s.x = W - SIZE; s.vx = -Math.abs(s.vx) * 0.6; } s.vx *= s.y <= 0 ? 0.9 : 0.995; if (s.y > H - F - SIZE) { s.y = H - F - SIZE; s.vy = -Math.abs(s.vy) * 0.4; } }
          else if (s.target) {
            const dx = s.target.x - s.x;
            if (Math.abs(dx) < 10 || now > s.target.until) {
              const t = s.target; s.target = null; s.mode = "idle"; s.until = now + 1200;
              if (t.item && items.current.includes(t.item)) { // eat it
                items.current = items.current.filter((x) => x !== t.item); setItemList((l) => l.filter((x) => x.id !== t.item.id));
                const w = viewRef.current[i].w; const water = t.item.kind === "water";
                patch(i, { scene: water ? "drink" : "eat", seed: Date.now() % 97 }); hop(i, 420); burst(i, water ? "💦" : "😋", 1); feelBond(i, 5, "Thanks for the snack!");
                const c = getCtx(); const q = c?.today?.quests?.find((x) => x.id === (water ? "water" : "calories"));
                showBubble(i, { who: CHARS[w], text: water ? (q ? `Glug glug! You're at ${q.pct}% of your water goal.` : "Glug glug! Stay hydrated, you!") : (q && q.value ? `Yum! That's ${q.value} of ${q.target} kcal today (${q.pct}%).` : say(w, "eat")) }, 5200, water ? "drink" : "eat");
              }
            } else { s.dir = dx > 0 ? 1 : -1; s.x += s.dir * Math.min(Math.abs(dx), s.target.speed * dt); s.mode = "walk"; }
          } else if (s.mode === "walk") { s.x += s.dir * 46 * dt; if (s.x < 6) { s.x = 6; s.dir = 1; } if (s.x > W - SIZE - 6) { s.x = W - SIZE - 6; s.dir = -1; } if (now > s.until) { s.mode = "idle"; s.until = now + rnd(2500, 7000); if (Math.random() < 0.6) patch(i, { scene: idleScene(), seed: Math.floor(rnd(0, 99)), zzz: false }); } }
          else if (s.mode === "idle" && now > s.until && !viewRef.current[i].bubble) {
            const hh = new Date().getHours();
            if (hh >= 23 || hh < 5) { s.until = now + 8000; patch(i, { scene: "sleep", zzz: true }); }
            else { s.mode = "walk"; s.dir = Math.random() < 0.5 ? -1 : 1; s.until = now + rnd(2200, 5200); patch(i, { zzz: false }); }
          }
          // kick the ball
          if (ball && s.mode !== "fly" && now > s.cd && Math.abs((ball.x + ITEM / 2) - (s.x + SIZE / 2)) < 52 && ball.y < 46) {
            const away = ball.x + ITEM / 2 > s.x + SIZE / 2 ? 1 : -1;
            ball.vx = away * rnd(380, 620); ball.vy = rnd(520, 820); s.cd = now + 500; s.dir = away; hop(i, 380); s.target = null;
            if (Math.random() < 0.35) { patch(i, { scene: pick(["cheer", "victory", "hype"]), seed: Date.now() % 97 }); setTimeout(() => patch(i, { scene: idleScene() }), 1400); }
            if (Math.random() < 0.12) feelBond(i, 1);
          }
        }
        s.squash *= Math.pow(0.0008, dt);
        const walking = s.mode === "walk";
        const bob = walking ? Math.abs(Math.sin(s.t * (s.target?.speed > 100 ? 13 : 9))) * 7 : s.mode === "idle" ? Math.sin(s.t * 2.2) * 1.5 : 0;
        const sx = 1 + s.squash * 0.6 - (s.vy > 0 ? 0.08 : 0), sy = 1 - s.squash * 0.55 + (s.vy > 200 ? 0.1 : 0);
        const el = els.current[i];
        if (el) el.style.transform = `translate3d(${s.x}px, ${H - F - SIZE - s.y - bob}px, 0) scaleX(${s.dir < 0 && s.mode !== "drag" ? -1 : 1}) scale(${sx.toFixed(3)}, ${sy.toFixed(3)}) rotate(${s.mode === "fly" ? Math.max(-25, Math.min(25, s.vx * 0.03)) : s.mode === "drag" ? Math.sin(s.t * 14) * 6 : walking ? Math.sin(s.t * 9) * 4 : 0}deg)`;
        const bubbleEl = el?.querySelector(".cp-bubble");
        if (bubbleEl) {
          const bx = s.x + SIZE / 2; const half = Math.min(135, W * 0.4);
          const shift = Math.max(half - bx + 6, Math.min(0, W - bx - half - 6));
          const flipped = s.dir < 0 && s.mode !== "drag"; const sh = flipped ? -shift : shift; // the parent is mirrored when facing left
          bubbleEl.style.setProperty("--bubx", `calc(-50% + ${sh}px)`); bubbleEl.style.setProperty("--tail", `calc(50% - ${sh}px)`);
          bubbleEl.style.scale = flipped ? "-1 1" : "1 1";
        }
      });

      raf = requestAnimationFrame(step);
    };
    sim.current.forEach((s, i) => { s.x = rnd(20, Math.max(40, window.innerWidth - 140)); s.mode = "idle"; s.until = performance.now() + 1000 + i * 1500; });
    raf = requestAnimationFrame(step);
    // a different character tags in every few minutes (not while you are playing with this one)
    const rotate = setInterval(() => {
      const S = sim.current[0]; const v = viewRef.current[0];
      if (document.hidden || v.bubble || S.mode === "drag" || S.mode === "fly" || S.target || items.current.length) return;
      if (performance.now() - lastTouch.current < 45000) return;
      const h = new Date().getHours(); if (h >= 23 || h < 5) return;
      const next = pick(ALL.filter((k) => k !== v.w));
      const prev = CHARS[v.w];
      showBubble(0, { who: prev, text: pick(["Tagging out — see you!", "My turn's over, bye!", "Time for a swap!"]) }, 1800, "wave");
      setTimeout(() => swapRef.current?.(0, next, `${prev} tagged you in!`), 1900);
    }, 170000);
    const onMove = (e) => { pointer.current = { x: e.clientX, on: true }; };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onMove, { passive: true });
    return () => { cancelAnimationFrame(raf); clearInterval(rotate); window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerdown", onMove); };
  }, []);

  // ---- drop items from the sky
  const dropItem = (kind, emoji, x) => {
    if (items.current.filter((i) => i.kind === kind).length >= (kind === "ball" ? 1 : 3)) return null;
    const it = { id: `${kind}-${Date.now()}-${Math.random()}`, kind, emoji, x: x ?? rnd(30, window.innerWidth - 70), y: window.innerHeight * 0.6, vx: rnd(-40, 40), vy: 0, rest: false };
    items.current = [...items.current, it]; setItemList((l) => [...l, { id: it.id, kind, emoji }]);
    if (kind !== "ball") setTimeout(() => { if (items.current.includes(it)) { items.current = items.current.filter((x) => x !== it); setItemList((l) => l.filter((x) => x.id !== it.id)); } }, 20000);
    return it;
  };
  const ballDown = (it) => (e) => {
    const item = items.current.find((x) => x.id === it.id); if (!item) return; e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId);
    item.drag = { sx: e.clientX, sy: e.clientY, ox: item.x, oy: item.y, pts: [{ x: e.clientX, y: e.clientY, t: performance.now() }] }; item.vx = 0; item.vy = 0;
  };
  const ballMove = (it) => (e) => { const item = items.current.find((x) => x.id === it.id); const d = item?.drag; if (!d) return; item.x = Math.max(0, Math.min(window.innerWidth - ITEM, d.ox + e.clientX - d.sx)); item.y = Math.max(0, d.oy - (e.clientY - d.sy)); d.pts.push({ x: e.clientX, y: e.clientY, t: performance.now() }); if (d.pts.length > 6) d.pts.shift(); };
  const ballUp = (it) => () => { const item = items.current.find((x) => x.id === it.id); const d = item?.drag; if (!d) return; const a = d.pts[0], b = d.pts[d.pts.length - 1], dt = Math.max(0.016, (b.t - a.t) / 1000); item.vx = Math.max(-1600, Math.min(1600, (b.x - a.x) / dt)); item.vy = Math.max(-900, Math.min(1700, -(b.y - a.y) / dt)); item.drag = null; };

  // ---- reactions to what you log: the food falls from the sky and they eat it
  useEffect(() => {
    let timer = 0;
    const onToast = (e) => {
      const d = e.detail || {};
      if (!d.message || /offline|sync/i.test(d.message)) return;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const i = 0;
        const t = d.message.toLowerCase();
        if (d.type === "success") await refreshCtx(true);
        if (d.type === "success" && /water|\bml\b|drink/.test(t)) { dropItem("water", pick(["💧", "🥤"])); return; }
        if (d.type === "success" && /food|meal|ate |eaten|recipe|logged|added/.test(t) && !/weight|task|habit|goal/.test(t)) { dropItem("food", pick(FOODS)); return; }
        const r = reactTo(d.message, d.type || "success", getCtx(), view[i]?.w || cast.current[i]);
        showBubble(i, { text: r.text, who: CHARS[cast.current[i]] }, 6000, MOOD_SCENE[r.mood] || "cheer");
        hop(i, 560); buzz(10); burst(i, r.mood === "sad" ? "💧" : "✨", 2);
        if (/goal|level|streak|album|sticker/i.test(d.message)) { fireConfetti({ count: 60 }); hop(0, 700); }
      }, 600);
    };
    window.addEventListener("mydailyos:toast", onToast);
    return () => { window.removeEventListener("mydailyos:toast", onToast); clearTimeout(timer); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- they speak up now and then, using real progress
  useEffect(() => {
    refreshCtx();
    const t = setInterval(() => {
      if (document.hidden || viewRef.current.some((v) => v.bubble)) return;
      const i = 0, w = viewRef.current[i].w;
      refreshCtx().then((ctx) => {
        const ins = insights(ctx, w);
        const line = ins.length ? ins[Math.floor(Math.random() * Math.min(3, ins.length))] : { mood: "hype", text: say(w, "hype") };
        showBubble(i, { text: line.text, who: CHARS[w] }, 7000, MOOD_SCENE[line.mood]); hop(i, 380);
      });
    }, 45000 + Math.random() * 30000);
    return () => clearInterval(t);
  }, []);

  // ---- pointer: tap (pet), double tap, drag & throw
  const down = (i) => (e) => {
    lastTouch.current = performance.now();
    const s = sim.current[i]; e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId);
    s.drag = { sx: e.clientX, sy: e.clientY, ox: s.x, oy: s.y, pts: [{ x: e.clientX, y: e.clientY, t: performance.now() }], moved: false };
  };
  const move = (i) => (e) => {
    const s = sim.current[i], d = s.drag; if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) > 7) { d.moved = true; s.mode = "drag"; s.vy = 0; s.vx = 0; s.target = null; patch(i, { bubble: null, scene: "shock", seed: 1 }); buzz(8); }
    if (d.moved) { s.x = Math.max(0, Math.min(window.innerWidth - SIZE, d.ox + dx)); s.y = Math.max(0, d.oy - dy); d.pts.push({ x: e.clientX, y: e.clientY, t: performance.now() }); if (d.pts.length > 6) d.pts.shift(); }
  };
  const up = (i) => (e) => {
    const s = sim.current[i], d = s.drag; s.drag = null; if (!d) return;
    const w = viewRef.current[i].w;
    if (d.moved) {
      const a = d.pts[0], b = d.pts[d.pts.length - 1], dt = Math.max(0.016, (b.t - a.t) / 1000);
      s.vx = Math.max(-1400, Math.min(1400, (b.x - a.x) / dt)); s.vy = Math.max(-900, Math.min(1500, -(b.y - a.y) / dt)); s.mode = "fly"; s.squash = 0;
      const speed = Math.hypot(s.vx, s.vy);
      patch(i, { scene: speed > 900 ? "shock" : "cheer", seed: 2 }); setTimeout(() => patch(i, { scene: idleScene() }), 1800);
      if (speed > 1100) { feelBond(i, 1); setTimeout(() => showBubble(i, { text: pick(["Whoaaa!", "I can fly?!", "Again again!", "Wheee!"]), who: CHARS[w] }, 2200), 200); }
      return;
    }
    const now = performance.now();
    if (now - lastTap.current[i] < 320) { // double tap: celebrate
      fireConfetti({ from: e.currentTarget, count: 60 }); hop(i, 760); buzz([14, 30, 14]); burst(i, "🎉", 3); feelBond(i, 2);
      patch(i, { scene: "victory", seed: Date.now() % 97 }); setTimeout(() => patch(i, { scene: idleScene() }), 2600);
      lastTap.current[i] = 0; return;
    }
    lastTap.current[i] = now;
    hop(i, 520); buzz(12); burst(i, "❤️", 1); feelBond(i, 1);
    s.mode = "idle"; s.until = performance.now() + 9000; s.target = null;
    refreshCtx().then((ctx) => {
      const ins = insights(ctx, w); const k = viewRef.current[i].seed || 0;
      const line = ins.length ? ins[k % ins.length] : { mood: "hype", text: say(w, "hype") };
      showBubble(i, { text: line.text, who: CHARS[w], chips: true, bond: bondLevel(loadBond()[w]) }, 13000, MOOD_SCENE[line.mood] || "cheer");
      patch(i, { seed: k + 1 });
    });
  };

  const ask = (i, chip) => {
    const w = viewRef.current[i].w, s = sim.current[i];
    if (chip.startsWith("Play ball")) { const it = dropItem("ball", "⚽", s.x + 70); showBubble(i, { text: it ? "Ball! Throw it — I'll kick it back!" : "The ball is already out — go get it!", who: CHARS[w] }, 3500, "cheer"); hop(i, 520); return; }
    if (chip.startsWith("Follow me")) { follow.current = performance.now() + 14000; showBubble(i, { text: "Lead the way — I'll follow your finger!", who: CHARS[w] }, 3500, "cheer"); hop(i, 420); return; }
    if (chip.startsWith("Swap me")) { showBubble(i, { who: "Choose who joins you", picker: true }, 20000); return; }
    if (chip.startsWith("Ask me anything") || TO_ASSISTANT[chip]) {
      window.dispatchEvent(new CustomEvent("flexfit:ask", { detail: { who: w, question: TO_ASSISTANT[chip] } }));
      showBubble(i, { text: chip.startsWith("Ask me") ? "Ask away. I know your day, your week and every feature!" : "Let me check your numbers…", who: CHARS[w] }, 2500, "think"); hop(i, 420); return;
    }
    const r = reply(chip, w, getCtx());
    showBubble(i, { text: r.text, who: CHARS[w], chips: true, bond: bondLevel(loadBond()[w]) }, 14000, MOOD_SCENE[r.mood] || "cheer"); hop(i, 420);
  };
  const swap = (i, who, note) => {
    cast.current = cast.current.map((w, k) => (k === i ? who : w));
    try { localStorage.setItem(castKey, JSON.stringify(cast.current)); } catch { /* ignore */ }
    patch(i, { w: who, scene: "victory", seed: Date.now() % 97, bubble: { text: note || `${CHARS[who]} joins the party!`, who: CHARS[who] }, bond: bondLevel(loadBond()[who]) });
    hop(i, 760); fireConfetti({ count: 50 }); burst(i, "✨", 3);
    clearTimeout(timers.current[i]); timers.current[i] = setTimeout(() => patch(i, { bubble: null, scene: idleScene() }), 3500);
  };

  swapRef.current = swap;

  return (
    <div className="cp-layer" aria-live="polite">
      {itemList.map((it) => (
        <span key={it.id} ref={(el) => { itemEls.current[it.id] = el; }} className={`cp-item ${it.kind === "ball" ? "is-ball" : ""}`} style={{ width: ITEM, height: ITEM }}
          onPointerDown={it.kind === "ball" ? ballDown(it) : undefined} onPointerMove={it.kind === "ball" ? ballMove(it) : undefined} onPointerUp={it.kind === "ball" ? ballUp(it) : undefined} onPointerCancel={it.kind === "ball" ? ballUp(it) : undefined}>{it.emoji}</span>
      ))}
      {fx.map((f) => <span key={f.id} className="cp-fx" style={{ left: f.x, top: f.y }}>{f.text}</span>)}
      {view.map((v, i) => {
        const st = stickerFor(v.w, v.scene, v.seed);
        return (
          <div key={`${i}-${v.w}`} ref={(el) => { els.current[i] = el; }} className={`cp ${sim.current[i]?.mode === "drag" ? "is-drag" : ""}`} style={{ width: SIZE, height: SIZE }}
            onPointerDown={down(i)} onPointerMove={move(i)} onPointerUp={up(i)} onPointerCancel={up(i)} role="button" aria-label={`${CHARS[v.w]} — tap to pet and chat, drag to throw`}>
            <i className="cp-shadow" />
            <img src={st.src} alt="" width={SIZE} height={SIZE} draggable="false" />
            {v.zzz && <span className="cp-zzz">Z z z</span>}
            {v.bubble && (
              <div className="cp-bubble" onPointerDown={(e) => e.stopPropagation()} role="status">
                <b>{v.bubble.who}{v.bubble.bond ? ` · ❤️ bond ${v.bubble.bond}` : ""}</b>{v.bubble.text}
                {v.bubble.picker && (
                  <div className="cp-pick">{ALL.map((w) => <button key={w} type="button" title={CHARS[w]} onClick={() => swap(i, w)}><img src={stickerFor(w, "cheer", 0).src} alt={CHARS[w]} width="40" height="40" /></button>)}</div>
                )}
                {v.bubble.chips && <div className="cp-chips">{CHIP_SET.map((c) => <button key={c} type="button" onClick={() => ask(i, c)}>{c}</button>)}</div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
