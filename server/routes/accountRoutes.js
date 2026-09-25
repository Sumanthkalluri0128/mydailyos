const express = require('express');
const User = require('../models/User');
const Profile = require('../models/Profile');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const PERSONAL_MODELS = [
  'Profile',
  'WeightLog',
  'WaterLog',
  'Task',
  'Habit',
  'HabitLog',
  'FoodLog',
  'ActivityLog',
];

router.get('/me', async (req, res) => {
  try {
    const u = await User.findById(req.user.id).select('_id name email createdAt');
    if (!u) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }
    res.json({ success: true, user: u });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.delete('/me', async (req, res) => {
  try {
    const id = req.user.id;

    // Delete every document owned by this user before deleting the user itself.
    // Master Food/Activity catalogues are intentionally NOT deleted because they
    // are shared reference data, not personal data.
    const deleted = {};
    for (const name of PERSONAL_MODELS) {
      const Model = require(`../models/${name}`);
      const result = await Model.deleteMany({ userId: id });
      deleted[name] = result.deletedCount || 0;
    }

    const userResult = await User.deleteOne({ _id: id });

    if (userResult.deletedCount !== 1) {
      return res.status(404).json({
        success: false,
        message: 'Account was not found or was already deleted',
      });
    }

    // Older versions of MyDailyOS stored a small amount of personal data
    // without userId. If this was the last account in the database, those
    // orphan records can only belong to the old single-user installation,
    // so remove them too. This prevents a deleted account from ever being
    // resurrected by a future signup.
    if ((await User.countDocuments()) === 0) {
      for (const name of PERSONAL_MODELS) {
        const Model = require(`../models/${name}`);
        await Model.deleteMany({
          $or: [{ userId: { $exists: false } }, { userId: null }],
        });
      }
    }

    console.log(`Account ${id} deleted permanently`, deleted);

    res.json({
      success: true,
      message: 'Account and all personal data deleted permanently',
    });
  } catch (e) {
    console.error('Account deletion failed:', e);
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
