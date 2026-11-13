// "Is something running?" One small store for every request the app makes, so the screen can always say so.
//   beginRequest({ write, label }) -> id      call when a request starts
//   noteRetry(id)                             the server is waking up and the request is being retried
//   endRequest(id)                            call when it finishes (success OR failure)
//   subscribe(fn) / getActivity()             the UI reads this (web: useSyncExternalStore, phone: a hook)
// Nothing is shown for fast requests (under 700 ms), so quick taps never flash a banner.
//   phase 'idle' -> 'working' (700 ms+: "Saving..." / "Loading...") -> 'slow' (5 s+: "still working, safe") -> 'waking' (server retrying)
const SHOW_AFTER_MS = 700;
const SLOW_AFTER_MS = 5000;

let nextId = 1;
const live = new Map(); // id -> { write, label, at, retry }
const subs = new Set();
let timer = null;
let snap = { phase: 'idle', pending: 0, writes: 0, message: '', since: 0 };

function compute(now) {
  if (!live.size) return { phase: 'idle', pending: 0, writes: 0, message: '', since: 0 };
  const rows = [...live.values()];
  const oldest = Math.min(...rows.map((r) => r.at));
  const age = now - oldest;
  const writes = rows.filter((r) => r.write).length;
  const waking = rows.some((r) => r.retry);
  const verb = writes ? 'Saving' : 'Loading';
  let phase = 'idle', message = '';
  if (waking) { phase = 'waking'; message = 'Waking the server up, one moment. Your change is kept.'; }
  else if (age >= SLOW_AFTER_MS) { phase = 'slow'; message = writes ? 'Still saving. The server is slow, your entry is safe.' : 'Still loading. The server is slow.'; }
  else if (age >= SHOW_AFTER_MS) { phase = 'working'; message = `${verb}\u2026`; }
  return { phase, pending: rows.length, writes, message, since: oldest };
}

function publish() {
  const next = compute(Date.now());
  if (next.phase !== snap.phase || next.pending !== snap.pending || next.writes !== snap.writes || next.message !== snap.message) {
    snap = next;
    subs.forEach((fn) => { try { fn(); } catch { /* a broken listener must not stop the others */ } });
  }
  // Re-check when the next threshold is crossed, so the message upgrades itself while a request is still running.
  if (timer) { clearTimeout(timer); timer = null; }
  if (live.size) {
    const age = Date.now() - Math.min(...[...live.values()].map((r) => r.at));
    const wait = age < SHOW_AFTER_MS ? SHOW_AFTER_MS - age : age < SLOW_AFTER_MS ? SLOW_AFTER_MS - age : 0;
    if (wait > 0) timer = setTimeout(publish, wait + 20);
  }
}

function beginRequest({ write = false, label = '' } = {}) {
  const id = nextId++;
  live.set(id, { write: !!write, label, at: Date.now(), retry: false });
  publish();
  return id;
}
function noteRetry(id) { const r = live.get(id); if (r) { r.retry = true; publish(); } }
function endRequest(id) { if (live.delete(id)) publish(); }
function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
const getActivity = () => snap; // a stable object until something changes (safe for useSyncExternalStore)

export { beginRequest, noteRetry, endRequest, subscribe, getActivity, SHOW_AFTER_MS, SLOW_AFTER_MS };
