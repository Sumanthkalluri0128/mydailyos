// Record sync between devices (Gym log first). Rules are pure; the routes run against a real MongoDB like the other integration tests.
const test = require('node:test');
const assert = require('node:assert/strict');
const dbHelper = require('./helpers/mongo');
const R = require('../lib/recordSync');
const skip = dbHelper.skipReason();

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.AUTH_LIMITS_SCALE = '100';

// ---------------------------------------------------------------- pure rules
test('cleanIncoming: only known kinds, safe ids, sane times, bounded size', () => {
  const now = 1_700_000_000_000;
  const ok = R.cleanIncoming({ kind: 'entry', rid: 'g-abc_1', data: { a: 1 }, updatedAt: now - 5 }, 'gym', now);
  assert.deepEqual(ok, { kind: 'entry', rid: 'g-abc_1', data: { a: 1 }, updatedAt: now - 5, deleted: false });
  assert.equal(R.cleanIncoming({ kind: 'nope', rid: 'x', data: {}, updatedAt: 1 }, 'gym', now), null, 'unknown kind');
  assert.equal(R.cleanIncoming({ kind: 'entry', rid: 'x', data: {}, updatedAt: 1 }, 'other', now), null, 'unknown space');
  assert.equal(R.cleanIncoming({ kind: 'entry', rid: 'has space', data: {}, updatedAt: 1 }, 'gym', now), null);
  assert.equal(R.cleanIncoming({ kind: 'entry', rid: '../etc', data: {}, updatedAt: 1 }, 'gym', now), null);
  assert.equal(R.cleanIncoming({ kind: 'entry', rid: 'x'.repeat(81), data: {}, updatedAt: 1 }, 'gym', now), null);
  assert.equal(R.cleanIncoming({ kind: 'entry', rid: 'x', data: [1], updatedAt: 1 }, 'gym', now), null, 'data must be an object');
  assert.equal(R.cleanIncoming({ kind: 'entry', rid: 'x', data: { big: 'y'.repeat(R.MAX_DATA_BYTES) }, updatedAt: 1 }, 'gym', now), null, 'too big');
  assert.equal(R.cleanIncoming({ kind: 'entry', rid: 'x', data: {}, updatedAt: 'soon' }, 'gym', now), null);
  assert.equal(R.cleanIncoming({ kind: 'entry', rid: 'x', data: {}, updatedAt: -1 }, 'gym', now), null);
  assert.equal(R.cleanIncoming({ kind: 'entry', rid: 'x', data: {}, updatedAt: now + 10 * 86_400_000 }, 'gym', now).updatedAt, now + 86_400_000, 'a clock far ahead is clamped');
  assert.deepEqual(R.cleanIncoming({ kind: 'entry', rid: 'x', deleted: true, data: { leak: 1 }, updatedAt: 5 }, 'gym', now), { kind: 'entry', rid: 'x', data: null, updatedAt: 5, deleted: true }, 'a deletion carries no data');
});
test('incomingWins: strictly newer wins, a tie keeps the server copy', () => {
  assert.equal(R.incomingWins(null, { updatedAt: 1 }), true);
  assert.equal(R.incomingWins({ updatedAt: 5 }, { updatedAt: 6 }), true);
  assert.equal(R.incomingWins({ updatedAt: 5 }, { updatedAt: 5 }), false);
  assert.equal(R.incomingWins({ updatedAt: 5 }, { updatedAt: 4 }), false);
});

