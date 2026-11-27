// Deleting a finished Workout-tab session must also remove what it left on the server, or the day's calorie burn stays inflated. Real MongoDB.
//   smart plan  : a body-plan session (clientId wp-<id>) AND a calorie entry (clientId bp-wp-<id>)
//   other plans : one calorie entry (clientId wp-<id>)
const test = require('node:test');
const assert = require('node:assert/strict');
const dbHelper = require('./helpers/mongo');
const skip = dbHelper.skipReason();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.AUTH_LIMITS_SCALE = '100';

let server, base, mongoose, alice, bob, aliceId;
async function call(token, method, path, body) {
  const res = await fetch(base + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text(); let json = {}; try { json = JSON.parse(text); } catch { json = { text }; }
  return { status: res.status, ...json };
}
const plus = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

test.before(async () => {
  if (skip) return;
  mongoose = require('mongoose'); await mongoose.connect(await dbHelper.start()); await mongoose.connection.dropDatabase();
  const { createApp } = require('../app');
  await new Promise((r) => { server = createApp({ allowedOrigins: [] }).listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
  const a = await call(null, 'POST', '/api/auth/signup', { name: 'A', email: 'a-sdel@test.dev', password: 'password123' });
  alice = a.token; aliceId = a.user?.id || a.user?._id;
  bob = (await call(null, 'POST', '/api/auth/signup', { name: 'B', email: 'b-sdel@test.dev', password: 'password123' })).token;
  const Activity = require('../models/Activity');
  await Activity.create({ name: 'Strength Training', category: 'Strength', met: 5 });
  await Activity.create({ name: 'Bodyweight circuit', category: 'General', met: 6 });
});
test.after(async () => { if (skip) return; await mongoose.connection.dropDatabase(); await mongoose.disconnect(); await new Promise((r) => server.close(r)); await dbHelper.stop(); });

const smartSession = (clientId, date, over = {}) => ({
  date, today: date, sessionId: 'A', title: 'Day 1: Push', way: 'gym', status: 'done', feel: 'good', minutes: 45, clientId,
  exercises: [{ id: 'bench', name: 'Bench press', slot: 'main', sets: [{ reps: 8, weightKg: 40 }, { reps: 8, weightKg: 40 }, { reps: 7, weightKg: 40 }] }], ...over,
});
const burn = async (date) => (await call(alice, 'GET', `/api/activities/summary?date=${date}`)).summary.workoutCalories;

test('smart plan: deleting by the app id removes the session AND its calorie entry, and the day total drops back', { skip }, async () => {
  const BodyPlanSession = require('../models/BodyPlanSession'); const ActivityLog = require('../models/ActivityLog');
  const day = plus(-1);
  assert.equal(await burn(day), 0, 'starts empty');
  const made = await call(alice, 'POST', '/api/body-plan/session', smartSession('wp-ws-s1', day));
  assert.equal(made.status, 201, JSON.stringify(made).slice(0, 200));
  assert.equal(await BodyPlanSession.countDocuments({ clientId: 'wp-ws-s1' }), 1);
  assert.equal(await ActivityLog.countDocuments({ clientId: 'bp-wp-ws-s1' }), 1, 'the session also counted in the day\'s exercise totals');
  const inflated = await burn(day);
  assert.ok(inflated > 100, `the entry burns something (${inflated})`);

  const del = await call(alice, 'DELETE', '/api/body-plan/session?clientId=wp-ws-s1');
  assert.equal(del.status, 200); assert.equal(del.deleted, 1);
  assert.ok(del.plan, 'the rebuilt plan comes back, like the by-id route');
  assert.equal(await BodyPlanSession.countDocuments({ clientId: 'wp-ws-s1' }), 0);
  assert.equal(await ActivityLog.countDocuments({ clientId: 'bp-wp-ws-s1' }), 0);
  assert.equal(await burn(day), 0, 'the burn total no longer counts the deleted session');
});

test('smart plan: safe to repeat; other people cannot delete yours; bad input is refused', { skip }, async () => {
  const BodyPlanSession = require('../models/BodyPlanSession');
  const day = plus(-2);
  await call(alice, 'POST', '/api/body-plan/session', smartSession('wp-ws-s2', day));
  const other = await call(bob, 'DELETE', '/api/body-plan/session?clientId=wp-ws-s2');
  assert.equal(other.status, 200); assert.equal(other.deleted, 0, 'not another person\'s session');
  assert.equal(await BodyPlanSession.countDocuments({ clientId: 'wp-ws-s2' }), 1, 'still there');
  assert.equal((await call(alice, 'DELETE', '/api/body-plan/session?clientId=wp-ws-s2')).deleted, 1);
  const again = await call(alice, 'DELETE', '/api/body-plan/session?clientId=wp-ws-s2');
  assert.equal(again.status, 200); assert.equal(again.deleted, 0, 'a retried delete is not an error');
  assert.equal((await call(alice, 'DELETE', '/api/body-plan/session')).status, 400, 'an id is required');
  assert.equal((await call(alice, 'DELETE', '/api/body-plan/session?clientId=bad%20id!')).status, 400, 'an invalid id is refused');
  assert.equal((await call(null, 'DELETE', '/api/body-plan/session?clientId=wp-ws-s2')).status, 401);
});

test('smart plan: a delete retried after the entry was already gone still clears what is left', { skip }, async () => {
  // Interrupted earlier delete: the session row is gone but its calorie entry remained (or the other way round). A repeat must finish the job.
  const BodyPlanSession = require('../models/BodyPlanSession'); const ActivityLog = require('../models/ActivityLog');
  const day = plus(-3);
  await call(alice, 'POST', '/api/body-plan/session', smartSession('wp-ws-s3', day));
  await BodyPlanSession.deleteOne({ clientId: 'wp-ws-s3' });
  assert.equal(await ActivityLog.countDocuments({ clientId: 'bp-wp-ws-s3' }), 1);
  const r = await call(alice, 'DELETE', '/api/body-plan/session?clientId=wp-ws-s3');
  assert.equal(r.status, 200);
  assert.equal(await ActivityLog.countDocuments({ clientId: 'bp-wp-ws-s3' }), 0, 'the leftover calorie entry is removed');
});

test('smart plan: deleting a session tells the coach its history changed', { skip }, async () => {
  const CoachState = require('../models/CoachState');
  const uid = new mongoose.Types.ObjectId((await require('../models/User').findOne({ email: 'a-sdel@test.dev' }))._id);
  await CoachState.updateOne({ userId: uid }, { $set: { weekly: { dirty: false, level: 0 } } }, { upsert: true });
  await call(alice, 'POST', '/api/body-plan/session', smartSession('wp-ws-s4', plus(-4)));
  await CoachState.updateOne({ userId: uid }, { $set: { 'weekly.dirty': false } });
  await call(alice, 'DELETE', '/api/body-plan/session?clientId=wp-ws-s4');
  assert.equal((await CoachState.findOne({ userId: uid }).lean()).weekly.dirty, true, 'the coach re-reads its signals');
  // deleting something that never existed does not flag anything
  await CoachState.updateOne({ userId: uid }, { $set: { 'weekly.dirty': false } });
  await call(alice, 'DELETE', '/api/body-plan/session?clientId=wp-never-was');
  assert.equal((await CoachState.findOne({ userId: uid }).lean()).weekly.dirty, false);
});

test('classic and custom plans: the calorie entry (wp-<id>) goes and the day total drops back', { skip }, async () => {
  const ActivityLog = require('../models/ActivityLog'); const Activity = require('../models/Activity');
  const circuit = await Activity.findOne({ name: 'Bodyweight circuit' });
  const day = plus(-5);
  const r = await call(alice, 'POST', '/api/activities/logs', { activityId: circuit._id, date: day, durationMinutes: 40, weightKg: 80, caloriesBurned: 300, clientId: 'wp-ws-c1', notes: 'Day 2 (Workout Plans)' });
  assert.equal(r.status, 201);
  assert.equal(await burn(day), 300);
  assert.equal((await call(alice, 'DELETE', '/api/activities/logs?clientId=wp-ws-c1')).deleted, 1);
  assert.equal(await ActivityLog.countDocuments({ clientId: 'wp-ws-c1' }), 0);
  assert.equal(await burn(day), 0);
});

test('deleting one session leaves another session on the same day alone', { skip }, async () => {
  const BodyPlanSession = require('../models/BodyPlanSession'); const ActivityLog = require('../models/ActivityLog');
  const day = plus(-6);
  await call(alice, 'POST', '/api/body-plan/session', smartSession('wp-ws-two-a', day, { title: 'Morning' }));
  await call(alice, 'POST', '/api/body-plan/session', smartSession('wp-ws-two-b', day, { title: 'Evening' }));
  assert.equal(await BodyPlanSession.countDocuments({ date: day }), 2);
  await call(alice, 'DELETE', '/api/body-plan/session?clientId=wp-ws-two-a');
  assert.equal(await BodyPlanSession.countDocuments({ date: day }), 1);
  assert.equal(await BodyPlanSession.countDocuments({ clientId: 'wp-ws-two-b' }), 1);
  assert.equal(await ActivityLog.countDocuments({ clientId: 'bp-wp-ws-two-b' }), 1, 'the other session\'s calories stay');
});
