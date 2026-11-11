const mongoose = require('mongoose');

// The 10-second daily readiness check (sleep hours, energy, soreness, stress). One row per person per day. The gym coach reads it to
// lighten TODAY's session and to spot a low-recovery week; the diet coach reads it so it never cuts calories on top of poor recovery.
// Private to the person: included in the account export and the backup restore, and deleted with the account.
const S = mongoose.Schema;
const rating = { type: Number, min: 1, max: 5, default: null };
const schema = new S({
  userId: { type: S.Types.ObjectId, ref: 'User', required: true, index: true },
  date: { type: String, required: true },
  sleepHours: { type: Number, min: 0, max: 16, default: null },
  energy: rating,      // 1 = drained ... 5 = great
  soreness: rating,    // 1 = none ... 5 = very sore
  stress: rating,      // 1 = calm ... 5 = very stressed
}, { timestamps: true });
schema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Readiness', schema);
