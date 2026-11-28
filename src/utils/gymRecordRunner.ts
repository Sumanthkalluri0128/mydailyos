// Keeps the Gym log the same on every device the person uses (this phone, the web app) by syncing the log itself to their own account.
// OFF until the person turns it on for this account (Gym log > Export > "Sync across my devices"). Then it runs quietly: after a change,
// when the app comes to the front, and on "Sync now". Offline or a sleeping server just leaves the work pending. The rules (newest edit
// wins, deletions travel, a wiped phone restores instead of deleting) live in utils/recordSync.ts, shared with the web app and tested there.
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { get, hasSession, post } from '../config/api';
import { EMPTY_MEMORY, syncRound } from './recordSync';
import { GYM_SPACE, gymToRecords } from './gymRecords';
import { applyRemote, consumeBulkRecords, getGym, gymOwner, loadGym, subscribeGym } from './gymStore';

const memKey = (o: string) => `flexfit_gymrec_v1:${o}`;
const onKey = (o: string) => `flexfit_gymrec_on:${o}`;
let running = false, again = false, started = false, bulk = false;
let timer: ReturnType<typeof setTimeout> | null = null;

// ---- the small status the Gym screen shows
export type RecordSyncStatus = { on: boolean; state: 'off' | 'idle' | 'syncing' | 'ok' | 'error'; last: number; message: string };
let status: RecordSyncStatus = { on: false, state: 'off', last: 0, message: '' };
const listeners = new Set<() => void>();
const setStatus = (patch: Partial<RecordSyncStatus>) => { status = { ...status, ...patch }; listeners.forEach((l) => l()); };
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
export const useRecordSyncStatus = (): RecordSyncStatus => useSyncExternalStore(subscribe, () => status, () => status);

async function isOn(o: string): Promise<boolean> { try { return !!o && (await AsyncStorage.getItem(onKey(o))) === '1'; } catch { return false; } }
/** Reads the saved switch for the account on screen (call when the Gym log opens). */
export async function refreshRecordSync(): Promise<boolean> { await loadGym(); const on = await isOn(gymOwner()); if (on !== status.on) setStatus({ on, state: on ? 'idle' : 'off' }); return on; }

/** Turn the sync on or off for the signed-in account. Turning it off keeps everything where it is (here and on the server). */
export async function setRecordSync(on: boolean): Promise<boolean> {
  await loadGym();
  const o = gymOwner(); if (!o) return false;
  try { if (on) await AsyncStorage.setItem(onKey(o), '1'); else await AsyncStorage.removeItem(onKey(o)); } catch { return false; }
  setStatus({ on, state: on ? 'idle' : 'off', message: '' });
  if (on) schedule(200);
  return true;
}

async function loadMem(o: string) {
  try { const j = JSON.parse((await AsyncStorage.getItem(memKey(o))) || 'null'); if (j && j.known && typeof j.known === 'object') return { v: 1, cursor: Number(j.cursor) || 0, known: j.known }; } catch { /* start over: sends again, which is harmless */ }
  return { ...EMPTY_MEMORY, known: {} as Record<string, any> };
}

export async function syncRecordsNow(): Promise<void> {
  if (running) { again = true; return; }
  if (!(await hasSession())) return;
  await loadGym();
  const o = gymOwner();
  if (!(await isOn(o))) { if (status.on) setStatus({ on: false, state: 'off' }); return; }
  running = true;
  setStatus({ on: true, state: 'syncing', message: '' });
  try {
    let mem: any = await loadMem(o);
    bulk = consumeBulkRecords() || bulk;
    const res = await syncRound({
      current: () => gymToRecords(getGym()),
      memory: () => mem,
      save: (m: any) => { mem = m; if (gymOwner() === o) AsyncStorage.setItem(memKey(o), JSON.stringify(m)).catch(() => {}); },
      push: async (records: any[]) => post<any>('/api/sync/push', { space: GYM_SPACE, records }),
      pull: async (since: number) => get<any>(`/api/sync/pull?space=${GYM_SPACE}&since=${since}&limit=500`),
      apply: (upserts: any[], removals: any[]) => { if (gymOwner() === o) applyRemote(upserts, removals); },
    }, { allowBulkDelete: bulk });
    bulk = false;
    setStatus({ state: 'ok', last: Date.now(), message: res.heldBack ? `${res.heldBack} missing entries were restored instead of deleted.` : '' });
  } catch {
    setStatus({ state: 'error', message: 'Could not reach your account. Your log is safe here and will sync later.' }); // offline or the server is waking up: tried again later
  } finally { running = false; if (again) { again = false; schedule(); } }
}

function schedule(ms = 3000) { if (timer) clearTimeout(timer); timer = setTimeout(() => { timer = null; syncRecordsNow(); }, ms); }

/** Start once when the signed-in app opens. Does nothing until the person has turned the sync on. */
export function startRecordSync() {
  if (started) return;
  started = true;
  subscribeGym(() => { if (status.on) schedule(); });
  AppState.addEventListener('change', (st) => { if (st === 'active') schedule(1500); });
  loadGym().then(() => refreshRecordSync()).then(() => schedule(2500));
}
