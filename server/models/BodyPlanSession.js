// One workout done (or skipped) from the Body plan. The adaptive engine (lib/bodyPlanAdapt) reads these to set next week's weights,
// sets and schedule. Kept small: sets are capped, text is trimmed, and everything is private to the person (in export and deletion).
const mongoose = require('mongoose');

const setSchema = new mongoose.Schema({ reps: { type: Number, min: 0, max: 1000, default: 0 }, weightKg: { type: Number, min: 0, max: 1000, default: 0 }, seconds: { type: Number, min: 0, max: 7200, default: 0 } }, { _id: false });
const exSchema = new mongoose.Schema({
  id: { type: String, required: true, maxlength: 60 }, name: { type: String, default: '', maxlength: 120 }, slot: { type: String, default: '', maxlength: 20 },
  done: { type: Boolean, default: true }, sets: { type: [setSchema], default: [] },
}, { _id: false });

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  clientId: { type: String },
  date: { type: String, required: true },
  sessionId: { type: String, default: '', maxlength: 4 },
  title: { type: String, default: '', maxlength: 80 },
  way: { type: String, enum: ['gym', 'home', 'quick'], default: 'gym' },
  status: { type: String, enum: ['done', 'partial', 'skipped'], required: true },
  reason: { type: String, enum: ['', 'tired', 'busy', 'sick', 'pain', 'travel', 'rest'], default: '' },
  feel: { type: String, enum: ['', 'easy', 'good', 'hard'], default: '' },
  pain: { type: [{ type: String, enum: ['knee', 'back', 'shoulder', 'wrist', 'elbow', 'other', 'dizzy'] }], default: [] },
  phase: { type: String, enum: ['', 'learn', 'build', 'easy', 'back'], default: '' },
  minutes: { type: Number, min: 0, max: 600, default: 0 },
  exercises: { type: [exSchema], default: [] },
  notes: { type: String, default: '', maxlength: 300 },
}, { timestamps: true });
schema.index({ userId: 1, date: -1 });
schema.index({ userId: 1, clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } });

module.exports = mongoose.model('BodyPlanSession', schema);
