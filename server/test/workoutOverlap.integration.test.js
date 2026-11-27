// Health Connect import vs. what the person logged themselves: the same workout is counted once. Real MongoDB, same harness as the other integration tests.
const test = require('node:test');
const assert = require('node:assert/strict');
const dbHelper = require('./helpers/mongo');
const skip = dbHelper.skipReason();

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.AUTH_LIMITS_SCALE = '100';

let server, base, mongoose, token;
const plus = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
async function call(method, path, { body } = {}) {
  const res = await fetch(base + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text(); let json = {}; try { json = JSON.parse(text); } catch { json = { text }; }
  return { status: res.status, ...json };
}
// A Health Connect session on `date` starting at `hour` for `mins` minutes. type 70 = strength training, 79 = walking.
const hc = (id, type, date, hour, mins) => ({ id, type, date, app: 'com.sec.android.app.shealth', startTime: `${date}T${String(hour).padStart(2, '0')}:00:00.000Z`, endTime: new Date(Date.parse(`${date}T${String(hour).padStart(2, '0')}:00:00.000Z`) + mins * 60000).toISOString() });

test.before(async () => {
  if (skip) return;
  mongoose = require('mongoose');
  await mongoose.connect(await dbHelper.start()); await mongoose.connection.dropDatabase();
  const { createApp } = require('../app');
  await new Promise((r) => { server = createApp({ allowedOrigins: [] }).listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
  token = (await call('POST', '/api/auth/signup', { body: { name: 'Ov', email: 'ov@test.dev', password: 'password123' } })).token;
});
test.after(async () => { if (skip) return; await mongoose.connection.dropDatabase(); await mongoose.disconnect(); await new Promise((r) => server.close(r)); await dbHelper.stop(); });

test('a watch session you already logged is skipped, a different kind of workout is kept, and the skip is not permanent', { skip }, async () => {
  const Activity = require('../models/Activity'); const ActivityLog = require('../models/ActivityLog');
  const strength = await Activity.create({ name: 'Strength Training', category: 'Strength', met: 5 });
  await Activity.create({ name: 'Walking - Moderate', category: 'Walking', met: 3.5 });
  await Activity.create({ name: 'Other workout', category: 'General', met: 4 });
  const day = plus(-3);

  // the person logs 30 minutes of strength themselves
  const mine = await call('POST', '/api/activities/logs', { body: { activityId: strength._id, date: day, durationMinutes: 30, weightKg: 80, clientId: 'mine-1' } });
  assert.equal(mine.status, 201);
  assert.equal(Math.round(mine.log.caloriesBurned), 168, 'net: (5 - 1) x 3.5 x 80 / 200 x 30');

  // the watch recorded two strength sessions (60 and 45 minutes) and a 40-minute walk. The phone sends the whole week every time.
  const week = () => [hc('s1', 70, day, 18, 60), hc('s2', 70, day, 7, 45), hc('w1', 79, day, 8, 40)];
  const r1 = await call('POST', '/api/activities/import', { body: { sessions: week() } });
  assert.equal(r1.status, 201);
  // your 30 minutes cover the LONGEST strength session (s1); the other strength session and the walk are different workouts and are kept
  assert.deepEqual(r1.skipped.map((s) => [s.clientId, s.reason]), [['hc:s1', 'logged-by-you']]);
  assert.equal(r1.imported, 2);
  assert.deepEqual(r1.logs.map((l) => l.activityName).sort(), ['Strength Training', 'Walking - Moderate']);
  assert.equal(await ActivityLog.countDocuments({ date: day }), 3);

  // every later sync of the same week gives the same answer and adds nothing
  for (let i = 0; i < 2; i += 1) {
    const again = await call('POST', '/api/activities/import', { body: { sessions: week() } });
    assert.equal(again.imported, 0);
    assert.equal(await ActivityLog.countDocuments({ date: day }), 3);
  }

  // not permanent: delete your entry and the watch session comes in
  assert.equal((await call('DELETE', `/api/activities/logs/${mine.log._id}`)).status, 200);
  const r4 = await call('POST', '/api/activities/import', { body: { sessions: week() } });
  assert.equal(r4.imported, 1);
  assert.equal(r4.logs[0].activityName, 'Strength Training');
  assert.equal(r4.logs[0].durationMinutes, 60);
  assert.equal(Math.round(r4.logs[0].caloriesBurned), 294, 'net, 70 kg default: (5 - 1) x 3.5 x 70 / 200 x 60');
});

test('the same workout is counted once whichever arrives first: watch then your own log, or your own log then watch', { skip }, async () => {
  const Activity = require('../models/Activity'); const ActivityLog = require('../models/ActivityLog');
  const strength = await Activity.findOne({ name: 'Strength Training' });
  const walkAct = await Activity.findOne({ name: 'Walking - Moderate' });
  const state = async (d) => (await ActivityLog.find({ date: d, userId: (await ActivityLog.findOne({ date: d }))?.userId }).lean()).map((l) => `${l.source || 'manual'}:${l.activityName}:${l.durationMinutes}`).sort();

  // order A: the watch session first, your own entry after
  const dayA = plus(-6);
  const a1 = await call('POST', '/api/activities/import', { body: { sessions: [hc('oa1', 70, dayA, 18, 60), hc('oa2', 79, dayA, 8, 40)] } });
  assert.equal(a1.imported, 2);
  const mineA = await call('POST', '/api/activities/logs', { body: { activityId: strength._id, date: dayA, durationMinutes: 30, weightKg: 80, clientId: 'ord-a' } });
  assert.equal(mineA.status, 201);
  const finalA = await state(dayA);

  // order B: your own entry first, the watch session after
  const dayB = plus(-7);
  await call('POST', '/api/activities/logs', { body: { activityId: strength._id, date: dayB, durationMinutes: 30, weightKg: 80, clientId: 'ord-b' } });
  await call('POST', '/api/activities/import', { body: { sessions: [hc('ob1', 70, dayB, 18, 60), hc('ob2', 79, dayB, 8, 40)] } });
  const finalB = await state(dayB);

  assert.deepEqual(finalA, finalB, 'the same final result in both orders');
  assert.equal(finalA.length, 2);
  assert.ok(finalA.some((x) => x.startsWith('manual:Strength Training:30')), 'your entry stays');
  assert.ok(finalA.some((x) => x.startsWith('healthconnect:Walking - Moderate:40')), 'a different kind of workout from the watch stays');
  assert.ok(!finalA.some((x) => x.startsWith('healthconnect:Strength')), 'the watch copy of the lifting session is gone');

  // not permanent: delete your entry, the next sync of the week brings the watch session back
  const del = await call('DELETE', `/api/activities/logs/${mineA.log._id}`);
  assert.equal(del.status, 200);
  const back = await call('POST', '/api/activities/import', { body: { sessions: [hc('oa1', 70, dayA, 18, 60), hc('oa2', 79, dayA, 8, 40)] } });
  assert.equal(back.imported, 1);
  assert.ok((await state(dayA)).some((x) => x.startsWith('healthconnect:Strength Training:60')));

  // a part-logged Gym log session (several rows) covers it as it grows past 40 %
  const dayC = plus(-8);
  await call('POST', '/api/activities/import', { body: { sessions: [hc('oc1', 70, dayC, 18, 60)] } });
  const row = (i, cid) => call('POST', '/api/activities/logs', { body: { activityId: strength._id, date: dayC, durationMinutes: 6, weightKg: 80, clientId: cid } });
  for (let i = 0; i < 3; i += 1) await row(i, `gl-${i}`);
  assert.ok((await state(dayC)).some((x) => x.startsWith('healthconnect:Strength')), '18 of 60 minutes: still a separate session');
  for (let i = 3; i < 5; i += 1) await row(i, `gl-${i}`);
  assert.ok(!(await state(dayC)).some((x) => x.startsWith('healthconnect:Strength')), '30 of 60 minutes: the watch copy goes');
  void walkAct;
});

test('a duplicate that already exists (from before this rule) is cleaned up by the next watch sync', { skip }, async () => {
  const Activity = require('../models/Activity'); const ActivityLog = require('../models/ActivityLog'); const User = require('../models/User');
  const strength = await Activity.findOne({ name: 'Strength Training' });
  const uid = (await User.findOne({ email: 'ov@test.dev' }))._id;
  const day = plus(-9);
  const r1 = await call('POST', '/api/activities/import', { body: { sessions: [hc('legacy1', 70, day, 18, 60)] } });
  assert.equal(r1.imported, 1);
  // the person's own entry was saved straight into the database (as old data would be): nothing reconciled it
  await ActivityLog.create({ userId: uid, activityId: strength._id, date: day, activityName: 'Strength Training', category: 'Strength', durationMinutes: 30, weightKg: 80, met: 5, caloriesBurned: 168, clientId: 'legacy-manual' });
  assert.equal(await ActivityLog.countDocuments({ userId: uid, date: day }), 2, 'both are counted: the old double count');
  await call('POST', '/api/activities/import', { body: { sessions: [hc('legacy1', 70, day, 18, 60)] } });   // the phone's next sync of the week
  const left = await ActivityLog.find({ userId: uid, date: day }).lean();
  assert.deepEqual(left.map((l) => l.source || 'manual'), ['manual'], 'the watch copy is removed, your entry stays');
  await call('POST', '/api/activities/import', { body: { sessions: [hc('legacy1', 70, day, 18, 60)] } });   // and it does not come back
  assert.equal(await ActivityLog.countDocuments({ userId: uid, date: day }), 1);
});
