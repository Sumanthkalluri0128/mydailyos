// Food log: the serving maths, and editing an entry's day, note and quick-add estimate. Real MongoDB.
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
  alice = (await call(null, 'POST', '/api/auth/signup', { name: 'A', email: 'a-food@test.dev', password: 'password123' })).token;
  bob = (await call(null, 'POST', '/api/auth/signup', { name: 'B', email: 'b-food@test.dev', password: 'password123' })).token;
});
test.after(async () => { if (skip) return; await mongoose.connection.dropDatabase(); await mongoose.disconnect(); await new Promise((r) => server.close(r)); await dbHelper.stop(); });

const rice = { name: 'Edit Rice', servingSize: 100, servingUnit: 'g', calories: 130, protein: 2.7, carbohydrates: 28, fat: 0.3, fiber: 0.4, sugar: 0.1, sodium: 1 };
const mkFood = async (o = {}) => (await call(alice, 'POST', '/api/foods', { ...rice, ...o })).food;
const log = (foodId, quantity, date = plus(-1), meal = 'lunch') => call(alice, 'POST', '/api/food-logs', { foodId, date, mealType: meal, quantity });

test('serving maths: any quantity scales the per-serving numbers, stored cleanly to 2 decimals', { skip }, async () => {
  const f = await mkFood();
  const a = await log(f._id, 150); assert.equal(a.status, 201);
  assert.equal(a.log.servings, 1.5); assert.equal(a.log.nutritionTotal.calories, 195); assert.equal(a.log.nutritionTotal.protein, 4.05);
  const b = await log(f._id, 33);
  assert.equal(b.log.nutritionTotal.calories, 42.9); assert.equal(b.log.nutritionTotal.fat, 0.1, '0.3 x 0.33 = 0.099 stored as 0.1');
  const c = await log(f._id, 0.5); assert.equal(c.log.nutritionTotal.calories, 0.65);
  const odd = await mkFood({ name: 'Edit Odd', servingSize: 30, calories: 61.3, protein: 1.1 });
  const d = await log(odd._id, 45); assert.equal(d.log.nutritionTotal.calories, 91.95);           // 61.3 x 1.5, no 91.94999999999999
  assert.equal((await call(alice, 'POST', '/api/food-logs', { foodId: f._id, date: plus(-1), mealType: 'lunch', quantity: 0 })).status, 400);
  assert.equal((await call(alice, 'POST', '/api/food-logs', { foodId: f._id, date: plus(-1), mealType: 'lunch', quantity: -5 })).status, 400);
  assert.equal((await call(alice, 'POST', '/api/food-logs', { foodId: f._id, date: plus(-1), mealType: 'brunch', quantity: 10 })).status, 400);
});

test('day total equals the sum of its entries, per meal and overall', { skip }, async () => {
  const f = await mkFood({ name: 'Edit Sum', calories: 97, protein: 3.3, servingSize: 75 });
  const day = plus(-20);
  const parts = [[75, 'breakfast'], [40, 'breakfast'], [123.4, 'lunch'], [10, 'snacks']];
  for (const [q, m] of parts) assert.equal((await log(f._id, q, day, m)).status, 201);
  const s = (await call(alice, 'GET', `/api/food-logs/summary?date=${day}`)).summary;
  const expect = (q) => Math.round(97 * (q / 75) * 100) / 100;
  const total = parts.reduce((n, [q]) => n + expect(q), 0);
  assert.ok(Math.abs(s.calories - total) < 0.001, `${s.calories} vs ${total}`);
  assert.ok(Math.abs(s.meals.breakfast - (expect(75) + expect(40))) < 0.001);
  assert.ok(Math.abs(s.meals.lunch - expect(123.4)) < 0.001);
});

