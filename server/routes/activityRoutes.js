const express = require("express");

const Activity = require("../models/Activity");
const ActivityLog = require("../models/ActivityLog");

const router = express.Router();

// ============================================================
// GET ACTIVITIES
// ============================================================

router.get("/", async (req, res) => {
  try {
    const {
      search,
      category,
    } = req.query;

    const filter = {};

    if (search) {
      filter.name = {
        $regex: search,
        $options: "i",
      };
    }

    if (category) {
      filter.category = category;
    }

    const activities =
      await Activity.find(filter).sort({
        isFavorite: -1,
        name: 1,
      });

    res.json({
      success: true,
      activities,
    });
  } catch (error) {
    console.error(
      "Failed to fetch activities:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Failed to fetch activities.",
    });
  }
});

// ============================================================
// ADD ACTIVITY TO DAILY LOG
// ============================================================

router.post("/logs", async (req, res) => {
  try {
    const {
      activityId,
      date,
      durationMinutes,
      weightKg,
      notes,
    } = req.body;

    if (
      !activityId ||
      !date ||
      durationMinutes === undefined ||
      weightKg === undefined
    ) {
      return res.status(400).json({
        success: false,
        message:
          "activityId, date, durationMinutes and weightKg are required.",
      });
    }

    const duration =
      Number(durationMinutes);

    const weight =
      Number(weightKg);

    if (
      !Number.isFinite(duration) ||
      duration <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Duration must be a positive number.",
      });
    }

    if (
      !Number.isFinite(weight) ||
      weight <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Weight must be a positive number.",
      });
    }

    const activity =
      await Activity.findById(
        activityId
      );

    if (!activity) {
      return res.status(404).json({
        success: false,
        message:
          "Activity not found.",
      });
    }

    // Standard MET calorie estimate:
    //
    // calories =
    // MET × 3.5 × weightKg / 200 × minutes

    const caloriesBurned =
      (activity.met *
        3.5 *
        weight) /
      200 *
      duration;

    const activityLog =
      new ActivityLog({
        activityId:
          activity._id,

        date,

        activityName:
          activity.name,

        category:
          activity.category,

        durationMinutes:
          duration,

        weightKg:
          weight,

        met:
          activity.met,

        caloriesBurned:
          Number(
            caloriesBurned.toFixed(2)
          ),

        notes:
          notes || "",
      });

    const savedLog =
      await activityLog.save();

    res.status(201).json({
      success: true,
      message:
        "Activity logged successfully.",
      log: savedLog,
    });
  } catch (error) {
    console.error(
      "Failed to create activity log:",
      error
    );

    res.status(400).json({
      success: false,
      message:
        "Failed to log activity.",
      error:
        error.message,
    });
  }
});

// ============================================================
// GET ACTIVITY LOGS FOR A DATE
// ============================================================

router.get("/logs", async (req, res) => {
  try {
    const { date } =
      req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        message:
          "Date is required.",
      });
    }

    const logs =
      await ActivityLog.find({
        date,
      }).sort({
        createdAt: 1,
      });

    res.json({
      success: true,
      date,
      logs,
    });
  } catch (error) {
    console.error(
      "Failed to fetch activity logs:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Failed to fetch activity logs.",
    });
  }
});

// ============================================================
// DAILY CALORIES BURNED SUMMARY
// ============================================================

router.get("/summary", async (req, res) => {
  try {
    const { date } =
      req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        message:
          "Date is required.",
      });
    }

    const logs =
      await ActivityLog.find({
        date,
      });

    let caloriesBurned = 0;
    let totalMinutes = 0;

    logs.forEach((log) => {
      caloriesBurned +=
        Number(
          log.caloriesBurned || 0
        );

      totalMinutes +=
        Number(
          log.durationMinutes || 0
        );
    });

    res.json({
      success: true,
      date,
      summary: {
        caloriesBurned:
          Number(
            caloriesBurned.toFixed(2)
          ),

        totalMinutes,
      },
    });
  } catch (error) {
    console.error(
      "Failed to calculate activity summary:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Failed to calculate activity summary.",
    });
  }
});

// ============================================================
// DELETE ACTIVITY LOG
// ============================================================

router.delete(
  "/logs/:id",
  async (req, res) => {
    try {
      const deletedLog =
        await ActivityLog.findByIdAndDelete(
          req.params.id
        );

      if (!deletedLog) {
        return res.status(404).json({
          success: false,
          message:
            "Activity log not found.",
        });
      }

      res.json({
        success: true,
        message:
          "Activity log deleted successfully.",
      });
    } catch (error) {
      console.error(
        "Failed to delete activity log:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to delete activity log.",
      });
    }
  }
);

module.exports = router;