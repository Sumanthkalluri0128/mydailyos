// Tour state for the web app: one small store (no library). Progress is kept in this browser AND on the server (/api/tour), so it follows the person
// to another device and a refresh never loses it. Nothing goes to a third party.
import { useSyncExternalStore } from "react";
import { apiFetch } from "../config/api";
import { getLocalDate } from "../utils/date";
import { actionForRequest, currentId, init, markLookDone, next as engNext, back as engBack, onAction, pathFor, resume, skipAll, whatsNew, hintsFor, markSeen } from "./engine.js";

const LOCAL = "ff_tour_v1", PENDING = "ff_tour_pending";
const loadLocal = () => { try { return JSON.parse(localStorage.getItem(LOCAL) || "{}") || {}; } catch { return {}; } };
const saveLocal = (patch) => { try { localStorage.setItem(LOCAL, JSON.stringify({ ...loadLocal(), ...patch })); } catch { /* private mode: server copy still works */ } };

let hasAnchor = () => true;                       // set by the host: can this step be shown? (anchors are only checked for steps on the page that is open now)
export const setAnchorChecker = (fn) => { hasAnchor = fn || (() => true); };

const loc = loadLocal();
let state = {
  ready: false, phase: "idle",                    // idle | welcome | steps | finished
  welcomeIndex: 0, from: "auto",
  goal: loc.goal || "", goalKnown: false, coachKnown: false, mode: loc.mode || "",
  tone: "cheer", who: "", engine: null, celebrate: null,
  checklist: null, checklistDismissed: !!loc.checklistDismissed, never: !!loc.never,
  hintsSeen: loc.hintsSeen || [], newSeen: loc.newSeen || [], rookie: { unlocked: false }, unlockedNow: false,
};
const subs = new Set();
const set = (p) => { state = { ...state, ...p }; subs.forEach((f) => f()); };
export const getTour = () => state;
export const useTour = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state, () => state);

const signedIn = () => { try { return !!localStorage.getItem("mydailyos_token"); } catch { return false; } };
const call = async (method, path, body) => {
  try { const r = await apiFetch(`/api/tour${path}`, { method, body: body ? JSON.stringify(body) : undefined }); return r.ok ? await r.json() : null; } catch { return null; }
};
const mergeServer = (d) => {
  if (!d) return;
  const t = d.tour || {};
  const hintsSeen = markSeen(state.hintsSeen, t.coachmarksSeen || []), newSeen = markSeen(state.newSeen, t.whatsNewSeen || []);
  saveLocal({ hintsSeen, newSeen, goal: d.goal || state.goal, mode: t.mode || state.mode, checklistDismissed: !!t.checklistDismissed, never: !!t.never });
  set({ goal: d.goal || state.goal, goalKnown: !!d.goalKnown, coachKnown: !!d.coachKnown, mode: t.mode || state.mode, checklist: d.checklist || state.checklist, hintsSeen, newSeen,
    checklistDismissed: !!t.checklistDismissed, never: !!t.never, rookie: d.rookie || state.rookie, serverStatus: t.status || "", serverStarted: !!t.startedAt, serverDone: t.stepsDone || [], serverStep: t.step || 0 });
};

/** Load progress from the server (and the coach's name and tone, if set). Safe to call many times. */
export async function loadTour() {
  if (!signedIn()) return;
  const [d, prefs] = await Promise.all([call("GET", ""), apiFetch("/api/food-prefs").then((r) => (r.ok ? r.json() : null)).catch(() => null)]);
  mergeServer(d);
  const c = prefs && prefs.coach ? prefs.coach : {};
  set({ ready: true, tone: ["cheer", "calm", "strict"].includes(c.tone) ? c.tone : state.tone, who: c.who || state.who });
  if (typeof window !== "undefined" && localStorage.getItem(PENDING) === "1" && !state.never && state.phase === "idle" && (!d || !d.tour || d.tour.status !== "done")) startTour("auto");
}

/** A brand-new account finished onboarding: the tour opens on Home. */
export const queueTour = () => { try { localStorage.setItem(PENDING, "1"); } catch { /* ignore */ } };

export async function startTour(from = "profile", { fresh } = {}) {
  try { localStorage.removeItem(PENDING); } catch { /* ignore */ }
  if (from === "profile") { mergeServer(await call("DELETE", "")); saveLocal({ never: false }); set({ never: false }); }
  else mergeServer(await call("PATCH", "", { status: "active" }));
  set({ phase: "welcome", welcomeIndex: 0, from, engine: null, celebrate: null, unlockedNow: false });
}
export const welcomeNext = () => (state.welcomeIndex >= 2 ? beginSteps() : set({ welcomeIndex: state.welcomeIndex + 1 }));
export const welcomeBack = () => set({ welcomeIndex: Math.max(0, state.welcomeIndex - 1) });

