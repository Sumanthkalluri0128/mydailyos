const mongoose = require('mongoose');

const stepLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: String, required: true },
    steps: { type: Number, required: true, min: 0 },
    source: { type: String, default: 'Health Connect' },
    syncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

stepLogSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('StepLog', stepLogSchema);
