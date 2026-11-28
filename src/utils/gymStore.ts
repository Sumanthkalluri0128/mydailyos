// Storage for the Gym log: exercises, sets/reps/weight, body weight, tape measurements and the person's body goal.
// The log lives in AsyncStorage on this phone, in a copy that belongs to the signed-in account (another account on this phone never
// sees it). This file makes no API calls. Two things can leave the phone, both from their own files:
//   * utils/gymSyncRunner.ts: each exercise's minutes and estimated calories, so the Exercise page and Home count them (always on);
//   * utils/gymRecordRunner.ts: the log itself, to the person's own account, so the browser and other devices show the same log.
//     Off until the person turns it on (Gym log > Export > "Sync across my devices").
// Data otherwise leaves the phone only when the person taps an export button (utils/gymShare.ts).
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BodyEntry, GymEntry, GymGoal, GymProfile, SiteKey } from './gymMath';
import { GymState, cleanBody, cleanEntry, sane } from './gymClean';
import { applyRecords, Gone, Rec } from './gymRecords';

const LEGACY_KEY = 'flexfit_gymlog_v1';                 // before v76: one log for the whole phone, whoever was signed in
const keyFor = (owner: string) => `flexfit_gymlog_v2:${owner}`;
const CACHE_OWNER_KEY = 'ff.cacheOwner';                 // written by utils/session.ts at sign-in: the email whose data this phone holds
let owner = '';                                           // whose log is in `state`

export type { GymState };
const EMPTY: GymState = { v: 1, entries: [], body: [], goal: null, profile: { unit: 'kg' } };

let state: GymState = EMPTY;
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const emit = () => listeners.forEach((l) => l());

/** Turns anything (a saved copy, an imported backup) into a safe GymState. Exported for tests. */
export const sanitizeGymState = sane;

function persistSoon() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; if (owner) AsyncStorage.setItem(keyFor(owner), JSON.stringify(state)).catch(() => {}); }, 200);
}
/** Write right now (after saving a set or a measurement, so nothing waits on the debounce). */
export async function flushGym(): Promise<void> {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  try { if (owner) await AsyncStorage.setItem(keyFor(owner), JSON.stringify(state)); } catch { /* storage full or unavailable: the in-memory copy still works */ }
}

async function readOwner(): Promise<string> { return String((await AsyncStorage.getItem(CACHE_OWNER_KEY).catch(() => null)) || '').trim().toLowerCase(); }

/** Reads this account's log. The first time an account opens the Gym log it takes over the old phone-wide log once (and that old copy is removed, so no other account can). */
export function loadGym(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (!loading) {
    loading = (async () => {
      try {
        owner = await readOwner();
        if (!owner) return;
        let raw = await AsyncStorage.getItem(keyFor(owner));
        if (raw == null) {
          const old = await AsyncStorage.getItem(LEGACY_KEY);
          if (old != null) { await AsyncStorage.setItem(keyFor(owner), old); await AsyncStorage.removeItem(LEGACY_KEY); raw = old; }
        }
        if (raw) { try { state = sane(JSON.parse(raw)); } catch { state = EMPTY; } }
      } catch { /* unreadable: start empty */ }
    })().finally(() => { loaded = true; emit(); });
  }
  return loading;
}
/** Somebody else signed in: drop the log on screen and load theirs (called by utils/session.ts). */
export async function rebindGym(): Promise<void> {
  const o = await readOwner();
  if (loaded && o === owner) return;
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  loaded = false; loading = null; state = EMPTY; owner = o; emit();
  await loadGym();
}
/** Which account the log on screen belongs to ('' when nobody is signed in). */
export const gymOwner = () => owner;
export const getGym = () => state;
export const isGymLoaded = () => loaded;
/** Lets the calorie sync hear about every change (it never writes to this store). */
export function subscribeGym(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
// Set when the person clears or restores the whole log on purpose, so the sync may remove many server rows at once.
let bulkChange = false, bulkRecords = false;
export function consumeBulkChange() { const b = bulkChange; bulkChange = false; return b; }
// The same, for the sync of the log itself (utils/gymRecordRunner.ts): only a clear or restore the person asked for may delete many records.
export function consumeBulkRecords() { const b = bulkRecords; bulkRecords = false; return b; }
function setGym(patch: Partial<GymState> | ((s: GymState) => Partial<GymState>)) {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p };
  emit();
  persistSoon();
}

/** The gym data plus a `ready` flag (false until the saved copy has been read). */
export function useGymStore(): GymState & { ready: boolean } {
  const [, tick] = useState(0);
  useEffect(() => {
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    loadGym();
    return () => { listeners.delete(l); };
  }, []);
  return { ...state, ready: loaded };
}

export const gymId = (p = 'g') => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

// ------------------------------------------------------------------------------------------------ actions
export async function saveEntry(e: GymEntry) {
  const clean = cleanEntry(e);
  if (!clean) return;
  setGym((s) => ({ entries: [...s.entries.filter((x) => x.id !== clean.id), clean] }));
  await flushGym();
}
export async function removeEntry(id: string) { setGym((s) => ({ entries: s.entries.filter((x) => x.id !== id) })); await flushGym(); }

/** One body record per day: saving again on the same day fills in / overwrites only the fields that were typed. */
export async function saveBody(b: Omit<BodyEntry, 'id' | 'at'> & { id?: string }) {
  setGym((s) => {
    const same = s.body.find((x) => x.date === b.date);
    const merged: BodyEntry = {
      id: same?.id || b.id || gymId('b'), at: Date.now(), date: b.date,
      weightKg: b.weightKg ?? same?.weightKg, bodyFat: b.bodyFat ?? same?.bodyFat,
      sites: { ...(same?.sites || {}), ...b.sites }, note: b.note || same?.note,
    };
    const clean = cleanBody(merged);
    return { body: clean ? [...s.body.filter((x) => x.id !== merged.id && x.date !== b.date), clean] : s.body };
  });
  await flushGym();
}
export async function removeBody(id: string) { setGym((s) => ({ body: s.body.filter((x) => x.id !== id) })); await flushGym(); }
export async function saveGoal(g: GymGoal | null) { setGym({ goal: g }); await flushGym(); }
export async function saveProfile(p: Partial<GymProfile>) { setGym((s) => ({ profile: { ...s.profile, ...p } })); await flushGym(); }
/** Wipe everything the gym log holds on this phone. */
export async function clearGym() { bulkChange = true; bulkRecords = true; state = { ...EMPTY, profile: state.profile }; emit(); await flushGym(); }
/** Replace the whole gym log (used by "Restore from backup"). The data is cleaned first, so a bad file can't break the screen. */
export async function replaceGym(raw: any) { bulkChange = true; bulkRecords = true; state = sane(raw); emit(); await flushGym(); }

/** Changes that arrived from the person's other devices (one update, one screen refresh). */
export async function applyRemote(upserts: Rec[], removals: Gone[]) { setGym((s) => applyRecords(s, upserts, removals)); await flushGym(); }
