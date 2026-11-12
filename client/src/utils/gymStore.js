// Local-only storage for the Gym log on the web app: exercises (sets x reps x weight), body weight, tape measurements and the body goal.
// Everything lives in this browser's localStorage. There is deliberately NO API call anywhere in the gym log: it is not uploaded,
// not synced and not part of the server backup. Data leaves the browser only when the person clicks a download button (gymDownload.js).
import { useSyncExternalStore } from "react";
import { cleanBody, cleanEntry, sane } from "./gymClean";

const KEY = "flexfit_gymlog_v1";
const EMPTY = { v: 1, entries: [], body: [], goal: null, profile: { unit: "kg" } };

function read() {
  try { const raw = localStorage.getItem(KEY); return raw ? sane(JSON.parse(raw)) : EMPTY; } catch { return EMPTY; }
}
let state = read();
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

/** Returns false when the browser refused the write (private mode, storage full) so the page can warn the person. */
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch { return false; }
}
function set(patch) {
  state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
  emit();
  return persist();
}
// Another tab changed the log: pick it up.
if (typeof window !== "undefined") window.addEventListener("storage", (e) => { if (e.key === KEY) { state = read(); emit(); } });

export const getGym = () => state;
export function useGymStore() {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => state, () => EMPTY);
}
export const gymId = (p = "g") => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export function saveEntry(e) {
  const clean = cleanEntry(e);
  if (!clean) return false;
  return set((s) => ({ entries: [...s.entries.filter((x) => x.id !== clean.id), clean] }));
}
export const removeEntry = (id) => set((s) => ({ entries: s.entries.filter((x) => x.id !== id) }));
/** One body record per day: saving again on the same day fills in / overwrites only the fields that were typed. */
export function saveBody(b) {
  return set((s) => {
    const same = s.body.find((x) => x.date === b.date);
    const merged = { id: same?.id || gymId("b"), at: Date.now(), date: b.date, weightKg: b.weightKg ?? same?.weightKg, bodyFat: b.bodyFat ?? same?.bodyFat, sites: { ...(same?.sites || {}), ...b.sites }, note: b.note || same?.note };
    const clean = cleanBody(merged);
    return { body: clean ? [...s.body.filter((x) => x.id !== merged.id && x.date !== b.date), clean] : s.body };
  });
}
export const removeBody = (id) => set((s) => ({ body: s.body.filter((x) => x.id !== id) }));
export const saveGoal = (g) => set({ goal: g });
export const saveProfile = (p) => set((s) => ({ profile: { ...s.profile, ...p } }));
export function clearGym() { return set((s) => ({ ...EMPTY, profile: s.profile })); }
/** Replace the whole log (used by "Restore from backup"). Cleaned first, so a bad file can't break the page. */
export function replaceGym(raw) { return set(sane(raw)); }
