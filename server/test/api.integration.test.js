// End-to-end API tests. They need a real MongoDB, so they only run when TEST_MONGO_URI is set:
//
//   TEST_MONGO_URI=mongodb://127.0.0.1:27017/flexfit_test npm test
//
// (Uses a throw-away database and drops it afterwards. Never point this at production data.)
const test = require('node:test');
const assert = require('node:assert/strict');

const URI = process.env.TEST_MONGO_URI;
const skip = !URI && 'set TEST_MONGO_URI to run the API integration tests';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

let server, base, mongoose;
const today = () => new Date().toISOString().slice(0, 10);
const plus = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

async function call(method, path, { token, body, raw } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) return res;
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch { json = { text }; }
  return { status: res.status, ...json };
}

test.before(async () => {
  if (skip) return;
  mongoose = require('mongoose');
  await mongoose.connect(URI);
  await mongoose.connection.dropDatabase();
  const { createApp } = require('../app');
  const app = createApp({ allowedOrigins: [] });
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (skip) return;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await new Promise((r) => server.close(r));
});

const ctx = {};

test('auth: signup validation, signup, duplicate, login, bad password', { skip }, async () => {
  assert.equal((await call('POST', '/api/auth/signup', { body: { name: 'A', email: 'nope', password: 'longenough' } })).status, 400);
  assert.equal((await call('POST', '/api/auth/signup', { body: { name: 'A', email: 'a@test.dev', password: 'short' } })).status, 400);

  const a = await call('POST', '/api/auth/signup', { body: { name: 'Alice', email: 'Alice@Test.dev', password: 'password123' } });
  assert.equal(a.status, 201);
  assert.ok(a.token);
  assert.equal(a.user.email, 'alice@test.dev');
  ctx.alice = a.token;

  assert.equal((await call('POST', '/api/auth/signup', { body: { name: 'Alice2', email: 'alice@test.dev', password: 'password123' } })).status, 409);
  assert.equal((await call('POST', '/api/auth/login', { body: { email: 'alice@test.dev', password: 'wrongpass1' } })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { body: { email: 'ghost@test.dev', password: 'wrongpass1' } })).status, 401);
  const ok = await call('POST', '/api/auth/login', { body: { email: 'alice@test.dev', password: 'password123' } });
  assert.equal(ok.status, 200);

  const b = await call('POST', '/api/auth/signup', { body: { name: 'Bob', email: 'bob@test.dev', password: 'password123' } });
  ctx.bob = b.token;
});

test('auth: protected routes reject missing/invalid tokens', { skip }, async () => {
  assert.equal((await call('GET', '/api/profile')).status, 401);
  assert.equal((await call('GET', '/api/tasks?date=' + today(), { token: 'garbage' })).status, 401);
  assert.equal((await call('GET', '/api/foods')).status, 401);
});

test('profile: new accounts need onboarding; validated partial updates; units', { skip }, async () => {
  const p = await call('GET', '/api/profile', { token: ctx.alice });
  assert.equal(p.profile.onboarded, false);
  assert.equal(p.profile.units.weight, 'kg');

  assert.equal((await call('PATCH', '/api/profile', { token: ctx.alice, body: { age: 500 } })).status, 400);
  assert.equal((await call('PATCH', '/api/profile', { token: ctx.alice, body: { sex: 'robot' } })).status, 400);

  const u = await call('PATCH', '/api/profile', {
    token: ctx.alice,
    body: { age: 30, sex: 'female', heightCm: 170, goals: { waterTargetMl: 2500, exerciseMinutesTarget: 40 }, units: { weight: 'lb', volume: 'oz' }, onboarded: true },
  });
  assert.equal(u.status, 200);
  assert.equal(u.profile.goals.waterTargetMl, 2500);
  assert.equal(u.profile.goals.calorieTarget, 1800, 'untouched goals keep their value');
  assert.equal(u.profile.units.weight, 'lb');
  assert.equal(u.profile.units.energy, 'kcal');
  assert.equal(u.profile.onboarded, true);
});

