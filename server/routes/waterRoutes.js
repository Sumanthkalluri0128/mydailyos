const express = require("express");

const WaterLog = require("../models/WaterLog");

const router = express.Router();


// ============================================================
// GET WATER LOGS FOR A DATE
// ============================================================

router.get("/", async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: "Date is required.",
      });
    }

    const logs = await WaterLog.find({
      date,
    }).sort({
      createdAt: 1,
    });

    const totalMl = logs.reduce(
      (total, log) =>
        total + Number(log.amountMl || 0),
      0
    );

    res.json({
      success: true,
      date,
      logs,
      totalMl,
      totalLiters:
        Number((totalMl / 1000).toFixed(2)),
    });
  } catch (error) {
    console.error(
      "Failed to fetch water logs:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to fetch water logs.",
    });
  }
});


// ============================================================
// ADD WATER
// ============================================================

router.post("/", async (req, res) => {
  try {
    const {
      date,
      amountMl,
      notes,
    } = req.body;

    if (!date || !amountMl) {
      return res.status(400).json({
        success: false,
        message:
          "Date and amountMl are required.",
      });
    }

    const amount = Number(amountMl);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message:
          "amountMl must be a positive number.",
      });
    }

    const log = await WaterLog.create({
      date,
      amountMl: amount,
      notes: notes || "",
    });

    res.status(201).json({
      success: true,
      log,
    });
  } catch (error) {
    console.error(
      "Failed to add water:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to add water.",
    });
  }
});


// ============================================================
// DELETE WATER LOG
// ============================================================

router.delete("/:id", async (req, res) => {
  try {
    const log =
      await WaterLog.findByIdAndDelete(
        req.params.id
      );

    if (!log) {
      return res.status(404).json({
        success: false,
        message: "Water log not found.",
      });
    }

    res.json({
      success: true,
      message: "Water log deleted.",
    });
  } catch (error) {
    console.error(
      "Failed to delete water log:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to delete water log.",
    });
  }
});


module.exports = router;