test('edit the amount: nutrition follows from the stored snapshot, even if the food is changed later', { skip }, async () => {
  const f = await mkFood({ name: 'Edit Snapshot' });
  const l = (await log(f._id, 100)).log;
  await call(alice, 'PUT', `/api/foods/${f._id}`, { ...rice, name: 'Edit Snapshot', calories: 999 });         // the food is corrected afterwards
  const p = await call(alice, 'PATCH', `/api/food-logs/${l._id}`, { quantity: 250 });
  assert.equal(p.log.nutritionTotal.calories, 325, 'uses the calories it was logged with, not the later change');
  assert.equal((await call(alice, 'PATCH', `/api/food-logs/${l._id}`, { halve: true })).log.nutritionTotal.calories, 162.5);
  assert.equal((await call(alice, 'PATCH', `/api/food-logs/${l._id}`, { quantity: 0 })).status, 400);
});

test('move an entry to another day, and edit its note', { skip }, async () => {
  const f = await mkFood({ name: 'Edit Move' });
  const l = (await log(f._id, 100, plus(-30))).log;
  const moved = await call(alice, 'PATCH', `/api/food-logs/${l._id}`, { date: plus(-31), notes: 'forgot to log' });
  assert.equal(moved.status, 200); assert.equal(moved.log.date, plus(-31)); assert.equal(moved.log.notes, 'forgot to log');
  assert.equal((await call(alice, 'GET', `/api/food-logs?date=${plus(-30)}`)).logs.length, 0);
  assert.equal((await call(alice, 'GET', `/api/food-logs?date=${plus(-31)}`)).logs.length, 1);
  assert.equal((await call(alice, 'GET', `/api/food-logs/summary?date=${plus(-31)}`)).summary.calories, 130, 'the day totals follow the entry');
  assert.equal((await call(alice, 'PATCH', `/api/food-logs/${l._id}`, { date: 'yesterday' })).status, 400);
  assert.equal((await call(alice, 'PATCH', `/api/food-logs/${l._id}`, { date: plus(30) })).status, 400, 'not weeks ahead');
  assert.equal((await call(alice, 'PATCH', `/api/food-logs/${l._id}`, { notes: 'x'.repeat(301) })).status, 400);
  assert.equal((await call(alice, 'PATCH', `/api/food-logs/${l._id}`, { notes: '' })).log.notes, '');
});

test('a quick-add estimate can be corrected; a real food\'s numbers cannot be typed over', { skip }, async () => {
  const q = (await call(alice, 'POST', '/api/food-logs/quick', { date: plus(-2), mealType: 'dinner', name: 'Restaurant thali', calories: 600, protein: 20 })).log;
  assert.equal(q.nutritionTotal.calories, 600);
  const e = await call(alice, 'PATCH', `/api/food-logs/${q._id}`, { calories: 450, protein: 25, foodName: 'Thali (half eaten)' });
  assert.equal(e.status, 200); assert.equal(e.log.nutritionTotal.calories, 450); assert.equal(e.log.nutritionTotal.protein, 25); assert.equal(e.log.foodName, 'Thali (half eaten)');
  assert.equal((await call(alice, 'GET', `/api/food-logs/summary?date=${plus(-2)}`)).summary.calories, 450);
  assert.equal((await call(alice, 'PATCH', `/api/food-logs/${q._id}`, { calories: 0 })).status, 400);
  assert.equal((await call(alice, 'PATCH', `/api/food-logs/${q._id}`, { calories: -5 })).status, 400);
  const twice = await call(alice, 'PATCH', `/api/food-logs/${q._id}`, { quantity: 2 });
  assert.equal(twice.log.nutritionTotal.calories, 900, 'two of them');
  const f = await mkFood({ name: 'Edit Real' }); const real = (await log(f._id, 100)).log;
  assert.equal((await call(alice, 'PATCH', `/api/food-logs/${real._id}`, { calories: 1 })).status, 400);
  assert.equal((await call(alice, 'PATCH', `/api/food-logs/${real._id}`, { foodName: 'Pizza' })).status, 400);
});

