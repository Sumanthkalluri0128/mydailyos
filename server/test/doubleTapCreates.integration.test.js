// Habits, medicines, goals and workout templates: tapping Save twice (or a retry after a timeout) must not make twins. Real MongoDB.
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
test.before(async () => {
  if (skip) return;
  mongoose = require('mongoose'); await mongoose.connect(await dbHelper.start()); await mongoose.connection.dropDatabase();
  const { createApp } = require('../app');
  await new Promise((r) => { server = createApp({ allowedOrigins: [] }).listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
  alice = (await call(null, 'POST', '/api/auth/signup', { name: 'A', email: 'a-dt@test.dev', password: 'password123' })).token;
  bob = (await call(null, 'POST', '/api/auth/signup', { name: 'B', email: 'b-dt@test.dev', password: 'password123' })).token;
});
test.after(async () => { if (skip) return; await mongoose.connection.dropDatabase(); await mongoose.disconnect(); await new Promise((r) => server.close(r)); await dbHelper.stop(); });

// each: [label, path, body, a changed body that is a genuinely different item, the response field, a model to count in]
const cases = () => [
  ['habit', '/api/habits', { name: 'Read 20 pages', target: 20, unit: 'pages' }, { name: 'Read 20 pages', target: 30, unit: 'pages' }, 'habit', require('../models/Habit')],
  ['medicine', '/api/meds', { name: 'Vitamin D', dose: '1000 IU', times: ['08:00'] }, { name: 'Vitamin D', dose: '2000 IU', times: ['08:00'] }, 'med', require('../models/Medicine')],
  ['goal', '/api/goals', { title: 'Work out 3 times', kind: 'short', metric: 'workouts', target: 3, startDate: plus(-1), deadline: plus(20), today: plus(0) }, { title: 'Work out 3 times', kind: 'short', metric: 'workouts', target: 5, startDate: plus(-1), deadline: plus(20), today: plus(0) }, 'goal', require('../models/Goal')],
];

for (const [label, path, body, changed, field, Model] of cases()) {
  test(`${label}: saving twice makes one; a genuinely different one is still created; other people are not affected`, { skip }, async () => {
    const first = await call(alice, 'POST', path, body);
    assert.equal(first.status, 201, JSON.stringify(first).slice(0, 200));
    const second = await call(alice, 'POST', path, { ...body, clientId: 'a-different-tap-id' });            // a second tap: the web app adds its own fresh clientId to every request
    assert.equal(second.status, 200); assert.equal(second.duplicate, true);
    assert.equal(second[field]._id, first[field]._id);
    const third = await call(alice, 'POST', path, body);
    assert.equal(third[field]._id, first[field]._id);
    assert.equal(await Model.countDocuments({ userId: first[field].userId }), 1, 'one stored');
    const other = await call(alice, 'POST', path, changed);
    assert.equal(other.status, 201); assert.notEqual(other[field]._id, first[field]._id);
    const theirs = await call(bob, 'POST', path, body);                                                    // same text, another person: their own copy
    assert.equal(theirs.status, 201); assert.notEqual(theirs[field]._id, first[field]._id);
  });
}

test('workout template: saving twice makes one', { skip }, async () => {
  const Activity = require('../models/Activity'); const WorkoutTemplate = require('../models/WorkoutTemplate');
  const push = await Activity.create({ name: 'Dt Push-ups', category: 'Strength', met: 5 });
  const body = { name: 'Push day', items: [{ activityId: push._id, durationMinutes: 20 }] };
  const a = await call(alice, 'POST', '/api/templates', body);
  assert.equal(a.status, 201);
  const b = await call(alice, 'POST', '/api/templates', { ...body, clientId: 'x' });
  assert.equal(b.status, 200); assert.equal(b.template._id, a.template._id); assert.equal(b.duplicate, true);
  assert.equal(await WorkoutTemplate.countDocuments({ name: 'Push day', userId: a.template.userId }), 1);
  const c = await call(alice, 'POST', '/api/templates', { name: 'Push day', items: [{ activityId: push._id, durationMinutes: 25 }] });
  assert.equal(c.status, 201, 'a different duration is a different template');
});

test('limits still apply and validation still comes first', { skip }, async () => {
  assert.equal((await call(alice, 'POST', '/api/habits', { name: '' })).status, 400);
  assert.equal((await call(alice, 'POST', '/api/meds', { name: 'No times' })).status, 400);
});

test('fasting: two "start" taps at the same moment leave exactly one fast in progress', { skip }, async () => {
  const Fast = require('../models/Fast');
  const results = await Promise.all(Array.from({ length: 6 }, () => call(bob, 'POST', '/api/fasting/start', { targetHours: 16 })));
  const created = results.filter((r) => r.status === 201), refused = results.filter((r) => r.status === 409);
  assert.equal(created.length, 1, `statuses: ${results.map((r) => r.status).join(',')}`);
  assert.equal(refused.length, 5);
  assert.equal(await Fast.countDocuments({ endedAt: null, userId: created[0].fast.userId }), 1);
  assert.equal((await call(bob, 'POST', '/api/fasting/start', { targetHours: 16 })).status, 409, 'and a later start is still refused');
});

test('task: a second tap within seconds returns the same task; a similar one later, or a different one, is new', { skip }, async () => {
  const Task = require('../models/Task');
  const body = { title: 'Call the plumber', date: plus(1), priority: 'medium' };
  const a = await call(alice, 'POST', '/api/tasks', body);
  assert.equal(a.status, 201, JSON.stringify(a).slice(0, 160));
  const b = await call(alice, 'POST', '/api/tasks', { ...body, clientId: 'another-tap' });
  assert.equal(b.status, 200); assert.equal(b.duplicate, true); assert.equal(b.task._id, a.task._id);
  assert.equal(await Task.countDocuments({ title: 'Call the plumber' }), 1);
  assert.equal((await call(alice, 'POST', '/api/tasks', { ...body, date: plus(2) })).status, 201, 'another day is another task');
  assert.equal((await call(alice, 'POST', '/api/tasks', { ...body, title: 'Call the plumber back' })).status, 201);
  // an identical task made later (after the window) is a new one: age the first, then add again
  await Task.collection.updateOne({ _id: new (require('mongoose').Types.ObjectId)(a.task._id) }, { $set: { createdAt: new Date(Date.now() - 60_000) } });   // raw: Mongoose treats createdAt as immutable
  const later = await call(alice, 'POST', '/api/tasks', body);
  assert.equal(later.status, 201); assert.notEqual(later.task._id, a.task._id);
});
