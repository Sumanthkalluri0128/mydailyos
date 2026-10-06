const mongoose = require('mongoose');

// One planned food on one day/meal. Becomes a FoodLog when the person eats it ("Log it").
const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: String, required: true },
    mealType: { type: String, enum: ['breakfast', 'lunch', 'dinner', 'snacks'], required: true },
    foodId: { type: mongoose.Schema.Types.ObjectId, ref: 'Food', required: true },
    foodName: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0.01 }, // in the food's own serving unit
    servingUnit: { type: String, default: 'g' },
    calories: { type: Number, default: 0 },
    protein: { type: Number, default: 0 },
    fiber: { type: Number, default: 0 },
    logged: { type: Boolean, default: false },
  },
  { timestamps: true }
);
schema.index({ userId: 1, date: 1 });

module.exports = mongoose.model('MealPlan', schema);
