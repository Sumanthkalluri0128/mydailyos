const mongoose = require('mongoose');
// Medicines and supplements the person wants reminders for. Private health data: included in the export and deleted with the account.
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 60 },
  dose: { type: String, default: '', maxlength: 40 },
  kind: { type: String, enum: ['medicine', 'supplement'], default: 'medicine' },
  times: { type: [String], default: [] },          // "HH:mm", 1-6 a day
  days: { type: [Number], default: [] },           // 0=Sunday..6; empty = every day
  notes: { type: String, default: '', maxlength: 120 },
  active: { type: Boolean, default: true },
}, { timestamps: true });
module.exports = mongoose.model('Medicine', schema);