test('custom foods: create, list, edit, favourite, duplicate, delete — and isolation between users', { skip }, async () => {
  assert.equal((await call('POST', '/api/foods', { token: ctx.alice, body: { name: 'X' } })).status, 400, 'servingSize + calories required');

  const c = await call('POST', '/api/foods', {
    token: ctx.alice,
    body: { name: 'Protein Shake', brand: 'HomeMade', servingSize: 250, servingUnit: 'ml', calories: 180, protein: 30, carbohydrates: 8, fat: 3, fiber: 1, sugar: 5, notes: 'post workout' },
  });
  assert.equal(c.status, 201);
  assert.equal(c.food.isCustom, true);
  ctx.food = c.food._id;

  const list = await call('GET', '/api/foods?search=shake', { token: ctx.alice });
  assert.equal(list.foods.length, 1);
  assert.equal(list.foods[0].isCustom, true);
  assert.equal((await call('GET', '/api/foods?search=shake', { token: ctx.bob })).foods.length, 0, "Bob can't see Alice's custom food");
  assert.equal((await call('PUT', `/api/foods/${ctx.food}`, { token: ctx.bob, body: { name: 'hack', servingSize: 1, calories: 1 } })).status, 404);
  assert.equal((await call('DELETE', `/api/foods/${ctx.food}`, { token: ctx.bob })).status, 404);

  const e = await call('PUT', `/api/foods/${ctx.food}`, { token: ctx.alice, body: { name: 'Protein Shake', servingSize: 250, servingUnit: 'ml', calories: 200, protein: 32 } });
  assert.equal(e.food.calories, 200);

  const fav = await call('PATCH', `/api/foods/${ctx.food}/favorite`, { token: ctx.alice });
  assert.equal(fav.food.isFavorite, true);
  assert.equal((await call('GET', '/api/foods?favorites=true', { token: ctx.alice })).foods.length, 1);
  assert.equal((await call('GET', '/api/foods?favorites=true', { token: ctx.bob })).foods.length, 0);

  // A shared catalogue food (no owner): visible to both, editable by neither, but can be duplicated.
  const Food = require('../models/Food');
  const shared = await Food.create({ name: 'Shared Rice', servingSize: 100, servingUnit: 'g', calories: 130, protein: 2.7 });
  ctx.shared = String(shared._id);
  assert.equal((await call('GET', '/api/foods?search=shared', { token: ctx.bob })).foods.length, 1);
  assert.equal((await call('PUT', `/api/foods/${ctx.shared}`, { token: ctx.alice, body: { name: 'x', servingSize: 1, calories: 1 } })).status, 403);
  assert.equal((await call('DELETE', `/api/foods/${ctx.shared}`, { token: ctx.alice })).status, 403);
  const dup = await call('POST', `/api/foods/${ctx.shared}/duplicate`, { token: ctx.alice });
  assert.equal(dup.status, 201);
  assert.equal(dup.food.isCustom, true);
  assert.equal((await call('DELETE', `/api/foods/${dup.food._id}`, { token: ctx.alice })).status, 200);
});

test('food logs: nutrition maths, offline replay is idempotent, edit, copy, recent, delete', { skip }, async () => {
  const body = { foodId: ctx.food, date: today(), mealType: 'breakfast', quantity: 500, clientId: 'c-food-1' };
  const l = await call('POST', '/api/food-logs', { token: ctx.alice, body });
  assert.equal(l.status, 201);
  assert.equal(l.log.nutritionTotal.calories, 400); // 200 kcal per 250 ml × 2 servings
  assert.equal(l.log.servings, 2);
  ctx.foodLog = l.log._id;

  const replay = await call('POST', '/api/food-logs', { token: ctx.alice, body });
  assert.equal(replay.status, 200);
  assert.equal(replay.duplicate, true);
  assert.equal(replay.log._id, ctx.foodLog);
  assert.equal((await call('GET', `/api/food-logs?date=${today()}`, { token: ctx.alice })).logs.length, 1, 'still exactly one entry');

  assert.equal((await call('POST', '/api/food-logs', { token: ctx.alice, body: { ...body, mealType: 'brunch', clientId: 'x' } })).status, 400);
  assert.equal((await call('POST', '/api/food-logs', { token: ctx.bob, body: { ...body, clientId: 'b1' } })).status, 404, "Bob can't log Alice's custom food");

  const patched = await call('PATCH', `/api/food-logs/${ctx.foodLog}`, { token: ctx.alice, body: { quantity: 250, mealType: 'lunch' } });
  assert.equal(patched.log.nutritionTotal.calories, 200);
  assert.equal(patched.log.mealType, 'lunch');

  const sum = await call('GET', `/api/food-logs/summary?date=${today()}`, { token: ctx.alice });
  assert.equal(Math.round(sum.summary.calories), 200);
  assert.equal(Math.round(sum.summary.meals.lunch), 200);

  const copied = await call('POST', '/api/food-logs/copy', { token: ctx.alice, body: { fromDate: today(), toDate: plus(1) } });
  assert.equal(copied.logs.length, 1);
  assert.equal(copied.logs[0].date, plus(1));

  const recent = await call('GET', '/api/foods/recent', { token: ctx.alice });
  assert.equal(recent.foods[0]._id, ctx.food);

  assert.equal((await call('DELETE', `/api/food-logs/${copied.logs[0]._id}`, { token: ctx.alice })).status, 200);
});

