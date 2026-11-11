// Rate limits for the sign-in routes. Much stricter than the global 400 requests a minute per IP.
// Each route gets TWO limiters chained together: one per person (IP + email: stops guessing one account)
// and one per IP (stops one machine trying many accounts, and mass sign-ups).
const { rateLimit } = require('../middleware/rateLimit');

const LIMITS = {
  login:  { perEmail: { windowMs: 15 * 60_000, max: 5 },  perIp: { windowMs: 15 * 60_000, max: 30 } },
  signup: { perIp:    { windowMs: 60 * 60_000, max: 5 },  perIpDay: { windowMs: 24 * 60 * 60_000, max: 15 } },
  forgot: { perEmail: { windowMs: 60 * 60_000, max: 3 },  perIp: { windowMs: 60 * 60_000, max: 10 } },
  reset:  { perIp:    { windowMs: 15 * 60_000, max: 10 }, perEmail: { windowMs: 60 * 60_000, max: 10 } },
};
// Tests that sign up many times from one address set AUTH_LIMITS_SCALE (for example 100) before loading the app. Never set it in production.
const scaled = (o) => { const k = Number(process.env.AUTH_LIMITS_SCALE) || 1; return k === 1 ? o : { ...o, max: Math.round(o.max * k) }; };
const emailOf = (req) => String(req.body?.email || '').trim().toLowerCase();

/** Runs several limiters in order; stops at the first one that answers 429. */
function chain(list) {
  const mw = (req, res, next) => {
    let i = 0;
    const step = () => { if (res.headersSent) return; const f = list[i++]; if (!f) return next(); f(req, res, step); };
    step();
  };
  mw.reset = () => list.forEach((l) => l.reset && l.reset());
  return mw;
}

const loginLimiters = (L = LIMITS.login) => chain([
  rateLimit({ ...scaled(L.perIp), keyFn: (req) => `login-ip|${req.ip}`, message: 'Too many sign-in attempts from this network. Please wait a few minutes and try again.' }),
  rateLimit({ ...scaled(L.perEmail), keyFn: (req) => `login|${req.ip}|${emailOf(req)}`, message: 'Too many login attempts. Please wait a few minutes and try again.' }),
]);
const signupLimiters = (L = LIMITS.signup) => chain([
  rateLimit({ ...scaled(L.perIp), keyFn: (req) => `signup|${req.ip}`, message: 'Too many sign-ups from this network. Please try again in an hour.' }),
  rateLimit({ ...scaled(L.perIpDay), keyFn: (req) => `signup-day|${req.ip}`, message: 'Too many sign-ups from this network today. Please try again tomorrow.' }),
]);
const forgotLimiters = (L = LIMITS.forgot) => chain([
  rateLimit({ ...scaled(L.perIp), keyFn: (req) => `forgot-ip|${req.ip}`, message: 'Too many reset requests from this network. Please wait before trying again.' }),
  rateLimit({ ...scaled(L.perEmail), keyFn: (req) => `forgot|${emailOf(req)}`, message: 'Too many reset requests. Please wait before trying again.' }),
]);
const resetLimiters = (L = LIMITS.reset) => chain([
  rateLimit({ ...scaled(L.perIp), keyFn: (req) => `reset-ip|${req.ip}`, message: 'Too many attempts. Please wait a few minutes.' }),
  rateLimit({ ...scaled(L.perEmail), keyFn: (req) => `reset|${emailOf(req)}`, message: 'Too many attempts for this account. Please wait a while.' }),
]);

module.exports = { LIMITS, chain, loginLimiters, signupLimiters, forgotLimiters, resetLimiters };