export async function chooseGoal(goal) { set({ goal, goalKnown: true }); saveLocal({ goal }); mergeServer(await call("PATCH", "", { goal })); }

/** The welcome is over: build the path for the goal and start the first win. */
export function beginSteps() {
  const path = pathFor(state.goal || "healthy", state.mode);
  const saved = state.from === "auto" && state.serverDone ? { done: state.serverDone, index: state.serverStep } : {};
  let eng = init(path, saved);
  eng = resume(eng, hasAnchor);
  set({ phase: eng.status === "active" ? "steps" : "finished", engine: eng });
  if (eng.status !== "active") finishTour();
  else call("PATCH", "", { status: "active", goal: state.goal || undefined });
}

const persist = (eng) => call("PATCH", "", { step: eng.index, stepsDone: eng.done });

export function nextStep() {
  if (!state.engine) return;
  const eng = engNext(markLookDone(state.engine), hasAnchor);
  set({ engine: eng, celebrate: null });
  if (eng.status === "finished") finishTour(); else persist(eng);
}
/** The anchor never showed up (another layout, a hidden feature): move on instead of breaking. */
export function skipMissing(anchor) {
  if (state.phase !== "steps" || !state.engine) return;
  const eng = engNext(state.engine, (a, stp) => a !== anchor && hasAnchor(a, stp));
  set({ engine: eng, celebrate: null });
  if (eng.status === "finished") finishTour(); else persist(eng);
}
export function backStep() { if (state.engine) { const e = engBack(state.engine, hasAnchor); set({ engine: e, celebrate: null }); persist(e); } }
export async function skipTour(never = false) {
  if (state.engine) set({ engine: skipAll(state.engine) });
  set({ phase: "idle", celebrate: null, never: never || state.never });
  saveLocal({ never: never || state.never });
  mergeServer(await call("PATCH", "", { status: "skipped", ...(never ? { never: true } : {}), ...(state.engine ? { step: state.engine.index, stepsDone: state.engine.done } : {}) }));
}
export async function finishTour() {
  set({ phase: "finished" });
  const d = await call("POST", "/complete");
  mergeServer(d);
  set({ unlockedNow: !!(d && d.unlockedSticker) });
}
export const closeFinished = () => set({ phase: "idle", engine: null, unlockedNow: false });

/** A real action happened (the api layer calls this after a successful write). */
export function noteAction(action) {
  if (!action || !signedIn()) return;
  if (state.phase === "steps" && state.engine) {
    const eng = onAction(state.engine, action);
    if (eng !== state.engine) {
      set({ engine: eng, celebrate: eng.justDone || null });
      persist(eng);
      if (eng.justDone) setTimeout(() => { if (getTour().celebrate === eng.justDone) nextStep(); }, 1900);
    }
  }
  call("POST", "/event", { action }).then(mergeServer);
}
if (typeof window !== "undefined") {
  window.addEventListener("ff:tour", (e) => noteAction(e.detail && e.detail.action));
  window.addEventListener("flexfit:synced", () => { if (signedIn() && getTour().ready) call("GET", "").then(mergeServer); });
}
/** Called by the api layer for every finished request. */
export const noteRequest = (method, url, ok) => { if (ok) { const a = actionForRequest(method, url); if (a) window.dispatchEvent(new CustomEvent("ff:tour", { detail: { action: a } })); } };
export const emitTour = (action) => { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("ff:tour", { detail: { action } })); };

/* ---------- checklist, hints, what's new ---------- */
export async function dismissChecklist(v = true) { set({ checklistDismissed: v }); saveLocal({ checklistDismissed: v }); mergeServer(await call("PATCH", "", { checklistDismissed: v })); }
export async function seeHints(ids) { const hintsSeen = markSeen(state.hintsSeen, ids); set({ hintsSeen }); saveLocal({ hintsSeen }); call("PATCH", "", { coachmarksSeen: ids }); }
export async function seeNew(id) { const newSeen = markSeen(state.newSeen, [id]); set({ newSeen }); saveLocal({ newSeen }); call("PATCH", "", { whatsNewSeen: [id] }); }
export const hintsToShow = (screen) => (state.never || state.phase !== "idle" ? [] : hintsFor(screen, state.hintsSeen));
export const newToShow = () => whatsNew(state.newSeen, getLocalDate());
export { currentId };
/** Profile switch: "Don't show tours or tips again" (and back on). */
export async function setNever(v) { set({ never: v }); saveLocal({ never: v }); mergeServer(await call("PATCH", "", { never: v })); }
