const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../lib/session');
let jwt = null; try { jwt = require('jsonwebtoken'); } catch { /* not installed: those tests skip */ }

const ORIGINS = ['https://app.example.com'];
const reqOf = (method, { cookie = '', csrf, origin } = {}) => ({ method, headers: { cookie, ...(csrf ? { 'x-csrf-token': csrf } : {}), ...(origin ? { origin } : {}) } });

test('cookies parse, including encoded values, and the first one wins', () => {
  assert.deepEqual(S.parseCookies('a=1; mdos_session=ab%2Bc; a=2; junk; =x'), { a: '1', mdos_session: 'ab+c' });
  assert.deepEqual(S.parseCookies(''), {}); assert.deepEqual(S.parseCookies(undefined), {});
});
test('off unless COOKIE_AUTH=1', () => { assert.equal(S.enabled({}), false); assert.equal(S.enabled({ COOKIE_AUTH: '0' }), false); assert.equal(S.enabled({ COOKIE_AUTH: '1' }), true); });
test('reads never need the CSRF token; writes need header = cookie', () => {
  assert.equal(S.csrfOk(reqOf('GET'), ORIGINS), true);
  const c = 'mdos_csrf=abc123';
  assert.equal(S.csrfOk(reqOf('POST', { cookie: c, csrf: 'abc123' }), ORIGINS), true);
  assert.equal(S.csrfOk(reqOf('POST', { cookie: c }), ORIGINS), false);                       // header missing
  assert.equal(S.csrfOk(reqOf('POST', { cookie: c, csrf: 'wrong!' }), ORIGINS), false);       // header wrong
  assert.equal(S.csrfOk(reqOf('DELETE', { cookie: '', csrf: 'abc123' }), ORIGINS), false);    // no cookie
  assert.equal(S.csrfOk(reqOf('PUT', { cookie: c, csrf: 'abc123456' }), ORIGINS), false);     // different length
});
test('writes from a foreign Origin are refused even with a matching token; no Origin header is fine', () => {
  const base = { cookie: 'mdos_csrf=t0k', csrf: 't0k' };
  assert.equal(S.csrfOk(reqOf('POST', { ...base, origin: 'https://app.example.com' }), ORIGINS), true);
  assert.equal(S.csrfOk(reqOf('POST', { ...base, origin: 'https://evil.example' }), ORIGINS), false);
  assert.equal(S.csrfOk(reqOf('POST', base), ORIGINS), true);
});
test('issue sets an httpOnly session cookie and a readable csrf cookie; clear removes both', () => {
  const calls = []; const res = { cookie: (n, v, o) => calls.push(['set', n, v, o]), clearCookie: (n, o) => calls.push(['clear', n, o]) };
  S.issue(res, 'TOKEN', { NODE_ENV: 'production' });
  const [sess, csrf] = calls;
  assert.deepEqual([sess[1], sess[2], sess[3].httpOnly, sess[3].secure, sess[3].sameSite], ['mdos_session', 'TOKEN', true, true, 'lax']);
  assert.equal(csrf[1], 'mdos_csrf'); assert.equal(csrf[3].httpOnly, false); assert.match(csrf[2], /^[0-9a-f]{48}$/);
  calls.length = 0; S.issue(res, 'T', { COOKIE_SAMESITE: 'none' }); assert.equal(calls[0][3].sameSite, 'none'); assert.equal(calls[0][3].secure, true);   // None requires Secure
  calls.length = 0; S.clear(res); assert.deepEqual(calls.map((c) => c[1]), ['mdos_session', 'mdos_csrf']);
});

function runAuth(req) {
  delete require.cache[require.resolve('../middleware/auth')];
  const { requireAuth } = require('../middleware/auth');
  const res = { code: 200, cookies: [], status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, cookie(n, v) { this.cookies.push(n); } };
  const full = { app: { locals: { allowedOrigins: ORIGINS } }, ...req };
  let next = false; requireAuth(full, res, () => { next = true; });
  return { res, next, req: full };
}
test('requireAuth: Bearer still works; cookie only works when COOKIE_AUTH=1; writes by cookie need CSRF', { skip: !jwt }, () => {
  process.env.JWT_SECRET = 'test-secret';
  const tok = jwt.sign({ sub: 'u1', email: 'a@x.dev' }, 'test-secret', { expiresIn: '1h' });
  delete process.env.COOKIE_AUTH;
  assert.equal(runAuth({ method: 'POST', headers: { authorization: `Bearer ${tok}` } }).next, true);
  assert.equal(runAuth({ method: 'GET', headers: { cookie: `mdos_session=${tok}` } }).res.code, 401);        // cookie ignored while off
  process.env.COOKIE_AUTH = '1';
  try {
    const ok = runAuth({ method: 'GET', headers: { cookie: `mdos_session=${tok}` } }); assert.equal(ok.next, true); assert.equal(ok.req.user.id, 'u1');
    assert.equal(runAuth({ method: 'POST', headers: { cookie: `mdos_session=${tok}` } }).res.code, 403);      // write without CSRF
    assert.equal(runAuth({ method: 'POST', headers: { cookie: `mdos_session=${tok}; mdos_csrf=zz`, 'x-csrf-token': 'zz' } }).next, true);
    assert.equal(runAuth({ method: 'POST', headers: { authorization: `Bearer ${tok}`, cookie: 'mdos_session=garbage' } }).next, true);   // Bearer wins, no CSRF needed
    assert.equal(runAuth({ method: 'GET', headers: { cookie: 'mdos_session=garbage' } }).res.code, 401);
    const old = jwt.sign({ sub: 'u1', email: 'a@x.dev', iat: Math.floor(Date.now() / 1000) - 3 * 86400 }, 'test-secret', { expiresIn: '10d' });
    assert.deepEqual(runAuth({ method: 'GET', headers: { cookie: `mdos_session=${old}` } }).res.cookies, ['mdos_session', 'mdos_csrf']);   // renewed after a day
    assert.deepEqual(runAuth({ method: 'GET', headers: { cookie: `mdos_session=${tok}` } }).res.cookies, []);                               // fresh: not renewed
  } finally { delete process.env.COOKIE_AUTH; }
});
