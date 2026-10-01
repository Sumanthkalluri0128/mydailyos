const test = require('node:test');
const assert = require('node:assert/strict');
const { rateLimit } = require('../middleware/rateLimit');
const v = require('../lib/validate');
const { createOnce } = require('../lib/idempotent');

function run(mw, req) {
  const headers = {};
  let status = 200; let body; let nextCalled = false;
  const res = {
    setHeader: (k, val) => { headers[k.toLowerCase()] = val; },
    status(c) { status = c; return this; },
    json(b) { body = b; return this; },
  };
  mw(req, res, () => { nextCalled = true; });
  return { status, body, headers, nextCalled };
}

test('rate limit: allows up to max, then 429 with Retry-After, then recovers after the window', () => {
  let t = 1_000_000;
  const mw = rateLimit({ windowMs: 1000, max: 3, now: () => t });
  const req = { ip: '1.2.3.4' };
  for (let i = 0; i < 3; i++) assert.equal(run(mw, req).nextCalled, true);
  const blocked = run(mw, req);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.nextCalled, false);
  assert.ok(Number(blocked.headers['retry-after']) >= 1);
  assert.equal(blocked.headers['ratelimit-remaining'], '0');
  t += 1001;
  assert.equal(run(mw, req).nextCalled, true, 'window rolled over');
  mw.reset();
});

test('rate limit: keys are independent (per IP / per custom key)', () => {
  const mw = rateLimit({ windowMs: 60_000, max: 1, keyFn: (r) => r.k });
  assert.equal(run(mw, { k: 'a' }).nextCalled, true);
  assert.equal(run(mw, { k: 'b' }).nextCalled, true);
  assert.equal(run(mw, { k: 'a' }).status, 429);
  mw.reset();
});

test('validate: nullable numbers, booleans, clientId, regex escaping', () => {
  assert.equal(v.nullableNumber(null, 'x'), null);
  assert.equal(v.nullableNumber('', 'x'), null);
  assert.equal(v.nullableNumber('42', 'x', { min: 1, max: 100 }), 42);
  assert.throws(() => v.nullableNumber('500', 'x', { max: 100 }), /between/);
  assert.equal(v.bool(true, 'b'), true);
  assert.throws(() => v.bool('true', 'b'));
  assert.equal(v.clientId(undefined), undefined);
  assert.equal(v.clientId('c-abc.1:2'), 'c-abc.1:2');
  assert.throws(() => v.clientId('bad id with spaces'));
  assert.equal(new RegExp(v.escapeRegex('a.b(c)*')).test('a.b(c)*'), true);
  assert.equal(new RegExp(v.escapeRegex('a.b')).test('axb'), false);
});

test('createOnce: replays return the existing record; a lost race on the unique index is recovered', async () => {
  const store = [];
  const Model = {
    findOne: async (q) => store.find((d) => d.userId === q.userId && d.clientId === q.clientId) || null,
    create: async (doc) => { const d = { _id: store.length + 1, ...doc }; store.push(d); return d; },
  };
  const a = await createOnce(Model, 'u1', 'c1', { amount: 250 });
  const b = await createOnce(Model, 'u1', 'c1', { amount: 250 });
  assert.equal(a.duplicate, false);
  assert.equal(b.duplicate, true);
  assert.equal(b.doc._id, a.doc._id);
  assert.equal(store.length, 1);
  await createOnce(Model, 'u2', 'c1', { amount: 100 }); // same clientId, different user: separate record
  assert.equal(store.length, 2);
  await createOnce(Model, 'u1', undefined, { amount: 1 });
  await createOnce(Model, 'u1', undefined, { amount: 1 });
  assert.equal(store.length, 4, 'no clientId = no dedupe');

  // Simulate two requests racing: findOne misses, create hits the unique index, then findOne finds the winner.
  let calls = 0;
  const Racy = {
    findOne: async () => (calls++ === 0 ? null : { _id: 'winner' }),
    create: async () => { const e = new Error('dup'); e.code = 11000; throw e; },
  };
  const r = await createOnce(Racy, 'u1', 'c9', {});
  assert.equal(r.duplicate, true);
  assert.equal(r.doc._id, 'winner');
});
