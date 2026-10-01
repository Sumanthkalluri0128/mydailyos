const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', maxlength: 500 },
    category: { type: String, default: 'General', maxlength: 60 },
    frequency: { type: String, enum: ['daily', 'weekdays', 'weekly'], default: 'daily' },
    target: { type: Number, default: 1, min: 1 },
    unit: { type: String, default: 'times', maxlength: 30 },
    isActive: { type: Boolean, default: true },
    notes: { type: String, default: '', maxlength: 500 },
  },
  { timestamps: true }
);
schema.index({ userId: 1, name: 1 });

module.exports = mongoose.model('Habit', schema);