test('water: validation, idempotent replay, totals, isolation', { skip }, async () => {
  assert.equal((await call('POST', '/api/water', { token: ctx.alice, body: { date: today(), amountMl: -5 } })).status, 400);
  assert.equal((await call('POST', '/api/water', { token: ctx.alice, body: { date: 'yesterday', amountMl: 250 } })).status, 400);
  const w = await call('POST', '/api/water', { token: ctx.alice, body: { date: today(), amountMl: 250, clientId: 'w-1' } });
  assert.equal(w.status, 201);
  await call('POST', '/api/water', { token: ctx.alice, body: { date: today(), amountMl: 250, clientId: 'w-1' } });
  await call('POST', '/api/water', { token: ctx.alice, body: { date: today(), amountMl: 500, clientId: 'w-2' } });
  const day = await call('GET', `/api/water?date=${today()}`, { token: ctx.alice });
  assert.equal(day.totalMl, 750);
  assert.equal(day.logs.length, 2);
  assert.equal((await call('GET', `/api/water?date=${today()}`, { token: ctx.bob })).totalMl, 0);
  ctx.water = w.log._id;
});

test('weight: one entry per day (update), profile sync, delete resyncs', { skip }, async () => {
  const a = await call('POST', '/api/weight', { token: ctx.alice, body: { date: today(), weightKg: 70.5 } });
  assert.equal(a.status, 201);
  const b = await call('POST', '/api/weight', { token: ctx.alice, body: { date: today(), weightKg: 70.2 } });
  assert.equal(b.status, 200);
  assert.equal(b.updated, true);
  assert.equal(b.log._id, a.log._id);
  assert.equal((await call('GET', '/api/weight', { token: ctx.alice })).logs.length, 1);
  assert.equal((await call('GET', '/api/profile', { token: ctx.alice })).profile.currentWeightKg, 70.2);
  await call('POST', '/api/weight', { token: ctx.alice, body: { date: plus(-3), weightKg: 71.4 } });
  await call('POST', '/api/weight', { token: ctx.alice, body: { date: plus(-6), weightKg: 72 } });
  assert.equal((await call('DELETE', `/api/weight/${a.log._id}`, { token: ctx.alice })).status, 200);
  assert.equal((await call('GET', '/api/profile', { token: ctx.alice })).profile.currentWeightKg, 71.4, 'falls back to the latest remaining entry');
  assert.equal((await call('POST', '/api/weight', { token: ctx.alice, body: { date: today(), weightKg: 0 } })).status, 400);
  await call('POST', '/api/weight', { token: ctx.alice, body: { date: today(), weightKg: 70 } });
});

test('tasks: due time, priority order, toggle (explicit + flip), edit, delete', { skip }, async () => {
  assert.equal((await call('POST', '/api/tasks', { token: ctx.alice, body: { title: '  ', date: today() } })).status, 400);
  assert.equal((await call('POST', '/api/tasks', { token: ctx.alice, body: { title: 'x', date: today(), time: '25:99' } })).status, 400);
  const t1 = await call('POST', '/api/tasks', { token: ctx.alice, body: { title: 'Low, no time', date: today(), priority: 'low' } });
  const t2 = await call('POST', '/api/tasks', { token: ctx.alice, body: { title: 'Call dentist', date: today(), time: '15:30', priority: 'high', clientId: 't-1' } });
  const t2b = await call('POST', '/api/tasks', { token: ctx.alice, body: { title: 'Call dentist', date: today(), time: '15:30', priority: 'high', clientId: 't-1' } });
  assert.equal(t2b.duplicate, true);
  assert.equal(t2b.task._id, t2.task._id);
  const t3 = await call('POST', '/api/tasks', { token: ctx.alice, body: { title: 'Morning run', date: today(), time: '07:00' } });

  const list = await call('GET', `/api/tasks?date=${today()}`, { token: ctx.alice });
  assert.deepEqual(list.tasks.map((t) => t.title), ['Morning run', 'Call dentist', 'Low, no time'], 'timed tasks first by time, then untimed');

  const done = await call('PATCH', `/api/tasks/${t2.task._id}/toggle`, { token: ctx.alice, body: { completed: true } });
  assert.equal(done.task.completed, true);
  const again = await call('PATCH', `/api/tasks/${t2.task._id}/toggle`, { token: ctx.alice, body: { completed: true } });
  assert.equal(again.task.completed, true, 'replaying an explicit completion never flips it back');
  const flip = await call('PATCH', `/api/tasks/${t2.task._id}/toggle`, { token: ctx.alice });
  assert.equal(flip.task.completed, false);

  const ed = await call('PATCH', `/api/tasks/${t1.task._id}`, { token: ctx.alice, body: { time: '21:15', title: 'Read chapter' } });
  assert.equal(ed.task.time, '21:15');

  const up = await call('GET', `/api/tasks/upcoming?days=3`, { token: ctx.alice });
  assert.ok(up.tasks.every((t) => t.time && !t.completed));
  assert.ok(up.tasks.find((t) => t.title === 'Read chapter'));

  assert.equal((await call('GET', `/api/tasks?date=${today()}`, { token: ctx.bob })).tasks.length, 0);
  assert.equal((await call('DELETE', `/api/tasks/${t3.task._id}`, { token: ctx.alice })).status, 200);
  assert.equal((await call('GET', `/api/tasks?date=${today()}`, { token: ctx.alice })).tasks.length, 2);
});

