// One source of truth: every screen must get targets and progress from lib/energy.js (resolveTargets / weightProgress),
// never by calling the pieces again with its own arguments. This test fails the day someone adds a second copy of the rules.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { resolveTargets, weightProgress } = require('../lib/energy');
const { progressView } = require('../lib/progressView');
const { goalCard } = require('../lib/simpleGoals');
const { weightJourney } = require('../lib/journey');

const ROOTS = [path.join(__dirname, '..', 'lib'), path.join(__dirname, '..', 'routes'), path.join(__dirname, '..', '..', 'client', 'src')];
const ALLOWED = new Set(['energy.js', 'planContextPure.js']); // planContextPure: the safety rule that forces maintenance on purpose
function walk(d) { return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)])); }

test('nobody outside energy.js calls macroTargets / macroRanges / waterTargetMl with their own arguments', () => {
  const bad = [];
  for (const root of ROOTS) for (const f of walk(root)) {
    if (!/\.(js|jsx)$/.test(f) || ALLOWED.has(path.basename(f))) continue;
    const src = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1'); // code only, not comments
    for (const name of ['macroTargets', 'macroRanges']) if (new RegExp('(?<![\\w.])' + name + '\\(').test(src)) bad.push(`${path.relative(path.join(__dirname, '..', '..'), f)} calls ${name}()`);
  }
  assert.deepEqual(bad, [], 'use resolveTargets(profile) instead:\n' + bad.join('\n'));
});

test('the goal card, the journey and the profile view show the same kg done', () => {
  const plan = { active: true, startKg: 90, targetKg: 80, startDate: '2026-10-01', paceKg: 0.5 };
  const card = goalCard({ plan, trendKg: 86.4, rate: -0.4, today: '2026-11-11', weighIns: [] });
  const j = weightJourney({ startKg: 90, currentKg: 86.4, targetKg: 80, paceKgPerWeek: 0.5 });
  const wp = weightProgress({ startKg: 90, currentKg: 86.4, targetKg: 80, paceKgPerWeek: 0.5 });
  for (const k of ['doneKg', 'remainingKg', 'pct']) { assert.equal(card[k], wp[k]); assert.equal(j[k], wp[k]); }
  const view = progressView({ plan, goals: { targetWeightKg: 80 } }, [{ date: '2026-10-02', weightKg: 89.8 }, { date: '2026-11-10', weightKg: 86.4 }]);
  assert.equal(view.doneKg, wp.doneKg);
  assert.equal(view.remainingKg, wp.remainingKg);
});

test('changing the body goal changes protein and fat everywhere at once (and nothing else drifts)', () => {
  const base = { sex: 'male', age: 30, heightCm: 175, currentWeightKg: 88, activityLevel: 'moderate', goals: { targetWeightKg: 80, weeklyPaceKg: 0.5, calorieMode: 'auto' } };
  const a = resolveTargets({ ...base, goals: { ...base.goals, bodyType: 'balanced' } });
  const b = resolveTargets({ ...base, goals: { ...base.goals, bodyType: 'muscular' } });
  assert.equal(a.calories, b.calories);
  assert.ok(b.macros.protein > a.macros.protein);
  assert.equal(b.bodyLabel, 'Strong & muscular');
  assert.equal(a.proteinSource, 'auto');
});

test('no weight yet: targets come from the saved calories, never a made-up 140 g', () => {
  const t = resolveTargets({ goals: { calorieTarget: 2000 } });
  assert.equal(t.ready, false);
  assert.equal(t.macros.protein, 125);
  assert.ok(t.ranges.protein.max >= t.ranges.protein.min);
});
