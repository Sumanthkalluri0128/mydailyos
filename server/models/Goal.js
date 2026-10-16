const mongoose = require('mongoose');

// A goal the person set for themselves. Short-term goals run days to weeks; long-term ones run months.
// Progress is never stored — it is worked out from the logs each time (see lib/journey.js goalProgress).
const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    kind: { type: String, enum: ['short', 'long'], default: 'short' },
    metric: { type: String, enum: ['workouts', 'logDays', 'waterDays', 'calorieDays', 'stepsTotal', 'weight', 'custom'], default: 'custom' },
    target: { type: Number, required: true, min: 0.01, max: 10000000 },
    startValue: { type: Number, default: null }, // weight goals: the weight you started from
    manualValue: { type: Number, default: 0 },   // custom goals: what you've reached so far
    unit: { type: String, default: '', maxlength: 20 },
    startDate: { type: String, required: true },
    deadline: { type: String, default: '' },
    done: { type: Boolean, default: false },
    doneAt: { type: String, default: '' },
    note: { type: String, default: '', maxlength: 300 },
  },
  { timestamps: true }
);
schema.index({ userId: 1, done: 1, deadline: 1 });

module.exports = mongoose.model('Goal', schema);
