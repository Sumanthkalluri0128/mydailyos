const test = require('node:test');
const assert = require('node:assert');
const { planTrendKg } = require('../lib/trendWeight');
const { proteinInRange, dayHits, dailyQuests } = require('../lib/journey');
const { goalCard } = require('../lib/simpleGoals');
const { addDays } = require('../lib/dates');

const TODAY = '2026-11-03';
const plan = { active: true, startKg: 80, targetKg: 72, startDate: addDays(TODAY, -21), paceKg: 0.5 };

test('goal progress follows your recent weigh-ins, not a lagging line seeded with the start weight', () => {
  const w = [18, 15, 12, 9, 6, 3, 1].map((n, i) => ({ date: addDays(TODAY, -n), weightKg: 79 - i * 0.3 })); // 79.0 -> 77.2
  const now = planTrendKg(plan, w, null);
  assert.ok(now < 78.2 && now > 77.2, `average of the last 7 days, got ${now}`);
  const g = goalCard({ plan, trendKg: now, today: TODAY, weighIns: w });
  assert.ok(g.doneKg >= 1.8, `expected at least 1.8 kg done, got ${g.doneKg}`);
  assert.match(g.basisLine, /last 7 days/);
});

test('no weigh-in since the plan started means 0 kg done, never a guess', () => {
  assert.equal(planTrendKg(plan, [{ date: addDays(TODAY, -40), weightKg: 90 }], null), 80);
});

test('one weigh-in a day: the last one wins', () => {
  const now = planTrendKg(plan, [{ date: addDays(TODAY, -1), weightKg: 79 }, { date: addDays(TODAY, -1), weightKg: 78 }], null);
  assert.equal(now, 78);
});

test('protein in range is completed; below or above the range is not', () => {
  const t = { protein: 120, proteinMin: 96, proteinMax: 160, calories: 2000, direction: 'lose', waterMl: 3000 };
  assert.equal(proteinInRange(95, t), false);
  assert.equal(proteinInRange(96, t), true);
  assert.equal(proteinInRange(130, t), true);
  assert.equal(proteinInRange(161, t), false);
  assert.equal(dayHits({ protein: 130 }, t).protein, true);
  const q = dailyQuests({ protein: 130 }, t, 0).quests.find((x) => x.id === 'protein');
  assert.equal(q.done, true);
  assert.match(q.hint, /In range/);
});

test('without a range the old rule (90% of the goal) still applies', () => {
  assert.equal(proteinInRange(108, { protein: 120 }), true);
  assert.equal(proteinInRange(107, { protein: 120 }), false);
});
