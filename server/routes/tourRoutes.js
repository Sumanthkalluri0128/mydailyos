// Tour progress, stored on the profile so it follows the person to another device. GET reads, PUT merges (never loses completed steps).
const express = require('express');
const Profile = require('../models/Profile');
const { requireAuth } = require('../middleware/auth');
const { wrap } = require('../lib/http');
const { sanitizeTour, mergeTour } = require('../lib/tourState');

const router = express.Router();
router.use(requireAuth);

router.get('/', wrap(async (req, res) => {
  const p = await Profile.findOne({ userId: req.user.id }).select('tour').lean();
  res.json({ success: true, tour: p?.tour || {} });
}));

router.put('/', wrap(async (req, res) => {
  const p = await Profile.findOne({ userId: req.user.id }).select('tour').lean();
  const merged = mergeTour(p?.tour || {}, sanitizeTour(req.body));
  await Profile.updateOne({ userId: req.user.id }, { $set: { tour: merged } }, { upsert: true });
  res.json({ success: true, tour: merged });
}));

module.exports = router;