// ---------------------------------------------------------------- routes
let server, base, mongoose, alice, bob;
async function call(token, method, path, body) {
  const res = await fetch(base + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text(); let json = {}; try { json = JSON.parse(text); } catch { json = { text }; }
  return { status: res.status, ...json };
}
test.before(async () => {
  if (skip) return;
  mongoose = require('mongoose');
  await mongoose.connect(await dbHelper.start()); await mongoose.connection.dropDatabase();
  const { createApp } = require('../app');
  await new Promise((r) => { server = createApp({ allowedOrigins: [] }).listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
  alice = (await call(null, 'POST', '/api/auth/signup', { name: 'A', email: 'a-sync@test.dev', password: 'password123' })).token;
  bob = (await call(null, 'POST', '/api/auth/signup', { name: 'B', email: 'b-sync@test.dev', password: 'password123' })).token;
});
test.after(async () => { if (skip) return; await mongoose.connection.dropDatabase(); await mongoose.disconnect(); await new Promise((r) => server.close(r)); await dbHelper.stop(); });

const entry = (rid, at, extra = {}) => ({ kind: 'entry', rid, updatedAt: at, data: { id: rid, date: '2026-11-01', exId: 'bench', sets: [{ kg: 40, reps: 10 }], at, ...extra } });

test('push then pull: a record made on one device reaches another, and pushing twice changes nothing', { skip }, async () => {
  const p1 = await call(alice, 'POST', '/api/sync/push', { space: 'gym', records: [entry('e1', 1000), entry('e2', 1001), { kind: 'goal', rid: 'goal', updatedAt: 1002, data: { targetKg: 70 } }] });
  assert.equal(p1.status, 200); assert.equal(p1.applied, 3); assert.equal(p1.rejected, 0);
  const again = await call(alice, 'POST', '/api/sync/push', { space: 'gym', records: [entry('e1', 1000), entry('e2', 1001)] });
  assert.equal(again.applied, 0, 'the same records again are not new');
  assert.equal(again.kept.length, 2);
  const pull = await call(alice, 'GET', '/api/sync/pull?space=gym&since=0');
  assert.equal(pull.records.length, 3);
  assert.deepEqual(pull.records.map((r) => r.seq), [1, 2, 3]);
  assert.equal(pull.more, false);
  const none = await call(alice, 'GET', `/api/sync/pull?space=gym&since=${pull.seq}`);
  assert.equal(none.records.length, 0, 'nothing new after the cursor');
});

test('conflict: the newer edit wins on both sides, an older one is ignored and reported back', { skip }, async () => {
  await call(alice, 'POST', '/api/sync/push', { space: 'gym', records: [entry('c1', 2000, { note: 'phone' })] });
  const older = await call(alice, 'POST', '/api/sync/push', { space: 'gym', records: [entry('c1', 1500, { note: 'old browser' })] });
  assert.equal(older.applied, 0);
  assert.equal(older.kept[0].data.note, 'phone', 'the server tells the device which copy won');
  const newer = await call(alice, 'POST', '/api/sync/push', { space: 'gym', records: [entry('c1', 2500, { note: 'browser later' })] });
  assert.equal(newer.applied, 1);
  const tie = await call(alice, 'POST', '/api/sync/push', { space: 'gym', records: [entry('c1', 2500, { note: 'same instant' })] });
  assert.equal(tie.applied, 0, 'a tie keeps the server copy so every device agrees');
  const cur = (await call(alice, 'GET', '/api/sync/pull?space=gym&since=0')).records.find((r) => r.rid === 'c1');
  assert.equal(cur.data.note, 'browser later');
});

test('a deletion is a record: it reaches other devices, and an older edit cannot bring the record back', { skip }, async () => {
  await call(alice, 'POST', '/api/sync/push', { space: 'gym', records: [entry('d1', 3000)] });
  const del = await call(alice, 'POST', '/api/sync/push', { space: 'gym', records: [{ kind: 'entry', rid: 'd1', deleted: true, updatedAt: 3100 }] });
  assert.equal(del.applied, 1);
  const stale = await call(alice, 'POST', '/api/sync/push', { space: 'gym', records: [entry('d1', 3050)] });   // another device still had the old copy
  assert.equal(stale.applied, 0);
  const rec = (await call(alice, 'GET', '/api/sync/pull?space=gym&since=0')).records.find((r) => r.rid === 'd1');
  assert.equal(rec.deleted, true); assert.equal(rec.data, null);
  const redo = await call(alice, 'POST', '/api/sync/push', { space: 'gym', records: [entry('d1', 3200)] });  // logging it again later is a new edit
  assert.equal(redo.applied, 1);
});

test('people never see each other\'s records', { skip }, async () => {
  await call(bob, 'POST', '/api/sync/push', { space: 'gym', records: [entry('same-id', 5000, { note: 'bob' })] });
  await call(alice, 'POST', '/api/sync/push', { space: 'gym', records: [entry('same-id', 5001, { note: 'alice' })] });
  const b = (await call(bob, 'GET', '/api/sync/pull?space=gym&since=0')).records;
  assert.deepEqual(b.map((r) => r.rid), ['same-id']);
  assert.equal(b[0].data.note, 'bob');
  assert.equal((await call(null, 'GET', '/api/sync/pull?space=gym&since=0')).status, 401);
  assert.equal((await call(null, 'POST', '/api/sync/push', { space: 'gym', records: [] })).status, 401);
});

test('bad input is refused cleanly', { skip }, async () => {
  assert.equal((await call(alice, 'POST', '/api/sync/push', { space: 'nope', records: [] })).status, 400);
  assert.equal((await call(alice, 'GET', '/api/sync/pull?space=nope')).status, 400);
  const mixed = await call(alice, 'POST', '/api/sync/push', { space: 'gym', records: [entry('ok1', 6000), { kind: 'bad', rid: 'x', data: {}, updatedAt: 1 }, 'junk', null] });
  assert.equal(mixed.applied, 1); assert.equal(mixed.rejected, 3);
  const tooMany = await call(alice, 'POST', '/api/sync/push', { space: 'gym', records: Array.from({ length: 501 }, (_, i) => entry(`m${i}`, 7000 + i)) });
  assert.equal(tooMany.status, 400);
});

test('pull pages through a large history without skipping or repeating', { skip }, async () => {
  const batch = (from, to) => Array.from({ length: to - from }, (_, i) => entry(`p${from + i}`, 8000 + from + i));
  assert.equal((await call(bob, 'POST', '/api/sync/push', { space: 'gym', records: batch(0, 250) })).applied, 250);
  assert.equal((await call(bob, 'POST', '/api/sync/push', { space: 'gym', records: batch(250, 500) })).applied, 250);
  let since = 0, got = [], pages = 0;
  for (;;) {
    const r = await call(bob, 'GET', `/api/sync/pull?space=gym&since=${since}&limit=120`); pages += 1;
    got = got.concat(r.records); since = r.seq; if (!r.more) break;
  }
  assert.ok(pages >= 4);
  const ids = got.map((r) => r.rid).filter((x) => x.startsWith('p'));
  assert.equal(new Set(ids).size, 500); assert.equal(ids.length, 500);
});

test('account export includes synced records and account deletion removes them', { skip }, async () => {
  const SyncRecord = require('../models/SyncRecord'); const SyncCounter = require('../models/SyncCounter');
  const exp = await call(bob, 'GET', '/api/account/export?format=json');
  assert.equal(exp.status, 200);
  const body = exp;
  assert.ok(Array.isArray(body.syncRecords) && body.syncRecords.length >= 500, 'the backup includes the synced Gym log');
  assert.ok(!('seq' in body.syncRecords[0]) && !('userId' in body.syncRecords[0]));
  const del = await call(bob, 'DELETE', '/api/account/me', { password: 'password123' });
  assert.ok([200, 204].includes(del.status), `delete status ${del.status}`);
  assert.equal(await SyncRecord.countDocuments({ rid: /^p\d+$/ }), 0, 'deleted with the account');
  assert.equal(await SyncCounter.countDocuments({ seq: { $gte: 500 } }), 0);
});

// ---------------------------------------------------------------- the shared client algorithm through the real routes
test('two devices through the real server: edits, deletions, a wiped device and an interrupted sync all converge', { skip }, async () => {
  const path = require('node:path'); const fs = require('node:fs'); const { pathToFileURL } = require('node:url');
  const file = path.join(__dirname, '..', '..', 'client', 'src', 'utils', 'recordSync.js');
  if (!fs.existsSync(file)) return;                                   // server-only checkout
  const RS = await import(pathToFileURL(file).href);
  const carol = (await call(null, 'POST', '/api/auth/signup', { name: 'C', email: 'c-sync@test.dev', password: 'password123' })).token;
  const device = () => {
    const d = { recs: new Map(), mem: { ...RS.EMPTY_MEMORY, known: {} }, failAt: 0, pushes: 0 };
    d.put = (rid, data) => d.recs.set(RS.keyOf('entry', rid), { kind: 'entry', rid, data, updatedAt: data.at });
    d.sync = (opts = {}) => RS.syncRound({
      current: () => Object.fromEntries(d.recs), memory: () => d.mem, save: (m) => { d.mem = m; },
      push: async (records) => { d.pushes += 1; if (d.failAt && d.pushes === d.failAt) throw new Error('offline'); const r = await call(carol, 'POST', '/api/sync/push', { space: 'gym', records }); assert.equal(r.status, 200); return r; },
      pull: async (since) => { const r = await call(carol, 'GET', `/api/sync/pull?space=gym&since=${since}&limit=200`); assert.equal(r.status, 200); return r; },
      apply: (ups, rems) => { for (const u of ups) d.recs.set(RS.keyOf(u.kind, u.rid), { ...u, updatedAt: 0 }); for (const x of rems) d.recs.delete(RS.keyOf(x.kind, x.rid)); },
    }, opts);
    d.ids = () => [...d.recs.values()].map((x) => x.rid).sort();
    return d;
  };
  const e = (id, at, note = '') => ({ id, date: '2026-11-01', exId: 'bench', sets: [{ kg: 40, reps: 10 }], at, note });
  const phone = device(), web = device();
  for (let i = 0; i < 30; i += 1) phone.put(`e${i}`, e(`e${i}`, 1000 + i));
  await phone.sync({ now: Date.now() - 60_000 }); await web.sync({ now: Date.now() - 59_000 });
  assert.equal(web.ids().length, 30, 'the browser got the phone\'s log');

  // both edit the same exercise: the later one wins everywhere
  phone.put('e0', e('e0', 1000, 'phone')); await phone.sync({ now: Date.now() - 50_000 });
  web.put('e0', e('e0', 1000, 'web later')); await web.sync({ now: Date.now() - 40_000 });
  await phone.sync({ now: Date.now() - 39_000 });
  assert.equal(phone.recs.get('entry:e0').data.note, 'web later'); assert.equal(web.recs.get('entry:e0').data.note, 'web later');

  // a deletion travels, and an old copy cannot bring it back
  phone.recs.delete('entry:e1'); await phone.sync({ now: Date.now() - 30_000 }); await web.sync({ now: Date.now() - 29_000 });
  assert.equal(web.recs.has('entry:e1'), false); assert.equal(web.ids().length, 29);

  // the phone loses its log (reinstall that kept the sync memory): the server copy survives and comes back
  phone.recs.clear();
  const r = await phone.sync({ now: Date.now() - 20_000 });
  assert.ok(r.heldBack >= 29 && r.added >= 29, `held back ${r.heldBack}, restored ${r.added}`);
  assert.equal(phone.ids().length, 29);
  const other = (await call(carol, 'GET', '/api/sync/pull?space=gym&since=0&limit=500')).records.filter((x) => !x.deleted);
  assert.equal(other.length, 29, 'nothing was deleted on the server');

  // an interrupted first sync of a big log finishes next time
  const big = device(); for (let i = 0; i < 700; i += 1) big.put(`b${i}`, e(`b${i}`, 5000 + i));
  big.failAt = 2; await assert.rejects(() => big.sync({ now: Date.now() - 10_000 }), /offline/);
  big.failAt = 0; const done = await big.sync({ now: Date.now() - 9_000 });
  assert.equal(done.pushed, 200, 'only what was left is sent');
  const fresh = device(); await fresh.sync({ now: Date.now() - 8_000 });
  assert.equal(fresh.ids().length, 29 + 700);
});