test('tasks: repeating tasks generate lazily; delete one occurrence or end the series', { skip }, async () => {
  const r = await call('POST', '/api/tasks', { token: ctx.alice, body: { title: 'Stretch', date: today(), time: '08:00', recurrence: 'daily' } });
  assert.ok(r.task.seriesId);

  const tomorrow = await call('GET', `/api/tasks?date=${plus(1)}`, { token: ctx.alice });
  const inst = tomorrow.tasks.find((t) => t.title === 'Stretch');
  assert.ok(inst, 'tomorrow has an instance');
  assert.equal(inst.time, '08:00');
  assert.equal((await call('GET', `/api/tasks?date=${plus(1)}`, { token: ctx.alice })).tasks.filter((t) => t.title === 'Stretch').length, 1, 'no duplicates on re-read');

  // Delete only tomorrow's occurrence: it must not come back.
  await call('DELETE', `/api/tasks/${inst._id}`, { token: ctx.alice });
  assert.equal((await call('GET', `/api/tasks?date=${plus(1)}`, { token: ctx.alice })).tasks.filter((t) => t.title === 'Stretch').length, 0);
  assert.equal((await call('GET', `/api/tasks?date=${plus(2)}`, { token: ctx.alice })).tasks.filter((t) => t.title === 'Stretch').length, 1, 'the series continues after a skipped day');

  // upcoming materialises the range in one call
  const up = await call('GET', '/api/tasks/upcoming?days=5', { token: ctx.alice });
  assert.ok(up.tasks.filter((t) => t.title === 'Stretch').length >= 3);

  // End the series from day+2 onwards.
  const d2 = (await call('GET', `/api/tasks?date=${plus(2)}`, { token: ctx.alice })).tasks.find((t) => t.title === 'Stretch');
  await call('DELETE', `/api/tasks/${d2._id}?scope=series`, { token: ctx.alice });
  assert.equal((await call('GET', `/api/tasks?date=${plus(3)}`, { token: ctx.alice })).tasks.filter((t) => t.title === 'Stretch').length, 0);
  assert.equal((await call('GET', `/api/tasks?date=${plus(2)}`, { token: ctx.alice })).tasks.filter((t) => t.title === 'Stretch').length, 0);
});

test('tasks: monthly recurrence stays on the 31st instead of drifting', { skip }, async () => {
  const { recurrenceMatches } = require('../lib/recurrence');
  assert.equal(recurrenceMatches('monthly', '2027-01-31', '2027-02-28'), true);
  assert.equal(recurrenceMatches('monthly', '2027-01-31', '2027-03-31'), true);
  assert.equal(recurrenceMatches('monthly', '2027-01-31', '2027-03-28'), false);
});

test('habits: create, edit, log (upsert), stats + streak, delete', { skip }, async () => {
  const h = await call('POST', '/api/habits', { token: ctx.alice, body: { name: 'Meditate', target: 10, unit: 'min' } });
  assert.equal(h.status, 201);
  ctx.habit = h.habit._id;
  assert.equal((await call('PATCH', `/api/habits/${ctx.habit}`, { token: ctx.alice, body: { name: 'Meditate daily' } })).habit.name, 'Meditate daily');

  const partial = await call('POST', '/api/habits/logs', { token: ctx.alice, body: { habitId: ctx.habit, date: today(), completedValue: 5 } });
  assert.equal(partial.log.completed, false);
  for (const d of [today(), plus(-1), plus(-2)]) {
    const l = await call('POST', '/api/habits/logs', { token: ctx.alice, body: { habitId: ctx.habit, date: d, completedValue: 10 } });
    assert.equal(l.log.completed, true);
  }
  assert.equal((await call('GET', `/api/habits/logs?date=${today()}`, { token: ctx.alice })).logs.length, 1, 'upsert keeps one log per day');

  const s = await call('GET', `/api/habits/${ctx.habit}/stats?today=${today()}`, { token: ctx.alice });
  assert.equal(s.stats.currentStreak, 3);
  assert.equal(s.stats.totalCompleted, 3);
  assert.equal(s.stats.totalLogged, 3);
  assert.ok(s.stats.completionRate > 0 && s.stats.completionRate <= 100);

  assert.equal((await call('GET', `/api/habits/${ctx.habit}/stats`, { token: ctx.bob })).status, 404);
});

