const mongoose = require('mongoose');

const nutrition = {
  calories: { type: Number, default: 0, min: 0 },
  protein: { type: Number, default: 0, min: 0 },
  carbohydrates: { type: Number, default: 0, min: 0 },
  fat: { type: Number, default: 0, min: 0 },
  fiber: { type: Number, default: 0, min: 0 },
  sugar: { type: Number, default: 0, min: 0 },
};

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    clientId: { type: String },
    foodId: { type: mongoose.Schema.Types.ObjectId, ref: 'Food', required: true },
    date: { type: String, required: true },
    mealType: { type: String, enum: ['breakfast', 'lunch', 'dinner', 'snacks'], required: true },
    foodName: { type: String, required: true },
    baseServingSize: { type: Number, required: true },
    servingUnit: { type: String, required: true },
    consumedQuantity: { type: Number, required: true },
    servings: { type: Number, required: true },
    nutritionPerServing: nutrition,
    nutritionTotal: nutrition,
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);
schema.index({ userId: 1, date: 1, mealType: 1 });
// Makes offline-queue replays idempotent: same clientId can never create two logs.
schema.index({ userId: 1, clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } });

module.exports = mongoose.model('FoodLog', schema);
