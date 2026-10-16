// Shares today's journey data (level, quests, streak, goals) with every character so they can comment on real progress.
import { apiFetch } from "../config/api";

let ctx = null, at = 0, inflight = null;
const subs = new Set();
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export const getCtx = () => ctx;
export const onCtx = (fn) => { subs.add(fn); return () => subs.delete(fn); };
export function refreshCtx(force = false) {
  if (typeof localStorage === "undefined" || !localStorage.getItem("mydailyos_token")) return Promise.resolve(ctx);
  if (!force && ctx && Date.now() - at < 90000) return Promise.resolve(ctx);
  if (inflight) return inflight;
  inflight = apiFetch(`/api/goals/journey?today=${today()}`)
    .then((r) => r.json())
    .then((d) => { if (d?.success) { ctx = d; at = Date.now(); subs.forEach((f) => f(ctx)); } return ctx; })
    .catch(() => ctx)
    .finally(() => { inflight = null; });
  return inflight;
}
