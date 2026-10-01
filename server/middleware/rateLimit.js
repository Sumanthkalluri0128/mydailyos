// Small dependency-free, in-memory rate limiter (fixed window, per key).
// Good enough for a single Render instance; swap for a Redis-backed limiter if you ever scale out.
function rateLimit({ windowMs = 60_000, max = 100, keyFn, message = 'Too many requests, please slow down.', now = Date.now } = {}) {
  const hits = new Map(); // key -> { count, resetAt }

  const sweep = setInterval(() => {
    const t = now();
    for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);
  }, Math.max(windowMs, 30_000));
  if (sweep.unref) sweep.unref();

  const middleware = (req, res, next) => {
    const key = (keyFn ? keyFn(req) : req.ip) || 'unknown';
    const t = now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= t) {
      entry = { count: 0, resetAt: t + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    const remaining = Math.max(0, max - entry.count);
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil((entry.resetAt - t) / 1000)));

    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - t) / 1000)));
      return res.status(429).json({ success: false, message });
    }
    next();
  };
  middleware.reset = () => hits.clear();
  middleware.size = () => hits.size;
  return middleware;
}

module.exports = { rateLimit };
