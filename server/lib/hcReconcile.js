// A workout recorded by the watch (Health Connect) AND logged by the person (Exercise page, Gym log, Workout tab, a plan) is counted once, whichever
// arrived first. When the person's own entry arrives after the watch session was already imported, the imported copy is removed (the person's own
// entry wins). The rule is in lib/hcImport.partitionHc, the same one the import itself uses. Nothing is lost for good: if the person deletes their own
// entry, the next watch sync brings the session back.
const ActivityLog = require('../models/ActivityLog');
const { partitionHc } = require('./hcImport');

/** Call after creating or changing the person's own exercise entries on `dates`. Never throws: a failure here must not fail the save. */
async function reconcileHealthConnect(userId, dates) {
  try {
    const days = [...new Set((dates || []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d))))];
    if (!days.length) return 0;
    const rows = await ActivityLog.find({ userId, date: { $in: days } }).select('date category durationMinutes source startMs').lean();
    const hc = rows.filter((r) => r.source === 'healthconnect');
    if (!hc.length) return 0;
    const { dropExisting } = partitionHc({ manualRows: rows.filter((r) => r.source !== 'healthconnect'), existing: hc });
    if (!dropExisting.length) return 0;
    await ActivityLog.deleteMany({ _id: { $in: dropExisting }, userId, source: 'healthconnect' });
    return dropExisting.length;
  } catch { return 0; }
}
module.exports = { reconcileHealthConnect };
