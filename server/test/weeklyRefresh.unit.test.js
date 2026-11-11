// When the cached weekly decision may be re-checked early, and the ids that keep a queued "Apply" tap honest.
const test = require('node:test');
const assert = require('node:assert/strict');
const { signalsOf, shouldRefresh, sessionsMoved, decisionId } = require('../lib/weeklyRefresh');

const base = { recoveryLow: false, waistDates: [], weighIns14: 7, foodDays14: 9, sessionStamp: '3:2026-11-01', strengthStatus: 'flat' };
const sig = (o = {}) => signalsOf({ ...base, ...o });
const dec = (o = {}) => ({ action: 'WAIT_ONE_MORE', applied: false, apply: null, ...o });
const T = '2026-11-10';

test('signals: waist readings count, and two readings 14+ days apart make a comparison possible', () => {
  assert.equal(sig().waistCount, 0);
  assert.equal(sig({ waistDates: ['2026-11-01'] }).compositionReady, false);
  assert.equal(sig({ waistDates: ['2026-10-20', '2026-11-05'] }).compositionReady, true);
  assert.equal(sig({ waistDates: ['2026-11-01', '2026-11-01'] }).waistCount, 1);       // the same day twice is one reading
  assert.equal(sig({ weighIns14: 5 }).weighInsOk, false);
  assert.equal(sig({ foodDays14: 8 }).foodDaysOk, true);
});

test('a new low-recovery pattern, and its end, re-check the decision', () => {
  assert.deepEqual(shouldRefresh({ prev: sig(), next: sig({ recoveryLow: true }), decision: dec(), today: T }), { refresh: true, reason: 'recovery-low', adopt: false });
  assert.equal(shouldRefresh({ prev: sig({ recoveryLow: true }), next: sig(), decision: dec(), today: T }).reason, 'recovery-back');
});

test('the first waist reading, enough readings to compare, and enough data re-check; nothing else does', () => {
  assert.equal(shouldRefresh({ prev: sig(), next: sig({ waistDates: ['2026-11-09'] }), decision: dec(), today: T }).reason, 'measurement');
  assert.equal(shouldRefresh({ prev: sig({ waistDates: ['2026-11-01'] }), next: sig({ waistDates: ['2026-11-01', '2026-11-09'] }), decision: dec(), today: T }).refresh, false);   // second reading only 8 days later: not comparable yet
  assert.equal(shouldRefresh({ prev: sig({ waistDates: ['2026-10-20'] }), next: sig({ waistDates: ['2026-10-20', '2026-11-09'] }), decision: dec(), today: T }).reason, 'measurement');
  assert.equal(shouldRefresh({ prev: sig({ weighIns14: 5 }), next: sig({ weighIns14: 6 }), decision: dec({ action: 'NEED_DATA' }), today: T }).reason, 'data');
  assert.equal(shouldRefresh({ prev: sig(), next: sig({ weighIns14: 12, foodDays14: 14 }), decision: dec(), today: T }).refresh, false);   // more of the same is not news
});

test('a strength trend that flipped after new sessions and RPE taps re-checks', () => {
  assert.equal(shouldRefresh({ prev: sig(), next: sig({ strengthStatus: 'down' }), decision: dec(), today: T }).reason, 'strength');
  assert.equal(shouldRefresh({ prev: sig({ strengthStatus: null }), next: sig({ strengthStatus: 'down' }), decision: dec(), today: T }).refresh, false);   // unknown before: nothing to compare
  assert.equal(sessionsMoved(sig(), sig({ sessionStamp: '4:2026-11-09' })), true);
  assert.equal(sessionsMoved(sig(), sig()), false);
});

test('guards: applied decisions wait for their effect, one re-check a day, old decisions are adopted, no profile no re-check', () => {
  const low = sig({ recoveryLow: true });
  assert.equal(shouldRefresh({ prev: sig(), next: low, decision: dec({ applied: true }), today: T }).refresh, false);
  assert.equal(shouldRefresh({ prev: sig(), next: low, decision: dec(), refreshedOn: T, today: T }).refresh, false);
  assert.equal(shouldRefresh({ prev: sig(), next: low, decision: dec(), refreshedOn: '2026-11-09', today: T }).refresh, true);
  assert.deepEqual(shouldRefresh({ prev: null, next: low, decision: dec(), today: T }), { refresh: false, reason: '', adopt: true });
  assert.equal(shouldRefresh({ prev: sig(), next: low, decision: dec({ action: 'NEED_PROFILE' }), today: T }).refresh, false);
});

test('decision ids change with the suggestion, so a stale queued tap cannot apply a different one', () => {
  const a = decisionId({ action: 'LADDER_STEPS', apply: { type: 'steps', stepsTarget: 11500, from: 10000 } });
  const b = decisionId({ action: 'LADDER_STEPS', apply: { type: 'steps', stepsTarget: 13000, from: 11500 } });
  assert.match(a, /^LADDER_STEPS:[0-9a-f]{8}$/);
  assert.notEqual(a, b);
  assert.equal(a, decisionId({ action: 'LADDER_STEPS', apply: { type: 'steps', stepsTarget: 11500, from: 10000 } }));
  assert.equal(decisionId(null), '');
});
