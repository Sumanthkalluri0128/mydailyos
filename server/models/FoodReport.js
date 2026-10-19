const mongoose = require('mongoose');

// "Report wrong values" on a food. Reviewed by the admin through GET /api/foods/reports (env-protected).
const schema = new mongoose.Schema(
  {
    foodId: { type: mongoose.Schema.Types.ObjectId, ref: 'Food', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    foodName: { type: String, default: '', maxlength: 120 },
    note: { type: String, required: true, trim: true, maxlength: 500 },
    status: { type: String, enum: ['open', 'fixed', 'dismissed'], default: 'open' },
  },
  { timestamps: true }
);
schema.index({ userId: 1, foodId: 1, createdAt: -1 });

module.exports = mongoose.model('FoodReport', schema);
