const express = require("express");

const Habit = require("../models/Habit");
const HabitLog = require("../models/HabitLog");

const router = express.Router();

// ============================================================
// DATE HELPERS
// ============================================================

function formatDate(date) {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function startOfDay(date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
}

function startOfWeek(date) {
  const result =
    startOfDay(date);

  const day =
    result.getDay();

  const difference =
    day === 0
      ? -6
      : 1 - day;

  result.setDate(
    result.getDate() +
      difference
  );

  return result;
}

function dateFromString(dateString) {
  const [
    year,
    month,
    day,
  ] = dateString
    .split("-")
    .map(Number);

  return new Date(
    year,
    month - 1,
    day
  );
}

// ============================================================
// CALCULATE CURRENT STREAK
// ============================================================

function calculateCurrentStreak(
  logs,
  frequency
) {
  const completedDates =
    new Set(
      logs
        .filter(
          (log) =>
            log.completed
        )
        .map(
          (log) =>
            log.date
        )
    );

  if (
    completedDates.size === 0
  ) {
    return 0;
  }

  const today =
    startOfDay(
      new Date()
    );

  // ----------------------------------------------------------
  // DAILY
  // ----------------------------------------------------------

  if (
    frequency === "daily"
  ) {
    let currentDate =
      today;

    let streak = 0;

    while (
      completedDates.has(
        formatDate(
          currentDate
        )
      )
    ) {
      streak++;

      currentDate =
        new Date(
          currentDate
        );

      currentDate.setDate(
        currentDate.getDate() -
          1
      );
    }

    return streak;
  }

  // ----------------------------------------------------------
  // WEEKDAYS
  // ----------------------------------------------------------

  if (
    frequency === "weekdays"
  ) {
    let currentDate =
      today;

    let streak = 0;

    // If today is weekend, begin with
    // the most recent Friday.
    if (
      currentDate.getDay() ===
      0
    ) {
      currentDate.setDate(
        currentDate.getDate() -
          2
      );
    } else if (
      currentDate.getDay() ===
      6
    ) {
      currentDate.setDate(
        currentDate.getDate() -
          1
      );
    }

    while (true) {
      const day =
        currentDate.getDay();

      if (
        day === 0 ||
        day === 6
      ) {
        currentDate.setDate(
          currentDate.getDate() -
            1
        );

        continue;
      }

      const date =
        formatDate(
          currentDate
        );

      if (
        !completedDates.has(
          date
        )
      ) {
        break;
      }

      streak++;

      currentDate.setDate(
        currentDate.getDate() -
          1
      );
    }

    return streak;
  }

  // ----------------------------------------------------------
  // WEEKLY
  // ----------------------------------------------------------

  if (
    frequency === "weekly"
  ) {
    const completedWeeks =
      new Set();

    completedDates.forEach(
      (dateString) => {
        const date =
          dateFromString(
            dateString
          );

        const week =
          formatDate(
            startOfWeek(
              date
            )
          );

        completedWeeks.add(
          week
        );
      }
    );

    let currentWeek =
      startOfWeek(
        today
      );

    // If the current week has not
    // been completed yet, allow the
    // streak to start from the previous
    // completed week.
    if (
      !completedWeeks.has(
        formatDate(
          currentWeek
        )
      )
    ) {
      currentWeek.setDate(
        currentWeek.getDate() -
          7
      );
    }

    let streak = 0;

    while (
      completedWeeks.has(
        formatDate(
          currentWeek
        )
      )
    ) {
      streak++;

      currentWeek.setDate(
        currentWeek.getDate() -
          7
      );
    }

    return streak;
  }

  return 0;
}

// ============================================================
// GET HABITS
// ============================================================

router.get("/", async (req, res) => {
  try {
    const habits =
      await Habit.find({
        isActive: true,
      }).sort({
        createdAt: 1,
      });

    res.json({
      success: true,
      habits,
    });
  } catch (error) {
    console.error(
      "Failed to fetch habits:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Failed to fetch habits.",
    });
  }
});

// ============================================================
// CREATE HABIT
// ============================================================

router.post("/", async (req, res) => {
  try {
    const {
      name,
      description,
      category,
      frequency,
      target,
      unit,
      notes,
    } = req.body;

    if (
      !name ||
      !name.trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Habit name is required.",
      });
    }

    const numericTarget =
      Number(target);

    if (
      !Number.isFinite(
        numericTarget
      ) ||
      numericTarget <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Habit target must be a positive number.",
      });
    }

    const habit =
      await Habit.create({
        name: name.trim(),

        description:
          description || "",

        category:
          category || "General",

        frequency:
          frequency || "daily",

        target:
          numericTarget,

        unit:
          unit || "times",

        notes:
          notes || "",
      });

    res.status(201).json({
      success: true,
      habit,
    });
  } catch (error) {
    console.error(
      "Failed to create habit:",
      error
    );

    res.status(400).json({
      success: false,
      message:
        "Failed to create habit.",
      error:
        error.message,
    });
  }
});

// ============================================================
// UPDATE HABIT
// ============================================================

