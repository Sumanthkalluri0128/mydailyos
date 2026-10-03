const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    items: [
      {
        _id: false,
        foodId: { type: mongoose.Schema.Types.ObjectId, ref: 'Food', required: true },
        foodName: { type: String, default: '' },
        quantity: { type: Number, required: true, min: 0.01 }, // in the food's own unit
        servingUnit: { type: String, default: 'g' },
        calories: { type: Number, default: 0 }, // snapshot for the list view only
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('SavedMeal', schema);
