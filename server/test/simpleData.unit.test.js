// Smoke test for the loader with the database layer stubbed (no MongoDB needed).
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { addDays } = require('../lib/dates');

const TODAY = '2026-10-21';
const stub = (rel, exp) => { const f = require.resolve(path.join('..', rel)); require.cache[f] = { id: f, filename: f, loaded: true, exports: exp }; };
const q = (rows) => { const o = { sort: () => o, select: () => o, lean: async () => rows, then: (r) => r(rows) }; return o; };
const updates = [];
const profile = { sex: 'male', age: 26, heightCm: 173, currentWeightKg: 79, activityLevel: 'moderate', goals: { targetWeightKg: 72, weeklyPaceKg: 0.5, proteinTarget: 120, waterTargetMl: 3000, stepsTarget: 8000, calorieMode: 'auto', calorieTarget: 2000 }, plan: { active: true, startKg: 80, startDate: addDays(TODAY, -28), targetKg: 72, paceKg: 0.5 }, journey: {}, targetHistory: [{ date: addDays(TODAY, -2), key: 'stepsTarget', label: 'Steps', from: 7000, to: 8000, reason: 'you asked for it' }] };
stub('models/Profile.js', { findOne: () => q(profile), updateOne: async (...a) => { updates.push(a); } });
stub('models/Goal.js', { find: () => q([]) });
stub('models/WeightLog.js', { find: () => q([{ date: addDays(TODAY, -28), weightKg: 80 }, { date: addDays(TODAY, -14), weightKg: 79.4 }, { date: addDays(TODAY, -1), weightKg: 78.8 }]) });
stub('models/FoodLog.js', { distinct: async () => Array.from({ length: 10 }, (_, i) => addDays(TODAY, -i)) });
stub('models/HealthLog.js', { find: () => q([]) });
stub('models/ActivityLog.js', { find: () => q([]) });
stub('lib/progress.js', {
  buildHistory: async () => ({ days: Array.from({ length: 10 }, (_, i) => ({ date: addDays(TODAY, -9 + i), calories: 1900, protein: 115, waterMl: 3100, steps: 8200, exerciseMinutes: 20, tasksCompleted: 0, habitsCompleted: 0, weighIn: false })) }),
  lifetimeTotals: async () => ({ tasksCompleted: 0, workouts: 2, foodEntries: 30, weighIns: 3, waterLiters: 20, habitCompletions: 0 }),
});

test('loadSimple builds the whole one-screen payload and persists the level floor and badge dates', async () => {
  const { loadSimple } = require('../lib/simpleData');
  const r = await loadSimple('u1', TODAY);
  assert.equal(r.goal.active, true);
  assert.match(r.goal.progressLine, /kg done of 8 kg/);
  assert.ok(r.focus.total <= 3);
  assert.ok(r.level.level >= 1);
  assert.equal(r.badges.shelves.length, 4);
  assert.ok(r.weeklyScore.parts.length === 3);
  assert.equal(r.targets.basic.length, 5);
  assert.match(r.updatedLine, /^Updated your steps target/);
  assert.ok(updates.length >= 1, 'floor / earnedAt saved');
  assert.ok(r.copy.goal && r.copy.status);
});
