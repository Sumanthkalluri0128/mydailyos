// Cookie sessions for the website (the phone keeps using its Authorization header; both work side by side).
//   mdos_session  the sign-in token, httpOnly: page scripts (and so any injected script) cannot read it.
//   mdos_csrf     a random value the page CAN read; every write must send it back in X-CSRF-Token (double-submit check).
// Off until COOKIE_AUTH=1 is set on the server. COOKIE_SAMESITE=lax (default; use when the API is on the SAME site as the web app,
// for example behind a Vercel rewrite of /api/*) or none (API on another site; Safari and some browsers block those cookies).
const crypto = require('node:crypto');

const SESSION = 'mdos_session';
const CSRF = 'mdos_csrf';
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;       // the cookie lives 14 days; it is renewed whenever you use the app after 24 hours
const RENEW_AFTER_S = 24 * 60 * 60;
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

const enabled = (env = process.env) => env.COOKIE_AUTH === '1';

function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const i = part.indexOf('='); if (i < 1) continue;
    const k = part.slice(0, i).trim(); if (!k) continue; let v = part.slice(i + 1).trim();
    try { v = decodeURIComponent(v); } catch { /* keep as is */ }
    if (!(k in out)) out[k] = v;
  }
  return out;
}

function options(env = process.env) {
  const sameSite = String(env.COOKIE_SAMESITE || 'lax').toLowerCase() === 'none' ? 'none' : 'lax';
  return { sameSite, secure: sameSite === 'none' || env.NODE_ENV === 'production' };
}

/** Sets both cookies on the response (res.cookie from Express). */
function issue(res, token, env = process.env) {
  const o = options(env);
  res.cookie(SESSION, token, { httpOnly: true, secure: o.secure, sameSite: o.sameSite, maxAge: MAX_AGE_MS, path: '/' });
  res.cookie(CSRF, crypto.randomBytes(24).toString('hex'), { httpOnly: false, secure: o.secure, sameSite: o.sameSite, maxAge: MAX_AGE_MS, path: '/' });
}
function clear(res, env = process.env) {
  const o = options(env);
  for (const name of [SESSION, CSRF]) res.clearCookie(name, { httpOnly: name === SESSION, secure: o.secure, sameSite: o.sameSite, path: '/' });
}

const safeEqual = (a, b) => { const x = Buffer.from(String(a || '')); const y = Buffer.from(String(b || '')); return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y); };

/**
 * A write that arrives with only a cookie must prove it came from our own page:
 * the X-CSRF-Token header must equal the mdos_csrf cookie, and if the browser sent an Origin it must be an allowed one.
 */
function csrfOk(req, allowedOrigins = []) {
  if (SAFE.has(req.method)) return true;
  const cookies = req.cookies || parseCookies(req.headers && req.headers.cookie);
  if (!safeEqual(req.headers && req.headers['x-csrf-token'], cookies[CSRF])) return false;
  const origin = req.headers && req.headers.origin;
  return !origin || allowedOrigins.includes(origin);
}

module.exports = { SESSION, CSRF, RENEW_AFTER_S, enabled, parseCookies, issue, clear, csrfOk, safeEqual };
