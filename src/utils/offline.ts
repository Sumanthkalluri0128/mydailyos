// Offline support:
//   (1) a write queue with replay (utils/offlineQueue.ts) that can no longer lose writes,
//   (2) a read cache, so every screen opens with the last known data when there is no signal,
//   (3) an optimistic overlay (utils/optimistic.ts) so entries added offline show up EVERYWHERE straight away
//       (their own list, Home totals, History, Progress charts),
//   (4) a provider that syncs automatically: when connectivity returns, when the app is opened, on a retry timer
//       while changes are waiting, and on demand ("Sync now").
import { report } from './telemetryClient';
import { announceWrite } from '../tour/events';
import { resetStepStore } from './stepStore';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { ApiError, get, hasSession, newClientId, sendRaw, today, warmUp } from '../config/api';
import { createOfflineQueue, QueuedOp } from './offlineQueue';
import { applyPending, LOCAL_PREFIX, opToEvent } from './optimistic';
import { planViewPath, weekStart } from './mealView';
import { useNotifications } from '../components/Notifications';

const QUEUE_KEY = 'flexfit_offline_queue_v1';
const CACHE_PREFIX = 'flexfit_cache_v1:';
const IDMAP_KEY = 'flexfit_idmap_v1';
const RETRY_EVERY_MS = 25_000;
const PREFETCH_EVERY_MS = 10 * 60_000;

// ------------------------------------------------------------------ local id -> real id
// A record created offline is shown with the id `local:<clientId>`. When its create finally reaches the server we
// learn the real id and rewrite later queued writes that mention the local one (edit / toggle / delete).
let idMap: Record<string, string> | null = null;
async function loadIdMap() {
  if (idMap) return idMap;
  try { idMap = JSON.parse((await AsyncStorage.getItem(IDMAP_KEY)) || '{}'); } catch { idMap = {}; }
  return idMap!;
}
async function rememberId(clientId: string, realId: string) {
  const m = await loadIdMap();
  m[clientId] = realId;
  const keys = Object.keys(m);
  if (keys.length > 300) for (const k of keys.slice(0, keys.length - 300)) delete m[k]; // keep it small
  await AsyncStorage.setItem(IDMAP_KEY, JSON.stringify(m)).catch(() => {});
}
const LOCAL_RE = new RegExp(`${LOCAL_PREFIX}([A-Za-z0-9_-]+)`, 'g');
function resolvePath(path: string, m: Record<string, string>) { return path.replace(LOCAL_RE, (whole, cid) => m[cid] ?? whole); }
const localClientIds = (path: string) => Array.from(path.matchAll(LOCAL_RE)).map((x) => x[1]);

/** After a create is accepted, remember which real id belongs to the client-generated one. */
function learnId(method: string, body: any, data: any) {
  const cid = body?.clientId;
  if (method !== 'POST' || !cid || !data || typeof data !== 'object') return;
  const doc: any = Object.values(data).find((v: any) => v && typeof v === 'object' && v._id);
  if (doc?._id) void rememberId(String(cid), String(doc._id));
}

/**
 * Write-through cache: when a write succeeds, patch every saved copy of the screens it affects (day summary, lists,
 * history). The next time Home (or any screen) opens it shows the right numbers immediately and refreshes in the
 * background, instead of waiting on slow network round trips to find out what the person just did.
 */
async function patchCaches(method: string, path: string, body: any, meta?: Record<string, any>) {
  const op = { method, path, body, meta, createdAt: Date.now() };
  if (!opToEvent(op)) return;
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(CACHE_PREFIX));
    await Promise.all(keys.map(async (k) => {
      const raw = await AsyncStorage.getItem(k);
      if (!raw) return;
      const entry = JSON.parse(raw);
      const next = applyPending(k.slice(CACHE_PREFIX.length), entry.data, [op], { pending: false });
      if (next !== entry.data) await AsyncStorage.setItem(k, JSON.stringify({ ...entry, data: next }));
    }));
  } catch { /* cache is best-effort */ }
}

// ------------------------------------------------------------------ queue wiring
let droppedHandler: ((op: QueuedOp, reason: string) => void) | null = null;

