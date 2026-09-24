const mongoose = require("mongoose");

const foodLogSchema = new mongoose.Schema(
  {
    // Reference to the original food
    foodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Food",
      required: true,
    },

    // Date the food was eaten
    // We use YYYY-MM-DD to avoid timezone problems.
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },

    // Meal where the food was consumed
    mealType: {
      type: String,
      enum: ["breakfast", "lunch", "dinner", "snacks"],
      required: true,
    },

    // Snapshot of the food name
    foodName: {
      type: String,
      required: true,
    },

    // Snapshot of the original serving information
    baseServingSize: {
      type: Number,
      required: true,
      min: 0,
    },

    servingUnit: {
      type: String,
      required: true,
    },

    // Amount actually eaten
    consumedQuantity: {
      type: Number,
      required: true,
      min: 0,
    },

    // Number of base servings consumed
    servings: {
      type: Number,
      required: true,
      min: 0,
    },

    // Nutrition snapshot per base serving
    nutritionPerServing: {
      calories: {
        type: Number,
        required: true,
        min: 0,
      },

      protein: {
        type: Number,
        default: 0,
        min: 0,
      },

      carbohydrates: {
        type: Number,
        default: 0,
        min: 0,
      },

      fat: {
        type: Number,
        default: 0,
        min: 0,
      },

      fiber: {
        type: Number,
        default: 0,
        min: 0,
      },

      sugar: {
        type: Number,
        default: 0,
        min: 0,
      },
    },

    // Final nutrition for the amount actually eaten
    nutritionTotal: {
      calories: {
        type: Number,
        required: true,
        min: 0,
      },

      protein: {
        type: Number,
        default: 0,
        min: 0,
      },

      carbohydrates: {
        type: Number,
        default: 0,
        min: 0,
      },

      fat: {
        type: Number,
        default: 0,
        min: 0,
      },

      fiber: {
        type: Number,
        default: 0,
        min: 0,
      },

      sugar: {
        type: Number,
        default: 0,
        min: 0,
      },
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

// Useful for quickly getting a day's logs
foodLogSchema.index({
  date: 1,
  mealType: 1,
});

module.exports = mongoose.model("FoodLog", foodLogSchema);