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
  // The weekly decision ladder (lib/weeklyDecision.js): slow weeks, ladder level, last change, and the decision currently on screen.
  weekly: { type: S.Types.Mixed, default: null },
  // What the coach changed and what happened afterwards (newest first, capped), and the one-tap undo for the last automatic change.
  changelog: { type: [S.Types.Mixed], default: [] },
  autoUndo: { type: S.Types.Mixed, default: null },
  // Optional cycle awareness (lib/cycle.js): OFF by default. Only the days a period started are kept; used to avoid reading the monthly water shift
  // as a stalled diet. Erasable in one tap, in the account export, and deleted with the account.
  cycle: { enabled: { type: Boolean, default: false }, starts: { type: [String], default: [] }, length: { type: Number, min: 21, max: 45, default: null } },
  gymToday: { type: S.Types.Mixed, default: null },          // {date, kind}: what the full adaptive gym plan said for today (written by the Coach page)
  showAll: { type: Boolean, default: false },
  seenFeatures: { type: [String], default: [] },
  treat: { weeklyKcal: { type: Number, default: 0, min: 0, max: 5000 }, entries: [{ _id: false, date: String, name: { type: String, maxlength: 80 }, kcal: Number }] },
}, { timestamps: true, minimize: false });

module.exports = mongoose.model('CoachState', schema);
