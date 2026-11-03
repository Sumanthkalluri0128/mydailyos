// The smart program (GET /api/body-plan) for the Workout & Body page: one request shared by Today, My plan and Body.
// The last answer is kept in this browser (per signed-in email) so the page opens at once and still works with no connection.
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../config/api";
export { smartUsable } from "./unifiedPlan";

const KEY = (owner) => `ff-wp-smart-v1:${owner || "guest"}`;
const readCache = (owner) => { try { const j = JSON.parse(localStorage.getItem(KEY(owner)) || "null"); return j && j.plan ? j : null; } catch { return null; } };
const writeCache = (owner, data) => { try { localStorage.setItem(KEY(owner), JSON.stringify(data)); } catch { /* storage full or private mode */ } };

export default function useSmartPlan(owner, today) {
  const [data, setData] = useState(() => readCache(owner));
  const [status, setStatus] = useState(() => (readCache(owner) ? "cached" : "loading")); // loading | ready | cached | error
  const [error, setError] = useState("");
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/body-plan?date=${today}`);
      let j = null;
      try { j = await r.json(); } catch { /* not JSON */ }
      if (!r.ok || !j || j.success === false) throw new Error((j && j.message) || (r.status === 503 ? "No connection yet." : `Request failed (${r.status})`));
      if (!alive.current) return;
      const offline = r.headers.get("X-FlexFit-Offline") === "1";
      setData(j); setStatus(offline ? "cached" : "ready"); setError("");
      if (!offline) writeCache(owner, j);
    } catch (e) {
      if (alive.current) { setError(e.message); setStatus((s) => (s === "loading" ? "error" : s)); }
    }
  }, [owner, today]);

  useEffect(() => { alive.current = true; load(); return () => { alive.current = false; }; }, [load]);
  // back online, or the tab comes back to the front: take the newest plan (another device may have logged a session)
  useEffect(() => {
    const again = () => { if (document.visibilityState !== "hidden") load(); };
    window.addEventListener("online", again);
    document.addEventListener("visibilitychange", again);
    return () => { window.removeEventListener("online", again); document.removeEventListener("visibilitychange", again); };
  }, [load]);

  /** The server answers a saved session with the re-worked plan: use it straight away, no second request. */
  const setPlan = useCallback((plan) => setData((d) => { const next = { ...(d || {}), plan }; writeCache(owner, next); return next; }), [owner]);
  return { data, status, error, reload: load, setPlan };
}
