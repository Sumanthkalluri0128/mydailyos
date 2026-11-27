// Keeps the Gym log the same on every device the person uses (this browser, the phone) by syncing the log itself to their own account.
// OFF until the person turns it on for this account (Gym log > Export > "Sync across my devices"). Then it runs quietly:
// after a change, when the tab is shown again, when the connection returns, and on "Sync now". Offline or a sleeping server just
// leaves the work pending. The rules (newest edit wins, deletions travel, a wiped browser restores instead of deleting) live in
// utils/recordSync.js, shared with the phone and tested there.
import { useSyncExternalStore } from "react";
import { apiFetch } from "../config/api";
import { isSignedIn } from "../auth/session";
import { currentOwner } from "./cacheOwner";
import { EMPTY_MEMORY, syncRound } from "./recordSync";
import { GYM_SPACE, gymToRecords } from "./gymRecords";
import { applyRemote, consumeBulkRecords, getGym, gymOwner, subscribeGym } from "./gymStore";

const memKey = (o) => `flexfit_gymrec_v1:${o}`;
const onKey = (o) => `flexfit_gymrec_on:${o}`;
let running = false, again = false, started = false, timer = null, bulk = false;

// ---- the small status the Gym page shows
let status = { on: false, state: "off", last: 0, message: "" };
const listeners = new Set();
const setStatus = (patch) => { status = { ...status, ...patch }; listeners.forEach((l) => l()); };
export const useRecordSyncStatus = () => useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => status, () => status);

export function isRecordSyncOn() { const o = currentOwner(); try { return !!o && localStorage.getItem(onKey(o)) === "1"; } catch { return false; } }
function refreshOn() { const on = isRecordSyncOn(); if (on !== status.on) setStatus({ on, state: on ? "idle" : "off" }); return on; }

/** Turn the sync on or off for the signed-in account. Turning it off keeps everything where it is (here and on the server). */
export function setRecordSync(on) {
  const o = currentOwner(); if (!o) return false;
  try { if (on) localStorage.setItem(onKey(o), "1"); else localStorage.removeItem(onKey(o)); } catch { return false; }
  setStatus({ on: !!on, state: on ? "idle" : "off", message: "" });
  if (on) schedule(200);
  return true;
}

function loadMem(o) { try { const j = JSON.parse(localStorage.getItem(memKey(o)) || "null"); return j && j.known && typeof j.known === "object" ? { v: 1, cursor: Number(j.cursor) || 0, known: j.known } : { ...EMPTY_MEMORY, known: {} }; } catch { return { ...EMPTY_MEMORY, known: {} }; } }
const saveMem = (o, m) => { try { localStorage.setItem(memKey(o), JSON.stringify(m)); } catch { /* private mode: it just sends again next time, which is harmless */ } };

async function json(r) { if (!r.ok) throw new Error(`sync ${r.status}`); const j = await r.json().catch(() => null); if (!j || !j.success) throw new Error("sync failed"); return j; }

export async function syncRecordsNow() {
  if (running) { again = true; return; }
  if (!isSignedIn() || !refreshOn()) return;
  running = true;
  const o = currentOwner();
  setStatus({ state: "syncing", message: "" });
  try {
    if (gymOwner() !== o) return;                       // the log on screen is not this account's yet: wait
    let mem = loadMem(o);
    bulk = consumeBulkRecords() || bulk;
    const res = await syncRound({
      current: () => gymToRecords(getGym()),
      memory: () => mem,
      save: (m) => { mem = m; if (currentOwner() === o) saveMem(o, m); },
      push: async (records) => json(await apiFetch("/api/sync/push", { method: "POST", body: JSON.stringify({ space: GYM_SPACE, records }) })),
      pull: async (since) => json(await apiFetch(`/api/sync/pull?space=${GYM_SPACE}&since=${since}&limit=500`)),
      apply: (upserts, removals) => { if (currentOwner() === o && gymOwner() === o) applyRemote(upserts, removals); },
    }, { allowBulkDelete: bulk });
    bulk = false;
    setStatus({ state: "ok", last: Date.now(), message: res.heldBack ? `${res.heldBack} missing entries were restored instead of deleted.` : "" });
  } catch { setStatus({ state: "error", message: "Could not reach your account. Your log is safe here and will sync later." }); /* offline or server waking up: tried again later */ }
  finally { running = false; if (again) { again = false; schedule(); } }
}

function schedule(ms = 3000) { clearTimeout(timer); timer = setTimeout(() => { timer = null; syncRecordsNow(); }, ms); }

/** Start once when the signed-in app opens. Does nothing until the person has turned the sync on. */
export function startRecordSync() {
  if (started || typeof window === "undefined") return;
  started = true;
  refreshOn();
  subscribeGym(() => { if (refreshOn()) schedule(); });
  window.addEventListener("online", () => { if (refreshOn()) schedule(800); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && refreshOn()) schedule(1500); });
  schedule(2500);
}
