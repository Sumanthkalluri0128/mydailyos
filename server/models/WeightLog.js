const mongoose = require("mongoose");

const weightLogSchema = new mongoose.Schema(
  {
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },

    weightKg: {
      type: Number,
      required: true,
      min: 1,
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

weightLogSchema.index({
  date: 1,
});

module.exports = mongoose.model(
  "WeightLog",
  weightLogSchema
);