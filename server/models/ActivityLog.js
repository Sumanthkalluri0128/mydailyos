const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    clientId: { type: String },
    activityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Activity', required: true },
    date: { type: String, required: true },
    activityName: { type: String, required: true },
    category: { type: String, required: true },
    durationMinutes: { type: Number, required: true, min: 0 },
    weightKg: { type: Number, required: true, min: 0 },
    met: { type: Number, required: true, min: 0 },
    caloriesBurned: { type: Number, required: true, min: 0 },
    // 'manual' = the person typed in the calories burned (e.g. from a watch); 'estimated' = MET formula.
    caloriesSource: { type: String, enum: ['estimated', 'manual'], default: 'estimated' },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);
schema.index({ userId: 1, date: 1 });
schema.index({ userId: 1, clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } });

module.exports = mongoose.model('ActivityLog', schema);
