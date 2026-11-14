// Database side of weighing scales. EVERY analysis that needs weights goes through here, so a reading from a different scale can
// never reach a trend, a calorie plan or a coach decision uncalibrated (see weightScales.js for the maths).
const WeightLog = require('../models/WeightLog');
const Profile = require('../models/Profile');
const W = require('./weightScales');

/** The clean scale list of one user: { scales, referenceId }. A user who never added a scale has the single main scale. */
async function scalesOf(uid) {
  let p = null;
  try { p = await Profile.findOne({ userId: uid }).select('weightScales referenceScaleId').lean(); } catch { /* no profile yet: the single main scale */ }
  return W.normalizeScales(p && p.weightScales, p && p.referenceScaleId);
}

/** Entries (each calibrated, so `weightKg` is on the reference scale and `rawKg` is what the scale showed). Newest first by default. */
async function weightEntries(uid, filter = {}, { sort = -1, limit = 0, select = '' } = {}) {
  let q = WeightLog.find({ userId: uid, ...filter }).sort({ date: sort, createdAt: sort });
  if (limit) q = q.limit(limit);
  if (select) q = q.select(select + ' scaleId');
  const [rows, { scales }] = await Promise.all([q.lean(), scalesOf(uid)]);
  return W.calibrate(rows, scales);
}

/** One calibrated point per date, ascending: [{date, weightKg, readings}]. `filter` is a WeightLog filter, e.g. { date: { $gte, $lte } }. */
async function weightPoints(uid, filter = {}, opts = {}) {
  return W.daily(await weightEntries(uid, filter, { ...opts, select: 'date weightKg' }));
}

/** The newest weigh-in on the reference scale (a day with two scales gives that day's mean), or null. */
async function latestWeightKg(uid) {
  const last = await WeightLog.findOne({ userId: uid }).sort({ date: -1, createdAt: -1 }).select('date').lean();
  if (!last) return null;
  const pts = await weightPoints(uid, { date: last.date });
  return pts.length ? pts[pts.length - 1].weightKg : null;
}

/** Re-learn every auto offset from the user's same-day pairs and store them. Returns the new clean list. */
async function relearn(uid) {
  const cur = await scalesOf(uid);
  if (cur.scales.length < 2) return cur;
  const logs = await WeightLog.find({ userId: uid }).select('date weightKg scaleId').lean();
  const scales = W.learnOffsets(cur.scales, logs, cur.referenceId);
  await Profile.updateOne({ userId: uid }, { $set: { weightScales: scales, referenceScaleId: cur.referenceId } });
  return { scales, referenceId: cur.referenceId };
}

module.exports = { scalesOf, weightEntries, weightPoints, latestWeightKg, relearn };
