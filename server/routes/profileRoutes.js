const express = require("express");

const Profile = require("../models/Profile");

const router = express.Router();


// ============================================================
// GET PROFILE
// ============================================================

router.get("/", async (req, res) => {
  try {
    let profile = await Profile.findOne();

    if (!profile) {
      profile = await Profile.create({});
    }

    res.json({
      success: true,
      profile,
    });
  } catch (error) {
    console.error(
      "Failed to fetch profile:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to fetch profile.",
    });
  }
});


// ============================================================
// UPDATE PROFILE
// ============================================================

router.patch("/", async (req, res) => {
  try {
    const {
      name,
      age,
      sex,
      heightCm,
      currentWeightKg,
      activityLevel,
      goals,
    } = req.body;

    let profile = await Profile.findOne();

    if (!profile) {
      profile = new Profile();
    }

    if (name !== undefined) {
      profile.name = name;
    }

    if (age !== undefined) {
      profile.age = age;
    }

    if (sex !== undefined) {
      profile.sex = sex;
    }

    if (heightCm !== undefined) {
      profile.heightCm = heightCm;
    }

    if (currentWeightKg !== undefined) {
      profile.currentWeightKg =
        currentWeightKg;
    }

    if (activityLevel !== undefined) {
      profile.activityLevel =
        activityLevel;
    }

    if (goals !== undefined) {
      profile.goals = {
        ...profile.goals.toObject(),
        ...goals,
      };
    }

    await profile.save();

    res.json({
      success: true,
      profile,
    });
  } catch (error) {
    console.error(
      "Failed to update profile:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to update profile.",
    });
  }
});


module.exports = router;