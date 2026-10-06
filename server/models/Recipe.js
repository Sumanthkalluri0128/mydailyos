const mongoose = require('mongoose');

// A recipe is a list of ingredients + a number of servings. Saving one also maintains a custom Food
// (`foodId`, one "serving" of the recipe) so it can be logged, planned and saved like any other food.
const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    servings: { type: Number, required: true, min: 0.25, max: 200, default: 1 },
    ingredients: [
      {
        _id: false,
        foodId: { type: mongoose.Schema.Types.ObjectId, ref: 'Food', required: true },
        foodName: { type: String, default: '' },
        quantity: { type: Number, required: true, min: 0.01 },
        servingUnit: { type: String, default: 'g' },
      },
    ],
    notes: { type: String, default: '', maxlength: 1000 },
    foodId: { type: mongoose.Schema.Types.ObjectId, ref: 'Food', default: null },
    perServing: {
      calories: { type: Number, default: 0 }, protein: { type: Number, default: 0 }, carbohydrates: { type: Number, default: 0 },
      fat: { type: Number, default: 0 }, fiber: { type: Number, default: 0 }, sugar: { type: Number, default: 0 }, sodium: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Recipe', schema);
