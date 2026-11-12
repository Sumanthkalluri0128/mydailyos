// Sends each logged gym exercise's minutes and estimated calories to the server, so the Exercise page and Home count them.
// Only what is needed for that goes out (name, date, sets x reps x weight, minutes, kcal): never body measurements or goals.
// Quiet by design: offline, a sleeping server or any error just leaves the work pending; it is retried on the next change,
// when the tab comes back into view, and when the connection returns. Safe to repeat (one server row per gym entry).
import { apiFetch } from "../config/api";
import { isSignedIn } from "../auth/session";
import { getLocalDate } from "./date";
import { consumeBulkChange, getGym, subscribeGym } from "./gymStore";
import { EMPTY_MEMORY, applyResult, hasWork, planGymSync } from "./gymSync";

const KEY = "flexfit_gymsync_v1";
let running = false, again = false, bulk = false, started = false, timer = null;

function loadMem() {
  try { const j = JSON.parse(localStorage.getItem(KEY) || "null"); return j && j.synced && typeof j.synced === "object" ? { synced: j.synced } : { ...EMPTY_MEMORY, synced: {} }; } catch { return { synced: {} }; }
}
const saveMem = (m) => { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* private mode: it just re-sends next time, which is harmless */ } };

/** Forget what was synced (sign-out), so the next account starts clean. */
export function resetGymSync() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

export async function syncGymNow() {
  if (running) { again = true; return; }
  running = true;
  let changed = false;
  try {
    if (!isSignedIn()) return;
    let m = loadMem();
    for (let round = 0; round < 6; round++) {
      bulk = consumeBulkChange() || bulk;
      const { entries, body } = getGym();
      const plan = planGymSync(entries, body, m, getLocalDate(), bulk);
      if (!hasWork(plan)) break;
      const r = await apiFetch("/api/activities/gym-sync", { method: "POST", body: JSON.stringify({ entries: plan.upsert, removeIds: plan.removeIds }) });
      if (!r.ok) break;
      const res = await r.json().catch(() => null);
      if (!res || !res.success) break;
      bulk = false;
      const next = applyResult(m, plan.upsert, res.synced || [], plan.removeIds);
      saveMem(next);
      const progressed = (res.synced || []).length > 0 || plan.removeIds.length > 0; // the server rejected everything: stop, do not loop
      m = next; changed = true;
      if (!progressed) break;
    }
  } catch { /* offline or server waking up: still pending, tried again later */ }
  finally {
    running = false;
    // Exercise, Home and the calorie balance reload from the server when they hear this.
    if (changed) { try { window.dispatchEvent(new Event("ff:refresh")); } catch { /* ignore */ } }
    if (again) { again = false; schedule(); }
  }
}

function schedule(ms = 400) {
  clearTimeout(timer);
  timer = setTimeout(() => { timer = null; syncGymNow(); }, ms);
}

/** Start once when the signed-in app opens: syncs on every gym change, when the tab is shown again and when the connection returns. */
export function startGymSync() {
  if (started || typeof window === "undefined") return;
  started = true;
  subscribeGym(() => schedule());
  window.addEventListener("online", () => schedule(800));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") schedule(1200); });
  schedule(1500);
}
