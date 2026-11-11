// A small per-person cache for heavy read-only summaries (Wrapped, progress, weekly, achievements).
// Safe by design: every successful write by that person bumps their "data version", which makes all their cached answers
// stale at once; the day is part of the key, so nothing is served across midnight; and a short time limit is the last backstop.
const TTL_MS = 10 * 60_000;
const MAX_ENTRIES = 3000;
const versions = new Map();          // userId -> number
const store = new Map();             // key -> { at, version, value }   (insertion order = oldest first)

const ver = (uid) => versions.get(String(uid)) || 0;
const bump = (uid) => { versions.set(String(uid), ver(uid) + 1); };

async function cached(uid, key, produce, { ttl = TTL_MS, now = Date.now, day = () => new Date().toISOString().slice(0, 10) } = {}) {
  const k = `${uid}|${day()}|${key}`;
  const hit = store.get(k);
  if (hit && hit.version === ver(uid) && now() - hit.at < ttl) { store.delete(k); store.set(k, hit); return { value: hit.value, hit: true }; }
  const startVersion = ver(uid);
  const value = await produce();
  // If the person wrote something while we were computing, this answer may already be stale: return it, but do not keep it.
  if (value !== undefined && ver(uid) === startVersion) {
    store.delete(k); store.set(k, { at: now(), version: startVersion, value });
    while (store.size > MAX_ENTRIES) store.delete(store.keys().next().value);
  }
  return { value, hit: false };
}

/** Express: cache a GET response per person + full URL. Sends `X-Cache: hit|miss`. */
function cacheGet(opts = {}) {
  return (req, res, next) => {
    if (req.method !== 'GET' || !req.user) return next();
    const orig = res.json.bind(res);
    let produced = false;
    res.set('X-Cache', 'miss');
    cached(req.user.id, req.originalUrl, () => new Promise((resolve) => {
      produced = true;
      res.json = (body) => { res.json = orig; resolve(res.statusCode < 400 ? body : undefined); return orig(body); };
      res.on('finish', () => resolve(undefined));     // a handler that answers some other way is simply not cached
      next();
    }), opts).then(({ value, hit }) => { if (hit && !produced && value !== undefined) { res.set('X-Cache', 'hit'); orig(value); } }).catch(next);
  };
}

/** Express: after any successful write (POST/PUT/PATCH/DELETE) by a signed-in person, forget their cached summaries. */
const NO_BUMP = /^\/api\/(telemetry|tour)\b/;   // usage pings do not change anything a summary shows
function bumpOnWrite(req, res, next) {
  if (!NO_BUMP.test(req.originalUrl || '') && req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') res.on('finish', () => { if (res.statusCode < 400 && req.user && req.user.id) bump(req.user.id); });
  next();
}
const _clear = () => { store.clear(); versions.clear(); };
module.exports = { cached, cacheGet, bumpOnWrite, bump, TTL_MS, _clear, _size: () => store.size };
