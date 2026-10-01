const Task = require('../models/Task');
const { recurrenceMatches } = require('./recurrence');
const { diffDays, todayUtc, enumerate } = require('./dates');

/**
 * Repeating tasks are created lazily: when a day (or range of days) is requested, every active
 * series whose rule lands on a date that has no instance yet gets one created.
 *
 *  - The series ORIGIN (earliest instance) drives the rule, so "monthly on the 31st" stays on the
 *    31st (clamped in short months) instead of drifting to the 28th after February.
 *  - The LATEST instance supplies the template (title/time/priority…), so edits carry forward.
 *  - Ending a series sets its latest instance's recurrence to 'none' (see DELETE /tasks/:id?scope=series).
 *  - Deleting a single occurrence leaves a hidden `skipped` marker so it is not re-created.
 */
async function materializeRange(userId, from, to) {
  // Never rewrite history: only today (±1 day of time-zone slack) and the future get generated.
  const today = todayUtc();
  const dates = enumerate(from, to).filter((d) => {
    const off = diffDays(today, d);
    return off >= -1 && off <= 400;
  });
  if (!dates.length) return;

  // Plain indexed queries (no aggregation pipeline) so this works on any MongoDB-compatible server.
  const last = dates[dates.length - 1];
  const seriesIds = (await Task.distinct('seriesId', { userId, seriesId: { $gt: '' }, date: { $lt: last } })).slice(0, 200);
  if (!seriesIds.length) return;
  const series = (
    await Promise.all(
      seriesIds.map(async (seriesId) => {
        const [latest, first] = await Promise.all([
          Task.findOne({ userId, seriesId, date: { $lt: last } }).sort({ date: -1 }).lean(),
          Task.findOne({ userId, seriesId }).sort({ date: 1 }).select('date').lean(),
        ]);
        return latest && first ? { _id: seriesId, latest, origin: first.date } : null;
      })
    )
  ).filter(Boolean);
  if (!series.length) return;

  const existing = await Task.find({
    userId, seriesId: { $in: series.map((s) => s._id) }, date: { $gte: dates[0], $lte: dates[dates.length - 1] },
  }).select('seriesId date').lean();
  const have = new Set(existing.map((t) => `${t.seriesId}|${t.date}`));

  for (const { _id: seriesId, latest, origin } of series) {
    if (latest.recurrence === 'none') continue;
    for (const date of dates) {
      if (have.has(`${seriesId}|${date}`)) continue;
      if (!recurrenceMatches(latest.recurrence, origin, date)) continue;
      if (diffDays(origin, date) > 366 * 3) continue;
      try {
        await Task.create({
          userId, seriesId, date, title: latest.title, description: latest.description, time: latest.time,
          priority: latest.priority, category: latest.category, recurrence: latest.recurrence, notes: latest.notes,
        });
        have.add(`${seriesId}|${date}`);
      } catch (e) {
        if (e.code !== 11000) throw e; // a concurrent request already created it — fine
      }
    }
  }
}

const materializeRecurring = (userId, date) => materializeRange(userId, date, date);

module.exports = { materializeRecurring, materializeRange };
