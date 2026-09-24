const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    category: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    // MET = metabolic equivalent.
    // Used to estimate calories burned.
    met: {
      type: Number,
      required: true,
      min: 0.1,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    isFavorite: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

activitySchema.index({
  name: 1,
});

module.exports = mongoose.model(
  "Activity",
  activitySchema
);