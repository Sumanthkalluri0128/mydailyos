// Fixing and removing finished workouts. Real MongoDB.
const test = require('node:test');
const assert = require('node:assert/strict');
const dbHelper = require('./helpers/mongo');
const skip = dbHelper.skipReason();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.AUTH_LIMITS_SCALE = '100';

let server, base, mongoose, alice, bob;
async function call(token, method, path, body) {
  const res = await fetch(base + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text(); let json = {}; try { json = JSON.parse(text); } catch { json = { text }; }
  return { status: res.status, ...json };
}
const plus = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const hc = (id, date, hour, mins) => ({ id, type: 70, date, app: 'com.sec.android.app.shealth', startTime: `${date}T${String(hour).padStart(2, '0')}:00:00.000Z`, endTime: new Date(Date.parse(`${date}T${String(hour).padStart(2, '0')}:00:00.000Z`) + mins * 60000).toISOString() });
test.before(async () => {
  if (skip) return;
  mongoose = require('mongoose'); await mongoose.connect(await dbHelper.start()); await mongoose.connection.dropDatabase();
  const { createApp } = require('../app');
  await new Promise((r) => { server = createApp({ allowedOrigins: [] }).listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
  alice = (await call(null, 'POST', '/api/auth/signup', { name: 'A', email: 'a-edit@test.dev', password: 'password123' })).token;
  bob = (await call(null, 'POST', '/api/auth/signup', { name: 'B', email: 'b-edit@test.dev', password: 'password123' })).token;
  const Activity = require('../models/Activity');
  await Activity.create({ name: 'Strength Training', category: 'Strength', met: 5 });
  await Activity.create({ name: 'Other workout', category: 'General', met: 4 });
});
test.after(async () => { if (skip) return; await mongoose.connection.dropDatabase(); await mongoose.disconnect(); await new Promise((r) => server.close(r)); await dbHelper.stop(); });

const mk = async (over = {}) => {
  const strength = await require('../models/Activity').findOne({ name: 'Strength Training' });
  const r = await call(alice, 'POST', '/api/activities/logs', { activityId: strength._id, date: plus(-1), durationMinutes: 60, weightKg: 80, ...over });
  assert.equal(r.status, 201); return r.log;
};

test('fix the duration: calories follow it; or type your own calories', { skip }, async () => {
  const l = await mk({ clientId: 'ed-1' });
  assert.equal(Math.round(l.caloriesBurned), 336);
  const p = await call(alice, 'PATCH', `/api/activities/logs/${l._id}`, { durationMinutes: 30 });
  assert.equal(p.status, 200); assert.equal(p.log.durationMinutes, 30); assert.equal(Math.round(p.log.caloriesBurned), 168, 'net: 4 x 3.5 x 80 / 200 x 30');
  const own = await call(alice, 'PATCH', `/api/activities/logs/${l._id}`, { durationMinutes: 45, caloriesBurned: 250 });
  assert.equal(own.log.caloriesBurned, 250, 'a number the person typed is kept');
  assert.equal((await call(alice, 'PATCH', `/api/activities/logs/${l._id}`, { caloriesBurned: 0 })).log.caloriesBurned, 0);
  for (const bad of [{ durationMinutes: 0 }, { durationMinutes: 2000 }, { durationMinutes: 'abc' }, { caloriesBurned: -1 }, { caloriesBurned: 99999 }]) assert.equal((await call(alice, 'PATCH', `/api/activities/logs/${l._id}`, bad)).status, 400, JSON.stringify(bad));
});

test('move to another day and edit the note', { skip }, async () => {
  const l = await mk({ clientId: 'ed-2' });
  const m = await call(alice, 'PATCH', `/api/activities/logs/${l._id}`, { date: plus(-3), notes: 'logged on the wrong day' });
  assert.equal(m.log.date, plus(-3)); assert.equal(m.log.notes, 'logged on the wrong day');
  assert.equal((await call(alice, 'PATCH', `/api/activities/logs/${l._id}`, { date: plus(10) })).status, 400, 'not a day that has not happened');
  assert.equal((await call(alice, 'PATCH', `/api/activities/logs/${l._id}`, { date: 'monday' })).status, 400);
  assert.equal((await call(alice, 'PATCH', `/api/activities/logs/${l._id}`, { notes: 'x'.repeat(301) })).status, 400);
  const sum = await call(alice, 'GET', `/api/activities/summary?date=${plus(-3)}`);
  assert.ok(sum.summary.workoutCalories >= 300, 'the day totals follow the entry');
});

test('entries from the Gym log are edited there; other people cannot touch yours', { skip }, async () => {
  const strength = await require('../models/Activity').findOne({ name: 'Strength Training' });
  const g = await call(alice, 'POST', '/api/activities/gym-sync', { entries: [{ id: 'ed1', date: plus(-1), name: 'Bench Press', cat: 'Chest', unit: 'reps', minutes: 20, kcal: 100, bodyKg: 80, sets: [{ kg: 40, reps: 10 }] }] });
  assert.equal(g.status, 200, JSON.stringify(g).slice(0, 160));
  const row = await require('../models/ActivityLog').findOne({ clientId: 'gym-ed1' });
  const r = await call(alice, 'PATCH', `/api/activities/logs/${row._id}`, { durationMinutes: 99 });
  assert.equal(r.status, 400); assert.match(r.message, /Gym log/);
  const l = await mk({ clientId: 'ed-3' });
  assert.equal((await call(bob, 'PATCH', `/api/activities/logs/${l._id}`, { durationMinutes: 5 })).status, 404);
  assert.equal((await call(null, 'PATCH', `/api/activities/logs/${l._id}`, { durationMinutes: 5 })).status, 401);
  assert.equal((await call(alice, 'PATCH', '/api/activities/logs/000000000000000000000000', { durationMinutes: 5 })).status, 404);
  void strength;
});

test('delete by the id the app gave the workout: the Workout tab removes a session and its entry together', { skip }, async () => {
  const ActivityLog = require('../models/ActivityLog');
  await mk({ clientId: 'wp-session-9' });
  assert.equal((await call(bob, 'DELETE', '/api/activities/logs?clientId=wp-session-9')).deleted, 0, 'not another person\'s');
  assert.equal(await ActivityLog.countDocuments({ clientId: 'wp-session-9' }), 1);
  const d = await call(alice, 'DELETE', '/api/activities/logs?clientId=wp-session-9');
  assert.equal(d.status, 200); assert.equal(d.deleted, 1);
  assert.equal(await ActivityLog.countDocuments({ clientId: 'wp-session-9' }), 0);
  assert.equal((await call(alice, 'DELETE', '/api/activities/logs?clientId=wp-session-9')).deleted, 0, 'again: nothing, no error');
  assert.equal((await call(alice, 'DELETE', '/api/activities/logs')).status, 400);
  await mk({ clientId: 'bp-wp-smart-3' });                                       // a smart-plan session is stored with a bp- prefix
  assert.equal((await call(alice, 'DELETE', '/api/activities/logs?clientId=wp-smart-3')).deleted, 1);
});

test('editing can make your entry cover a watch session (and the watch copy goes), whichever way round', { skip }, async () => {
  const ActivityLog = require('../models/ActivityLog');
  const day = plus(-5);
  await call(alice, 'POST', '/api/activities/import', { body: undefined, ...{} }).catch(() => {});
  const imp = await fetch(base + '/api/activities/import', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${alice}` }, body: JSON.stringify({ sessions: [hc('ed-hc', day, 18, 60)] }) });
  assert.equal(imp.status, 201);
  const l = await mk({ date: day, durationMinutes: 10, clientId: 'ed-cover' });           // 10 of 60 minutes: a separate session
  assert.equal(await ActivityLog.countDocuments({ date: day, source: 'healthconnect' }), 1);
  await call(alice, 'PATCH', `/api/activities/logs/${l._id}`, { durationMinutes: 30 });   // now 30 of 60
  assert.equal(await ActivityLog.countDocuments({ date: day, source: 'healthconnect' }), 0, 'the watch copy is removed once your entry covers it');
});

test('calories typed in an edit are marked as entered by you; calories that follow the minutes are estimated; a note-only edit leaves them alone', { skip }, async () => {
  const l = await mk({ clientId: 'ed-src', caloriesBurned: 410 });
  assert.equal(l.caloriesSource, 'manual', 'typed when logged');
  assert.equal(Math.round(l.caloriesBurned), 410);
  const note = await call(alice, 'PATCH', `/api/activities/logs/${l._id}`, { notes: 'felt good' });
  assert.equal(Math.round(note.log.caloriesBurned), 410, 'editing only the note keeps the number you typed'); assert.equal(note.log.caloriesSource, 'manual');
  const day = await call(alice, 'PATCH', `/api/activities/logs/${l._id}`, { date: plus(-2) });
  assert.equal(Math.round(day.log.caloriesBurned), 410, 'moving to another day keeps it too'); assert.equal(day.log.caloriesSource, 'manual');
  const mins = await call(alice, 'PATCH', `/api/activities/logs/${l._id}`, { durationMinutes: 30 });
  assert.equal(Math.round(mins.log.caloriesBurned), 168, 'new minutes: the calories follow them'); assert.equal(mins.log.caloriesSource, 'estimated', 'so it is no longer "entered by you"');
  const own = await call(alice, 'PATCH', `/api/activities/logs/${l._id}`, { caloriesBurned: 222 });
  assert.equal(own.log.caloriesBurned, 222); assert.equal(own.log.caloriesSource, 'manual');
  const both = await call(alice, 'PATCH', `/api/activities/logs/${l._id}`, { durationMinutes: 20, caloriesBurned: 100 });
  assert.equal(both.log.caloriesBurned, 100); assert.equal(both.log.caloriesSource, 'manual', 'minutes and calories together: your number wins');
});
