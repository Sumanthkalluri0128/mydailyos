const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, default: null },
    targetHours: { type: Number, min: 1, max: 72, default: 16 },
  },
  { timestamps: true }
);
schema.index({ userId: 1, startedAt: -1 });

module.exports = mongoose.model('Fast', schema);
