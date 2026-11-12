const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../lib/setText');
const { LIB } = require('../lib/exerciseLibrary');

const cands = [...LIB.map((e) => ({ id: e.id, name: e.name, source: 'plan' })), { id: 'a1', name: 'Treadmill run', source: 'activity' }, { id: 'a2', name: 'Pull-up', source: 'activity' }];

test('sets x reps at a weight', () => {
  const [e] = S.parseWorkoutText('bench press 3x10 @ 60kg', cands);
  assert.equal(e.sets.length, 3); assert.deepEqual(e.sets[0], { reps: 10, weightKg: 60, seconds: 0 });
});
test('words: "4 sets of 8 at 80" and pounds convert to kg', () => {
  assert.deepEqual(S.parseSets(' 4 sets of 8 at 80').sets.map((s) => [s.reps, s.weightKg]), [[8, 80], [8, 80], [8, 80], [8, 80]]);
  assert.equal(S.parseSets(' 3x5 @ 135 lb').sets[0].weightKg, 61.2);
});
test('a list of weight x reps pairs keeps each set', () => {
  const r = S.parseSets(' 60kg x 10, 65kg x 8, 70kg x 6').sets;
  assert.deepEqual(r.map((s) => [s.weightKg, s.reps]), [[60, 10], [65, 8], [70, 6]]);
  assert.deepEqual(S.parseSets(' 60x10').sets, [{ reps: 10, weightKg: 60, seconds: 0 }]);
});
test('bodyweight lists and timed holds', () => {
  assert.deepEqual(S.parseSets(' 20, 15, 10').sets.map((s) => s.reps), [20, 15, 10]);
  assert.equal(S.parseSets(' 60s').sets[0].seconds, 60);
  assert.equal(S.parseSets(' 2 min').seconds, 120);
});
test('several exercises in one note, split by commas, lines and semicolons', () => {
  const r = S.parseWorkoutText('bench press 3x10 @ 60kg, squats 4x8 @ 80; pull ups 3x8\nplank 60s', cands);
  assert.deepEqual(r.map((x) => x.name), ['bench press', 'squats', 'pull ups', 'plank']);
  assert.deepEqual(r.map((x) => x.sets.length), [3, 4, 3, 1]);
  const pairs = S.parseWorkoutText('bench 60kg x 10, 65kg x 8', cands);
  assert.equal(pairs.length, 1); assert.equal(pairs[0].sets.length, 2);
});
test('shorthand and spelling variants find the right exercise', () => {
  const pick = (t) => S.matchExercise(t, cands).match?.name || null;
  assert.match(pick('push ups'), /push-up/i);
  assert.match(pick('rdl'), /romanian deadlift/i);
  assert.match(pick('db bench press'), /dumbbell bench press/i);
  assert.match(pick('hip thrust'), /hip thrust/i);
  assert.match(pick('leg press'), /^leg press$/i);
  assert.equal(S.matchExercise('leg press', cands).confidence, 'high');
});
test('unknown names are returned unmatched, not guessed', () => {
  const [e] = S.parseWorkoutText('zorblax flapper 3x10', cands);
  assert.equal(e.match, null); assert.equal(e.confidence, 0);
});
test('a name with no numbers still shows up and asks for sets', () => {
  const [e] = S.parseWorkoutText('leg press', cands);
  assert.equal(e.needsSets, true); assert.equal(e.sets.length, 0);
});
