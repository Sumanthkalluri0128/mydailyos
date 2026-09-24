const express = require("express");

const WeightLog = require("../models/WeightLog");
const Profile = require("../models/Profile");

const router = express.Router();


// ============================================================
// GET WEIGHT LOGS
// ============================================================

router.get("/", async (req, res) => {
  try {
    const logs = await WeightLog.find()
      .sort({
        date: -1,
        createdAt: -1,
      });

    res.json({
      success: true,
      logs,
    });
  } catch (error) {
    console.error(
      "Failed to fetch weight logs:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to fetch weight logs.",
    });
  }
});


// ============================================================
// GET WEIGHT LOG FOR A DATE
// ============================================================

router.get("/date/:date", async (req, res) => {
  try {
    const log = await WeightLog.findOne({
      date: req.params.date,
    }).sort({
      createdAt: -1,
    });

    res.json({
      success: true,
      date: req.params.date,
      log: log || null,
    });
  } catch (error) {
    console.error(
      "Failed to fetch weight for date:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to fetch weight.",
    });
  }
});


// ============================================================
// ADD WEIGHT
// ============================================================

router.post("/", async (req, res) => {
  try {
    const {
      date,
      weightKg,
      notes,
    } = req.body;

    if (!date || weightKg === undefined || weightKg === null) {
      return res.status(400).json({
        success: false,
        message:
          "Date and weightKg are required.",
      });
    }

    const weight = Number(weightKg);

    if (!Number.isFinite(weight) || weight <= 0) {
      return res.status(400).json({
        success: false,
        message:
          "weightKg must be a positive number.",
      });
    }

    // --------------------------------------------------------
    // SAVE WEIGHT LOG
    // --------------------------------------------------------

    const log = await WeightLog.create({
      date,
      weightKg: weight,
      notes: notes || "",
    });

    // --------------------------------------------------------
    // UPDATE PROFILE CURRENT WEIGHT
    // --------------------------------------------------------

    await Profile.findOneAndUpdate(
      {},
      {
        currentWeightKg: weight,
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );

    // --------------------------------------------------------
    // RESPONSE
    // --------------------------------------------------------

    res.status(201).json({
      success: true,
      log,
      currentWeightKg: weight,
    });

  } catch (error) {
    console.error(
      "Failed to add weight:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to add weight.",
    });
  }
});


// ============================================================
// DELETE WEIGHT LOG
// ============================================================

router.delete("/:id", async (req, res) => {
  try {
    const deletedLog = await WeightLog.findByIdAndDelete(
      req.params.id
    );

    if (!deletedLog) {
      return res.status(404).json({
        success: false,
        message: "Weight entry not found.",
      });
    }

    // Find the newest remaining weight entry
    const latestRemainingWeight =
      await WeightLog.findOne()
        .sort({
          date: -1,
          createdAt: -1,
        });

    if (latestRemainingWeight) {
      await Profile.findOneAndUpdate(
        {},
        {
          currentWeightKg:
            latestRemainingWeight.weightKg,
        },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true,
        }
      );
    } else {
      // No weight entries remain
      await Profile.findOneAndUpdate(
        {},
        {
          currentWeightKg: null,
        },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true,
        }
      );
    }

    res.json({
      success: true,
      message: "Weight entry deleted.",
      currentWeightKg:
        latestRemainingWeight?.weightKg ?? null,
    });
  } catch (error) {
    console.error(
      "Failed to delete weight:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to delete weight.",
    });
  }
});

module.exports = router;