// Phase 1 "duplicate guards": the same action twice (a double tap, a retry after a timeout, an offline-queue replay)
// must never leave two copies behind. Runs against a real MongoDB, same harness as api.integration.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const dbHelper = require('./helpers/mongo');
const skip = dbHelper.skipReason();

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.AUTH_LIMITS_SCALE = '100';

let server, base, mongoose, token;
const plus = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

async function call(method, path, { body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch { json = { text }; }
  return { status: res.status, ...json };
}

test.before(async () => {
  if (skip) return;
  mongoose = require('mongoose');
  await mongoose.connect(await dbHelper.start());
  await mongoose.connection.dropDatabase();
  const { createApp } = require('../app');
  await new Promise((r) => { server = createApp({ allowedOrigins: [] }).listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
  const s = await call('POST', '/api/auth/signup', { body: { name: 'Dup', email: 'dup@test.dev', password: 'password123' } });
  token = s.token;
});
test.after(async () => {
  if (skip) return;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await new Promise((r) => server.close(r));
  await dbHelper.stop();
});

const shake = { name: 'Dup Shake', brand: 'Home', servingSize: 250, servingUnit: 'ml', calories: 180, protein: 30, carbohydrates: 8, fat: 3 };

test('custom foods: saving the same food twice returns the first, a different one is still created', { skip }, async () => {
  const Food = require('../models/Food');
  const a = await call('POST', '/api/foods', { body: shake });
  assert.equal(a.status, 201);
  const b = await call('POST', '/api/foods', { body: { ...shake, name: 'dup shake' } }); // capitals do not matter
  assert.equal(b.status, 200);
  assert.equal(b.duplicate, true);
  assert.equal(b.food._id, a.food._id);
  assert.equal(await Food.countDocuments({ name: /^dup shake$/i }), 1);
  const c = await call('POST', '/api/foods', { body: { ...shake, calories: 200 } }); // different numbers = a different food
  assert.equal(c.status, 201);
  assert.notEqual(c.food._id, a.food._id);
  assert.equal(await Food.countDocuments({ name: /^dup shake$/i }), 2);
});

test('custom foods: "duplicate" twice returns the same copy; an edited copy makes the next one "(copy 2)"', { skip }, async () => {
  const Food = require('../models/Food');
  const src = await call('POST', '/api/foods', { body: { ...shake, name: 'Dup Source', calories: 111 } });
  const d1 = await call('POST', `/api/foods/${src.food._id}/duplicate`);
  assert.equal(d1.status, 201);
  assert.equal(d1.food.name, 'Dup Source (copy)');
  const d2 = await call('POST', `/api/foods/${src.food._id}/duplicate`); // second tap
  assert.equal(d2.status, 200);
  assert.equal(d2.food._id, d1.food._id);
  assert.equal(await Food.countDocuments({ name: /^Dup Source \(copy/ }), 1);
  // the person edits the copy, then wants another one: that is a real second copy
  const edit = await call('PUT', `/api/foods/${d1.food._id}`, { body: { ...shake, name: 'Dup Source (copy)', calories: 150 } });
  assert.equal(edit.status, 200);
  const d3 = await call('POST', `/api/foods/${src.food._id}/duplicate`);
  assert.equal(d3.status, 201);
  assert.equal(d3.food.name, 'Dup Source (copy 2)');
});

async function logFood(foodId, date, mealType, quantity = 250) {
  const r = await call('POST', '/api/food-logs', { body: { foodId, date, mealType, quantity } });
  assert.equal(r.status, 201);
  return r.log;
}
const logsOn = async (date) => (await call('GET', `/api/food-logs?date=${date}`)).logs;

test('food copy: a replay returns the same rows, a double tap adds nothing, a day cannot be copied onto itself', { skip }, async () => {
  const f = (await call('POST', '/api/foods', { body: { ...shake, name: 'Copy Food' } })).food;
  const [d1, d2, d3] = [plus(-30), plus(-29), plus(-28)];
  const e1 = await logFood(f._id, d1, 'lunch'); const e2 = await logFood(f._id, d1, 'lunch', 500); await logFood(f._id, d1, 'dinner');

  const first = await call('POST', '/api/food-logs/copy', { body: { fromDate: d1, toDate: d2, mealType: 'lunch', clientId: 'copy-aaa' } });
  assert.equal(first.status, 201);
  assert.equal(first.logs.length, 2);
  assert.equal(first.skipped, 0);

  // 1. the very same request again (an offline-queue replay): same rows come back, nothing new is written
  const replay = await call('POST', '/api/food-logs/copy', { body: { fromDate: d1, toDate: d2, mealType: 'lunch', clientId: 'copy-aaa' } });
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.logs.map((l) => l._id).sort(), first.logs.map((l) => l._id).sort());
  assert.equal((await logsOn(d2)).length, 2);

  // 2. a second tap = a new request with a DIFFERENT clientId: the same entries are not copied again
  const second = await call('POST', '/api/food-logs/copy', { body: { fromDate: d1, toDate: d2, mealType: 'lunch', clientId: 'copy-bbb' } });
  assert.equal(second.status, 200);
  assert.equal(second.logs.length, 0);
  assert.equal(second.skipped, 2);
  assert.equal((await logsOn(d2)).length, 2);

  // 3. an old client that sends no clientId at all is protected the same way
  const bare = await call('POST', '/api/food-logs/copy', { body: { fromDate: d1, toDate: d2, mealType: 'lunch' } });
  assert.equal(bare.logs.length, 0);
  assert.equal((await logsOn(d2)).length, 2);

  // 4. the copies point at the entries they came from, so copying to another day still works
  assert.deepEqual(first.logs.map((l) => l.copiedFrom).sort(), [e1._id, e2._id].sort());
  const third = await call('POST', '/api/food-logs/copy', { body: { fromDate: d1, toDate: d3, mealType: 'lunch' } });
  assert.equal(third.status, 201);
  assert.equal(third.logs.length, 2);
  assert.equal((await logsOn(d3)).length, 2);

  // 5. copying a day onto itself would only double it
  const same = await call('POST', '/api/food-logs/copy', { body: { fromDate: d1, toDate: d1, mealType: 'lunch' } });
  assert.equal(same.status, 400);
  assert.equal((await logsOn(d1)).filter((l) => l.mealType === 'lunch').length, 2);

  // 6. an edited quantity still comes through on the first copy (the preview feature is unchanged)
  const d4 = plus(-27);
  const edited = await call('POST', '/api/food-logs/copy', { body: { fromDate: d1, toDate: d4, ids: [e1._id], edits: [{ id: e1._id, quantity: 125 }] } });
  assert.equal(edited.logs.length, 1);
  assert.equal(edited.logs[0].consumedQuantity, 125);
  assert.equal(edited.logs[0].servings, 0.5);
});

test('meal plan copy-week: copying twice, or onto a week that already has the item, never doubles the plan', { skip }, async () => {
  const MealPlan = require('../models/MealPlan');
  const f = (await call('POST', '/api/foods', { body: { ...shake, name: 'Plan Food' } })).food;
  const w1 = plus(40), w2 = plus(60), w3 = plus(80);
  const add = (date, mealType) => call('POST', '/api/meal-plans', { body: { date, mealType, foodId: f._id, quantity: 250 } });
  assert.equal((await add(w1, 'breakfast')).status, 201);
  assert.equal((await add(plus(41), 'lunch')).status, 201);
  assert.equal((await add(plus(42), 'dinner')).status, 201);
  const inWeek = (start) => MealPlan.countDocuments({ date: { $gte: start, $lte: plus(Number(new Date(start) - new Date(plus(0))) / 86400000 + 6) } });

  const c1 = await call('POST', '/api/meal-plans/copy-week', { body: { fromStart: w1, toStart: w2 } });
  assert.equal(c1.status, 201);
  assert.equal(c1.copied, 3);
  assert.equal(c1.alreadyThere, 0);
  assert.equal(await inWeek(w2), 3);

  const c2 = await call('POST', '/api/meal-plans/copy-week', { body: { fromStart: w1, toStart: w2 } }); // second tap
  assert.equal(c2.status, 200);
  assert.equal(c2.copied, 0);
  assert.equal(c2.alreadyThere, 3);
  assert.equal(await inWeek(w2), 3);

  // a week that already has one of the three: only the other two are added
  assert.equal((await add(plus(80), 'breakfast')).status, 201);
  const c3 = await call('POST', '/api/meal-plans/copy-week', { body: { fromStart: w1, toStart: w3 } });
  assert.equal(c3.copied, 2);
  assert.equal(c3.alreadyThere, 1);
  assert.equal(await inWeek(w3), 3);

  assert.equal((await call('POST', '/api/meal-plans/copy-week', { body: { fromStart: w1, toStart: w1 } })).status, 400);
});
