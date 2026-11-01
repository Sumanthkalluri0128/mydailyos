// The real body-plan router over HTTP, with auth and the two database reads/writes stubbed, so the saved training setup,
// preview-by-query and apply paths are exercised without MongoDB.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const authPath = require.resolve('../middleware/auth');
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: { requireAuth: (req, res, next) => { req.user = { id: 'u1' }; next(); } } };
const Profile = require('../models/Profile');
const HealthLog = require('../models/HealthLog');
const WeightLog = require('../models/WeightLog');
const ActivityLog = require('../models/ActivityLog');
const Activity = require('../models/Activity');
const BodyPlanSession = require('../models/BodyPlanSession');

const store = { profile: null, updates: [], sessions: [], activity: [], weights: [] };
let nextId = 1;
const chain = (rows) => ({ sort() { return this; }, limit() { return this; }, select() { return this; }, lean: async () => rows });
BodyPlanSession.find = (q = {}) => chain(store.sessions.filter((s) => (!q.date || ((!q.date.$gte || s.date >= q.date.$gte) && (!q.date.$lte || s.date <= q.date.$lte)))));
BodyPlanSession.findOne = (q) => ({ lean: async () => store.sessions.find((s) => s.clientId && s.clientId === q.clientId) || null });
BodyPlanSession.create = async (d) => { const row = { ...d, _id: String(nextId++).padStart(24, '0') }; store.sessions.push(row); return row; };
BodyPlanSession.findOneAndDelete = (q) => ({ lean: async () => { const i = store.sessions.findIndex((s) => s._id === q._id); return i < 0 ? null : store.sessions.splice(i, 1)[0]; } });
WeightLog.find = () => chain(store.weights);
ActivityLog.find = () => chain(store.activity);
ActivityLog.create = async (d) => { store.activity.push(d); return d; };
ActivityLog.deleteMany = async (q) => { store.activity = store.activity.filter((a) => a.clientId !== q.clientId); };
Activity.findOne = () => ({ lean: async () => ({ _id: 'a1', name: 'Strength Training', category: 'Strength', met: 5 }) });
Profile.findOne = () => ({ select() { return this; }, lean: async () => store.profile });
Profile.updateOne = async (q, u) => { store.updates.push(u.$set); };
HealthLog.find = () => ({ sort() { return this; }, limit() { return this; }, select() { return this; }, lean: async () => [{ type: 'waist', value: 90, date: '2026-10-01' }, { type: 'neck', value: 38, date: '2026-10-01' }] });
const router = require('../routes/bodyPlanRoutes');

