const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../lib/paginate');
const C = require('../lib/userCache');

test('cursor: parse, reject junk, and applyCursor keeps existing date bounds', () => {
  assert.deepEqual(P.parseCursor('2026-10-05~65f0c0ffee0c0ffee0c0ffee'), { date: '2026-10-05', id: '65f0c0ffee0c0ffee0c0ffee' });
  assert.equal(P.parseCursor(''), null); assert.equal(P.parseCursor(undefined), null);
  for (const bad of ['nope', '2026-10-05', '2026-10-05~xyz', 'a~b~c', '2026-10-05~65f0c0ffee0c0ffee0c0ffee~x']) assert.equal(P.parseCursor(bad), false, bad);
  const f = P.applyCursor({ userId: 'u', date: { $gte: '2026-01-01' } }, { date: '2026-10-05', id: '65f0c0ffee0c0ffee0c0ffee' });
  assert.deepEqual(f.date, { $gte: '2026-01-01' });
  assert.equal(f.$and[0].$or.length, 2);
  assert.deepEqual(P.applyCursor({ a: 1 }, null), { a: 1 });
});
test('finishPage: trims the extra row, says whether there is more, builds the next cursor from the last shown row', () => {
  const rows = [1, 2, 3, 4].map((n) => ({ date: `2026-10-0${5 - n + 1}`, _id: `65f0c0ffee0c0ffee0c0ff0${n}` }));
  const p = P.finishPage(rows, 3);
  assert.equal(p.page.length, 3); assert.equal(p.hasMore, true); assert.equal(p.nextCursor, '2026-10-03~65f0c0ffee0c0ffee0c0ff03');
  const q = P.finishPage(rows.slice(0, 3), 3);
  assert.equal(q.hasMore, false); assert.equal(q.nextCursor, null);
  assert.deepEqual(P.finishPage([], 5), { page: [], hasMore: false, nextCursor: null });
  assert.equal(P.pageSize('abc', 50, 200), 50); assert.equal(P.pageSize('9999', 50, 200), 200); assert.equal(P.pageSize('0', 50, 200), 50); assert.equal(P.pageSize('-3', 50, 200), 1);
});

test('cache: same person + key is computed once; a write makes it stale; another person is unaffected', async () => {
  C._clear(); let n = 0; const make = async () => ({ n: ++n });
  assert.deepEqual((await C.cached('u1', 'wrapped', make)).value, { n: 1 });
  const again = await C.cached('u1', 'wrapped', make); assert.equal(again.hit, true); assert.equal(n, 1);
  await C.cached('u2', 'wrapped', make); assert.equal(n, 2);
  C.bump('u1');
  const fresh = await C.cached('u1', 'wrapped', make); assert.equal(fresh.hit, false); assert.equal(fresh.value.n, 3);
  assert.equal((await C.cached('u2', 'wrapped', make)).hit, true);
});
test('cache: not served across midnight or after the time limit', async () => {
  C._clear(); let n = 0; const make = async () => ++n; let t = 0; let day = '2026-10-05';
  const o = { now: () => t, ttl: 1000, day: () => day };
  await C.cached('u', 'k', make, o);
  t = 500; assert.equal((await C.cached('u', 'k', make, o)).hit, true);
  t = 1500; assert.equal((await C.cached('u', 'k', make, o)).hit, false);
  day = '2026-10-06'; assert.equal((await C.cached('u', 'k', make, o)).hit, false);
});
test('cache: a write that lands while computing means the answer is returned but not kept', async () => {
  C._clear(); let n = 0;
  const slow = async () => { n += 1; C.bump('u'); return n; };
  assert.equal((await C.cached('u', 'k', slow)).value, 1);
  assert.equal((await C.cached('u', 'k', slow)).hit, false); assert.equal(n, 2);
});
test('cache: undefined results (errors) are never stored', async () => {
  C._clear(); let n = 0; const bad = async () => { n += 1; return undefined; };
  await C.cached('u', 'k', bad); const r = await C.cached('u', 'k', bad);
  assert.equal(r.hit, false); assert.equal(n, 2); assert.equal(C._size(), 0);
});

function fakeRes() { const r = { code: 200, headers: {}, listeners: {}, set(k, v) { this.headers[k] = v; return this; }, status(c) { this.code = c; return this; }, get statusCode() { return this.code; }, json(b) { this.sent = b; this.emit('finish'); return this; }, on(e, f) { (this.listeners[e] = this.listeners[e] || []).push(f); return this; }, emit(e) { (this.listeners[e] || []).forEach((f) => f()); } }; return r; }
test('middleware: second identical GET is served from cache without running the handler; a POST in between clears it', async () => {
  C._clear(); let runs = 0;
  const handler = (req, res) => { runs += 1; res.json({ runs }); };
  const call = async (method, url) => {
    const req = { method, originalUrl: url, user: { id: 'u9' } }; const res = fakeRes();
    await new Promise((resolve) => { res.on('finish', resolve); C.bumpOnWrite(req, res, () => {}); if (method === 'GET') C.cacheGet()(req, res, () => handler(req, res)); else { res.json({ ok: 1 }); } });
    return res;
  };
  const a = await call('GET', '/api/wrapped?month=2026-10'); assert.equal(a.sent.runs, 1); assert.equal(a.headers['X-Cache'], 'miss');
  const b = await call('GET', '/api/wrapped?month=2026-10'); assert.equal(b.sent.runs, 1); assert.equal(b.headers['X-Cache'], 'hit'); assert.equal(runs, 1);
  await call('GET', '/api/wrapped?month=2026-09'); assert.equal(runs, 2);                       // different URL = different entry
  await call('POST', '/api/food-logs');                                                         // a write
  const c = await call('GET', '/api/wrapped?month=2026-10'); assert.equal(c.sent.runs, 3); assert.equal(c.headers['X-Cache'], 'miss');
});
