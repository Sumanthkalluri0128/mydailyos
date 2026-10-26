const mongoose = require('mongoose');
// One row per dose marked as taken ("2026-10-25 08:00 for medicine X"). Unmarking deletes the row.
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  medId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
  date: { type: String, required: true },
  time: { type: String, required: true },
  takenAt: { type: Date, default: Date.now },
}, { timestamps: true });
schema.index({ userId: 1, date: 1 });
schema.index({ userId: 1, medId: 1, date: 1, time: 1 }, { unique: true });
module.exports = mongoose.model('MedLog', schema);
