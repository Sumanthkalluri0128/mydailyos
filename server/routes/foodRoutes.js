const express = require("express");
const Food = require("../models/Food");

const router = express.Router();

// GET all foods
// GET all foods / search foods
router.get("/", async (req, res) => {
  try {
    const { search, favorites } = req.query;

    const filter = {};

    // Search by food name or brand
    if (search) {
      filter.$or = [
        {
          name: {
            $regex: search,
            $options: "i",
          },
        },
        {
          brand: {
            $regex: search,
            $options: "i",
          },
        },
      ];
    }

    // Favorites only
    if (favorites === "true") {
      filter.isFavorite = true;
    }

    const foods = await Food.find(filter).sort({
      name: 1,
    });

    res.json({
      success: true,
      foods,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch foods",
    });
  }
});

// GET one food
router.get("/:id", async (req, res) => {
  try {
    const food = await Food.findById(req.params.id);

    if (!food) {
      return res.status(404).json({
        success: false,
        message: "Food not found",
      });
    }

    res.json({
      success: true,
      food,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch food",
    });
  }
});

// CREATE food
router.post("/", async (req, res) => {
  try {
    const food = new Food({
      name: req.body.name,
      brand: req.body.brand,
      servingSize: req.body.servingSize,
      servingUnit: req.body.servingUnit,
      calories: req.body.calories,
      protein: req.body.protein,
      carbohydrates: req.body.carbohydrates,
      fat: req.body.fat,
      fiber: req.body.fiber,
      sugar: req.body.sugar,
      notes: req.body.notes,
    });

    const savedFood = await food.save();

    res.status(201).json({
      success: true,
      message: "Food created successfully",
      food: savedFood,
    });
  } catch (error) {
    console.error(error);

    res.status(400).json({
      success: false,
      message: "Failed to create food",
      error: error.message,
    });
  }
});

// UPDATE food
router.put("/:id", async (req, res) => {
  try {
    const updatedFood = await Food.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updatedFood) {
      return res.status(404).json({
        success: false,
        message: "Food not found",
      });
    }

    res.json({
      success: true,
      message: "Food updated successfully",
      food: updatedFood,
    });
  } catch (error) {
    console.error(error);

    res.status(400).json({
      success: false,
      message: "Failed to update food",
      error: error.message,
    });
  }
});

// DELETE food
router.delete("/:id", async (req, res) => {
  try {
    const deletedFood = await Food.findByIdAndDelete(req.params.id);

    if (!deletedFood) {
      return res.status(404).json({
        success: false,
        message: "Food not found",
      });
    }

    res.json({
      success: true,
      message: "Food deleted successfully",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to delete food",
    });
  }
});


// TOGGLE FAVORITE
router.patch("/:id/favorite", async (req, res) => {
  try {
    const food = await Food.findById(req.params.id);

    if (!food) {
      return res.status(404).json({
        success: false,
        message: "Food not found",
      });
    }

    food.isFavorite = !food.isFavorite;

    await food.save();

    res.json({
      success: true,
      message: food.isFavorite
        ? "Food added to favorites"
        : "Food removed from favorites",
      food,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to update favorite",
    });
  }
});

module.exports = router;