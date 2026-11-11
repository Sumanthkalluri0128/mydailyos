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
    // 'auto' (default): the calorie target's activity level follows your recent days (lib/dailyCoach.js: it moves only after 2 days in a row
    // agree). 'manual': always the level you chose above. `autoActivity` is the stored automatic reading, refreshed once a day.
    activityMode: { type: String, enum: ['auto', 'manual'], default: 'auto' },
    autoActivity: { type: mongoose.Schema.Types.Mixed, default: null },
    goals: {
      calorieTarget: { type: Number, min: 1, default: 1800 },
      // 'auto' = calculated from body, goal and pace (the saved calorieTarget just mirrors it); 'manual' = the number the person typed.
      // The safe minimum calories (null = 1,500 men / 1,200 others). Every engine reads it through energy.calorieFloorOf.
      calorieFloor: { type: Number, min: 1000, max: 3000, default: null },
      calorieMode: { type: String, enum: ['auto', 'manual'], default: 'auto' },
      // null = automatic (from weight, goal and body type). A number is the person's own choice and wins everywhere.
      proteinTarget: { type: Number, min: 1, default: null },
      waterTargetMl: { type: Number, min: 1, default: 3000 },
      stepsTarget: { type: Number, min: 1, default: 10000 },
      exerciseMinutesTarget: { type: Number, min: 1, default: 30 },
      targetWeightKg: { type: Number, min: 1, default: null },
      // How fast to move toward the target weight, in kg per week (drives the calorie target).
      // The body the person is aiming for (chosen in the app). Drives protein/fat targets and the Body plan. '' = not chosen yet.
      bodyType: { type: String, enum: ['', 'lean', 'athletic', 'muscular', 'balanced'], default: '' },
      // The day the person first saved a Body plan (YYYY-MM-DD). The adaptive plan counts weeks from here, so days before it are never "not done".
      bodyPlanStartedOn: { type: String, default: '' },
      weeklyPaceKg: { type: Number, min: 0.1, max: 1, default: 0.5 },
      // 'off' = every weekly change needs a tap (default). 'safe' = small changes inside the safe limits are applied for you, with a one-tap undo.
      coachAuto: { type: String, enum: ['off', 'safe'], default: 'off' },
    },
    // How the person trains (asked on the Body plan screen). Drives the weekly program: where, level, days, time, home equipment,
    // anything that hurts, and muscles to bring up. Empty = not chosen yet, the plan uses sensible defaults and says so.
    training: {
      place: { type: String, enum: ['gym', 'home', 'both', ''], default: '' },
      level: { type: String, enum: ['beginner', 'intermediate', 'advanced', ''], default: '' },
      days: { type: Number, min: 2, max: 7, default: null },
      weekdays: { type: [{ type: Number, min: 0, max: 6 }], default: [] }, // gym days: 0 = Monday ... 6 = Sunday
      minutes: { type: Number, min: 20, max: 120, default: null },
      equipment: { type: [{ type: String, enum: ['dumbbells', 'bands', 'bench', 'pullupbar', 'kettlebell'] }], default: [] },
      limits: { type: [{ type: String, enum: ['knee', 'back', 'shoulder', 'wrist', 'elbow', 'heart'] }], default: [] },
      focus: { type: [{ type: String, enum: ['glutes', 'shoulders', 'arms', 'chest', 'back', 'legs', 'core'] }], default: [] },
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
      // Weekly backup email with the data export attached. Off by default; `lastBackupEmail` = Monday of the last week sent.
      backupEmail: { type: Boolean, default: false },
      lastBackupEmail: { type: String, default: '' },
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
    // App tour progress (see lib/tourState.js): only short ids, so it is safe to export and delete with the account.
    tour: { type: Object, default: {} },
    // Safety layer. hideNumbers hides weights and calorie counts in the apps (the plan still works).
    safety: { hideNumbers: { type: Boolean, default: false } },
    // Existing accounts default to true so they are never pushed through first-run onboarding;
    // signup creates the profile with onboarded:false explicitly.
    onboarded: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Profile', schema);
