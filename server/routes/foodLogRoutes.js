const express = require("express");
const Food = require("../models/Food");
const FoodLog = require("../models/FoodLog");

const router = express.Router();


// ============================================================
// GET FOOD LOGS FOR A DATE
// ============================================================

router.get("/", async (req, res) => {
  try {
    const { date, mealType } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: "Date is required",
      });
    }

    const filter = {
      date,
    };

    if (mealType) {
      filter.mealType = mealType;
    }

    const logs = await FoodLog.find(filter)
      .sort({ createdAt: 1 });

    res.json({
      success: true,
      logs,
    });
  } catch (error) {
    console.error("Failed to fetch food logs:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch food logs",
    });
  }
});


// ============================================================
// ADD FOOD TO DAILY LOG
// ============================================================

router.post("/", async (req, res) => {
  try {
    const {
      foodId,
      date,
      mealType,
      quantity,
      notes,
    } = req.body;

    // Validate required fields
    if (!foodId || !date || !mealType || quantity === undefined) {
      return res.status(400).json({
        success: false,
        message:
          "foodId, date, mealType and quantity are required",
      });
    }

    // Quantity must be positive
    if (Number(quantity) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Quantity must be greater than 0",
      });
    }

    // Find the master food
    const food = await Food.findById(foodId);

    if (!food) {
      return res.status(404).json({
        success: false,
        message: "Food not found",
      });
    }

    // Calculate servings
    const servings =
      Number(quantity) / Number(food.servingSize);

    // Calculate final nutrition
    const nutritionTotal = {
      calories: food.calories * servings,
      protein: food.protein * servings,
      carbohydrates: food.carbohydrates * servings,
      fat: food.fat * servings,
      fiber: food.fiber * servings,
      sugar: food.sugar * servings,
    };

    // Create snapshot
    const foodLog = new FoodLog({
      foodId: food._id,

      date,

      mealType,

      foodName: food.name,

      baseServingSize: food.servingSize,

      servingUnit: food.servingUnit,

      consumedQuantity: Number(quantity),

      servings,

      nutritionPerServing: {
        calories: food.calories,
        protein: food.protein,
        carbohydrates: food.carbohydrates,
        fat: food.fat,
        fiber: food.fiber,
        sugar: food.sugar,
      },

      nutritionTotal,

      notes: notes || "",
    });

    const savedLog = await foodLog.save();

    res.status(201).json({
      success: true,
      message: "Food logged successfully",
      log: savedLog,
    });
  } catch (error) {
    console.error("Failed to create food log:", error);

    res.status(400).json({
      success: false,
      message: "Failed to log food",
      error: error.message,
    });
  }
});


// ============================================================
// DELETE FOOD LOG
// ============================================================

router.delete("/:id", async (req, res) => {
  try {
    const deletedLog = await FoodLog.findByIdAndDelete(
      req.params.id
    );

    if (!deletedLog) {
      return res.status(404).json({
        success: false,
        message: "Food log not found",
      });
    }

    res.json({
      success: true,
      message: "Food log deleted successfully",
    });
  } catch (error) {
    console.error("Failed to delete food log:", error);

    res.status(500).json({
      success: false,
      message: "Failed to delete food log",
    });
  }
});

// ============================================================
// GET DAILY NUTRITION SUMMARY
// ============================================================

router.get("/summary", async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: "Date is required",
      });
    }

    const logs = await FoodLog.find({
      date,
    });

    const summary = {
      calories: 0,
      protein: 0,
      carbohydrates: 0,
      fat: 0,
      fiber: 0,
      sugar: 0,

      meals: {
        breakfast: 0,
        lunch: 0,
        dinner: 0,
        snacks: 0,
      },
    };

    logs.forEach((log) => {
      const nutrition = log.nutritionTotal || {};

      summary.calories += Number(
        nutrition.calories || 0
      );

      summary.protein += Number(
        nutrition.protein || 0
      );

      summary.carbohydrates += Number(
        nutrition.carbohydrates || 0
      );

      summary.fat += Number(
        nutrition.fat || 0
      );

      summary.fiber += Number(
        nutrition.fiber || 0
      );

      summary.sugar += Number(
        nutrition.sugar || 0
      );

      if (
        Object.prototype.hasOwnProperty.call(
          summary.meals,
          log.mealType
        )
      ) {
        summary.meals[log.mealType] += Number(
          nutrition.calories || 0
        );
      }
    });

    res.json({
      success: true,
      date,
      summary,
    });
  } catch (error) {
    console.error(
      "Failed to calculate daily summary:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to calculate daily summary",
    });
  }
});

module.exports = router;