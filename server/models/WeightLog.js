const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    clientId: { type: String },
    date: { type: String, required: true },
    weightKg: { type: Number, required: true, min: 1, max: 700 },
    notes: { type: String, default: '', maxlength: 300 },
  },
  { timestamps: true }
);
schema.index({ userId: 1, date: 1 });
schema.index({ userId: 1, clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } });

module.exports = mongoose.model('WeightLog', schema);
