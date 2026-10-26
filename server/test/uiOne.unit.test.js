const test = require('node:test'); const assert = require('node:assert/strict');
const { featureView, CORE, ALL } = require('../lib/features');
const { nextStep } = require('../lib/nextStep');
const { toneCheck } = require('../lib/safety');

test('new user sees only the core set plus profile', () => {
  const v = featureView({ counts: {} });
  assert.deepEqual(v.visible.sort(), ['profile', ...CORE].sort());
  assert.ok(v.locked.length >= 5); assert.deepEqual(v.newlyUnlocked, []);
  assert.ok(v.locked.every((l) => l.hint));
});
test('usage unlocks features and reports each once', () => {
  let v = featureView({ counts: { foodLogs: 5, activeDays: 3 }, seen: [] });
  assert.ok(v.visible.includes('recipes') && v.visible.includes('health') && !v.visible.includes('habit'));
  assert.deepEqual(v.newlyUnlocked.sort(), ['health', 'recipes']);
  v = featureView({ counts: { foodLogs: 5, activeDays: 3 }, seen: ['recipes', 'health'] });
  assert.deepEqual(v.newlyUnlocked, []);
});
test('show all reveals everything, deletes nothing, announces nothing', () => {
  const v = featureView({ counts: {}, showAll: true });
  assert.equal(v.visible.length, ALL.length); assert.deepEqual(v.newlyUnlocked, []);
  const back = featureView({ counts: {}, showAll: false });   // switching back keeps the same simple set
  assert.ok(back.visible.length < ALL.length);
});
test('junk counts are ignored', () => {
  const v = featureView({ counts: { foodLogs: -3, activeDays: 'x', weightLogs: NaN } });
  assert.deepEqual(v.counts, { foodLogs: 0, plannedDays: 0, weightLogs: 0, activeDays: 0 });
});
test('next step follows the day', () => {
  assert.equal(nextStep({ hour: 8, meals: {} }).id, 'breakfast');
  assert.equal(nextStep({ hour: 8, meals: { breakfast: 300 }, waterTargetMl: 2000, waterMl: 0 }).id, 'water-am');
  assert.equal(nextStep({ hour: 12, meals: { breakfast: 300 } }).id, 'lunch');
  assert.equal(nextStep({ hour: 14, meals: { breakfast: 1, lunch: 1 }, waterTargetMl: 2000, waterMl: 400 }).id, 'water');
  assert.equal(nextStep({ hour: 16, meals: { breakfast: 1, lunch: 1 }, waterTargetMl: 2000, waterMl: 1500, stepsTarget: 8000, steps: 1000 }).id, 'steps');
  assert.equal(nextStep({ hour: 19, meals: { breakfast: 1, lunch: 1, dinner: 1 }, budget: 1800, eaten: 2200 }).id, 'fix');
  assert.equal(nextStep({ hour: 19, meals: { breakfast: 1, lunch: 1 } }).id, 'dinner');
  assert.equal(nextStep({ hour: 21, meals: { breakfast: 1, lunch: 1, dinner: 1 } }).id, 'wind-down');
});
test('next step copy never shames and always has valid shape', () => {
  for (let h = 0; h < 24; h++) for (const m of [{}, { breakfast: 1, lunch: 1, dinner: 1 }]) {
    const s = nextStep({ hour: h, meals: m, budget: 1500, eaten: 2000, waterTargetMl: 2000, steps: 0, stepsTarget: 8000 });
    assert.ok(s.id && s.text && s.scene); assert.ok(!toneCheck || toneCheck(s.text).ok !== false, s.text);
  }
});
