const express = require("express");

const Task = require("../models/Task");

const router = express.Router();


// ============================================================
// GET TASKS
// ============================================================

router.get("/", async (req, res) => {
  try {
    const {
      date,
      completed,
      category,
    } = req.query;

    const filter = {};

    if (date) {
      filter.date = date;
    }

    if (completed !== undefined) {
      filter.completed =
        completed === "true";
    }

    if (category) {
      filter.category = category;
    }

    const tasks = await Task.find(filter)
      .sort({
        completed: 1,
        priority: -1,
        time: 1,
        createdAt: 1,
      });

    res.json({
      success: true,
      tasks,
    });
  } catch (error) {
    console.error(
      "Failed to fetch tasks:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to fetch tasks",
    });
  }
});


// ============================================================
// CREATE TASK
// ============================================================

router.post("/", async (req, res) => {
  try {
    const {
      title,
      description,
      date,
      time,
      priority,
      category,
      recurrence,
      notes,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: "Task title is required",
      });
    }

    if (!date) {
      return res.status(400).json({
        success: false,
        message: "Task date is required",
      });
    }

    const task = new Task({
      title: title.trim(),

      description:
        description || "",

      date,

      time: time || "",

      priority:
        priority || "medium",

      category:
        category || "General",

      recurrence:
        recurrence || "none",

      notes: notes || "",
    });

    const savedTask =
      await task.save();

    res.status(201).json({
      success: true,
      message: "Task created successfully",
      task: savedTask,
    });
  } catch (error) {
    console.error(
      "Failed to create task:",
      error
    );

    res.status(400).json({
      success: false,
      message: "Failed to create task",
      error: error.message,
    });
  }
});


// ============================================================
// UPDATE TASK
// ============================================================
router.patch(
  "/:id/toggle",
  async (req, res) => {
    try {
      const task =
        await Task.findById(
          req.params.id
        );

      if (!task) {
        return res.status(404).json({
          success: false,
          message: "Task not found",
        });
      }

      task.completed =
        !task.completed;

      task.completedAt =
        task.completed
          ? new Date()
          : null;

      const updatedTask =
        await task.save();

      res.json({
        success: true,
        message:
          task.completed
            ? "Task completed"
            : "Task marked incomplete",
        task: updatedTask,
      });
    } catch (error) {
      console.error(
        "Failed to toggle task:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to toggle task",
      });
    }
  }
);
router.patch("/:id", async (req, res) => {
  try {
    const {
      title,
      description,
      date,
      time,
      priority,
      category,
      recurrence,
      notes,
      completed,
    } = req.body;

    const task =
      await Task.findById(
        req.params.id
      );

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    if (title !== undefined) {
      task.title = title.trim();
    }

    if (description !== undefined) {
      task.description = description;
    }

    if (date !== undefined) {
      task.date = date;
    }

    if (time !== undefined) {
      task.time = time;
    }

    if (priority !== undefined) {
      task.priority = priority;
    }

    if (category !== undefined) {
      task.category = category;
    }

    if (recurrence !== undefined) {
      task.recurrence = recurrence;
    }

    if (notes !== undefined) {
      task.notes = notes;
    }

    // Handle completion separately.
    if (completed !== undefined) {
      task.completed = Boolean(
        completed
      );

      if (task.completed) {
        task.completedAt = new Date();
      } else {
        task.completedAt = null;
      }
    }

    const updatedTask =
      await task.save();

    res.json({
      success: true,
      message: "Task updated successfully",
      task: updatedTask,
    });
  } catch (error) {
    console.error(
      "Failed to update task:",
      error
    );

    res.status(400).json({
      success: false,
      message: "Failed to update task",
      error: error.message,
    });
  }
});


// ============================================================
// TOGGLE TASK COMPLETION
// ============================================================




// ============================================================
// DELETE TASK
// ============================================================

router.delete("/:id", async (req, res) => {
  try {
    const deletedTask =
      await Task.findByIdAndDelete(
        req.params.id
      );

    if (!deletedTask) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    res.json({
      success: true,
      message: "Task deleted successfully",
    });
  } catch (error) {
    console.error(
      "Failed to delete task:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to delete task",
    });
  }
});


module.exports = router;