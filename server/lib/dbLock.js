// A per-person lease lock that works across several server processes. Pure: the storage is injected (see makeMongoStore), so the
// behaviour is tested without a database.
//   store.tryAcquire(key, owner, ttlMs) -> true when this owner now holds the lease (free, expired, or already ours)
//   store.release(key, owner)           -> frees the lease, only if this owner still holds it
const crypto = require('node:crypto');

const DEFAULTS = { ttlMs: 15000, waitMs: 12000, pollMs: 40 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class LockBusyError extends Error {
  constructor() { super('The coach is busy with another request. Please try again in a moment.'); this.status = 503; this.code = 'LOCK_BUSY'; }
}

/** Runs fn while holding the lease for `key`. Waits (with a little jitter) up to waitMs; then gives up with a 503-style error. */
async function withLease(store, key, fn, opts = {}) {
  const { ttlMs, waitMs, pollMs } = { ...DEFAULTS, ...opts };
  const owner = crypto.randomUUID();
  const sl = opts.sleep || sleep;
  const now = opts.now || Date.now;
  const give = now() + waitMs;
  let got = false;
  for (;;) {
    got = await store.tryAcquire(key, owner, ttlMs);
    if (got) break;
    if (now() >= give) throw new LockBusyError();
    await sl(pollMs + Math.floor(Math.random() * pollMs));
  }
  // A slow request must not lose its lease halfway: while the work runs, the lease is extended every third of its life.
  let beat = null;
  if (typeof store.renew === 'function' && !opts.noRenew) {
    beat = setInterval(() => { Promise.resolve(store.renew(key, owner, ttlMs)).catch(() => {}); }, Math.max(1000, Math.floor(ttlMs / 3)));
    if (beat.unref) beat.unref();
  }
  try { return await fn(); } finally { if (beat) clearInterval(beat); try { await store.release(key, owner); } catch { /* the lease expires by itself */ } }
}

/**
 * The MongoDB store. `Lock` is the CoachLock model.
 * Upsert on (userId, until <= now): free or expired -> we take it; held by someone else -> the upsert tries to INSERT a second document for the
 * same userId and the unique index refuses (E11000) = busy. No read-then-write gap, so two processes can never both win.
 */
function makeMongoStore(Lock) {
  return {
    async tryAcquire(key, owner, ttlMs) {
      const t = new Date();
      try {
        await Lock.findOneAndUpdate({ userId: key, $or: [{ until: { $lte: t } }, { owner }] }, { $set: { owner, until: new Date(t.getTime() + ttlMs) } }, { upsert: true, new: true, setDefaultsOnInsert: true });
        return true;
      } catch (e) {
        if (e && e.code === 11000) return false;
        throw e;
      }
    },
    async renew(key, owner, ttlMs) { await Lock.updateOne({ userId: key, owner }, { $set: { until: new Date(Date.now() + ttlMs) } }); },
    async release(key, owner) { await Lock.deleteOne({ userId: key, owner }); },
  };
}

module.exports = { withLease, makeMongoStore, LockBusyError, DEFAULTS };
