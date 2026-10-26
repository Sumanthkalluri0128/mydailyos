const mongoose = require('mongoose');

// Per-person coaching state: rough-day mode, the current 7-day experiment and its history, what the coach has learned from taps
// (resettable in Profile), and the weekly treat allowance. Private; included in the account export and deleted with the account.
const S = mongoose.Schema;
const schema = new S({
  userId: { type: S.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  rough: { date: { type: String, default: '' } },
  roughDates: [String],
  exp: { type: S.Types.Mixed, default: null },
  expHistory: { type: [S.Types.Mixed], default: [] },
  expPaused: { type: Boolean, default: false },
  learn: { type: S.Types.Mixed, default: {} },
  tone: { type: String, enum: ['gentle', 'strict', 'funny'], default: 'funny' },
  gentle: { type: Boolean, default: false },
  event: { kind: { type: String, enum: ['', 'festival', 'wedding', 'trip'], default: '' }, from: { type: String, default: '' }, to: { type: String, default: '' }, label: { type: String, default: '', maxlength: 40 } },
  dietBreak: { kind: { type: String, default: '' }, from: { type: String, default: '' }, to: { type: String, default: '' } },
  showAll: { type: Boolean, default: false },
  seenFeatures: { type: [String], default: [] },
  treat: { weeklyKcal: { type: Number, default: 0, min: 0, max: 5000 }, entries: [{ _id: false, date: String, name: { type: String, maxlength: 80 }, kcal: Number }] },
}, { timestamps: true, minimize: false });

module.exports = mongoose.model('CoachState', schema);
