const mongoose = require("mongoose");

const waterLogSchema = new mongoose.Schema(
  {
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },

    amountMl: {
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

waterLogSchema.index({
  date: 1,
});

module.exports = mongoose.model(
  "WaterLog",
  waterLogSchema
);