test('another person cannot read or change your entries', { skip }, async () => {
  const f = await mkFood({ name: 'Edit Private' }); const l = (await log(f._id, 100, plus(-3))).log;
  assert.equal((await call(bob, 'PATCH', `/api/food-logs/${l._id}`, { date: plus(-4) })).status, 404);
  assert.equal((await call(bob, 'GET', `/api/food-logs?date=${plus(-3)}`)).logs.length, 0);
  await call(bob, 'DELETE', `/api/food-logs/${l._id}`);
  assert.equal((await call(alice, 'GET', `/api/food-logs?date=${plus(-3)}`)).logs.length, 1, 'bob could not delete alice\'s entry');
});

test('the day list marks quick-add estimates (so the apps can offer "Correct the estimate"), and only those', { skip }, async () => {
  const day = plus(-6);
  const q = (await call(alice, 'POST', '/api/food-logs/quick', { date: day, mealType: 'dinner', name: 'Pasta out', calories: 700 })).log;
  const f = await mkFood({ name: 'List Rice' });
  const r = (await log(f._id, 100, day, 'lunch')).log;
  const list = (await call(alice, 'GET', `/api/food-logs?date=${day}`)).logs;
  assert.equal(list.find((x) => x._id === q._id).quick, true, 'the estimate is flagged');
  assert.equal(list.find((x) => x._id === r._id).quick, undefined, 'a real food is not');
  const bobList = (await call(bob, 'GET', `/api/food-logs?date=${day}`)).logs;
  assert.deepEqual(bobList, [], 'another person sees nothing of it');
  const empty = (await call(alice, 'GET', `/api/food-logs?date=${plus(-30)}`)).logs;
  assert.deepEqual(empty, [], 'an empty day is fine');
});

test('correcting an estimate replaces the stale auto note, leaves the person\'s own note alone, and the answer says it is an estimate', { skip }, async () => {
  const day = plus(-7);
  const q = (await call(alice, 'POST', '/api/food-logs/quick', { date: day, mealType: 'dinner', name: 'Thali', caloriesLow: 600, caloriesHigh: 900, calories: 750, padPct: 10 })).log;
  assert.match(q.notes, /^Estimate 600–900 kcal \+10% buffer$/);
  const fix = await call(alice, 'PATCH', `/api/food-logs/${q._id}`, { calories: 540, foodName: 'Half thali' });
  assert.equal(fix.status, 200);
  assert.equal(Math.round(fix.log.nutritionTotal.calories), 540); assert.equal(fix.log.foodName, 'Half thali');
  assert.equal(fix.log.notes, 'Corrected estimate (was 825 kcal)', 'the range and buffer described the old number');
  assert.equal(fix.log.quick, true);
  // fixing the name only keeps the note; a second correction does not stack notes
  const nameOnly = await call(alice, 'PATCH', `/api/food-logs/${q._id}`, { foodName: 'Small thali' });
  assert.equal(nameOnly.log.notes, 'Corrected estimate (was 825 kcal)');
  // a note the person wrote is never replaced
  const q2 = (await call(alice, 'POST', '/api/food-logs/quick', { date: day, mealType: 'lunch', name: 'Wrap', calories: 500 })).log;
  await call(alice, 'PATCH', `/api/food-logs/${q2._id}`, { notes: 'shared with a friend' });
  const fix2 = await call(alice, 'PATCH', `/api/food-logs/${q2._id}`, { calories: 300 });
  assert.equal(fix2.log.notes, 'shared with a friend');
  // typed note and calories together: the typed note wins
  const q3 = (await call(alice, 'POST', '/api/food-logs/quick', { date: day, mealType: 'snacks', name: 'Chaat', calories: 400 })).log;
  const both = await call(alice, 'PATCH', `/api/food-logs/${q3._id}`, { calories: 250, notes: 'only half' });
  assert.equal(both.log.notes, 'only half');
  // the day total follows the corrected numbers
  const dayLogs = (await call(alice, 'GET', `/api/food-logs?date=${day}`)).logs;
  assert.equal(Math.round(dayLogs.reduce((t, l) => t + l.nutritionTotal.calories, 0)), 540 + 300 + 250);
});
