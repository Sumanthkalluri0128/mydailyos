// Database helpers shared by the template and training routes. Kept thin: all the rules live in the pure libs.
const ActivityLog = require('../models/ActivityLog');
const { computeRecords } = require('./records');
const { newRecords } = require('./strength');

/** Map name -> record from everything logged BEFORE this workout (so a new log is compared with the past). */
async function priorRecords(userId, names, beforeIds = []) {
  if (!names.length) return new Map();
  const logs = await ActivityLog.find({ userId, activityName: { $in: names }, 'sets.0': { $exists: true }, _id: { $nin: beforeIds } }).select('activityName date sets').lean();
  return new Map(computeRecords(logs).map((r) => [r.activityName, r]));
}

/** Records broken by `results` [{activityName, sets}] relative to the past. Call BEFORE inserting the new logs. */
async function recordsBroken(userId, results) {
  const names = [...new Set(results.filter((r) => (r.sets || []).length).map((r) => r.activityName))];
  return newRecords(await priorRecords(userId, names), results);
}

module.exports = { priorRecords, recordsBroken };