test('exercise: catalogue, log with calories, templates (create, log in one tap, idempotent), delete', { skip }, async () => {
  const Activity = require('../models/Activity');
  const run = await Activity.create({ name: 'Running', category: 'Cardio', met: 9.8 });
  const push = await Activity.create({ name: 'Push-ups', category: 'Strength', met: 8 });

  assert.equal((await call('GET', '/api/activities?search=run', { token: ctx.alice })).activities.length, 1);
  const log = await call('POST', '/api/activities/logs', { token: ctx.alice, body: { activityId: run._id, date: today(), durationMinutes: 30, weightKg: 70, clientId: 'a-1' } });
  assert.equal(log.status, 201);
  assert.equal(Math.round(log.log.caloriesBurned), Math.round((9.8 * 3.5 * 70 / 200) * 30));
  const replay = await call('POST', '/api/activities/logs', { token: ctx.alice, body: { activityId: run._id, date: today(), durationMinutes: 30, weightKg: 70, clientId: 'a-1' } });
  assert.equal(replay.duplicate, true);
  assert.equal((await call('POST', '/api/activities/logs', { token: ctx.alice, body: { activityId: run._id, date: today(), durationMinutes: 0 } })).status, 400);

  // Manual calories burned (e.g. from a watch) override the estimate; a range query returns history. Uses yesterday so today's counts below are unchanged.
  const manual = await call('POST', '/api/activities/logs', { token: ctx.alice, body: { activityId: run._id, date: plus(-1), durationMinutes: 30, weightKg: 70, caloriesBurned: 410, clientId: 'a-manual' } });
  assert.equal(manual.status, 201);
  assert.equal(manual.log.caloriesBurned, 410);
  assert.equal(manual.log.caloriesSource, 'manual');
  assert.equal(log.log.caloriesSource, 'estimated');
  assert.equal((await call('POST', '/api/activities/logs', { token: ctx.alice, body: { activityId: run._id, date: today(), durationMinutes: 10, caloriesBurned: -5 } })).status, 400);
  const range = await call('GET', `/api/activities/logs?from=${plus(-2)}&to=${today()}`, { token: ctx.alice });
  assert.equal(range.logs.length, 2, 'yesterday manual + today estimated');
  assert.equal((await call('GET', `/api/activities/logs?from=${today()}&to=${plus(-2)}`, { token: ctx.alice })).status, 400);
  assert.equal((await call('GET', `/api/activities/logs?from=${plus(-2)}&to=${today()}`, { token: ctx.bob })).logs.length, 0);

  assert.equal((await call('POST', '/api/templates', { token: ctx.alice, body: { name: 'Empty', items: [] } })).status, 400);
  const tpl = await call('POST', '/api/templates', { token: ctx.alice, body: { name: 'Push day', items: [{ activityId: push._id, durationMinutes: 20 }, { activityId: run._id, durationMinutes: 10 }] } });
  assert.equal(tpl.status, 201);
  ctx.tpl = tpl.template._id;
  assert.equal((await call('GET', '/api/templates', { token: ctx.bob })).templates.length, 0);

  const one = await call('POST', `/api/templates/${ctx.tpl}/log`, { token: ctx.alice, body: { date: today(), weightKg: 70, clientId: 'tpl-1' } });
  assert.equal(one.status, 201);
  assert.equal(one.logs.length, 2);
  assert.equal(one.totals.minutes, 30);
  const again = await call('POST', `/api/templates/${ctx.tpl}/log`, { token: ctx.alice, body: { date: today(), weightKg: 70, clientId: 'tpl-1' } });
  assert.equal(again.duplicate, true);
  assert.equal((await call('GET', `/api/activities/logs?date=${today()}`, { token: ctx.alice })).logs.length, 3, '1 direct + 2 from template, replay added nothing');

  const upd = await call('PUT', `/api/templates/${ctx.tpl}`, { token: ctx.alice, body: { name: 'Push day v2', items: [{ activityId: push._id, durationMinutes: 25 }] } });
  assert.equal(upd.template.items.length, 1);
});

