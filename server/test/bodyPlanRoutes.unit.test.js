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

const store = { profile: null, updates: [] };
Profile.findOne = () => ({ lean: async () => store.profile });
Profile.updateOne = async (q, u) => { store.updates.push(u.$set); };
HealthLog.find = () => ({ sort() { return this; }, limit() { return this; }, lean: async () => [{ type: 'waist', value: 90 }, { type: 'neck', value: 38 }] });
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
test.beforeEach(() => { store.profile = JSON.parse(JSON.stringify(base)); store.updates = []; });
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