router.patch(
  "/:id",
  async (req, res) => {
    try {
      const habit =
        await Habit.findByIdAndUpdate(
          req.params.id,
          req.body,
          {
            new: true,
            runValidators: true,
          }
        );

      if (!habit) {
        return res.status(404).json({
          success: false,
          message:
            "Habit not found.",
        });
      }

      res.json({
        success: true,
        habit,
      });
    } catch (error) {
      console.error(
        "Failed to update habit:",
        error
      );

      res.status(400).json({
        success: false,
        message:
          "Failed to update habit.",
        error:
          error.message,
      });
    }
  }
);

// ============================================================
// DELETE / DEACTIVATE HABIT
// ============================================================

router.delete(
  "/:id",
  async (req, res) => {
    try {
      const habit =
        await Habit.findByIdAndUpdate(
          req.params.id,
          {
            isActive: false,
          },
          {
            new: true,
          }
        );

      if (!habit) {
        return res.status(404).json({
          success: false,
          message:
            "Habit not found.",
        });
      }

      res.json({
        success: true,
        message:
          "Habit deactivated.",
        habit,
      });
    } catch (error) {
      console.error(
        "Failed to deactivate habit:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to deactivate habit.",
      });
    }
  }
);

// ============================================================
// GET HABIT LOGS FOR A DATE
// ============================================================

router.get(
  "/logs",
  async (req, res) => {
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
        await HabitLog.find({
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
        "Failed to fetch habit logs:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to fetch habit logs.",
      });
    }
  }
);

// ============================================================
// CREATE / UPDATE HABIT LOG
// ============================================================

router.post(
  "/logs",
  async (req, res) => {
    try {
      const {
        habitId,
        date,
        completedValue,
        notes,
      } = req.body;

      if (
        !habitId ||
        !date
      ) {
        return res.status(400).json({
          success: false,
          message:
            "habitId and date are required.",
        });
      }

      const habit =
        await Habit.findById(
          habitId
        );

      if (!habit) {
        return res.status(404).json({
          success: false,
          message:
            "Habit not found.",
        });
      }

      const value =
        Math.max(
          0,
          Number(
            completedValue
          ) || 0
        );

      const completed =
        value >=
        habit.target;

      const log =
        await HabitLog.findOneAndUpdate(
          {
            habitId,
            date,
          },
          {
            habitId,
            date,
            habitName:
              habit.name,
            target:
              habit.target,
            unit:
              habit.unit,
            completedValue:
              value,
            completed,
            notes:
              notes || "",
          },
          {
            new: true,
            upsert: true,
            runValidators: true,
          }
        );

      res.json({
        success: true,
        log,
      });
    } catch (error) {
      console.error(
        "Failed to save habit log:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to save habit log.",
      });
    }
  }
);

// ============================================================
// DELETE HABIT LOG
// ============================================================

router.delete(
  "/logs/:id",
  async (req, res) => {
    try {
      const log =
        await HabitLog.findByIdAndDelete(
          req.params.id
        );

      if (!log) {
        return res.status(404).json({
          success: false,
          message:
            "Habit log not found.",
        });
      }

      res.json({
        success: true,
        message:
          "Habit log deleted.",
      });
    } catch (error) {
      console.error(
        "Failed to delete habit log:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to delete habit log.",
      });
    }
  }
);

// ============================================================
// GET HABIT HISTORY
// ============================================================

router.get(
  "/:id/history",
  async (req, res) => {
    try {
      const { id } =
        req.params;

      const habit =
        await Habit.findById(id);

      if (!habit) {
        return res.status(404).json({
          success: false,
          message:
            "Habit not found.",
        });
      }

      const logs =
        await HabitLog.find({
          habitId: id,
        }).sort({
          date: 1,
        });

      res.json({
        success: true,
        habit,
        logs,
      });
    } catch (error) {
      console.error(
        "Failed to fetch habit history:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to fetch habit history.",
      });
    }
  }
);

// ============================================================
// GET HABIT STATS
// ============================================================

router.get(
  "/:id/stats",
  async (req, res) => {
    try {
      const { id } =
        req.params;

      const habit =
        await Habit.findById(id);

      if (!habit) {
        return res.status(404).json({
          success: false,
          message:
            "Habit not found.",
        });
      }

      const logs =
        await HabitLog.find({
          habitId: id,
        }).sort({
          date: 1,
        });

      const currentStreak =
        calculateCurrentStreak(
          logs,
          habit.frequency
        );

      const completedLogs =
        logs.filter(
          (log) =>
            log.completed
        );

      const completionRate =
        logs.length > 0
          ? (
              completedLogs.length /
              logs.length
            ) *
            100
          : 0;

      res.json({
        success: true,

        stats: {
          currentStreak,

          totalCompleted:
            completedLogs.length,

          totalLogged:
            logs.length,

          completionRate:
            Number(
              completionRate.toFixed(
                1
              )
            ),
        },
      });
    } catch (error) {
      console.error(
        "Failed to calculate habit stats:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to calculate habit stats.",
      });
    }
  }
);

module.exports = router;