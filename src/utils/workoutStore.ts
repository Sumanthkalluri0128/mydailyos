// Local-first storage for the Workout tab. Everything lives on the phone (AsyncStorage) so the tab works in the gym with no signal,
// and a workout in progress survives the app being closed. One small module-level store with a hook, so the tab, the session screen
// and the history all see the same data the moment it changes.
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActiveSession, Session, Swaps } from './workoutEngine';
import { addPending, cleanPending, deleteRequest, removePending } from './sessionDelete';

const KEY = 'flexfit_workout_v1';

export type WorkoutState = {
  v: 1;
  swaps: Swaps;                               // dayN -> base exercise -> chosen alternative (the person's own version of the plan)
  routinePicks: Record<string, string>;       // warm-up / cool-down / mobility row -> chosen alternative name
  favs: string[];                             // favourite exercise ids
  sessions: Session[];                        // finished workouts, newest last
  active: ActiveSession | null;               // the workout in progress (null when none)
  autoRest: boolean;                          // start the rest timer when a set is ticked
  mobilityPick: string;                       // which mobility option (A/B/C) is preferred
  syncLog: boolean;                           // also add finished workouts to the daily exercise log
  pendingDeletes: PendingDelete[];            // finished workouts deleted here whose server entry still has to go (see sessionDelete.ts)
};
export type PendingDelete = { clientId: string; kind: 'smart' | 'activity'; at: number; after?: number };

const EMPTY: WorkoutState = { v: 1, swaps: {}, routinePicks: {}, favs: [], sessions: [], active: null, autoRest: true, mobilityPick: 'A', syncLog: true, pendingDeletes: [] };

let state: WorkoutState = EMPTY;
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const emit = () => listeners.forEach((l) => l());

function persistSoon() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {}); }, 250);
}
/** Write right now (used when the person finishes or leaves a workout, so nothing waits on the debounce). */
export async function flushWorkout(): Promise<void> {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  try { await AsyncStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full or unavailable: the in-memory copy still works */ }
}

function sane(raw: any): WorkoutState {
  const o = raw && typeof raw === 'object' ? raw : {};
  return {
    v: 1,
    swaps: o.swaps && typeof o.swaps === 'object' ? o.swaps : {},
    routinePicks: o.routinePicks && typeof o.routinePicks === 'object' ? o.routinePicks : {},
    favs: Array.isArray(o.favs) ? o.favs.filter((x: any) => typeof x === 'string') : [],
    sessions: Array.isArray(o.sessions) ? o.sessions.filter((s: any) => s && typeof s.id === 'string' && typeof s.date === 'string' && Array.isArray(s.exercises)) : [],
    active: o.active && typeof o.active === 'object' && Array.isArray(o.active.exercises) && o.active.exercises.length ? o.active : null,
    autoRest: o.autoRest !== false,
    mobilityPick: typeof o.mobilityPick === 'string' ? o.mobilityPick : 'A',
    syncLog: o.syncLog !== false,
    pendingDeletes: cleanPending(o.pendingDeletes) as PendingDelete[],
  };
}

export function loadWorkout(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (!loading) {
    loading = AsyncStorage.getItem(KEY)
      .then((raw) => { if (raw) { try { state = sane(JSON.parse(raw)); } catch { state = EMPTY; } } })
      .catch(() => {})
      .finally(() => { loaded = true; emit(); });
  }
  return loading;
}

export const getWorkout = () => state;
export function setWorkout(patch: Partial<WorkoutState> | ((s: WorkoutState) => Partial<WorkoutState>)) {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p };
  emit();
  persistSoon();
}

/** The workout data plus a `ready` flag (false until the saved copy has been read). */
export function useWorkoutStore(): WorkoutState & { ready: boolean } {
  const [, tick] = useState(0);
  useEffect(() => {
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    loadWorkout();
    return () => { listeners.delete(l); };
  }, []);
  return { ...state, ready: loaded };
}

