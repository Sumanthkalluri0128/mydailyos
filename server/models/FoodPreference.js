const mongoose = require('mongoose');

// A person's private Food Preferences ("Planning sensei" answers). One document per user.
// Health data lives here (avoid.allergies, avoid.intolerances, health.flags): it is included in the account export and deleted with the account.
const S = mongoose.Schema;
const schema = new S({
  userId: { type: S.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  diet: { type: String, enum: ['', 'veg', 'egg', 'nonveg', 'vegan', 'jain', 'sattvic'], default: '' },
  scope: { days: { type: Number, min: 1, max: 7 }, meals: [{ type: String, enum: ['breakfast', 'lunch', 'dinner', 'snacks'] }] },
  avoid: {
    allergies: [String], intolerances: [String], religious: [String], dislikes: [{ type: String, maxlength: 40 }],
  },
  health: { flags: [String] },
  loves: [{ type: String, maxlength: 40 }],
  cuisines: [String],
  cookTime: { breakfast: Number, lunch: Number, dinner: Number },
  kitchen: { skill: String, equipment: [String] },
  household: { adults: Number, kids: Number, elders: Number },
  budget: { type: String, enum: ['', 'low', 'medium', 'flexible'], default: '' },
  eatingOut: { meals: [String], kind: String, perWeek: Number },
  protein: { sources: [String] },
  spice: { type: String, default: '' }, oil: { type: String, default: '' },
  prep: { type: String, default: '' },
  bigMeal: { type: String, default: '' },
  snacks: { style: [String], sweetPlan: String },
  variety: { type: String, default: '' },
  fasting: { options: [String] },
  ramadan: { from: String, days: Number },
  event: { kind: String, from: String, to: String },
  have: [{ type: String, maxlength: 40 }],
  coach: { who: { type: String, default: '' }, tone: { type: String, enum: ['', 'cheer', 'calm', 'strict'], default: '' } },
  answered: { type: S.Types.Mixed, default: {} },       // { questionId: { at, skipped, usual } }
  feedback: [{
    _id: false, key: String, name: String, loved: { type: Number, default: 0 }, heavy: { type: Number, default: 0 }, long: { type: Number, default: 0 }, na: { type: Number, default: 0 }, at: Date,
  }],
  sensei: { completedAt: Date, sessions: { type: Number, default: 0 }, stickerAt: Date },
}, { timestamps: true, minimize: false });

module.exports = mongoose.model('FoodPreference', schema);
