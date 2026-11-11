// The cross-instance lock against a REAL MongoDB (the unique index is what makes it a lock, so a fake cannot prove it).
// Uses mongodb-memory-server by default, or TEST_MONGO_URI (a throw-away database). Skips with a clear message when neither is available.
const test = require('node:test');
const assert = require('node:assert/strict');
const dbHelper = require('./helpers/mongo');

const skip = dbHelper.skipReason();
let mongoose, CoachLock, withLease, makeMongoStore, store;

test.before(async () => {
  if (skip) return;
  mongoose = require('mongoose');
  await mongoose.connect(await dbHelper.start());
  CoachLock = require('../models/CoachLock');
  await CoachLock.init();                                   // build the unique and TTL indexes before the first lease
  ({ withLease, makeMongoStore } = require('../lib/dbLock'));
  store = makeMongoStore(CoachLock);
});
test.after(async () => { if (skip) return; await mongoose.connection.dropDatabase(); await mongoose.disconnect(); await dbHelper.stop(); });

test('many simultaneous "instances" never overlap for one person, and all finish', { skip }, async () => {
  const uid = new mongoose.Types.ObjectId().toString();
  let inside = 0, maxInside = 0, done = 0;
  await Promise.all(Array.from({ length: 8 }, () => withLease(store, uid, async () => {
    inside += 1; maxInside = Math.max(maxInside, inside);
    await new Promise((r) => setTimeout(r, 15));
    inside -= 1; done += 1;
  }, { pollMs: 5, waitMs: 20000 })));
  assert.equal(maxInside, 1);
  assert.equal(done, 8);
  assert.equal(await CoachLock.countDocuments({ userId: uid }), 0, 'every lease was released');
});

test('different people do not wait for each other', { skip }, async () => {
  const a = new mongoose.Types.ObjectId().toString(), b = new mongoose.Types.ObjectId().toString();
  let both = 0, inside = 0;
  await Promise.all([a, b].map((k) => withLease(store, k, async () => { inside += 1; both = Math.max(both, inside); await new Promise((r) => setTimeout(r, 30)); inside -= 1; })));
  assert.equal(both, 2);
});

test('an abandoned lease expires, a long job renews its own, and release only removes its own lease', { skip }, async () => {
  const uid = new mongoose.Types.ObjectId().toString();
  assert.equal(await store.tryAcquire(uid, 'crashed-instance', 150), true);
  assert.equal(await store.tryAcquire(uid, 'someone-else', 150), false, 'held: the unique index refuses a second lease');
  await new Promise((r) => setTimeout(r, 220));
  assert.equal(await store.tryAcquire(uid, 'someone-else', 150), true, 'expired: free to take');
  await store.renew(uid, 'someone-else', 5000);
  await store.release(uid, 'crashed-instance');                                   // not the holder: must change nothing
  assert.equal(await store.tryAcquire(uid, 'third', 150), false, 'the renewed lease still stands');
  await store.release(uid, 'someone-else');
  assert.equal(await store.tryAcquire(uid, 'third', 150), true);
  await store.release(uid, 'third');
});