// ------------------------------------------------------------------------------------------------ actions
export function setSwap(dayN: number, baseId: string, chosenId: string) {
  setWorkout((s) => {
    const day = { ...(s.swaps[String(dayN)] || {}) };
    if (chosenId === baseId) delete day[baseId]; else day[baseId] = chosenId;
    return { swaps: { ...s.swaps, [String(dayN)]: day } };
  });
}
export const toggleFav = (id: string) => setWorkout((s) => ({ favs: s.favs.includes(id) ? s.favs.filter((x) => x !== id) : [...s.favs, id] }));
export const pickRoutine = (rowId: string, name: string) => setWorkout((s) => ({ routinePicks: { ...s.routinePicks, [rowId]: name } }));
export const saveActive = (a: ActiveSession | null) => setWorkout({ active: a });
export async function commitSession(session: Session) {
  setWorkout((s) => ({ sessions: [...s.sessions.filter((x) => x.id !== session.id), session], active: null }));
  await flushWorkout();
}
export function markSynced(id: string) {
  setWorkout((s) => ({ sessions: s.sessions.map((x) => (x.id === id ? withoutFailure({ ...x, synced: true }) : x)) }));
}
const withoutFailure = (x: Session): Session => { const { syncFailed: _gone, ...rest } = x; return rest as Session; };
/** The server refused this workout: remember why, so it is shown (not lost, not retried for ever). */
export function markSyncFailed(id: string, reason: string, at = Date.now()) {
  setWorkout((s) => ({ sessions: s.sessions.map((x) => (x.id === id && !x.synced ? { ...x, syncFailed: { reason, at } } : x)) }));
}
/** "Try again": forget the refusal so the next sync run sends it once more. */
export function retrySession(id: string) {
  setWorkout((s) => ({ sessions: s.sessions.map((x) => (x.id === id ? withoutFailure(x) : x)) }));
}
export function deleteSession(id: string) {
  setWorkout((s) => ({ sessions: s.sessions.filter((x) => x.id !== id) }));
}
/** How long the "Undo" toast is on screen, plus a margin. The server is told only after this, and a delete the person undid is never sent. */
export const UNDO_WINDOW_MS = 5200;
/**
 * Delete a finished workout from this phone AND, once the Undo window is over, from the server (its exercise entry keeps inflating the day's burn otherwise).
 * The wait is on the saved list from the start, so closing the app inside the window loses nothing: it is sent the next time the tab opens.
 */
export function deleteSessionEverywhere(session: Session) {
  const req = session.kind === 'rest' ? null : deleteRequest(session.id, { smart: session.plan === 'smart', classicPrefix: 'ws' });
  setWorkout((s) => ({ sessions: s.sessions.filter((x) => x.id !== session.id), pendingDeletes: req ? (addPending(s.pendingDeletes, req, Date.now(), { delayMs: UNDO_WINDOW_MS }) as PendingDelete[]) : s.pendingDeletes }));
  void flushWorkout();
}
/** Undo: the workout comes back and its waiting delete is cancelled. */
export function undoSessionDelete(session: Session) {
  const req = session.kind === 'rest' ? null : deleteRequest(session.id, { smart: session.plan === 'smart', classicPrefix: 'ws' });
  setWorkout((s) => ({ sessions: [...s.sessions.filter((x) => x.id !== session.id), session], pendingDeletes: req ? (removePending(s.pendingDeletes, req.clientId) as PendingDelete[]) : s.pendingDeletes }));
  void flushWorkout();
}
/** These deletes reached the server (or were handed to the offline queue, which keeps them in order): take them off the list. */
export function settlePendingDeletes(clientIds: string[]) {
  if (!clientIds.length) return;
  setWorkout((s) => ({ pendingDeletes: s.pendingDeletes.filter((d) => !clientIds.includes(d.clientId)) }));
  void flushWorkout();
}
export function restoreSession(session: Session) {
  setWorkout((s) => ({ sessions: [...s.sessions.filter((x) => x.id !== session.id), session] }));
}