test('progress: history rows, combined /day payload, achievements, weekly summary', { skip }, async () => {
  const hist = await call('GET', `/api/progress/history?from=${plus(-6)}&to=${today()}`, { token: ctx.alice });
  assert.equal(hist.days.length, 7);
  const last = hist.days[6];
  assert.equal(last.waterMl, 750);
  assert.ok(last.exerciseMinutes >= 30);
  assert.equal(last.weighIn, true);
  assert.equal(hist.days[2].weighIn, false, 'carried-forward weight is not marked as a weigh-in');
  assert.equal((await call('GET', `/api/progress/history?from=${today()}&to=${plus(-6)}`, { token: ctx.alice })).status, 400);
  assert.equal((await call('GET', `/api/progress/history?from=2020-01-01&to=2026-12-31`, { token: ctx.alice })).status, 400, 'range cap');

  const day = await call('GET', `/api/progress/day?date=${today()}&include=profile,habits,weights`, { token: ctx.alice });
  assert.equal(day.summary.waterMl, 750);
  assert.ok(day.tasks.length >= 2);
  assert.equal(day.profile.units.weight, 'lb');
  assert.equal(day.habitDefs.length, 1);
  assert.ok(day.weightLogs.length >= 2);
  assert.ok(Array.isArray(day.habits) && day.habits[0].habitName === 'Meditate daily');
  const bare = await call('GET', `/api/progress/day?date=${today()}`, { token: ctx.alice });
  assert.equal(bare.profile, undefined);

  const ach = await call('GET', `/api/progress/achievements?today=${today()}`, { token: ctx.alice });
  assert.ok(ach.badges.length > 10);
  assert.ok(ach.badges.find((b) => b.id === 'workouts-1').unlocked);
  assert.ok(ach.streaks.logging.current >= 1);
  assert.equal(ach.streaks.habit.current, 3);
  assert.ok(ach.totals.workouts >= 3);

  const wk = await call('GET', `/api/progress/weekly?end=${today()}`, { token: ctx.alice });
  assert.equal(wk.days.length, 7);
  assert.equal(wk.totals.waterMl, 750);
  assert.ok(wk.weight && typeof wk.weight.change === 'number');
  assert.equal(wk.to, today());
});

test('account: CSV + JSON export, change password, rate-limit headers', { skip }, async () => {
  const csv = await call('GET', '/api/account/export?format=csv', { token: ctx.alice, raw: true });
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.match(csv.headers.get('content-disposition'), /flexfit-export-.*\.csv/);
  const text = await csv.text();
  assert.match(text, /type,date,name,quantity,unit,calories/);
  assert.match(text, /food,.*Protein Shake/);
  assert.match(text, /water,.*Water,250,ml/);
  assert.match(text, /exercise,.*Running/);
  assert.doesNotMatch(text, /bob@test\.dev/);

  const json = await call('GET', '/api/account/export?format=json', { token: ctx.alice });
  assert.equal(json.user.email, 'alice@test.dev');
  assert.ok(json.waterLogs.length >= 2);
  assert.equal(json.customFoods.length, 1);
  assert.equal(json.passwordHash, undefined);
  assert.equal((await call('GET', '/api/account/export?format=xml', { token: ctx.alice })).status, 400);

  assert.equal((await call('POST', '/api/account/change-password', { token: ctx.alice, body: { currentPassword: 'nope', newPassword: 'newpassword1' } })).status, 400);
  assert.equal((await call('POST', '/api/account/change-password', { token: ctx.alice, body: { currentPassword: 'password123', newPassword: 'short' } })).status, 400);
  const ch = await call('POST', '/api/account/change-password', { token: ctx.alice, body: { currentPassword: 'password123', newPassword: 'newpassword1' } });
  assert.equal(ch.status, 200);
  assert.equal((await call('POST', '/api/auth/login', { body: { email: 'alice@test.dev', password: 'password123' } })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { body: { email: 'alice@test.dev', password: 'newpassword1' } })).status, 200);
});

test('security: malformed input is rejected cleanly, headers present, login is rate limited', { skip }, async () => {
  const res = await call('GET', '/api/health', { raw: true });
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-powered-by'), null);
  assert.equal(res.headers.get('ratelimit-limit'), null, 'health checks are never throttled');
  assert.ok((await call('GET', '/api/profile', { raw: true })).headers.get('ratelimit-limit'), 'API routes advertise their limit');

  const bad = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not json' });
  assert.equal(bad.status, 400);
  assert.equal((await call('GET', '/api/tasks/not-an-id', { token: ctx.alice })).status, 404);
  assert.equal((await call('GET', '/api/nope')).status, 404);
  assert.equal((await call('DELETE', '/api/food-logs/not-an-object-id', { token: ctx.alice })).status, 400);

  // regex injection attempt in search must not blow up
  assert.equal((await call('GET', '/api/foods?search=' + encodeURIComponent('(((.*+'), { token: ctx.alice })).status, 200);

  let last;
  for (let i = 0; i < 12; i++) last = await call('POST', '/api/auth/login', { body: { email: 'victim@test.dev', password: 'guess' + i } });
  assert.equal(last.status, 429);
});

