// Puts a backup file (the JSON from "Download my data" / the weekly backup link) back into an account.
// Safe to run twice: rows that already exist (same _id) are skipped, never duplicated or overwritten.
// Rows keep their original _id, so links between them (habit logs -> habit, medicine logs -> medicine, recipes -> foods) stay valid.
const ORDER = [
  // [export key, model file]
  ['customFoods', 'Food'], ['habits', 'Habit'], ['medicines', 'Medicine'],       // things other rows point at come first
  ['foodLogs', 'FoodLog'], ['activityLogs', 'ActivityLog'], ['waterLogs', 'WaterLog'], ['weightLogs', 'WeightLog'], ['tasks', 'Task'],
  ['habitLogs', 'HabitLog'], ['medLogs', 'MedLog'], ['templates', 'WorkoutTemplate'], ['healthLogs', 'HealthLog'], ['fasts', 'Fast'], ['goals', 'Goal'],
  ['planTemplates', 'PlanTemplate'], ['recipes', 'Recipe'], ['savedMeals', 'SavedMeal'], ['mealPlans', 'MealPlan'], ['bodyPlanSessions', 'BodyPlanSession'], ['readiness', 'Readiness'],
];
const SINGLE = [['profile', 'Profile'], ['foodPreferences', 'FoodPreference'], ['coachState', 'CoachState'], ['trainingProgram', 'TrainingProgram']];   // one row per person
const HEX = /^[0-9a-f]{24}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** JSON turned ids and dates into text; turn them back (ids by name: _id / ...Id, dates by shape). userId is set to the account being restored. */
function revive(value, ObjectId, userId, key = '') {
  if (Array.isArray(value)) return value.map((x) => revive(x, ObjectId, userId, key));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = k === 'userId' ? userId : revive(v, ObjectId, userId, k);
    return out;
  }
  if (typeof value === 'string') {
    if (HEX.test(value) && (key === '_id' || /Id$/.test(key) || key === 'ref')) return new ObjectId(value);
    if (ISO.test(value)) { const d = new Date(value); if (!Number.isNaN(d.getTime())) return d; }
  }
  return value;
}

/** Quick checks before anything is written. Returns a list of problems (empty = looks like a real backup). */
function validateBackup(data) {
  const problems = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['This is not a backup file (expected a JSON object).'];
  if (!data.exportedAt) problems.push('Missing "exportedAt": not a file from Download my data.');
  if (!data.user || !data.user.email) problems.push('Missing the account email.');
  for (const [key] of ORDER) if (data[key] != null && !Array.isArray(data[key])) problems.push(`"${key}" should be a list.`);
  return problems;
}

/**
 * @param data     parsed backup JSON
 * @param userId   the account to restore INTO (must exist already: sign up again first if it was deleted)
 * @param opts     { apply: false } (default is a dry run: counts only), { models } to inject test doubles, { mongoose }
 * @returns        { applied, counts: { key: { inFile, inserted, skipped } } }
 */
async function restoreBackup(data, userId, { apply = false, models, mongoose } = {}) {
  const problems = validateBackup(data);
  if (problems.length) throw new Error(problems.join(' '));
  const mg = mongoose || require('mongoose');
  const ObjectId = mg.Types.ObjectId;
  const uid = new ObjectId(String(userId));
  const model = (name) => (models && models[name]) || require(`../models/${name}`);
  const counts = {};
  for (const [key, name] of ORDER) {
    const rows = Array.isArray(data[key]) ? data[key] : [];
    if (!rows.length) continue;
    const docs = rows.map((r) => revive(r, ObjectId, uid));
    const c = { inFile: docs.length, inserted: 0, skipped: 0 };
    if (apply) {
      try { const r = await model(name).collection.insertMany(docs, { ordered: false }); c.inserted = r.insertedCount; }
      catch (e) {
        if (e && e.writeErrors && e.writeErrors.every((w) => w.code === 11000 || (w.err && w.err.code === 11000))) c.inserted = e.result && e.result.insertedCount != null ? e.result.insertedCount : docs.length - e.writeErrors.length;
        else throw e;
      }
      c.skipped = c.inFile - c.inserted;
    }
    counts[key] = c;
  }
  for (const [key, name] of SINGLE) {
    if (!data[key]) continue;
    const c = { inFile: 1, inserted: 0, skipped: 0 };
    if (apply) {
      const exists = await model(name).collection.findOne({ userId: uid });
      if (exists) c.skipped = 1; else { await model(name).collection.insertOne(revive(data[key], ObjectId, uid)); c.inserted = 1; }
    }
    counts[key] = c;
  }
  return { applied: !!apply, counts };
}

module.exports = { restoreBackup, validateBackup, revive, ORDER, SINGLE };