const queue = createOfflineQueue({
  load: async () => {
    try { const raw = await AsyncStorage.getItem(QUEUE_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
  },
  save: async (ops) => { await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(ops)); },
  send: async (op) => {
    const m = await loadIdMap();
    const path = resolvePath(op.path, m);
    // Still pointing at a local id means the create it depends on never made it (it was rejected) — nothing to do.
    if (LOCAL_RE.test(path)) { LOCAL_RE.lastIndex = 0; return { ok: true }; }
    LOCAL_RE.lastIndex = 0;
    return sendRaw(op.method, path, op.body);
  },
  onSent: (op, res) => { learnId(op.method, op.body, res.data); },
  onDropped: (op, reason) => droppedHandler?.(op, reason),
});

export { newClientId };

export type WriteResult<T = any> = { queued: false; data: T } | { queued: true; data: null };

/**
 * Perform a write. Online: sent immediately. Offline (network failure): stored in the queue and
 * replayed later, in order. Server-side rejections (validation etc.) still throw so the UI can show them.
 */
export async function write<T = any>(
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body: any,
  label: string,
  meta?: Record<string, any>
): Promise<WriteResult<T>> {
  // Deleting something that only exists on this phone: just cancel it — nothing to tell the server.
  const m = await loadIdMap();
  path = resolvePath(path, m);
  if (method === 'DELETE' && isLocalIdInPath(path)) {
    const ids = localClientIds(path);
    await queue.mutate((ops) => ops.filter((o) => !ids.includes(String(o.body?.clientId)) && !ids.some((id) => o.path.includes(`${LOCAL_PREFIX}${id}`))));
    return { queued: false, data: {} as T };
  }

  // Repeating readings (live step counts) replace the older queued one instead of piling up.
  const coalesce = meta?.coalesce as string | undefined;
  if (coalesce) await queue.mutate((ops) => ops.filter((o) => o.meta?.coalesce !== coalesce));

  const pending = await queue.pending();
  // Keep ordering: if older writes are still waiting, try to flush them first.
  if (pending.length) {
    const r = await queue.flush();
    if (r.remaining > 0) {
      await queue.enqueue({ method, path, body, label, meta }); announceWrite(method, path);
      return { queued: true, data: null };
    }
    path = resolvePath(path, await loadIdMap());
  }
  if (isLocalIdInPath(path)) { // the create is still unsynced, so this edit has to wait behind it
    await queue.enqueue({ method, path, body, label, meta }); announceWrite(method, path);
    return { queued: true, data: null };
  }
  const res = await sendWithResult<T>(method, path, body);
  if (res.kind === 'ok') {
    learnId(method, body, res.data);
    await patchCaches(method, path, body, meta);
    return { queued: false, data: res.data };
  }
  if (res.kind === 'network') {
    await queue.enqueue({ method, path, body, label, meta }); announceWrite(method, path);
    return { queued: true, data: null };
  }
  throw res.error;
}

function isLocalIdInPath(path: string) { LOCAL_RE.lastIndex = 0; const r = LOCAL_RE.test(path); LOCAL_RE.lastIndex = 0; return r; }

async function sendWithResult<T>(method: string, path: string, body: any): Promise<
  { kind: 'ok'; data: T } | { kind: 'network' } | { kind: 'error'; error: ApiError }
> {
  // Use the typed client so we get the parsed body back.
  const api = await import('../config/api');
  try {
    const fn = method === 'POST' ? api.post : method === 'PATCH' ? api.patch : method === 'PUT' ? api.put : api.del;
    const data = method === 'DELETE' ? await api.del<T>(path) : await (fn as any)(path, body ?? {});
    return { kind: 'ok', data };
  } catch (e: any) {
    if (e instanceof ApiError && e.network) return { kind: 'network' };
    return { kind: 'error', error: e instanceof ApiError ? e : new ApiError(e?.message || 'Request failed') };
  }
}

// ------------------------------------------------------------------ read cache
export async function cachedGet<T = any>(path: string): Promise<{ data: T; stale: boolean }> {
  try {
    const data = await get<T>(path);
    AsyncStorage.setItem(CACHE_PREFIX + path, JSON.stringify({ at: Date.now(), data })).catch(() => {});
    return { data, stale: false };
  } catch (e: any) {
    if (e instanceof ApiError && e.network) {
      const raw = await AsyncStorage.getItem(CACHE_PREFIX + path).catch(() => null);
      if (raw) { try { return { data: JSON.parse(raw).data as T, stale: true }; } catch {} }
    }
    throw e;
  }
}

/**
 * THE way screens read data. Network first; with no signal it falls back to the last saved copy; and either way
 * writes still waiting to sync are layered on top, so nothing the person entered ever seems to vanish.
 */
export async function read<T = any>(path: string): Promise<T> {
  return (await readMeta<T>(path)).data;
}

/** Like read(), and also says whether the data is the saved copy (no signal) rather than fresh from the server. */
export async function readMeta<T = any>(path: string): Promise<{ data: T; stale: boolean }> {
  const { data, stale } = await cachedGet<T>(path);
  return { data: applyPending(path, data, await queue.pending()), stale };
}

/** When the saved copy of a screen's data was fetched (ms since epoch), or null if never saved. */
export async function peekAt(path: string): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + path);
    const at = raw ? Number(JSON.parse(raw).at) : NaN;
    return Number.isFinite(at) ? at : null;
  } catch { return null; }
}

/** Last saved copy of a screen's data (plus anything still waiting to sync) — instantly, with no network. null if never loaded. */
export async function peek<T = any>(path: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + path);
    if (!raw) return null;
    return applyPending(path, JSON.parse(raw).data as T, await queue.pending());
  } catch { return null; }
}

