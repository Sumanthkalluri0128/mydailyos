const mongoose = require('mongoose');

// "Report wrong values" on a food. Reviewed through the admin-only list (routes/adminRoutes.js).
const schema = new mongoose.Schema(
  {
    foodId: { type: mongoose.Schema.Types.ObjectId, ref: 'Food', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    foodName: { type: String, default: '', maxlength: 120 },
    catalogue: { type: Boolean, default: false },
    note: { type: String, required: true, maxlength: 500 },
    status: { type: String, enum: ['open', 'fixed', 'dismissed'], default: 'open', index: true },
  },
  { timestamps: true }
);
module.exports = mongoose.model('FoodReport', schema);