const base = { sex: 'male', age: 30, heightCm: 178, currentWeightKg: 90, activityLevel: 'moderate', goals: { bodyType: 'athletic' } };
let server, url;
test.before(async () => {
  const app = express(); app.use(express.json()); app.use('/api/body-plan', router);
  app.use((err, req, res, next) => res.status(err.status || 500).json({ success: false, message: err.message })); // eslint-disable-line no-unused-vars
  await new Promise((r) => { server = http.createServer(app).listen(0, r); });
  url = `http://127.0.0.1:${server.address().port}/api/body-plan`;
});
test.after(() => server.close());
test.beforeEach(() => { store.profile = JSON.parse(JSON.stringify(base)); store.updates = []; store.sessions = []; store.activity = []; store.weights = []; });
const get = async (q = '') => (await fetch(`${url}${q}`)).json();
const post = async (path, body) => { const r = await fetch(`${url}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, json: await r.json() }; };

test('GET returns the plan with the full program, analysis, and the options for the setup form', async () => {
  const j = await get();
  assert.equal(j.success, true);
  assert.equal(j.plan.ready, true);
  assert.ok(j.plan.training.program.sessions.length >= 2);
  assert.ok(j.plan.analysis.headline);
  assert.equal(j.plan.training.prefs.setupDone, false, 'nothing saved yet: defaults, and it says so');
  assert.equal(j.trainingOptions.places.length, 3);
});

test('GET uses the saved setup, and query values preview a change without saving', async () => {
  store.profile.training = { place: 'home', level: 'intermediate', days: 4, minutes: 45, equipment: ['dumbbells'], limits: ['knee'], focus: [] };
  const saved = await get();
  assert.equal(saved.plan.training.prefs.place, 'home');
  assert.equal(saved.plan.training.program.daysPerWeek, 4);
  const preview = await get('?place=gym&days=3&limits=&equipment=bands,bench');
  assert.equal(preview.plan.training.prefs.place, 'gym');
  assert.equal(preview.plan.training.program.daysPerWeek, 3);
  assert.deepEqual(preview.plan.training.prefs.limits, [], 'an empty query value clears the saved one');
  assert.deepEqual(preview.plan.training.prefs.equipment, ['bands', 'bench']);
  assert.equal(store.updates.length, 0, 'previewing never writes');
});

test('apply saves the body goal and the cleaned training setup together', async () => {
  const r = await post('/apply', { type: 'athletic', training: { place: 'both', level: 'beginner', days: 3, minutes: 60, equipment: ['bands', 'nope'], limits: ['back'], focus: ['glutes'], evil: '$where' } });
  assert.equal(r.status, 200);
  assert.equal(r.json.applied.training, true);
  const set = store.updates[0];
  assert.equal(set['goals.bodyType'], 'athletic');
  assert.deepEqual(set.training, { place: 'both', level: 'beginner', days: 3, minutes: 60, equipment: ['bands'], limits: ['back'], focus: ['glutes'] });
  assert.equal(r.json.plan.training.prefs.place, 'both');
  assert.ok(r.json.plan.training.program.sessions.every((s) => s.exercises.every((e) => e.id !== 'bb-row')), 'back limit applied in the returned plan');
});

test('apply without a training object leaves the saved setup alone (older apps keep working)', async () => {
  const r = await post('/apply', { type: 'lean' });
  assert.equal(r.status, 200);
  assert.equal('training' in store.updates[0], false);
  assert.equal(r.json.applied.training, false);
});

test('a bad body goal is refused, and an underweight body still saves its setup but never a loss target', async () => {
  const bad = await post('/apply', { type: 'huge' });
  assert.equal(bad.status, 400);
  store.profile.currentWeightKg = 50;
  const r = await post('/apply', { type: 'muscular', training: { place: 'gym', level: 'beginner' } });
  assert.equal(r.status, 200);
  assert.equal(store.updates[0]['goals.targetWeightKg'], null);
  assert.equal(store.updates[0].training.level, 'beginner');
});

test('the Profile model accepts the training setup and rejects values outside the lists', () => {
  const ok = new Profile({ userId: '5f8d0d55b54764421b7156c3', training: { place: 'gym', level: 'advanced', days: 5, minutes: 75, equipment: ['bands'], limits: ['knee'], focus: ['arms'] } });
  assert.equal(ok.validateSync(), undefined);
  const bad = new Profile({ userId: '5f8d0d55b54764421b7156c3', training: { place: 'moon', days: 9, limits: ['hip'] } });
  const err = bad.validateSync();
  assert.ok(err.errors['training.place'] && err.errors['training.days']);
  assert.equal(new Profile({ userId: '5f8d0d55b54764421b7156c3' }).training.place, '');
});

// ---------------------------------------------------------------- adaptive plan: sessions in, adjusted plan out
const TODAY = new Date().toISOString().slice(0, 10);
const firstEx = (plan, i = 0) => plan.training.program.sessions[i].exercises[0];
const sessionBody = (plan, o = {}) => { const s = plan.training.program.sessions[0]; return { date: TODAY, today: TODAY, clientId: o.clientId || `c${Math.random().toString(36).slice(2, 9)}`, sessionId: s.id, title: s.title, way: 'gym', status: 'done', feel: 'good', phase: 'build', minutes: 50, exercises: s.exercises.map((e) => ({ id: e.id, name: e.name, slot: e.slot, sets: Array.from({ length: e.sets }, () => ({ reps: e.repsHi, weightKg: e.unit === 'seconds' ? 0 : 30 })) })), ...o }; };

test('GET includes the adaptive plan: today, this week, a target on every exercise', async () => {
  const j = await get(`?date=${TODAY}`);
  assert.equal(j.plan.adapt.engine, 'adapt-v1');
  assert.equal(j.plan.adapt.week.days.length, 7);
  assert.ok(j.plan.training.program.sessions[0].exercises.every((e) => e.next && e.next.action === 'start'));
});

test('a saved session changes the next targets (top of the range = heavier), counts in exercise totals, and is idempotent', async () => {
  const { plan } = await get(`?date=${TODAY}`);
  const body = sessionBody(plan, { clientId: 'abc123' });
  const r = await post('/session', body);
  assert.equal(r.status, 201);
  assert.ok(r.json.highlights.some((h) => /First time/.test(h.text)));
  const ex = r.json.plan.training.program.sessions[0].exercises.find((e) => e.unit !== 'seconds');
  assert.equal(ex.next.last.weightKg, 30);
  assert.equal(store.activity.length, 1, 'counted in the day\'s exercise totals');
  assert.equal(store.activity[0].clientId, 'bp-abc123');
  const again = await post('/session', body);
  assert.equal(again.json.duplicate, true);
  assert.equal(store.sessions.length, 1, 'same clientId is saved once');
});

test('skipping with a reason is saved without exercises and never counts as exercise', async () => {
  const r = await post('/session', { date: TODAY, today: TODAY, clientId: 'skip1', sessionId: 'A', status: 'skipped', reason: 'sick' });
  assert.equal(r.status, 201);
  assert.equal(store.sessions[0].exercises.length, 0);
  assert.equal(store.activity.length, 0);
});

test('bad sessions are refused: no sets, future date, unknown status; and odd values are cleaned', async () => {
  const { plan } = await get(`?date=${TODAY}`);
  assert.equal((await post('/session', { date: TODAY, status: 'done', exercises: [] })).status, 400);
  assert.equal((await post('/session', { date: '2999-01-01', status: 'skipped' })).status, 400);
  assert.equal((await post('/session', { date: TODAY, status: 'weird' })).status, 400);
  assert.equal((await post('/session', sessionBody(plan, { feel: 'bogus' }))).status, 400, 'an unknown value is refused, not guessed');
  const r = await post('/session', sessionBody(plan, { feel: '', pain: ['knee', 'toenail'], exercises: [{ id: 'goblet-squat', sets: [{ reps: 99999, weightKg: -5 }, { reps: 8, weightKg: 20 }] }, { id: '$bad id', sets: [{ reps: 5 }] }] }));
  assert.equal(r.status, 201);
  const row = store.sessions[0];
  assert.equal(row.feel, '');
  assert.deepEqual(row.pain, ['knee']);
  assert.equal(row.exercises.length, 1);
  assert.equal(row.exercises[0].sets[0].reps, 1000);
  assert.equal(row.exercises[0].sets[0].weightKg, 0);
});

test('deleting a session removes its exercise entry and the plan is worked out again', async () => {
  const { plan } = await get(`?date=${TODAY}`);
  await post('/session', sessionBody(plan, { clientId: 'del1' }));
  const id = store.sessions[0]._id;
  const r = await (await fetch(`${url}/session/${id}?date=${TODAY}`, { method: 'DELETE' })).json();
  assert.equal(r.success, true);
  assert.equal(store.sessions.length, 0);
  assert.equal(store.activity.length, 0);
});

test('apply stamps the day the plan began, once', async () => {
  await post('/apply', { type: 'athletic', date: TODAY });
  assert.equal(store.updates[0]['goals.bodyPlanStartedOn'], TODAY);
  store.profile.goals.bodyPlanStartedOn = '2026-09-01';
  await post('/apply', { type: 'athletic', date: TODAY });
  assert.equal('goals.bodyPlanStartedOn' in store.updates[1], false);
});
