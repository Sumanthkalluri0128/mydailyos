const test = require('node:test');
const assert = require('node:assert');
const { resolveStart, startChoice } = require('../lib/planStart');

const T = '2026-11-03';
const plan = { active: true, startKg: 80.3, startDate: '2026-10-01', targetKg: 72.5 };

test('re-saving an active plan keeps the old start unless a fresh start is asked for', () => {
  assert.deepEqual(resolveStart({ plan, requested: undefined, currentKg: 77.4, today: T }), { mode: 'keep', startKg: 80.3, startDate: '2026-10-01' });
  assert.deepEqual(resolveStart({ plan, requested: 'keep', currentKg: 77.4, today: T }), { mode: 'keep', startKg: 80.3, startDate: '2026-10-01' });
  assert.deepEqual(resolveStart({ plan, requested: 'fresh', currentKg: 77.4, today: T }), { mode: 'fresh', startKg: 77.4, startDate: T });
  assert.equal(resolveStart({ plan, requested: 'nonsense', currentKg: 77.4, today: T }).mode, 'keep');
});

test('a first plan (or one that is switched off) always starts fresh', () => {
  assert.equal(resolveStart({ plan: null, requested: 'keep', currentKg: 77.4, today: T }).startKg, 77.4);
  assert.equal(resolveStart({ plan: { ...plan, active: false }, requested: undefined, currentKg: 77.4, today: T }).mode, 'fresh');
});

test('the prompt is only offered when there is an old start that differs from today', () => {
  assert.equal(startChoice({ plan: null, currentKg: 77.4, today: T }), null);
  assert.equal(startChoice({ plan: { ...plan, startKg: 77.4, startDate: T }, currentKg: 77.4, today: T }), null);
  const c = startChoice({ plan, currentKg: 77.4, today: T });
  assert.deepEqual(c.keep, { startKg: 80.3, startDate: '2026-10-01' });
  assert.deepEqual(c.fresh, { startKg: 77.4, startDate: T });
});