/** Forget everything cached/queued (called on logout and account deletion so data never leaks between accounts). */
export async function clearOfflineData() {
  resetStepStore();
  await queue.clear();
  idMap = {};
  await AsyncStorage.removeItem(IDMAP_KEY).catch(() => {});
  const keys = await AsyncStorage.getAllKeys().catch(() => [] as readonly string[]);
  const mine = keys.filter((k) => k.startsWith(CACHE_PREFIX));
  if (mine.length) await AsyncStorage.multiRemove(mine).catch(() => {});
}

/** Saves today's essentials while online, so the app opens fully populated even with no signal later. */
async function prefetchEssentials() {
  const t = today();
  const paths = [
    `/api/progress/day?date=${t}`, '/api/profile', '/api/habits', `/api/habits/logs?date=${t}`, `/api/tasks?date=${t}`,
    `/api/water?date=${t}`, `/api/food-logs?date=${t}`, '/api/weight', '/api/foods/recent', '/api/activities',
    `/api/activities/logs?date=${t}`, '/api/templates', '/api/saved-meals', `/api/health-logs/steps/day?date=${t}`,
    planViewPath(weekStart(t), t), // the meal planner's merged week, so it opens with no signal
   
  ];
  await Promise.all(paths.map((p) => cachedGet(p).catch(() => null)));
}

// ------------------------------------------------------------------ provider
type OfflineCtx = {
  online: boolean;
  pending: number;
  syncing: boolean;
  /** Increments every time queued writes were successfully replayed — screens include it in effect deps to refresh. */
  syncVersion: number;
  /** Labels of the writes still waiting (newest last), for the banner. */
  pendingLabels: string[];
  flushNow: () => Promise<void>;
  onDropped: (fn: ((label: string, reason: string) => void) | null) => void;
};
const Ctx = createContext<OfflineCtx | null>(null);

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const { warning, success } = useNotifications();
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [pendingLabels, setPendingLabels] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncVersion, setSyncVersion] = useState(0);
  const dropCb = useRef<((label: string, reason: string) => void) | null>(null);
  const pendingRef = useRef(0);
  const lastPrefetch = useRef(0);

  const flushNow = useCallback(async () => {
    if (!(await hasSession())) return;
    setSyncing(true);
    try {
      const r = await queue.flush();
      if (r.dropped > 0) report({ writesDropped: r.dropped });
      if (r.paused === 'network' && r.remaining > 0 && (await NetInfo.fetch()).isConnected !== false) report({ syncFailed: 1 }); // online but the server did not take them
      if (r.sent > 0 || r.dropped > 0) setSyncVersion((v) => v + 1);
      if (r.sent > 0 && r.remaining === 0) success('All synced', `${r.sent} offline change${r.sent === 1 ? '' : 's'} saved to your account.`);
      if (Date.now() - lastPrefetch.current > PREFETCH_EVERY_MS && r.paused !== 'network') {
        lastPrefetch.current = Date.now();
        prefetchEssentials().catch(() => {});
      }
    } finally { setSyncing(false); }
  }, [success]);

  useEffect(() => {
    droppedHandler = (op, reason) => {
      // Never silent: tell the person what could not be saved and why.
      warning('Couldn\u2019t save one change', `${op.label}: ${reason}`);
      dropCb.current?.(op.label, reason);
    };
    const apply = (ops: QueuedOp[]) => { pendingRef.current = ops.length; setPending(ops.length); setPendingLabels(ops.map((o) => o.label)); };
    queue.pending().then(apply);
    const unsub = queue.subscribe(apply);
    const net = NetInfo.addEventListener((s) => {
      const isOnline = s.isConnected !== false && s.isInternetReachable !== false;
      setOnline(isOnline);
      if (isOnline) { warmUp(); flushNow(); }
    });
    const app = AppState.addEventListener('change', (st) => {
      if (st === 'active') { warmUp(); flushNow(); }
    });
    // While something is waiting, keep trying (a lost/slow connection often recovers without a NetInfo event).
    const timer = setInterval(() => { if (pendingRef.current > 0) flushNow(); }, RETRY_EVERY_MS);
    warmUp();
    flushNow();
    return () => { unsub(); net(); app.remove(); clearInterval(timer); droppedHandler = null; };
  }, [flushNow, warning]);

  const value = useMemo<OfflineCtx>(() => ({
    online, pending, syncing, syncVersion, pendingLabels, flushNow,
    onDropped: (fn) => { dropCb.current = fn; },
  }), [online, pending, syncing, syncVersion, pendingLabels, flushNow]);

  return React.createElement(Ctx.Provider, { value }, children);
}

export function useOffline(): OfflineCtx {
  const c = useContext(Ctx);
  if (!c) return { online: true, pending: 0, syncing: false, syncVersion: 0, pendingLabels: [], flushNow: async () => {}, onDropped: () => {} };
  return c;
}

/** Re-run a screen's loader whenever queued writes were replayed (so it shows the server's version). */
export function useRefreshOnSync(load: () => void) {
  const { syncVersion } = useOffline();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncVersion]);
}
