// Tour progress: kept in this browser (localStorage) AND on the server (/api/tour), merged so nothing completed is lost.
// No third-party trackers: the only network calls are to our own API.
import content from "./tourContent.js";
import * as T from "./tourEngine.js";
import { apiFetch } from "../config/api";

const KEY = "ff_tour_v1", PENDING = "ff_tour_pending";
const blank = () => ({ goal: "", coach: "", welcomeSeen: false, status: "idle", index: 0, path: [], done: [], skipped: [], events: [], hintsSeen: [], newSeen: [], checklistDismissed: false, rewardClaimed: false, updatedAt: 0 });
const read = () => { try { return { ...blank(), ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return blank(); } };

let saved = read();
const subs = new Set(), cheers = new Set();
let pushT = null;

const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* private mode: keep going in memory */ } };
const push = () => { clearTimeout(pushT); pushT = setTimeout(() => { if (!localStorage.getItem("mydailyos_token")) return; apiFetch("/api/tour", { method: "PUT", body: JSON.stringify(saved) }).catch(() => {}); }, 1200); };
function set(patch, { sync = true } = {}) { saved = { ...saved, ...patch, updatedAt: Date.now() }; persist(); subs.forEach((f) => f(saved)); if (sync) push(); }

export const getTour = () => saved;
export const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };
export const onCheer = (f) => { cheers.add(f); return () => cheers.delete(f); };

/** The engine state built from what is saved (path comes from the chosen goal until a path is saved). */
export const engineState = () => T.init({ goal: saved.goal || "stay", saved: saved.path.length ? saved : null });
const store = (e) => set({ status: e.status, index: e.index, path: e.path, done: e.done, skipped: e.skipped, events: e.events });

export function apply(fn) { store(fn(engineState())); }
export const queueTour = () => { try { localStorage.setItem(PENDING, "1"); } catch { /* ignore */ } };
export const tourPending = () => { try { return localStorage.getItem(PENDING) === "1"; } catch { return false; } };
export const clearPending = () => { try { localStorage.removeItem(PENDING); } catch { /* ignore */ } };

export function chooseGoal(goal) { const e = T.init({ goal }); set({ goal, ...pickState(e) }); }
const pickState = (e) => ({ status: e.status, index: e.index, path: e.path, done: e.done, skipped: e.skipped, events: e.events });
export const chooseCoach = (coach) => set({ coach });
export function beginTour() { clearPending(); set({ welcomeSeen: true }); apply(T.start); }
export const skipTour = () => apply(T.skip);
export const closeWelcome = () => { clearPending(); set({ welcomeSeen: true }); };
export const dontShowAgain = () => { clearPending(); set({ welcomeSeen: true, checklistDismissed: true }); apply(T.dismiss); };
export const replayTour = () => { clearPending(); set({ welcomeSeen: true }); apply((s) => T.start(T.replay(T.init({ goal: saved.goal || "stay" })))); };
export const resumeTour = () => apply(T.resume);
export const nextStep = () => apply(T.next);
export const backStep = () => apply(T.back);
export const skipMissing = () => apply(T.skipMissing);
export const finishedAndUnclaimed = () => saved.status === "done" && !saved.rewardClaimed;
export const claimReward = () => set({ rewardClaimed: true });
export const dismissChecklist = () => set({ checklistDismissed: true });
export const showChecklist = () => set({ checklistDismissed: false });
export const markHints = (ids) => set({ hintsSeen: [...new Set([...saved.hintsSeen, ...ids])] });
export const resetHints = (screen) => { const ids = T.allHints(screen).map((h) => h.id); set({ hintsSeen: saved.hintsSeen.filter((x) => !ids.includes(x)) }); };
export const markNewSeen = (id) => set({ newSeen: [...new Set([...saved.newSeen, id])] });

/** A real action happened (called from the API wrapper after a successful write). */
export function emit(event) {
  if (!event) return;
  const r = T.onEvent(engineState(), event);
  store(r.state);
  if (r.completed) cheers.forEach((f) => f({ step: r.completed, text: r.cheer }));
}

/** Pull what the server has, merge, and push back. Call once after sign-in. */
export async function syncFromServer() {
  try {
    const res = await apiFetch("/api/tour");
    const j = await res.json();
    if (!j?.success) return;
    const m = T.mergeSaved(saved, j.tour || {});
    saved = { ...saved, ...m, welcomeSeen: saved.welcomeSeen || (j.tour && j.tour.status && j.tour.status !== "idle") || !!(j.tour && (j.tour.done || []).length) };
    persist(); subs.forEach((f) => f(saved)); push();
  } catch { /* offline: local copy is enough */ }
}
export { content };
