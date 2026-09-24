const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema(
  {
    activityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Activity",
      required: true,
    },

    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },

    activityName: {
      type: String,
      required: true,
      trim: true,
    },

    category: {
      type: String,
      required: true,
      trim: true,
    },

    durationMinutes: {
      type: Number,
      required: true,
      min: 0.1,
    },

    // Weight used for this particular calculation.
    weightKg: {
      type: Number,
      required: true,
      min: 0.1,
    },

    // Snapshot of MET at the time of logging.
    met: {
      type: Number,
      required: true,
      min: 0.1,
    },

    caloriesBurned: {
      type: Number,
      required: true,
      min: 0,
    },

    notes: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

activityLogSchema.index({
  date: 1,
});

module.exports = mongoose.model(
  "ActivityLog",
  activityLogSchema
);