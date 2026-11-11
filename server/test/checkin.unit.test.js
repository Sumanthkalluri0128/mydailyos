const test = require('node:test');
const assert = require('node:assert/strict');
const { pickSleep, coachAdvice, SLEEP_CHOICES, ENERGY_CHOICES } = require('../lib/checkin');
const { toneCheck } = require('../lib/safety');

test('Health Connect hours beat a tapped answer for the same day', () => {
  assert.deepEqual(pickSleep([{ value: 5.5, source: 'manual' }, { value: 7.2, source: 'device' }]), { hours: 7.2, source: 'device' });
  assert.deepEqual(pickSleep([{ value: 5.5, source: 'manual' }]), { hours: 5.5, source: 'manual' });
  assert.deepEqual(pickSleep([]), { hours: null, source: null });
  assert.deepEqual(pickSleep([{ value: 0, source: 'device' }]), { hours: null, source: null });
});
test('coach: short sleep or low energy suggests an easier day, good sleep and energy suggests a hard one', () => {
  assert.equal(coachAdvice({ sleepHours: 4.5 }).level, 'easy');
  assert.equal(coachAdvice({ sleepHours: 8, energy: 1 }).level, 'easy');
  assert.equal(coachAdvice({ energy: 2 }).level, 'easy');
  assert.equal(coachAdvice({ sleepHours: 6.5, energy: 3 }).level, 'normal');
  assert.equal(coachAdvice({ sleepHours: 7.5, energy: 4 }).level, 'push');
  assert.equal(coachAdvice({ sleepHours: 8 }).level, 'push');
  assert.equal(coachAdvice({}).level, 'unknown');
});
test('coach: an easy day points at the Quick 20, and short sleep mentions cravings', () => {
  const a = coachAdvice({ sleepHours: 5 });
  assert.match(a.workout, /Quick 20/); assert.match(a.food, /cravings/);
});
test('all wording is calm (no shaming words)', () => {
  for (const args of [{ sleepHours: 4 }, { energy: 1 }, { sleepHours: 7.5, energy: 5 }, { sleepHours: 7, energy: 3 }]) {
    const a = coachAdvice(args);
    assert.equal(toneCheck(`${a.headline} ${a.workout} ${a.food}`).ok, true);
  }
});
test('answers are one tap: 5 sleep choices and 5 energy choices, hours rise with each choice', () => {
  assert.equal(SLEEP_CHOICES.length, 5); assert.equal(ENERGY_CHOICES.length, 5);
  assert.deepEqual(SLEEP_CHOICES.map((c) => c.hours), [...SLEEP_CHOICES.map((c) => c.hours)].sort((a, b) => a - b));
});
