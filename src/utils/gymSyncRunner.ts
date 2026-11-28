// Sends each logged gym exercise's minutes and estimated calories to the server, so the Exercise page and Home count them.
// Only what is needed for that goes out (name, date, sets x reps x weight, minutes, kcal): never body measurements or goals.
// Quiet by design: offline, a sleeping server or any error just leaves the work pending; it is retried on the next change,
// when the app comes back to the front, and when the gym log screen opens. Safe to repeat (one server row per gym entry).
import { useEffect } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { hasSession, post, today } from '../config/api';
import { consumeBulkChange, getGym, loadGym, subscribeGym } from './gymStore';
import { BATCH, EMPTY_MEMORY, SyncMemory, applyResult, hasWork, planGymSync } from './gymSync';

const KEY = 'flexfit_gymsync_v1';
let mem: SyncMemory | null = null;
let running = false, again = false, bulk = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;
const doneListeners = new Set<() => void>();

/** Called after the server took new gym data, so screens that show calories burned can reload. Returns an unsubscribe function. */
export function onGymSynced(fn: () => void) { doneListeners.add(fn); return () => { doneListeners.delete(fn); }; }

async function loadMem(): Promise<SyncMemory> {
  if (mem) return mem;
  try { const raw = await AsyncStorage.getItem(KEY); const j = raw ? JSON.parse(raw) : null; mem = j && typeof j.synced === 'object' && j.synced ? { synced: j.synced } : { ...EMPTY_MEMORY, synced: {} }; }
  catch { mem = { synced: {} }; }
  return mem!;
}
const saveMem = (m: SyncMemory) => { mem = m; return AsyncStorage.setItem(KEY, JSON.stringify(m)).catch(() => {}); };

/** Forget what was synced (sign-out / account change), so the next account starts clean. */
export async function resetGymSync() { mem = { synced: {} }; await AsyncStorage.removeItem(KEY).catch(() => {}); }

export async function syncGymNow(): Promise<void> {
  if (running) { again = true; return; }
  running = true;
  let changed = false;
  try {
    await loadGym();
    if (!(await hasSession())) return;
    let m = await loadMem();
    for (let round = 0; round < 6; round++) {
      bulk = consumeBulkChange() || bulk;
      const { entries, body } = getGym();
      const plan = planGymSync(entries, body, m, today(), bulk);
      if (!hasWork(plan)) break;
      const res = await post<{ success: boolean; synced?: string[]; removed?: number }>('/api/activities/gym-sync', { entries: plan.upsert, removeIds: plan.removeIds });
      if (!res?.success) break;
      bulk = false;
      const next = applyResult(m, plan.upsert, res.synced || [], plan.removeIds);
      await saveMem(next);
      const progressed = (res.synced?.length || 0) > 0 || plan.removeIds.length > 0; // the server rejected everything: stop, do not loop
      m = next; changed = true;
      if (!progressed) break;
    }
  } catch { /* offline or server waking up: still pending, tried again later */ }
  finally {
    running = false;
    if (changed) doneListeners.forEach((f) => { try { f(); } catch { /* a screen's reload must not stop the sync */ } });
    if (again) { again = false; schedule(); }
  }
}

function schedule(ms = 400) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; syncGymNow(); }, ms);
}

/** Start once from the root layout: syncs on every gym change and when the app returns to the front. */
export function startGymSync() {
  if (started) return;
  started = true;
  subscribeGym(() => schedule());
  AppState.addEventListener('change', (st) => { if (st === 'active') schedule(1200); });
  loadGym().then(() => schedule(2000));
}

/** For screens: reload when gym data has just reached the server. */
export function useGymSynced(reload: () => void) {
  useEffect(() => onGymSynced(reload), [reload]);
}