test('steps count toward calories burned automatically; health logs validate; one steps value per day', { skip }, async () => {
  await call('PATCH', '/api/profile', { token: ctx.alice, body: { currentWeightKg: 80 } });
  const d = plus(-3);
  assert.equal((await call('POST', '/api/health-logs', { token: ctx.alice, body: { type: 'steps', date: d, value: -1 } })).status, 400);
  assert.equal((await call('POST', '/api/health-logs', { token: ctx.alice, body: { type: 'nope', date: d, value: 5 } })).status, 400);
  assert.equal((await call('POST', '/api/health-logs', { token: ctx.alice, body: { type: 'steps', date: d, value: 4000 } })).status, 201);
  await call('POST', '/api/health-logs', { token: ctx.alice, body: { type: 'steps', date: d, value: 10000, source: 'device' } });
  const list = await call('GET', '/api/health-logs?type=steps', { token: ctx.alice });
  assert.equal(list.logs.filter((l) => l.date === d).length, 1, 're-saving the same day replaces it');
  assert.equal(list.logs.find((l) => l.date === d).value, 10000);

  const day = await call('GET', `/api/health-logs/steps/day?date=${d}`, { token: ctx.alice });
  assert.equal(day.steps, 10000);
  assert.equal(day.caloriesBurned, 400, '10,000 steps x 80 kg x 0.0005');
  const summary = await call('GET', `/api/activities/summary?date=${d}`, { token: ctx.alice });
  assert.equal(summary.summary.stepCalories, 400);
  assert.equal(summary.summary.caloriesBurned, summary.summary.workoutCalories + 400);
  const hist = await call('GET', `/api/progress/history?from=${d}&to=${d}`, { token: ctx.alice });
  assert.equal(hist.days[0].steps, 10000);
  assert.ok(hist.days[0].caloriesBurned >= 400);

  const bp = (b) => call('POST', '/api/health-logs', { token: ctx.alice, body: { type: 'bloodPressure', date: d, ...b } });
  assert.equal((await bp({ value: 120 })).status, 400, 'diastolic required');
  assert.equal((await bp({ value: 80, value2: 120 })).status, 400, 'systolic must exceed diastolic');
  assert.equal((await bp({ value: 120, value2: 80 })).status, 201);
  assert.equal((await call('GET', '/api/health-logs?type=steps', { token: ctx.bob })).logs.length, 0, 'private to the owner');
  const latest = await call('GET', '/api/health-logs/latest', { token: ctx.alice });
  assert.ok(latest.latest.steps && latest.latest.bloodPressure);
});

