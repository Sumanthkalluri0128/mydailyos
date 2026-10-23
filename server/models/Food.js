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
    sodium: { type: Number, default: 0, min: 0 }, // mg per serving
    // Optional micronutrients per serving. null = unknown (never 0 by default, so "no data" is not shown as "none").
    iron: { type: Number, default: null, min: 0 },          // mg
    calcium: { type: Number, default: null, min: 0 },       // mg
    potassium: { type: Number, default: null, min: 0 },     // mg
    magnesium: { type: Number, default: null, min: 0 },     // mg
    zinc: { type: Number, default: null, min: 0 },          // mg
    vitaminA: { type: Number, default: null, min: 0 },      // µg RAE
    vitaminB12: { type: Number, default: null, min: 0 },    // µg
    vitaminC: { type: Number, default: null, min: 0 },      // mg
    vitaminD: { type: Number, default: null, min: 0 },      // µg
    folate: { type: Number, default: null, min: 0 },        // µg
    dataSource: { type: String, default: '', maxlength: 160 }, // where the micronutrient values come from (IFCT 2017, USDA, Open Food Facts, label)
    barcode: { type: String, default: '', trim: true, maxlength: 20, index: true },
    // Household measures, e.g. { label: 'katori', quantity: 150 } => 1 katori = 150 (servingUnit).
    units: { type: [{ _id: false, label: { type: String, maxlength: 30 }, quantity: { type: Number, min: 0.01 } }], default: [] },
    notes: { type: String, default: '', maxlength: 500 },
    // Internal placeholder food (e.g. "Quick add" for eating out). Never shown in lists, search or suggestions.
    hidden: { type: Boolean, default: false },
    // Per-person favourites (a shared food can be a favourite for one person and not another).
    favoriteBy: { type: [mongoose.Schema.Types.ObjectId], default: [], select: false },
    // Legacy flag from before favourites were per-person. Still honoured for a person's own foods.
    isFavorite: { type: Boolean, default: false },
  },
  { timestamps: true }
);
schema.index({ userId: 1, name: 1 });

module.exports = mongoose.model('Food', schema);
