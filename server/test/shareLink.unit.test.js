const test = require('node:test'); const assert = require('node:assert/strict');
const S = require('../lib/shareLink');

const stats = { streak: 6, loggingDays: 5, workouts: 3, workoutMinutes: 95, avgSteps: 8123, avgWaterMl: 2100, weightChangeKg: -0.6, avgCalories: 1840 };

test('tokens are long, unique, hashed, and checked by shape', () => {
  const a = S.newToken(), b = S.newToken();
  assert.notEqual(a, b); assert.ok(S.looksLikeToken(a)); assert.equal(a.length, 32);
  assert.notEqual(S.hashToken(a), a); assert.equal(S.hashToken(a), S.hashToken(a)); assert.ok(!S.looksLikeToken('../etc/passwd'));
});
test('only the selected fields come out; unknown fields are dropped; default has no health numbers', () => {
  const d = S.pick(undefined, stats).map((x) => x.id); assert.deepEqual(d, ['streak', 'loggingDays', 'workouts']);
  const items = S.pick(['steps', 'weight', 'bogus', 'steps'], stats); assert.deepEqual(items.map((x) => x.id), ['steps', 'weight']);
  assert.ok(!JSON.stringify(S.pick(['streak'], stats)).includes('kg') && !JSON.stringify(S.pick(['streak'], stats)).includes('1840'));
  assert.ok(!S.DEFAULT_FIELDS.some((f) => S.FIELDS[f].health));
});
test('missing data says so instead of showing zero', () => {
  assert.equal(S.pick(['weight'], { weightChangeKg: null })[0].value, 'No data yet');
});
test('page escapes markup, is noindex, has no scripts, hides unselected data', () => {
  const html = S.renderPage({ label: '<b>Asha</b>', from: '2026-10-19', to: '2026-10-25', items: S.pick(['streak'], stats) });
  assert.ok(html.includes('noindex') && !html.includes('<script') && html.includes('&lt;b&gt;Asha'));
  assert.ok(!html.includes('1840') && !html.includes('-0.6') && html.includes('6 days'));
  assert.ok(S.notFoundPage().includes('not available'));
});
