// Workout planner routes against a real MongoDB (same harness as the other integration tests).
const test = require('node:test');
const assert = require('node:assert/strict');
const dbHelper = require('./helpers/mongo');
const P = require('../lib/workoutPlanner');
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
const TODAY = plus(0);
const addD = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const get = (token, from, to) => call(token, 'GET', `/api/workout-plan?from=${from}&to=${to}`);

test.before(async () => {
  if (skip) return;
  mongoose = require('mongoose');
  await mongoose.connect(await dbHelper.start()); await mongoose.connection.dropDatabase();
  const { createApp } = require('../app');
  await new Promise((r) => { server = createApp({ allowedOrigins: [] }).listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
  alice = (await call(null, 'POST', '/api/auth/signup', { name: 'A', email: 'a-plan@test.dev', password: 'password123' })).token;
  bob = (await call(null, 'POST', '/api/auth/signup', { name: 'B', email: 'b-plan@test.dev', password: 'password123' })).token;
});
test.after(async () => { if (skip) return; await mongoose.connection.dropDatabase(); await mongoose.disconnect(); await new Promise((r) => server.close(r)); await dbHelper.stop(); });

test('add a workout: idempotent, validated, never into the past', { skip }, async () => {
  const body = { date: plus(3), today: TODAY, kind: 'strength', title: 'Upper body', minutes: 45, exercises: [{ name: 'Bench press', sets: 3, reps: 8, kg: 60 }], clientId: 'plan-1' };
  const a = await call(alice, 'POST', '/api/workout-plan', body);
  assert.equal(a.status, 201); assert.equal(a.item.title, 'Upper body'); assert.equal(a.item.exercises.length, 1); assert.equal(a.item.status, 'planned'); assert.equal(a.item.done, false);
  const again = await call(alice, 'POST', '/api/workout-plan', body);                // a retry / a double tap with the same id
  assert.equal(again.status, 200); assert.equal(again.item._id, a.item._id);
  assert.equal((await call(alice, 'POST', '/api/workout-plan', { ...body, date: plus(-1), clientId: 'plan-2' })).status, 400, 'yesterday cannot be planned');
  assert.equal((await call(alice, 'POST', '/api/workout-plan', { ...body, kind: 'yoga', clientId: 'plan-3' })).status, 400);
  assert.equal((await call(alice, 'POST', '/api/workout-plan', { ...body, date: 'tomorrow', clientId: 'plan-4' })).status, 400);
  assert.equal((await call(alice, 'POST', '/api/workout-plan', { today: TODAY, kind: 'rest', date: plus(4), clientId: 'plan-5' })).item.title, 'Rest day', 'a title is filled in');
  const list = await get(alice, plus(0), plus(10));
  assert.equal(list.items.length, 2);
  assert.equal((await get(alice, plus(0), plus(200))).status, 400, 'at most 93 days at a time');
});

test('plan a month: repeat a week for 4 weeks, again for nothing, and delete what is ahead of one series', { skip }, async () => {
  const start = P.mondayOf(plus(37));                      // a Monday, so all four weeks are whole
  const pattern = [{ dow: 1, kind: 'strength', title: 'Push', minutes: 50 }, { dow: 3, kind: 'strength', title: 'Pull', minutes: 50 }, { dow: 5, kind: 'cardio', title: 'Run', minutes: 30 }, { dow: 7, kind: 'rest' }];
  const r = await call(alice, 'POST', '/api/workout-plan/repeat', { from: start, today: TODAY, weeks: 4, pattern, clientId: 'month-1' });
  assert.equal(r.status, 201); assert.equal(r.created, 16);
  const again = await call(alice, 'POST', '/api/workout-plan/repeat', { from: start, today: TODAY, weeks: 4, pattern, clientId: 'month-1' });
  assert.equal(again.created, 0, 'the same request twice adds nothing');
  const month = await get(alice, start, addD(start, 40));
  assert.equal(month.items.length, 16);
  assert.ok(month.items.every((i) => i.seriesId === 'month-1'));
  assert.equal(Object.keys(month.days).length, 16, 'sixteen different days');
  // starting mid-week never plans the days before the start
  const mid = addD(start, 2);
  assert.equal((await call(alice, 'POST', '/api/workout-plan/repeat', { from: mid, today: TODAY, weeks: 1, pattern: [{ dow: 1, kind: 'cardio' }, { dow: 5, kind: 'cardio' }], clientId: 'mid-1' })).created, 1, 'Monday is before the start date, Friday is not');
  // a different series (more weeks, same ids can not collide)
  assert.equal((await call(alice, 'POST', '/api/workout-plan/repeat', { from: start, today: TODAY, weeks: 1, pattern: [{ dow: 2, kind: 'recovery' }], clientId: 'month-2' })).created, 1);
  assert.equal((await call(alice, 'POST', '/api/workout-plan/repeat', { from: start, today: TODAY, weeks: 1, pattern: [], clientId: 'x' })).status, 400);
  // remove the series from a date onwards
  const cut = addD(start, 14);
  const del = await call(alice, 'DELETE', `/api/workout-plan/series/month-1?from=${cut}`);
  assert.equal(del.status, 200);
  const left = await get(alice, start, addD(start, 40));
  assert.ok(left.items.filter((i) => i.seriesId === 'month-1').every((i) => i.date < cut));
  assert.ok(left.items.some((i) => i.seriesId === 'month-2'), 'other series untouched');
});

test('planned vs done: your own log marks a workout done, the right kind and enough minutes only', { skip }, async () => {
  const Activity = require('../models/Activity');
  const strength = await Activity.create({ name: 'Strength Training', category: 'Strength', met: 5 });
  const walk = await Activity.create({ name: 'Walking - Moderate', category: 'Walking', met: 3.5 });
  const day = TODAY;
  const mk = (kind, minutes, cid) => call(alice, 'POST', '/api/workout-plan', { date: day, today: TODAY, kind, minutes, clientId: cid });
  const lift = (await mk('strength', 60, 'pd-1')).item, run = (await mk('cardio', 40, 'pd-2')).item, rest = (await mk('rest', 0, 'pd-3')).item;
  let day1 = (await get(alice, day, day));
  assert.deepEqual(day1.items.map((i) => i.done), [false, false, false]);
  // nothing counted for planning alone
  const logLift = await call(alice, 'POST', '/api/activities/logs', { activityId: strength._id, date: day, durationMinutes: 20, weightKg: 80, clientId: 'pd-log-1' });
  assert.equal(logLift.status, 201);
  day1 = await get(alice, day, day);
  assert.equal(day1.items.find((i) => i._id === lift._id).done, false, '20 of 60 minutes is under 40 %');
  await call(alice, 'POST', '/api/activities/logs', { activityId: strength._id, date: day, durationMinutes: 10, weightKg: 80, clientId: 'pd-log-2' });
  day1 = await get(alice, day, day);
  assert.equal(day1.items.find((i) => i._id === lift._id).done, true, '30 of 60 minutes covers it');
  assert.equal(day1.items.find((i) => i._id === lift._id).matched, true);
  assert.equal(day1.items.find((i) => i._id === run._id).done, false, 'lifting does not do the run');
  assert.equal(day1.items.find((i) => i._id === rest._id).done, false, 'a rest day is never matched');
  assert.deepEqual(day1.days[day], { planned: 1, done: 1, skipped: 0, rest: 1 });
  // a walk does not do the run? it does: walking counts as cardio
  await call(alice, 'POST', '/api/activities/logs', { activityId: walk._id, date: day, durationMinutes: 30, weightKg: 80, clientId: 'pd-log-3' });
  day1 = await get(alice, day, day);
  assert.equal(day1.items.find((i) => i._id === run._id).done, true);
  // marking done / skipped by hand, and undoing it
  const manual = (await mk('conditioning', 20, 'pd-4')).item;
  let p = await call(alice, 'PATCH', `/api/workout-plan/${manual._id}`, { status: 'done' });
  assert.equal(p.item.status, 'done'); assert.equal(p.item.done, true);
  p = await call(alice, 'PATCH', `/api/workout-plan/${manual._id}`, { status: 'skipped' });
  assert.equal(p.item.status, 'skipped'); assert.equal(p.item.done, false);
  assert.equal((await get(alice, day, day)).days[day].skipped, 1);
  p = await call(alice, 'PATCH', `/api/workout-plan/${manual._id}`, { status: 'planned' });
  assert.equal(p.item.status, 'planned');
  assert.equal((await call(alice, 'PATCH', `/api/workout-plan/${manual._id}`, { status: 'finished' })).status, 400);
});

test('move a workout to another day, edit it, and the plan remembers where it was moved from', { skip }, async () => {
  const it = (await call(alice, 'POST', '/api/workout-plan', { date: plus(5), today: TODAY, kind: 'strength', title: 'Legs', minutes: 50, clientId: 'mv-1' })).item;
  const moved = await call(alice, 'PATCH', `/api/workout-plan/${it._id}`, { date: plus(6), today: TODAY });
  assert.equal(moved.item.date, plus(6)); assert.equal(moved.item.movedFrom, plus(5));
  const again = await call(alice, 'PATCH', `/api/workout-plan/${it._id}`, { date: plus(7), today: TODAY });
  assert.equal(again.item.movedFrom, plus(5), 'it remembers the original day, not the last stop');
  assert.equal((await call(alice, 'PATCH', `/api/workout-plan/${it._id}`, { date: plus(-2), today: TODAY })).status, 400, 'not into the past');
  const edit = await call(alice, 'PATCH', `/api/workout-plan/${it._id}`, { title: 'Legs + core', minutes: 40, exercises: [{ name: 'Squat', sets: 4, reps: 6, kg: 80 }, { name: 'Plank' }], note: 'light day' });
  assert.equal(edit.item.title, 'Legs + core'); assert.equal(edit.item.minutes, 40); assert.equal(edit.item.exercises.length, 2); assert.equal(edit.item.note, 'light day');
  assert.equal((await call(alice, 'PATCH', `/api/workout-plan/${it._id}`, { title: '' })).status, 400);
  assert.equal((await call(alice, 'PATCH', '/api/workout-plan/000000000000000000000000', { title: 'x' })).status, 404);
});

test('copy a week onto another: skips what is there, resets status, never plans the past', { skip }, async () => {
  const w1 = plus(60), w2 = plus(80);
  const add = (date, kind, title, cid) => call(alice, 'POST', '/api/workout-plan', { date, today: TODAY, kind, title, minutes: 30, clientId: cid });
  const a = (await add(w1, 'strength', 'A', 'cw-1')).item; await add(plus(61), 'cardio', 'B', 'cw-2'); await add(plus(62), 'rest', 'Rest', 'cw-3');
  await call(alice, 'PATCH', `/api/workout-plan/${a._id}`, { status: 'done' });
  const c1 = await call(alice, 'POST', '/api/workout-plan/copy-week', { fromStart: w1, toStart: w2, today: TODAY });
  assert.equal(c1.status, 201); assert.equal(c1.copied, 3);
  const copied = (await get(alice, w2, plus(86))).items;
  assert.equal(copied.length, 3); assert.ok(copied.every((i) => i.status === 'planned' && !i.movedFrom), 'a copy is a fresh plan');
  const c2 = await call(alice, 'POST', '/api/workout-plan/copy-week', { fromStart: w1, toStart: w2, today: TODAY });
  assert.equal(c2.status, 200); assert.equal(c2.copied, 0); assert.equal(c2.alreadyThere, 3);
  assert.equal((await get(alice, w2, plus(86))).items.length, 3, 'a second tap does not double the plan');
  assert.equal((await call(alice, 'POST', '/api/workout-plan/copy-week', { fromStart: w1, toStart: w1, today: TODAY })).status, 400);
});

test('delete one workout; another person cannot see or change it', { skip }, async () => {
  const it = (await call(alice, 'POST', '/api/workout-plan', { date: plus(9), today: TODAY, kind: 'cardio', clientId: 'iso-1' })).item;
  assert.equal((await get(bob, plus(0), plus(20))).items.length, 0, 'bob sees none of alice\'s plan');
  assert.equal((await call(bob, 'PATCH', `/api/workout-plan/${it._id}`, { title: 'hijack' })).status, 404);
  assert.equal((await call(bob, 'DELETE', `/api/workout-plan/${it._id}`)).status, 404);
  assert.equal((await call(null, 'GET', `/api/workout-plan?from=${plus(0)}&to=${plus(5)}`)).status, 401);
  assert.equal((await call(alice, 'DELETE', `/api/workout-plan/${it._id}`)).status, 200);
  assert.equal((await call(alice, 'DELETE', `/api/workout-plan/${it._id}`)).status, 404);
});

test('the plan is in the account export and goes with the account', { skip }, async () => {
  const WorkoutPlanItem = require('../models/WorkoutPlanItem');
  await call(bob, 'POST', '/api/workout-plan', { date: plus(2), today: TODAY, kind: 'strength', title: 'Bob day', clientId: 'bob-1' });
  const exp = await call(bob, 'GET', '/api/account/export?format=json');
  assert.equal(exp.status, 200);
  assert.deepEqual(exp.workoutPlan.map((x) => x.title), ['Bob day']);
  assert.ok(!('userId' in exp.workoutPlan[0]) && !('_id' in exp.workoutPlan[0]));
  assert.equal((await call(bob, 'DELETE', '/api/account/me', { password: 'password123' })).status, 200);
  assert.equal(await WorkoutPlanItem.countDocuments({ title: 'Bob day' }), 0);
});

test('a person cannot fill the planner without limit', { skip }, async () => {
  assert.equal(P.MAX_ITEMS_PER_PERSON, 3000);
  const big = await call(alice, 'POST', '/api/workout-plan/repeat', { from: plus(200), today: TODAY, weeks: 12, pattern: Array.from({ length: 21 }, (_, i) => ({ dow: (i % 7) + 1, kind: 'custom' })), clientId: 'big-1' });
  assert.equal(big.status, 400, '252 items in one go is refused');
});