test('saved meals, barcode validation, fasting, streaks, strength sets + records', { skip }, async () => {
  const food = (await call('POST', '/api/foods', { token: ctx.alice, body: { name: 'Meal test food', servingSize: 100, servingUnit: 'g', calories: 200, units: [{ label: 'bowl', quantity: 150 }] } })).food;
  assert.equal(food.units[0].label, 'bowl');
  const saved = await call('POST', '/api/saved-meals', { token: ctx.alice, body: { name: 'My breakfast', items: [{ foodId: food._id, quantity: 150 }] } });
  assert.equal(saved.status, 201);
  assert.equal(saved.meal.items[0].calories, 300);
  assert.equal((await call('POST', '/api/saved-meals', { token: ctx.alice, body: { name: 'Empty', items: [] } })).status, 400);
  const logged = await call('POST', `/api/saved-meals/${saved.meal._id}/log`, { token: ctx.alice, body: { date: today(), mealType: 'breakfast', clientId: 'sm-1' } });
  assert.equal(logged.logs.length, 1);
  assert.equal(logged.logs[0].nutritionTotal.calories, 300);
  const again = await call('POST', `/api/saved-meals/${saved.meal._id}/log`, { token: ctx.alice, body: { date: today(), mealType: 'breakfast', clientId: 'sm-1' } });
  assert.equal(again.logs[0]._id, logged.logs[0]._id, 'replay is idempotent');
  assert.equal((await call('GET', '/api/saved-meals', { token: ctx.bob })).meals.length, 0);

  assert.equal((await call('GET', '/api/foods/barcode/abc', { token: ctx.alice })).status, 400);

  const s = await call('GET', `/api/progress/streaks?today=${today()}`, { token: ctx.alice });
  assert.ok(s.streaks.current >= 1 && s.streaks.loggedToday);

  assert.equal((await call('POST', '/api/fasting/start', { token: ctx.alice, body: { targetHours: 16 } })).status, 201);
  assert.equal((await call('POST', '/api/fasting/start', { token: ctx.alice, body: {} })).status, 409);
  const ended = await call('POST', '/api/fasting/end', { token: ctx.alice, body: {} });
  assert.equal(ended.reachedGoal, false);
  assert.equal((await call('GET', '/api/fasting', { token: ctx.alice })).history.length, 1);

  const act = (await call('GET', '/api/activities', { token: ctx.alice })).activities[0];
  const withSets = await call('POST', '/api/activities/logs', { token: ctx.alice, body: { activityId: act._id, date: today(), durationMinutes: 20, sets: [{ reps: 5, weightKg: 100 }, { reps: 8, weightKg: 80 }] } });
  assert.equal(withSets.status, 201);
  assert.equal(withSets.log.sets.length, 2);
  assert.equal((await call('POST', '/api/activities/logs', { token: ctx.alice, body: { activityId: act._id, date: today(), durationMinutes: 20, sets: [{ reps: 0 }] } })).status, 400);
  const rec = await call('GET', '/api/activities/records', { token: ctx.alice });
  assert.equal(rec.records[0].bestWeightKg, 100);
});

test('password reset: generic response, wrong code rejected, correct code changes password', { skip }, async () => {
  const User = require('../models/User');
  const crypto = require('crypto');
  const email = 'bob@test.dev';
  const unknown = await call('POST', '/api/auth/forgot', { body: { email: 'nobody@test.dev' } });
  const known = await call('POST', '/api/auth/forgot', { body: { email } });
  assert.equal(unknown.status, 200);
  assert.equal(known.status, 200);
  assert.equal(unknown.message, known.message, 'does not reveal whether the email exists');
  // The code is emailed, so the test plants a known one the same way the route stores it.
  const plant = async (code) => User.updateOne({ email }, { resetCodeHash: crypto.createHash('sha256').update(`${code}|${process.env.JWT_SECRET}`).digest('hex'), resetExpires: new Date(Date.now() + 60000), resetAttempts: 0 });
  await plant('ABCD2345');
  assert.equal((await call('POST', '/api/auth/reset', { body: { email, code: 'WRONG123', newPassword: 'brand-new-pass' } })).status, 400);
  assert.equal((await call('POST', '/api/auth/reset', { body: { email, code: 'ABCD2345', newPassword: 'short' } })).status, 400);
  assert.equal((await call('POST', '/api/auth/reset', { body: { email, code: 'abcd-2345', newPassword: 'brand-new-pass' } })).status, 200);
  assert.equal((await call('POST', '/api/auth/reset', { body: { email, code: 'ABCD2345', newPassword: 'another-pass-1' } })).status, 400, 'code is single use');
  assert.equal((await call('POST', '/api/auth/login', { body: { email, password: 'brand-new-pass' } })).status, 200);
});

test('account deletion removes everything the person owns (and only theirs)', { skip }, async () => {
  const Food = require('../models/Food');
  const Task = require('../models/Task');
  const del = await call('DELETE', '/api/account/me', { token: ctx.alice });
  assert.equal(del.status, 200);
  assert.equal(await Food.countDocuments({ name: 'Protein Shake' }), 0, 'custom foods deleted');
  assert.equal(await Food.countDocuments({ name: 'Shared Rice' }), 1, 'shared catalogue kept');
  const User = require('../models/User');
  const alice = await User.findOne({ email: 'alice@test.dev' });
  assert.equal(alice, null);
  for (const name of ['FoodLog', 'WaterLog', 'WeightLog', 'Task', 'Habit', 'HabitLog', 'ActivityLog', 'WorkoutTemplate', 'Profile']) {
    const M = require(`../models/${name}`);
    const rows = await M.find({}).lean();
    assert.ok(rows.every((r) => String(r.userId) !== String(ctx.aliceId || '')), name);
  }
  assert.equal(await Task.countDocuments({ title: 'Read chapter' }), 0);
  assert.equal((await call('GET', '/api/profile', { token: ctx.alice })).status, 200, 'token still verifies, but data is gone');
  const bobFoods = await call('GET', '/api/foods', { token: ctx.bob });
  assert.equal(bobFoods.status, 200);
});
