const mongoose = require('mongoose');

// One planned food on one day/meal. Becomes a FoodLog when the person eats it ("Log it").
const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    clientId: { type: String },                  // makes an offline replay of "add to plan" create exactly one item
    date: { type: String, required: true },
    mealType: { type: String, enum: ['breakfast', 'lunch', 'dinner', 'snacks'], required: true },
    foodId: { type: mongoose.Schema.Types.ObjectId, ref: 'Food', required: true },
    foodName: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0.01 }, // in the food's own serving unit
    servingUnit: { type: String, default: 'g' },
    calories: { type: Number, default: 0 },
    protein: { type: Number, default: 0 },
    fiber: { type: Number, default: 0 },
    carbohydrates: { type: Number, default: 0 },
    fat: { type: Number, default: 0 },
    logged: { type: Boolean, default: false },
    logId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodLog', default: null }, // the FoodLog this item became when it was eaten (so it is counted once)
    rescue: { type: Boolean, default: false }, // built by the "gentle day" button
    auto: { type: Boolean, default: false },   // built by the smart planner ("Plan my week")
    role: { type: String, default: '' },       // protein | carb | veg | dairy | fruit | snack (smart planner)
    why: { type: String, default: '', maxlength: 200 }, // short reason shown under an auto-planned item
  },
  { timestamps: true }
);
schema.index({ userId: 1, date: 1 });
schema.index({ userId: 1, clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } });

module.exports = mongoose.model('MealPlan', schema);
