const test = require('node:test');
const assert = require('node:assert/strict');
const { LIMITS, loginLimiters, signupLimiters, forgotLimiters, chain } = require('../lib/authLimits');
const { rateLimit } = require('../middleware/rateLimit');

function run(mw, req) {
  const res = { headers: {}, statusCode: 200, headersSent: false, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; this.headersSent = true; return this; } };
  let passed = false; mw(req, res, () => { passed = true; });
  return { passed, res };
}
const req = (ip, email) => ({ ip, body: { email } });

test('login: the 6th try for one email from one IP is refused, a different email is not', () => {
  const mw = loginLimiters();
  for (let i = 0; i < LIMITS.login.perEmail.max; i += 1) assert.equal(run(mw, req('1.1.1.1', 'a@x.dev')).passed, true);
  const blocked = run(mw, req('1.1.1.1', 'a@x.dev'));
  assert.equal(blocked.passed, false); assert.equal(blocked.res.statusCode, 429);
  assert.equal(run(mw, req('1.1.1.1', 'b@x.dev')).passed, true);
  assert.equal(run(mw, req('2.2.2.2', 'a@x.dev')).passed, true);
});
test('login: one IP trying many different emails is stopped by the per-IP cap', () => {
  const mw = loginLimiters();
  for (let i = 0; i < LIMITS.login.perIp.max; i += 1) assert.equal(run(mw, req('9.9.9.9', `u${i}@x.dev`)).passed, true);
  assert.equal(run(mw, req('9.9.9.9', 'fresh@x.dev')).res.statusCode, 429);
});
test('signup: only 5 an hour per IP', () => {
  const mw = signupLimiters();
  for (let i = 0; i < LIMITS.signup.perIp.max; i += 1) assert.equal(run(mw, req('3.3.3.3', `n${i}@x.dev`)).passed, true);
  assert.equal(run(mw, req('3.3.3.3', 'one-more@x.dev')).res.statusCode, 429);
});
test('forgot password: 3 an hour per email, whatever the IP', () => {
  const mw = forgotLimiters();
  for (let i = 0; i < LIMITS.forgot.perEmail.max; i += 1) assert.equal(run(mw, req(`10.0.0.${i}`, 'v@x.dev')).passed, true);
  assert.equal(run(mw, req('10.0.0.99', 'v@x.dev')).res.statusCode, 429);
});
test('all auth limits are far below the global 400 a minute', () => {
  for (const group of Object.values(LIMITS)) for (const l of Object.values(group)) assert.ok(l.max <= 30 && l.windowMs >= 15 * 60_000);
});
test('chain stops at the first limiter that refuses and does not call next twice', () => {
  const a = rateLimit({ max: 1, keyFn: () => 'k' });
  const mw = chain([a, rateLimit({ max: 100, keyFn: () => 'k2' })]);
  assert.equal(run(mw, req('1', 'e')).passed, true);
  assert.equal(run(mw, req('1', 'e')).res.statusCode, 429);
});
