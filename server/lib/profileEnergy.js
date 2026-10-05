// Keeps the saved `goals.calorieTarget` honest. In auto mode it mirrors the calculated plan; in manual mode it is the
// person's own number and is never touched. (Readers that matter use lib/energy.js directly; this is for exports/backups.)
const { expectedEnergy } = require('./energy');

/** @returns the updated profile document when the stored target had to change, otherwise null. */
async function refreshStoredTarget(Profile, profile) {
  if (!profile) return null;
  const plain = typeof profile.toObject === 'function' ? profile.toObject() : profile;
  const e = expectedEnergy(plain);
  if (!e || e.mode !== 'auto' || Number(plain.goals?.calorieTarget) === e.autoTarget) return null;
  return Profile.findOneAndUpdate({ _id: plain._id }, { $set: { 'goals.calorieTarget': e.autoTarget } }, { new: true });
}

module.exports = { refreshStoredTarget };
