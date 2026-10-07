// Shared helpers for the FlexFit motion kit (no dependencies).
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

/** Older decorative effects (confetti, count-up, page transitions) are off unless localStorage ff_classic_motion=1. */
export const classicMotion = () => { try { return localStorage.getItem("ff_calm_motion") !== "1"; } catch { return true; } };

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Light haptic on Android/Chrome. iOS Safari ignores vibrate(), which is fine. */
export const buzz = (p = 12) => { try { if (!prefersReducedMotion()) navigator.vibrate?.(p); } catch {} };

/** Rolls a number up to `value`. Returns the target immediately for reduced-motion users. */
export function useCountUp(value, ms = 900) {
  const [n, setN] = useState(prefersReducedMotion() || !classicMotion() ? value : 0);
  const from = useRef(0);
  useEffect(() => {
    if (prefersReducedMotion() || !classicMotion()) { setN(value); return; }
    const start = performance.now(), a = from.current;
    let raf;
    const tick = (t) => {
      const p = Math.min((t - start) / ms, 1), e = 1 - Math.pow(1 - p, 3);
      const v = a + (value - a) * e;
      setN(v); from.current = v;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return Math.round(n);
}

const COLORS = ["#6847e8", "#e8476f", "#2587d9", "#20a46b", "#ffb020", "#ffffff"];

/** Canvas confetti from an element (or screen centre). Self-cleaning, ~1.8s. */
export function fireConfetti({ from, count = 70, spread = Math.PI * 1.1 } = {}) {
  if (prefersReducedMotion() || !classicMotion() || typeof document === "undefined") return;
  const dpr = window.devicePixelRatio || 1;
  const W = window.innerWidth, H = window.innerHeight;
  const cv = document.createElement("canvas");
  cv.width = W * dpr; cv.height = H * dpr;
  Object.assign(cv.style, { position: "fixed", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 9999 });
  document.body.appendChild(cv);
  const ctx = cv.getContext("2d"); ctx.scale(dpr, dpr);
  const r = from?.getBoundingClientRect?.();
  const ox = r ? r.left + r.width / 2 : W / 2, oy = r ? r.top + r.height / 2 : H * 0.4;
  const ps = Array.from({ length: count }, () => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * spread, s = 5 + Math.random() * 9;
    return { x: ox, y: oy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, w: 5 + Math.random() * 5, h: 3 + Math.random() * 4,
      rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: COLORS[(Math.random() * COLORS.length) | 0] };
  });
  const t0 = performance.now();
  (function frame(t) {
    const life = (t - t0) / 1800;
    ctx.clearRect(0, 0, W, H);
    for (const p of ps) {
      p.vy += 0.28; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - life * life);
      ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    }
    life < 1 ? requestAnimationFrame(frame) : cv.remove();
  })(t0);
}

/** Cross-fades a state change with the View Transitions API when available; plain update otherwise. */
export function withTransition(update) {
  if (prefersReducedMotion() || !classicMotion() || !document.startViewTransition) return update();
  document.startViewTransition(() => flushSync(update));
}

/** Show a skeleton only if loading lasts > `delay` ms, then keep it >= `min` ms so it never flashes. */
export function useSkeleton(loading, { delay = 120, min = 350 } = {}) {
  const [show, setShow] = useState(false);
  const since = useRef(0);
  useEffect(() => {
    let t;
    if (loading) t = setTimeout(() => { since.current = Date.now(); setShow(true); }, delay);
    else if (show) t = setTimeout(() => setShow(false), Math.max(0, min - (Date.now() - since.current)));
    return () => clearTimeout(t);
  }, [loading, delay, min, show]);
  return show;
}

/** Fires once per key per day when `done` flips false -> true (never on first load). */
const seen = new Set();
const dayKey = (key) => `ff_cel_${new Date().toDateString()}_${key}`;
const alreadyDone = (k) => { if (seen.has(k)) return true; try { return localStorage.getItem(k) === "1"; } catch { return false; } };
const markDone = (k) => { seen.add(k); try { localStorage.setItem(k, "1"); } catch { /* private mode: in-memory only */ } };
export function useCelebrateOnce(key, done, fn) {
  const prev = useRef(done);
  useEffect(() => {
    const k = dayKey(key);
    if (done && prev.current === false && !alreadyDone(k)) { markDone(k); fn(); }
    prev.current = done;
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps
}
