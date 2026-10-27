const test = require('node:test');
const assert = require('node:assert/strict');
const { createStats, percentile, pingSource } = require('../lib/serverStats');
const flags = require('../lib/flags');

const clock = (iso) => { let t = Date.parse(iso); const f = () => t; f.add = (ms) => { t += ms; }; return f; };

test('percentile: nearest rank, ignores junk, null when empty', () => {
  assert.equal(percentile([], 50), null);
  assert.equal(percentile([5, 1, 3, 2, 4], 50), 3);
  assert.equal(percentile([1, 2, 3, 4, 100], 95), 100);
  assert.equal(percentile([NaN, 7], 50), 7);
});

test('stats: counters per day, clamped, unknown names ignored', () => {
  const now = clock('2026-10-26T10:00:00Z'); const s = createStats({ now });
  assert.equal(s.count('syncFailed', 3), true); assert.equal(s.count('writesDropped', 5000), true);
  assert.equal(s.count('bogus', 1), false); assert.equal(s.count('syncFailed', -4), false); assert.equal(s.count('syncFailed', 'x'), false);
  now.add(86_400_000); s.count('syncFailed');
  const d = s.snapshot().days;
  assert.equal(d[0].day, '2026-10-27'); assert.equal(d[0].syncFailed, 1);
  assert.equal(d[1].syncFailed, 3); assert.equal(d[1].writesDropped, 1000);
});

test('stats: cold-start samples, error list keeps the newest 20 and strips query strings', () => {
  const s = createStats({ now: clock('2026-10-26T10:00:00Z') });
  [30000, 45000, 2000].forEach((m) => s.wake(m)); assert.equal(s.wake(0), false); assert.equal(s.wake(10 * 60_000), true);
  assert.equal(s.snapshot().wake.samples, 4); assert.equal(s.snapshot().wake.p50, 30000);
  for (let i = 0; i < 25; i++) s.error({ path: `/api/x?secret=${i}`, method: 'GET', message: 'boom' });
  const snap = s.snapshot(); assert.equal(snap.recentErrors.length, 20); assert.doesNotMatch(JSON.stringify(snap.recentErrors), /secret/);
  assert.equal(snap.days[0].errors5xx, 25);
});

test('stats: one boot record per process, filled in by the second call', () => {
  const s = createStats({ now: clock('2026-10-26T10:00:00Z') });
  s.boot({ listenMs: 800, dbMs: null }); s.boot({ listenMs: null, dbMs: 4200 });
  const b = s.snapshot().boots; assert.equal(b.length, 1); assert.deepEqual([b[0].listenMs, b[0].dbMs], [800, 4200]);
});

test('keep-alive status: ok while pings arrive, quiet otherwise; source from header', () => {
  const now = clock('2026-10-26T10:00:00Z'); const s = createStats({ now });
  assert.equal(s.snapshot().keepAlive.status, 'quiet');
  s.ping(pingSource({ 'x-keepalive': 'self' })); assert.equal(s.snapshot().keepAlive.status, 'ok');
  now.add(11 * 60_000); assert.equal(s.snapshot().keepAlive.status, 'quiet');
  s.ping(pingSource({ 'x-keepalive': 'github' })); assert.equal(s.snapshot().keepAlive.status, 'ok');
  assert.equal(pingSource({}), 'other'); assert.equal(pingSource({ 'x-keepalive': 'evil' }), 'other');
  assert.equal(s.snapshot().keepAlive.github.count24h, 1);
});

test('stats: save and restore merge instead of replacing', () => {
  const a = createStats({ now: clock('2026-10-26T10:00:00Z') }); a.count('syncFailed', 2); a.wake(1000);
  const b = createStats({ now: clock('2026-10-26T12:00:00Z') }); b.count('syncFailed', 1); b.restore(JSON.parse(JSON.stringify(a.toJSON())));
  assert.equal(b.snapshot().days[0].syncFailed, 3); assert.equal(b.snapshot().wake.samples, 1);
  b.restore(null); b.restore({ days: { 'bad': { syncFailed: 9 } } }); assert.equal(b.snapshot().days.length, 1);
});

test('flags: master switch, deny, allow, percent', () => {
  const f = { key: 'new-thing', enabled: true, percent: 0, allow: ['Pat@x.com'], deny: ['bad@x.com'] };
  assert.equal(flags.evaluate({ ...f, enabled: false, percent: 100 }, { id: '1' }), false);
  assert.equal(flags.evaluate(f, { id: 'u1', email: 'pat@x.com' }), true);          // allow list, case-insensitive
  assert.equal(flags.evaluate(f, { id: 'u2', email: 'other@x.com' }), false);       // 0 percent
  assert.equal(flags.evaluate({ ...f, percent: 100 }, { id: 'u3', email: 'bad@x.com' }), false); // deny wins
  assert.equal(flags.evaluate({ ...f, percent: 100 }, null), true);                 // everyone, even signed out
  assert.equal(flags.evaluate({ ...f, percent: 50 }, null), false);
  assert.equal(flags.evaluate(null, { id: '1' }), false);
});

test('flags: percentage is stable, roughly right, and only ever adds people', () => {
  const ids = Array.from({ length: 2000 }, (_, i) => `user${i}`);
  const on = (pct) => ids.filter((id) => flags.evaluate({ key: 'k', enabled: true, percent: pct }, { id }));
  const a = on(10), b = on(30);
  assert.ok(a.length > 120 && a.length < 280, `10% gave ${a.length}`);
  assert.ok(a.every((id) => b.includes(id)), 'raising the percentage keeps everyone who had it');
  assert.deepEqual(on(10), a);
  assert.notEqual(flags.bucket('one', 'u'), flags.bucket('two', 'u') + 1000); // different flags use different buckets
});

test('flags: admin edits are validated and cleaned', () => {
  const c = flags.cleanFlag('beta.chart', { enabled: true, percent: '25', allow: 'A@x.com, b@x.com a@x.com', deny: ['  '], description: 'x'.repeat(300) });
  assert.deepEqual([c.enabled, c.percent, c.allow, c.deny, c.description.length], [true, 25, ['a@x.com', 'b@x.com'], [], 200]);
  assert.equal(flags.cleanFlag('ok-1', { enabled: 'yes' }).enabled, false);
  assert.throws(() => flags.cleanFlag('Bad Key', {}), /lowercase/); assert.throws(() => flags.cleanFlag('ok', { percent: 101 }), /Percent/);
  assert.deepEqual(flags.evaluateAll([{ key: 'a', enabled: true, percent: 100 }, { key: 'b', enabled: false }], { id: '1' }), { a: true, b: false });
});
