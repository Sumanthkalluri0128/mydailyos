// The Macros card (web + phone), Home gauges and the quests must judge a day by the SAME budget. The clients size macros with
// resolveTargets(profile, { budget }); the server sizes the quest's protein ceiling with proteinRangeAt(profile, budget). They must agree.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const server = require('../lib/energy');

const load = () => import(pathToFileURL(path.join(__dirname, '../../client/src/utils/energy.js')).href);
const people = () => {
  let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const sexes = ['male', 'female'], acts = ['sedentary', 'light', 'moderate', 'very_active'];
  return Array.from({ length: 800 }, () => {
    const w = 45 + rnd() * 70;
    return { age: 18 + Math.floor(rnd() * 45), sex: sexes[Math.floor(rnd() * 2)], heightCm: 150 + Math.floor(rnd() * 40), currentWeightKg: Math.round(w * 10) / 10, activityLevel: acts[Math.floor(rnd() * 4)],
      goals: { targetWeightKg: Math.round((w - 5 - rnd() * 10) * 10) / 10, weeklyPaceKg: 0.5, calorieMode: 'auto' } };
  });
};

test('no budget (or no extra room) leaves the base targets exactly as before', async () => {
  const web = await load();
  for (const p of people().slice(0, 100)) {
    const base = web.resolveTargets(p), same = web.resolveTargets(p, { budget: base.calories });
    assert.deepEqual(same.ranges, base.ranges); assert.deepEqual(same.macros, base.macros); assert.deepEqual(same.limits, base.limits);
  }
});

test('on a bigger day the protein goal stays the plan\'s, the ceiling and the other targets grow, and the server agrees with the clients', async () => {
  const web = await load();
  let grew = 0;
  for (const p of people()) {
    const base = web.resolveTargets(p);
    if (!base.ready) continue;
    const budget = base.calories + 500;
    const day = web.resolveTargets(p, { budget });
    assert.equal(day.macros.protein, base.macros.protein, 'protein goal does not move');
    assert.ok(day.ranges.protein.max >= base.ranges.protein.max && day.ranges.protein.min >= 0);
    assert.ok(day.macros.carbs > base.macros.carbs && day.limits.sugar >= base.limits.sugar);
    assert.deepEqual(day.ranges.protein, server.proteinRangeAt(p, budget), 'server and client agree on the protein range');
    if (day.ranges.protein.max > base.ranges.protein.max) grew++;
  }
  assert.ok(grew > 50, 'the 35%-of-calories cap really was limiting people on the base target');
});

test('a person at the base cap who eats past the goal on a training day is "in range" once the day is sized to its budget', async () => {
  const web = await load();
  const p = { age: 30, sex: 'male', heightCm: 175, currentWeightKg: 78, activityLevel: 'light', goals: { targetWeightKg: 70, weeklyPaceKg: 0.75, calorieMode: 'auto', proteinTarget: 140 } };
  const base = web.resolveTargets(p), eaten = 146;
  assert.equal(web.rangeStatus(eaten, base.ranges.protein), 'high'); // what the card said: above maximum
  const day = web.resolveTargets(p, { budget: base.calories + 529 });
  assert.equal(web.rangeStatus(eaten, day.ranges.protein), 'ok');
});
