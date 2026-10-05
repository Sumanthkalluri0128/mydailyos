// Offline support for the website, in three parts:
//   1. READS: every successful GET is saved for the signed-in person; with no connection the saved copy is returned instead
//      (so pages open with the last known data instead of an error).
//   2. WRITES: creating a water / food / exercise / steps / weight / task entry while offline is saved in a queue (with a
//      client id, so a retry can never create a duplicate) and sent automatically when the connection returns.
//   3. STATE: a tiny store the offline banner subscribes to (offline? how many changes are waiting? syncing?).
// Everything is scoped to the signed-in email, so one person's saved data is never shown to, or sent as, another person.
import { kvGet, kvSet, kvDel, kvKeys } from "./kv";
import { currentOwner } from "../utils/cacheOwner";

const CACHE_PREFIX = "get:";
const QUEUE_KEY = "queue";
const MAX_QUEUE = 200;
const MAX_AGE_MS = 7 * 24 * 3600 * 1000; // a queued change older than a week is dropped rather than replayed blindly

// Creates that are safe to replay: each carries a clientId and the server ignores a repeat of the same id.
const QUEUEABLE = [
  /^\/api\/water$/, /^\/api\/food-logs$/, /^\/api\/activities\/logs$/, /^\/api\/health-logs$/,
  /^\/api\/weight$/, /^\/api\/tasks$/, /^\/api\/habits\/logs$/,
];
const pathOf = (url) => { try { return new URL(url, window.location.origin).pathname; } catch { return ""; } };
export const isQueueable = (method, url) => String(method).toUpperCase() === "POST" && QUEUEABLE.some((r) => r.test(pathOf(url)));
const newId = () => `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// ---------------------------------------------------------------- state for the banner
let state = { online: typeof navigator === "undefined" ? true : navigator.onLine, pending: 0, syncing: false, lastError: "" };
const listeners = new Set();
const set = (patch) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };
export const getOfflineState = () => state;
export const subscribeOffline = (l) => { listeners.add(l); return () => listeners.delete(l); };

// ---------------------------------------------------------------- read cache
const cacheKey = (owner, url) => `${CACHE_PREFIX}${owner}|${url}`;

export async function saveGet(url, data) {
  const owner = currentOwner();
  if (!owner) return;
  await kvSet(cacheKey(owner, url), { at: Date.now(), data });
}

export async function savedGet(url) {
  const owner = currentOwner();
  if (!owner) return null;
  return kvGet(cacheKey(owner, url));
}

// ---------------------------------------------------------------- write queue
async function readQueue() { return (await kvGet(QUEUE_KEY)) || []; }
async function writeQueue(q) { await kvSet(QUEUE_KEY, q); set({ pending: q.filter((x) => x.owner === currentOwner()).length }); }

export async function enqueue({ method, url, body }) {
  const owner = currentOwner();
  if (!owner) return false;
  const q = await readQueue();
  if (q.length >= MAX_QUEUE) return false;
  let parsed = {};
  try { parsed = body ? JSON.parse(body) : {}; } catch { return false; }
  if (!parsed.clientId) parsed.clientId = newId();
  q.push({ id: newId(), owner, method, url, body: JSON.stringify(parsed), at: Date.now() });
  await writeQueue(q);
  return true;
}

let flushing = null;
/** Sends everything that is waiting, oldest first. Stops at the first network failure; drops entries the server rejects for good. */
export function flushQueue(sender) {
  if (flushing) return flushing;
  flushing = (async () => {
    const owner = currentOwner();
    if (!owner || !navigator.onLine) return { sent: 0, dropped: 0 };
    set({ syncing: true, lastError: "" });
    let sent = 0, dropped = 0;
    try {
      let q = await readQueue();
      q = q.filter((x) => Date.now() - x.at < MAX_AGE_MS);
      const keep = [];
      let stop = false;
      for (const op of q) {
        if (stop || op.owner !== owner) { keep.push(op); continue; } // another person's changes wait for them to sign in
        let res;
        try { res = await sender(op); } catch { stop = true; keep.push(op); continue; }
        if (res.ok) sent++;
        else if (res.status === 401 || res.status === 429 || res.status >= 500) { stop = true; keep.push(op); }
        else dropped++; // 400/404/409...: the server will never accept it, replaying would loop forever
      }
      await writeQueue(keep);
      if (dropped) set({ lastError: `${dropped} offline change${dropped > 1 ? "s" : ""} could not be saved.` });
    } finally {
      set({ syncing: false });
    }
    if (sent) window.dispatchEvent(new Event("flexfit:synced"));
    return { sent, dropped };
  })().finally(() => { flushing = null; });
  return flushing;
}

export async function refreshPending() {
  const q = await readQueue();
  set({ pending: q.filter((x) => x.owner === currentOwner()).length });
}

/** Removes the saved copies and queued changes of everyone except the current person (call after a different person signs in). */
export async function purgeOthers() {
  const owner = currentOwner();
  if (!owner) return; // unknown person: delete nothing
  for (const k of await kvKeys(CACHE_PREFIX)) if (!String(k).startsWith(`${CACHE_PREFIX}${owner}|`)) await kvDel(k);
  const q = await readQueue();
  await writeQueue(q.filter((x) => x.owner === owner));
}

export async function wipeAll() {
  for (const k of await kvKeys(CACHE_PREFIX)) await kvDel(k);
  await kvDel(QUEUE_KEY);
  set({ pending: 0 });
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => set({ online: true }));
  window.addEventListener("offline", () => set({ online: false }));
}
