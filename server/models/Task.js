const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    clientId: { type: String },
    // Groups the instances of a repeating task (see lib/taskSeries.js). '' = not part of a series.
    seriesId: { type: String, default: '' },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', maxlength: 1000 },
    date: { type: String, required: true },
    time: { type: String, default: '' }, // "HH:mm" due time, '' = no time
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    category: { type: String, default: 'General', maxlength: 60 },
    completed: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
    recurrence: { type: String, enum: ['none', 'daily', 'weekdays', 'weekly', 'monthly'], default: 'none' },
    // "Delete just this occurrence" of a repeating task leaves a hidden marker so it is not re-created.
    skipped: { type: Boolean, default: false },
    notes: { type: String, default: '', maxlength: 1000 },
  },
  { timestamps: true }
);
schema.index({ userId: 1, date: 1 });
schema.index({ userId: 1, clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } });
schema.index({ userId: 1, seriesId: 1, date: 1 }, { unique: true, partialFilterExpression: { seriesId: { $gt: '' } } });

module.exports = mongoose.model('Task', schema);
