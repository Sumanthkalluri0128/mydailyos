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
      // 'auto' = calculated from body, goal and pace (the saved calorieTarget just mirrors it); 'manual' = the number the person typed.
      calorieMode: { type: String, enum: ['auto', 'manual'], default: 'auto' },
      proteinTarget: { type: Number, min: 1, default: 140 },
      waterTargetMl: { type: Number, min: 1, default: 3000 },
      stepsTarget: { type: Number, min: 1, default: 10000 },
      exerciseMinutesTarget: { type: Number, min: 1, default: 30 },
      targetWeightKg: { type: Number, min: 1, default: null },
      // How fast to move toward the target weight, in kg per week (drives the calorie target).
      weeklyPaceKg: { type: Number, min: 0.1, max: 1, default: 0.5 },
    },
    // Display preferences only — every value is stored metric.
    units: {
      weight: { type: String, enum: ['kg', 'lb'], default: 'kg' },
      energy: { type: String, enum: ['kcal', 'kJ'], default: 'kcal' },
      volume: { type: String, enum: ['ml', 'oz'], default: 'ml' },
    },
    // Optional emails. Off by default; `lastWeeklyEmail` is the Monday (YYYY-MM-DD) of the last week already sent, so it is never sent twice.
    notify: {
      weeklyEmail: { type: Boolean, default: false },
      lastWeeklyEmail: { type: String, default: '' },
    },
    // The north-star plan ("lose 6 kg by March"): everything else (focus habits, rewards, events, maintenance breaks) hangs under it.
    plan: {
      active: { type: Boolean, default: false },
      startKg: { type: Number, default: null },
      startDate: { type: String, default: '' },
      targetKg: { type: Number, default: null },
      byDate: { type: String, default: '' },
      paceKg: { type: Number, default: 0.5 },
      focus: { type: [String], default: [] }, // three weekly focus habit ids (see lib/northStar HABITS)
      // Rewards the person chose for themselves ("new shoes at 3 kg lost"). Never food.
      rewards: {
        type: [{ _id: false, id: { type: String, required: true }, atKg: { type: Number, required: true, min: 0.1, max: 200 }, text: { type: String, required: true, maxlength: 80 }, claimedAt: { type: String, default: '' } }],
        default: [],
      },
      // Event mode: Diwali, a wedding, a trip.
      events: {
        type: [{ _id: false, id: { type: String, required: true }, title: { type: String, required: true, maxlength: 60 }, startDate: { type: String, required: true }, endDate: { type: String, required: true } }],
        default: [],
      },
      // Maintenance break: while on, the calorie target is held at maintenance (we remember the previous mode to restore it).
      breakUntil: { type: String, default: '' },
      breakPrev: { mode: { type: String, default: '' }, target: { type: Number, default: null } },
      lastBreakEnd: { type: String, default: '' },
    },
    // Section B: highest XP ever shown (so the level never drops), when each badge family was first earned, and a short history of target changes.
    journey: {
      xpFloor: { type: Number, default: 0 },
      earnedAt: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    targetHistory: {
      type: [{ _id: false, date: String, key: String, label: String, from: mongoose.Schema.Types.Mixed, to: mongoose.Schema.Types.Mixed, reason: { type: String, default: '' } }],
      default: [],
    },
    // Safety layer. hideNumbers hides weights and calorie counts in the apps (the plan still works).
    safety: { hideNumbers: { type: Boolean, default: false } },
    // Existing accounts default to true so they are never pushed through first-run onboarding;
    // signup creates the profile with onboarded:false explicitly.
    onboarded: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Profile', schema);
