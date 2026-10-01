const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema(
  {
    activityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Activity', required: true },
    activityName: { type: String, required: true },
    category: { type: String, default: 'General' },
    met: { type: Number, required: true, min: 0 },
    durationMinutes: { type: Number, required: true, min: 1, max: 1440 },
  },
  { _id: false }
);

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    notes: { type: String, default: '', maxlength: 500 },
    items: { type: [itemSchema], validate: [(v) => v.length > 0 && v.length <= 30, 'A template needs 1–30 exercises'] },
  },
  { timestamps: true }
);
schema.index({ userId: 1, name: 1 });

module.exports = mongoose.model('WorkoutTemplate', schema);
