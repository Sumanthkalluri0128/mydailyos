const mongoose = require('mongoose');

// Foods come from two places:
//   * the shared catalogue        -> userId is null/missing (read-only for everyone)
//   * a person's own custom foods -> userId is set (only that person can see/edit/delete them)
const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    brand: { type: String, default: '', trim: true, maxlength: 120 },
    servingSize: { type: Number, required: true, min: 0.01 },
    servingUnit: { type: String, required: true, default: 'g', trim: true, maxlength: 20 },
    calories: { type: Number, required: true, min: 0 },
    protein: { type: Number, default: 0, min: 0 },
    carbohydrates: { type: Number, default: 0, min: 0 },
    fat: { type: Number, default: 0, min: 0 },
    fiber: { type: Number, default: 0, min: 0 },
    sugar: { type: Number, default: 0, min: 0 },
    notes: { type: String, default: '', maxlength: 500 },
    // Per-person favourites (a shared food can be a favourite for one person and not another).
    favoriteBy: { type: [mongoose.Schema.Types.ObjectId], default: [], select: false },
    // Legacy flag from before favourites were per-person. Still honoured for a person's own foods.
    isFavorite: { type: Boolean, default: false },
  },
  { timestamps: true }
);
schema.index({ userId: 1, name: 1 });

module.exports = mongoose.model('Food', schema);
