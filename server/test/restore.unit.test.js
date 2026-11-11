const test = require('node:test');
const assert = require('node:assert/strict');
const { restoreBackup, validateBackup, revive } = require('../lib/restore');

class OID { constructor(s) { if (!/^[0-9a-f]{24}$/i.test(String(s))) throw new Error('bad id'); this.s = String(s).toLowerCase(); } toString() { return this.s; } }
const fakeMongoose = { Types: { ObjectId: OID } };
const U = 'aaaaaaaaaaaaaaaaaaaaaaaa', H = 'bbbbbbbbbbbbbbbbbbbbbbbb', L = 'cccccccccccccccccccccccc';

const backup = () => ({
  exportedAt: '2026-11-05T10:00:00.000Z', user: { name: 'A', email: 'a@x.dev' },
  habits: [{ _id: H, userId: 'old', name: 'Walk', createdAt: '2026-10-01T08:00:00.000Z' }],
  habitLogs: [{ _id: L, userId: 'old', habitId: H, date: '2026-10-02', completed: true }],
  foodLogs: [{ _id: 'dddddddddddddddddddddddd', userId: 'old', date: '2026-10-02', foodName: 'Rice', nutritionTotal: { calories: 200 } }],
  recipes: [{ _id: 'eeeeeeeeeeeeeeeeeeeeeeee', userId: 'old', name: 'Dal', ingredients: [{ _id: 'ffffffffffffffffffffffff', foodId: 'abababababababababababab', quantity: 1 }] }],
  profile: { _id: '111111111111111111111111', userId: 'old', heightCm: 170 },
});
function fakeModels({ existing = new Set() } = {}) {
  const store = {}; const models = {};
  for (const n of ['Food', 'Habit', 'Medicine', 'FoodLog', 'ActivityLog', 'WaterLog', 'WeightLog', 'Task', 'HabitLog', 'MedLog', 'WorkoutTemplate', 'HealthLog', 'Fast', 'Goal', 'PlanTemplate', 'Recipe', 'SavedMeal', 'MealPlan', 'BodyPlanSession', 'Profile', 'FoodPreference', 'CoachState', 'TrainingProgram']) {
    store[n] = []; models[n] = { collection: {
      async insertMany(docs) { const fresh = docs.filter((d) => !existing.has(String(d._id))); store[n].push(...fresh);
        if (fresh.length < docs.length) { const e = new Error('dup'); e.writeErrors = docs.filter((d) => existing.has(String(d._id))).map(() => ({ code: 11000 })); e.result = { insertedCount: fresh.length }; throw e; }
        return { insertedCount: fresh.length }; },
      async insertOne(d) { store[n].push(d); }, async findOne() { return existing.has(`single-${n}`) ? {} : null; } } };
  }
  return { store, models };
}

test('revive: ids and dates come back as ids and dates, userId is replaced, plain strings stay', () => {
  const r = revive(backup().recipes[0], OID, new OID(U));
  assert.ok(r._id instanceof OID); assert.equal(String(r.userId), U);
  assert.ok(r.ingredients[0].foodId instanceof OID); assert.ok(r.ingredients[0]._id instanceof OID);
  const h = revive(backup().habits[0], OID, new OID(U)); assert.ok(h.createdAt instanceof Date); assert.equal(h.name, 'Walk');
  assert.equal(revive({ date: '2026-10-02', note: 'aaaaaaaaaaaaaaaaaaaaaaaa' }, OID, new OID(U)).note, 'aaaaaaaaaaaaaaaaaaaaaaaa'); // not an id field: left alone
  assert.equal(revive({ date: '2026-10-02' }, OID, new OID(U)).date, '2026-10-02');                                                      // a day stays text
});
test('validate: rejects things that are not a backup', () => {
  assert.ok(validateBackup(null).length); assert.ok(validateBackup([]).length); assert.ok(validateBackup({}).length);
  assert.ok(validateBackup({ exportedAt: 'x', user: { email: 'a@x' }, foodLogs: 'nope' })[0].includes('foodLogs'));
  assert.deepEqual(validateBackup(backup()), []);
  assert.throws(() => { throw new Error(validateBackup({}).join(' ')); }, /not a file from Download my data/);
});
test('dry run counts rows and writes nothing', async () => {
  const { store, models } = fakeModels();
  const r = await restoreBackup(backup(), U, { models, mongoose: fakeMongoose });
  assert.equal(r.applied, false); assert.equal(r.counts.habitLogs.inFile, 1); assert.equal(r.counts.profile.inFile, 1);
  assert.ok(Object.values(store).every((a) => a.length === 0));
});
test('apply writes everything with the new userId, keeps ids so links stay valid, parents first', async () => {
  const { store, models } = fakeModels();
  const r = await restoreBackup(backup(), U, { apply: true, models, mongoose: fakeMongoose });
  assert.equal(r.counts.habits.inserted, 1); assert.equal(r.counts.recipes.inserted, 1); assert.equal(r.counts.profile.inserted, 1);
  assert.equal(String(store.HabitLog[0].habitId), String(store.Habit[0]._id));
  assert.equal(String(store.FoodLog[0].userId), U);
  const keys = Object.keys(r.counts); assert.ok(keys.indexOf('habits') < keys.indexOf('habitLogs'));
});
test('running it twice does not duplicate: existing rows are skipped and counted', async () => {
  const { models } = fakeModels({ existing: new Set([H, L, 'single-Profile']) });
  const r = await restoreBackup(backup(), U, { apply: true, models, mongoose: fakeMongoose });
  assert.deepEqual(r.counts.habits, { inFile: 1, inserted: 0, skipped: 1 });
  assert.deepEqual(r.counts.habitLogs, { inFile: 1, inserted: 0, skipped: 1 });
  assert.deepEqual(r.counts.foodLogs, { inFile: 1, inserted: 1, skipped: 0 });
  assert.deepEqual(r.counts.profile, { inFile: 1, inserted: 0, skipped: 1 });
});
test('a real (non-duplicate) database error is not swallowed', async () => {
  const { models } = fakeModels(); models.FoodLog.collection.insertMany = async () => { const e = new Error('disk full'); e.writeErrors = [{ code: 12345 }]; throw e; };
  await assert.rejects(restoreBackup(backup(), U, { apply: true, models, mongoose: fakeMongoose }), /disk full/);
});
