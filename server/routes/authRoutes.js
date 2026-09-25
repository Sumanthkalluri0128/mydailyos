const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Profile = require('../models/Profile');

const router = express.Router();

function createToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

async function migrateLegacyPersonalData(userId) {
  const collections = [
    'WeightLog',
    'WaterLog',
    'Task',
    'Habit',
    'HabitLog',
    'FoodLog',
    'ActivityLog',
  ];

  for (const name of collections) {
    const Model = require(`../models/${name}`);
    await Model.updateMany(
      { $or: [{ userId: { $exists: false } }, { userId: null }] },
      { $set: { userId } }
    );
  }

  // Legacy Profile is special because the new schema has a unique userId.
  // Reuse the old profile if one exists instead of creating two profiles
  // with the same userId.
  const legacyProfile = await Profile.findOne({
    $or: [{ userId: { $exists: false } }, { userId: null }],
  }).sort({ createdAt: 1 });

  if (legacyProfile) {
    legacyProfile.userId = userId;
    await legacyProfile.save();
  } else {
    await Profile.create({ userId });
  }
}

router.post('/signup', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!name || !email || password.length < 8) {
      return res.status(400).json({
        success: false,
        message:
          'Name, valid email and password of at least 8 characters are required',
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address',
      });
    }

    if (await User.exists({ email })) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists',
      });
    }

    const isFirstUser = (await User.countDocuments()) === 0;

    const user = await User.create({
      name,
      email,
      passwordHash: await bcrypt.hash(password, 12),
    });

    if (isFirstUser) {
      await migrateLegacyPersonalData(user._id);
    } else {
      await Profile.create({ userId: user._id, name: user.name });
    }

    res.status(201).json({
      success: true,
      token: createToken(user),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error('Signup failed:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    const user = await User.findOne({ email });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    res.json({
      success: true,
      token: createToken(user),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error('Login failed:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
