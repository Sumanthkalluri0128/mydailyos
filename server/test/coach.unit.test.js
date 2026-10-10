const test = require('node:test');
const assert = require('node:assert/strict');
const { swapFor } = require('../lib/swaps');
const { adaptiveMaintenance } = require('../lib/adaptiveTdee');
const { buildCoach } = require('../lib/weeklyCoach');

const mk = (n, f) => Array.from({ length: n }, (_, i) => ({ date: new Date(Date.UTC(2026, 9, 10) - (n - 1 - i) * 86400000).toISOString().slice(0, 10), ...f(i) }));

test('swaps suggest a lighter option only for foods that have one', () => {
  assert.ok(swapFor('Butter chicken (restaurant, 1 bowl)'));
  assert.equal(swapFor('Boiled egg'), null);
});

test('adaptive maintenance: eating 1700 while losing 0.2 kg/week means burning more than 1700', () => {
  const days = mk(35, (i) => ({ calories: 1700, weightKg: i % 2 ? 80 - i * 0.03 : null }));
  const m = adaptiveMaintenance(days, 2400);
  assert.ok(m.estimate > 1700 && m.estimate < 2200);
  assert.equal(m.confidence, 'high');
  assert.equal(adaptiveMaintenance(mk(10, () => ({ calories: 1700, weightKg: 80 })), 2400), null, 'too little data -> no estimate');
});

test('weekly budget counts unlogged days as on budget, never as spare calories', () => {
  const days = mk(35, (i) => ({ calories: i % 2 ? 0 : 1000, weightKg: null, protein: 0, waterMl: 0, exerciseMinutes: 0 }));
  const out = buildCoach({ days, targets: { calories: 1600 }, today: '2026-10-10' });
  assert.equal(out.weekBudget.budget, 11200);
  assert.ok(out.weekBudget.usedBeforeToday >= 1000 * 2 + 1600 * 2, 'unlogged days count at the target');
});
