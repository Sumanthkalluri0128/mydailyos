const mongoose = require('mongoose');

// One planned workout on one day (the workout planner: plan a week or a month, move or skip a day). Private to the person; included in export
// and in account deletion. "Done" is not stored for logged workouts: the route matches the plan against the person's own exercise log.
const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    clientId: { type: String },                    // makes an offline replay of "add to plan" create exactly one item
    date: { type: String, required: true },        // YYYY-MM-DD, the person's own day
    kind: { type: String, enum: ['strength', 'cardio', 'conditioning', 'recovery', 'rest', 'custom'], default: 'custom' },
    title: { type: String, required: true, maxlength: 80 },
    minutes: { type: Number, default: 0, min: 0, max: 300 },
    exercises: { type: [{ name: { type: String, maxlength: 60 }, sets: Number, reps: Number, kg: Number, _id: false }], default: [] },
    note: { type: String, default: '', maxlength: 300 },
    status: { type: String, enum: ['planned', 'done', 'skipped'], default: 'planned' },
    doneAt: { type: Date, default: null },
    movedFrom: { type: String, default: '' },      // the day it was moved from, so the plan can show "moved"
    seriesId: { type: String, default: '', maxlength: 80 }, // items made by one "repeat for N weeks"
  },
  { timestamps: true }
);
schema.index({ userId: 1, date: 1 });
schema.index({ userId: 1, seriesId: 1 });
schema.index({ userId: 1, clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } });

module.exports = mongoose.model('WorkoutPlanItem', schema);
