// The database lease: two server instances can never run the same person's coach work at the same time.
const test = require('node:test');
const assert = require('node:assert/strict');
const { withLease, makeMongoStore, LockBusyError } = require('../lib/dbLock');

// A shared "database" with the same rule as the unique index: one live lease per key.
function sharedStore(clock = { t: 1000 }) {
  const rows = new Map();
  return {
    clock, rows,
    async tryAcquire(key, owner, ttl) { await new Promise((r) => setImmediate(r)); const cur = rows.get(key); if (cur && cur.until > clock.t && cur.owner !== owner) return false; rows.set(key, { owner, until: clock.t + ttl }); return true; },
    async release(key, owner) { const cur = rows.get(key); if (cur && cur.owner === owner) rows.delete(key); },
  };
}

test('two instances sharing one store never overlap, and both finish', async () => {
  const store = sharedStore();
  let inside = 0, maxInside = 0; const order = [];
  const work = (name) => withLease(store, 'u1', async () => { inside += 1; maxInside = Math.max(maxInside, inside); order.push(`${name}+`); await new Promise((r) => setTimeout(r, 5)); order.push(`${name}-`); inside -= 1; return name; }, { pollMs: 1, waitMs: 5000 });
  const out = await Promise.all([work('A'), work('B'), work('C')]);
  assert.deepEqual(out.sort(), ['A', 'B', 'C']);
  assert.equal(maxInside, 1);
  for (let k = 0; k < order.length; k += 2) assert.equal(order[k][0], order[k + 1][0], `work items never interleave: ${order.join(' ')}`);
});

test('different people never wait for each other', async () => {
  const store = sharedStore();
  let both = 0, inside = 0;
  await Promise.all(['u1', 'u2'].map((k) => withLease(store, k, async () => { inside += 1; both = Math.max(both, inside); await new Promise((r) => setTimeout(r, 5)); inside -= 1; })));
  assert.equal(both, 2);
});

test('the lease is released when the work throws, so the next request is not blocked', async () => {
  const store = sharedStore();
  await assert.rejects(() => withLease(store, 'u1', async () => { throw new Error('boom'); }), /boom/);
  assert.equal(store.rows.size, 0);
  assert.equal(await withLease(store, 'u1', async () => 'ok'), 'ok');
});

test('a lease left behind by a crashed instance expires by itself', async () => {
  const clock = { t: 1000 }; const store = sharedStore(clock);
  await store.tryAcquire('u1', 'dead-instance', 30000);                   // never released
  let slept = 0;
  const r = await withLease(store, 'u1', async () => 'got it', { ttlMs: 30000, waitMs: 60000, pollMs: 1000, now: () => clock.t, sleep: async (ms) => { slept += ms; clock.t += 20000; } });
  assert.equal(r, 'got it');
  assert.ok(slept > 0);
});

test('when the lease stays taken too long the caller gets a clear 503, not a hang', async () => {
  const clock = { t: 1000 }; const store = sharedStore(clock);
  await store.tryAcquire('u1', 'busy-instance', 10 * 60 * 1000);
  await assert.rejects(() => withLease(store, 'u1', async () => 'never', { waitMs: 100, pollMs: 10, now: () => clock.t, sleep: async (ms) => { clock.t += ms; } }), (e) => e instanceof LockBusyError && e.status === 503);
});

test('the Mongo store treats a duplicate-key error as "busy" and re-throws anything else', async () => {
  const dup = makeMongoStore({ findOneAndUpdate: async () => { const e = new Error('E11000'); e.code = 11000; throw e; }, deleteOne: async () => {} });
  assert.equal(await dup.tryAcquire('u1', 'me', 1000), false);
  const bad = makeMongoStore({ findOneAndUpdate: async () => { throw new Error('network down'); }, deleteOne: async () => {} });
  await assert.rejects(() => bad.tryAcquire('u1', 'me', 1000), /network down/);
  const calls = [];
  const ok = makeMongoStore({ findOneAndUpdate: async (f, u, o) => { calls.push({ f, u, o }); return {}; }, deleteOne: async (f) => calls.push({ del: f }) });
  assert.equal(await ok.tryAcquire('u1', 'me', 1000), true);
  assert.equal(calls[0].o.upsert, true);                                  // free-or-expired is claimed in ONE atomic upsert
  await ok.release('u1', 'me');
  assert.deepEqual(calls[1].del, { userId: 'u1', owner: 'me' });         // only our own lease is ever removed
});

test('a slow request keeps its lease while it works, so another instance cannot step in halfway', async () => {
  const store = sharedStore(); let renewed = 0;
  const real = store.tryAcquire.bind(store);
  store.renew = async (key, owner, ttl) => { renewed += 1; const cur = store.rows.get(key); if (cur && cur.owner === owner) cur.until = store.clock.t + ttl; };
  store.tryAcquire = real;
  await withLease(store, 'u1', async () => { await new Promise((r) => setTimeout(r, 1300)); }, { ttlMs: 3000, waitMs: 1000 });
  assert.ok(renewed >= 1, 'the lease was extended while the work ran');
  assert.equal(store.rows.size, 0);
});
test('the Mongo store renews only its own lease', async () => {
  const calls = []; const st = makeMongoStore({ updateOne: async (f, u) => calls.push({ f, u }), findOneAndUpdate: async () => ({}), deleteOne: async () => {} });
  await st.renew('u1', 'me', 30000);
  assert.deepEqual(calls[0].f, { userId: 'u1', owner: 'me' });
  assert.ok(calls[0].u.$set.until instanceof Date);
});
