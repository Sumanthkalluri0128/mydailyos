// A planned workout the person pressed "Start" on: carried from the planner to the Gym log, which walks through its exercises (see planStart.ts).
// Kept per account in AsyncStorage, so closing the app in the middle of a workout does not lose it.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';
import { cleanStart } from './planStart';

export type PlanStart = { item: { id: string; date: string; title: string; kind: string; exercises: { name: string; sets: number; reps: number; kg: number }[] }; skipped: string[] };

const CACHE_OWNER_KEY = 'ff.cacheOwner';              // written by utils/session.ts at sign-in: the email whose data this phone holds
const keyFor = (owner: string) => `flexfit_planstart_v1:${owner}`;
let state: PlanStart | null = null;
let owner = '';
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());
const readOwner = async () => String((await AsyncStorage.getItem(CACHE_OWNER_KEY).catch(() => null)) || '').trim().toLowerCase();

function persist() {
  if (!owner) return;
  (state ? AsyncStorage.setItem(keyFor(owner), JSON.stringify(state)) : AsyncStorage.removeItem(keyFor(owner))).catch(() => { /* the in-memory copy still works */ });
}

/** Reads the saved plan of the signed-in account (and forgets another account's). Safe to call often. */
export async function loadPlannedStart(): Promise<void> {
  const o = await readOwner();
  if (loaded && o === owner) return;
  owner = o; loaded = true;
  let next: PlanStart | null = null;
  if (o) { try { next = cleanStart(JSON.parse((await AsyncStorage.getItem(keyFor(o))) || 'null')) as PlanStart | null; } catch { next = null; } }
  state = next; emit();
}

export const getPlannedStart = () => state;
/** `item` is a planner item ({ _id, date, title, kind, exercises }). */
export async function beginPlannedStart(item: { _id: string; date: string; title: string; kind: string; exercises: { name: string; sets: number; reps: number; kg: number }[] }) {
  await loadPlannedStart();
  state = cleanStart({ item: { id: item._id, date: item.date, title: item.title, kind: item.kind, exercises: item.exercises }, skipped: [] }) as PlanStart | null;
  persist(); emit();
}
export function skipPlannedStep(stepKey: string) {
  if (!state || state.skipped.includes(stepKey)) return;
  state = { ...state, skipped: [...state.skipped, stepKey] }; persist(); emit();
}
export function endPlannedStart() { state = null; persist(); emit(); }

export function usePlannedStart(): PlanStart | null {
  useEffect(() => { void loadPlannedStart(); }, []);
  return useSyncExternalStore((f) => { listeners.add(f); return () => { listeners.delete(f); }; }, getPlannedStart, () => null);
}
