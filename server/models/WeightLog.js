const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    clientId: { type: String },
    date: { type: String, required: true },
    // EXACTLY what the scale showed. Analysis never reads this directly: lib/weightData.js calibrates it with the scale's offset.
    weightKg: { type: Number, required: true, min: 1, max: 700 },
    // Which scale ('' = the main scale; also every entry from before scales existed). Ids live in Profile.weightScales.
    scaleId: { type: String, default: '', maxlength: 40 },
    notes: { type: String, default: '', maxlength: 300 },
  },
  { timestamps: true }
);
schema.index({ userId: 1, date: 1 });
schema.index({ userId: 1, scaleId: 1 });
schema.index({ userId: 1, clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } });

module.exports = mongoose.model('WeightLog', schema);
