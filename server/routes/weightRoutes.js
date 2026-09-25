const express = require('express');
const Weight = require('../models/WeightLog');
const Profile = require('../models/Profile');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const logs = await Weight.find({ userId: req.user.id }).sort({ date: -1, createdAt: -1 });
    res.json({ success: true, logs });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to fetch weight history.' });
  }
});

router.get('/date/:date', async (req, res) => {
  try {
    const log = await Weight.findOne({ userId: req.user.id, date: req.params.date }).sort({ createdAt: -1 });
    res.json({ success: true, date: req.params.date, log: log || null });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to fetch weight.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const date = String(req.body.date || '');
    const weightKg = Number(req.body.weightKg);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(weightKg) || weightKg <= 0) {
      return res.status(400).json({ success: false, message: 'Valid date and positive weightKg are required.' });
    }

    const log = await Weight.findOneAndUpdate(
      { userId: req.user.id, date },
      { $set: { weightKg, notes: req.body.notes || '' } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    await Profile.findOneAndUpdate(
      { userId: req.user.id },
      { $set: { currentWeightKg: weightKg } },
      { upsert: true, setDefaultsOnInsert: true }
    );

    res.status(201).json({ success: true, log, currentWeightKg: weightKg });
  } catch (e) {
    console.error('Failed to save weight:', e);
    res.status(400).json({ success: false, message: e.message || 'Failed to save weight.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const log = await Weight.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!log) return res.status(404).json({ success: false, message: 'Weight entry not found.' });

    const latest = await Weight.findOne({ userId: req.user.id }).sort({ date: -1, createdAt: -1 });
    await Profile.findOneAndUpdate(
      { userId: req.user.id },
      { $set: { currentWeightKg: latest?.weightKg ?? null } },
      { upsert: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true, currentWeightKg: latest?.weightKg ?? null });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to delete weight entry.' });
  }
});

module.exports = router;
