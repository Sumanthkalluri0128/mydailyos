// Server health numbers for the admin page: cold-start times, failed syncs, dropped offline writes, error counts, keep-alive status.
// Pure (no database, no Express) so it can be tested; lib/serverStatsStore.js saves it to MongoDB every few minutes so a restart does not erase it.
// Only AGGREGATE counts are kept: no user ids, no emails, no request bodies.
const DAY_MS = 86_400_000;
const KEEP_DAYS = 14;
const COUNTERS = ['errors5xx', 'syncFailed', 'writesDropped', 'wakeReports'];
const SOURCES = ['self', 'github', 'other'];

const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const clampInt = (n, max) => { const x = Math.floor(Number(n)); return Number.isFinite(x) && x > 0 ? Math.min(x, max) : 0; };

/** p in 0..100, nearest-rank on a copy; null for an empty list. */
function percentile(list, p) {
  const a = (list || []).filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  return a[Math.min(a.length - 1, Math.max(0, Math.ceil((p / 100) * a.length) - 1))];
}

function createStats({ now = Date.now, startedAt = now() } = {}) {
  let days = {};           // 'YYYY-MM-DD' -> { errors5xx, syncFailed, writesDropped, wakeReports }
  let wake = [];           // client-measured waits for a sleeping server, in ms (newest last, max 100)
  let boots = [];          // { at, listenMs, dbMs } per process start (newest last, max 20)
  let errors = [];         // { at, path, method, message } newest last, max 20
  let pings = { self: [], github: [], other: [] }; // timestamps, kept for 24 h
  let thisBoot = null;
  let dirty = false;

  const trimDays = () => { const keys = Object.keys(days).sort(); while (keys.length > KEEP_DAYS) delete days[keys.shift()]; };
  const bucket = () => { const d = dayOf(now()); if (!days[d]) { days[d] = {}; trimDays(); } return days[d]; };

  return {
    startedAt,
    count(name, n = 1) {
      if (!COUNTERS.includes(name)) return false;
      const k = clampInt(n, 1000); if (!k) return false;
      const b = bucket(); b[name] = (b[name] || 0) + k; dirty = true; return true;
    },
    wake(ms) { const v = clampInt(ms, 5 * 60_000); if (!v) return false; wake.push(v); wake = wake.slice(-100); this.count('wakeReports'); dirty = true; return true; },
    /** One record per process start; the second call (database connected) fills in the rest of the same record. */
    boot({ listenMs, dbMs }) {
      if (!thisBoot) { thisBoot = { at: new Date(now()).toISOString(), listenMs: null, dbMs: null }; boots.push(thisBoot); boots = boots.slice(-20); }
      if (clampInt(listenMs, 3_600_000)) thisBoot.listenMs = clampInt(listenMs, 3_600_000);
      if (clampInt(dbMs, 3_600_000)) thisBoot.dbMs = clampInt(dbMs, 3_600_000);
      dirty = true;
    },
    error({ path, method, message }) {
      this.count('errors5xx');
      errors.push({ at: new Date(now()).toISOString(), path: String(path || '').split('?')[0].slice(0, 120), method: String(method || '').slice(0, 8), message: String(message || '').slice(0, 160) });
      errors = errors.slice(-20); dirty = true;
    },
    ping(source) {
      const s = SOURCES.includes(source) ? source : 'other';
      const t = now(); pings[s].push(t);
      if (pings[s].length > 600) pings[s] = pings[s].filter((x) => t - x < DAY_MS);
    },
    snapshot() {
      const t = now();
      const recent = {}; const last = {};
      for (const s of SOURCES) { const l = pings[s].filter((x) => t - x < DAY_MS); recent[s] = l.length; last[s] = l.length ? new Date(l[l.length - 1]).toISOString() : null; }
      const age = (iso) => (iso ? t - Date.parse(iso) : Infinity);
      const ok = age(last.self) < 10 * 60_000 || age(last.github) < 15 * 60_000 || age(last.other) < 15 * 60_000;
      const keepAlive = {
        status: ok ? 'ok' : 'quiet',
        note: ok ? 'Pings are arriving, so the free host should stay awake.' : 'No keep-alive ping in the last 15 minutes. The host may go to sleep (next visit waits 30 to 60 seconds).',
        self: { last: last.self, count24h: recent.self }, github: { last: last.github, count24h: recent.github }, other: { last: last.other, count24h: recent.other },
      };
      return {
        now: new Date(t).toISOString(), uptimeSec: Math.round((t - startedAt) / 1000),
        boots: boots.slice(), bootNow: boots[boots.length - 1] || null,
        wake: { samples: wake.length, p50: percentile(wake, 50), p95: percentile(wake, 95), max: wake.length ? Math.max(...wake) : null, recent: wake.slice(-10) },
        days: Object.keys(days).sort().reverse().map((d) => ({ day: d, ...Object.fromEntries(COUNTERS.map((c) => [c, days[d][c] || 0])) })),
        recentErrors: errors.slice().reverse(), keepAlive,
      };
    },
    /** Saved form (no pings: they are only meaningful while the process is alive). */
    toJSON() { return { days, wake, boots, errors }; },
    restore(doc) {
      if (!doc || typeof doc !== 'object') return;
      for (const [d, v] of Object.entries(doc.days || {})) if (/^\d{4}-\d\d-\d\d$/.test(d) && v && typeof v === 'object') { days[d] = days[d] || {}; for (const c of COUNTERS) days[d][c] = (days[d][c] || 0) + clampInt(v[c], 1e9); }
      trimDays();
      wake = [...(doc.wake || []).map(Number).filter(Number.isFinite), ...wake].slice(-100);
      boots = [...(doc.boots || []).filter((b) => b && b.at), ...boots].slice(-20);
      errors = [...(doc.errors || []).filter((e) => e && e.at), ...errors].slice(-20);
    },
    isDirty: () => dirty, clean() { dirty = false; },
  };
}

/** Which keep-alive source sent this /api/health request: our own self-ping, the GitHub workflow, or anything else (a monitor, a browser). */
const pingSource = (headers = {}) => { const v = String(headers['x-keepalive'] || '').toLowerCase(); return v === 'self' || v === 'github' ? v : 'other'; };

module.exports = { createStats, percentile, pingSource, COUNTERS };
