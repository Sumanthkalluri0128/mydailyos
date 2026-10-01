const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true, unique: true },
    name: { type: String, default: '', trim: true, maxlength: 100 },
    age: { type: Number, min: 1, max: 120, default: null },
    sex: { type: String, enum: ['male', 'female', 'other', ''], default: '' },
    heightCm: { type: Number, min: 50, max: 250, default: null },
    currentWeightKg: { type: Number, min: 1, max: 700, default: null },
    activityLevel: {
      type: String,
      enum: ['sedentary', 'light', 'moderate', 'very_active', 'extra_active'],
      default: 'moderate',
    },
    goals: {
      calorieTarget: { type: Number, min: 1, default: 1800 },
      proteinTarget: { type: Number, min: 1, default: 140 },
      waterTargetMl: { type: Number, min: 1, default: 3000 },
      stepsTarget: { type: Number, min: 1, default: 10000 },
      exerciseMinutesTarget: { type: Number, min: 1, default: 30 },
      targetWeightKg: { type: Number, min: 1, default: null },
    },
    // Display preferences only — every value is stored metric.
    units: {
      weight: { type: String, enum: ['kg', 'lb'], default: 'kg' },
      energy: { type: String, enum: ['kcal', 'kJ'], default: 'kcal' },
      volume: { type: String, enum: ['ml', 'oz'], default: 'ml' },
    },
    // Existing accounts default to true so they are never pushed through first-run onboarding;
    // signup creates the profile with onboarded:false explicitly.
    onboarded: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Profile', schema);
