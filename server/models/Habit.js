const mongoose = require("mongoose");

const habitSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    category: {
      type: String,
      default: "General",
      trim: true,
    },

    frequency: {
      type: String,
      enum: [
        "daily",
        "weekdays",
        "weekly",
      ],
      default: "daily",
    },

    target: {
      type: Number,
      default: 1,
      min: 1,
    },

    unit: {
      type: String,
      default: "times",
      trim: true,
    },

    isActive: {
      type: Boolean,
      default: true,
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

habitSchema.index({
  name: 1,
});

module.exports = mongoose.model(
  "Habit",
  habitSchema
);