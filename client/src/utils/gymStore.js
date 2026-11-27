// Storage for the Gym log on the web app: exercises (sets x reps x weight), body weight, tape measurements and the body goal.
// The log lives in this browser's localStorage, in a copy that belongs to the signed-in account (so another account on this browser
// never sees it). This file makes no API calls. Two things can leave the browser, both from their own files:
//   * utils/gymSyncRunner.js: each exercise's minutes and estimated calories, so the Exercise page and Home count them (always on);
//   * utils/gymRecordRunner.js: the log itself, to the person's own account, so the phone and other browsers show the same log. Off
//     until the person turns it on (Gym log > Export > "Sync across my devices").
// Otherwise data leaves only when the person clicks a download button (gymDownload.js).
import { useSyncExternalStore } from "react";
import { cleanBody, cleanEntry, sane } from "./gymClean";
import { applyRecords } from "./gymRecords";
import { currentOwner } from "./cacheOwner";

const LEGACY_KEY = "flexfit_gymlog_v1";                    // before v76: one log for the whole browser, whoever was signed in
const keyFor = (owner) => `flexfit_gymlog_v2:${owner}`;
const EMPTY = { v: 1, entries: [], body: [], goal: null, profile: { unit: "kg" } };

/** The log of this account. The first time an account opens the Gym log, it takes over the old browser-wide log once (and that old copy is removed, so no other account can). */
function read(owner) {
  if (!owner) return EMPTY;
  try {
    let raw = localStorage.getItem(keyFor(owner));
    if (raw == null) {
      const old = localStorage.getItem(LEGACY_KEY);
      if (old != null) { localStorage.setItem(keyFor(owner), old); localStorage.removeItem(LEGACY_KEY); raw = old; }
    }
    return raw ? sane(JSON.parse(raw)) : EMPTY;
  } catch { return EMPTY; }
}
let owner = currentOwner();
let state = read(owner);
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
/** Somebody else signed in (or out) since the log was loaded: switch to their log. */
function follow() { const o = currentOwner(); if (o !== owner) { owner = o; state = read(o); } }

/** Returns false when the browser refused the write (private mode, storage full) so the page can warn the person. */
function persist() {
  if (!owner) return true;                                  // nobody signed in: nothing to keep
  try { localStorage.setItem(keyFor(owner), JSON.stringify(state)); return true; } catch { return false; }
}
function set(patch) {
  follow();
  state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
  emit();
  return persist();
}
// Another tab changed the log: pick it up.
if (typeof window !== "undefined") window.addEventListener("storage", (e) => { if (owner && e.key === keyFor(owner)) { state = read(owner); emit(); } });
/** Call after signing in or out so every screen shows the right person's log at once. */
export function rebindGym() { const o = currentOwner(); if (o !== owner) { owner = o; state = read(o); emit(); } }
/** Which account the log on screen belongs to ("" when nobody is signed in). */
export const gymOwner = () => { follow(); return owner; };

export const getGym = () => { follow(); return state; };
/** Lets the calorie sync hear about every change (it never writes to this store). Returns an unsubscribe function. */
export function subscribeGym(fn) { listeners.add(fn); return () => listeners.delete(fn); }
// Set when the person clears or restores the whole log on purpose, so the sync may remove many server rows at once.
let bulkChange = false, bulkRecords = false;
export function consumeBulkChange() { const b = bulkChange; bulkChange = false; return b; }
// The same, for the sync of the log itself (utils/gymRecordRunner.js): only a clear or restore the person asked for may delete many records.
export function consumeBulkRecords() { const b = bulkRecords; bulkRecords = false; return b; }
export function useGymStore() {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => { follow(); return state; }, () => EMPTY);
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
export function clearGym() { bulkChange = true; bulkRecords = true; return set((s) => ({ ...EMPTY, profile: s.profile })); }
/** Replace the whole log (used by "Restore from backup"). Cleaned first, so a bad file can't break the page. */
export function replaceGym(raw) { bulkChange = true; bulkRecords = true; return set(sane(raw)); }

/** Changes that arrived from the person's other devices (one update, one screen refresh). */
export const applyRemote = (upserts, removals) => set((st) => applyRecords(st, upserts, removals));
