const mongoose = require('mongoose');

// A saved week ("My cutting week"): the planned meals of 7 days, stored by weekday offset so it can be loaded onto any week.
const S = mongoose.Schema;
const schema = new S({
  userId: { type: S.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 60 },
  items: [{
    _id: false, offset: { type: Number, min: 0, max: 6 }, mealType: { type: String, enum: ['breakfast', 'lunch', 'dinner', 'snacks'] },
    foodId: { type: S.Types.ObjectId, ref: 'Food' }, foodName: String, quantity: Number, servingUnit: String,
    calories: Number, protein: Number, fiber: Number, carbohydrates: Number, fat: Number, role: String, locked: Boolean,
  }],
}, { timestamps: true });
schema.index({ userId: 1, name: 1 }, { unique: true });
module.exports = mongoose.model('PlanTemplate', schema);
