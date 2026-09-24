const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    description: {
      type: String,
      default: "",
    },

    // Date on which this task should appear.
    // Stored as YYYY-MM-DD.
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },

    // Optional time.
    time: {
      type: String,
      default: "",
    },

    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },

    category: {
      type: String,
      default: "General",
      trim: true,
    },

    completed: {
      type: Boolean,
      default: false,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    // Used later for recurring tasks.
    recurrence: {
      type: String,
      enum: [
        "none",
        "daily",
        "weekdays",
        "weekly",
        "monthly",
      ],
      default: "none",
    },

    notes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Quickly retrieve tasks for a particular day.
taskSchema.index({
  date: 1,
  completed: 1,
});

module.exports = mongoose.model(
  "Task",
  taskSchema
);