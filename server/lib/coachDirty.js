// Tells the weekly coach "something it reads just changed" (a check-in, a waist reading, a finished workout with effort taps), at the
// cost of one tiny update. The coach then re-reads its signals the next time it is asked, instead of re-reading them on every screen open.
// Already flagged? Then nothing is written at all (the filter matches no document), so ten check-in edits in a row cost one write.
// Best effort: a failure here must never break the save that called it.
async function markCoachDirty(CoachState, uid) {
  try { await CoachState.updateOne({ userId: uid, weekly: { $ne: null }, 'weekly.dirty': { $ne: true } }, { $set: { 'weekly.dirty': true } }); } catch { /* the daily check still catches it */ }
}
/** A new weigh-in or a profile / goal edit changes today's numbers: the daily decision is re-worked the next time it is asked. */
async function markDailyDirty(CoachState, uid) {
  try { await CoachState.updateOne({ userId: uid, daily: { $ne: null }, 'daily.dirty': { $ne: true } }, { $set: { 'daily.dirty': true } }); } catch { /* the next day catches it */ }
}
module.exports = { markCoachDirty, markDailyDirty };
