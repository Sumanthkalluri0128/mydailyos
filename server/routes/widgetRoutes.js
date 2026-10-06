// Compact "today" snapshot for home-screen widgets / watch complications / shortcuts (one small, cacheable payload).
const express = require('express');
const Profile = require('../models/Profile');
const FoodLog = require('../models/FoodLog');
const { requireAuth } = require('../middleware/auth');
const { wrap } = require('../lib/http');
const { buildHistory } = require('../lib/progress');
const { computeStreaks } = require('../lib/streaks');
const { dayBalance, expectedEnergy, macroTargets } = require('../lib/energy');
const v = require('../lib/validate');

const router = express.Router();
router.use(requireAuth);

router.get('/summary', wrap(async (req, res) => {
  const uid = req.user.id;
  const date = v.date(req.query.date, 'date');
  const [{ days }, profile, dates] = await Promise.all([buildHistory(uid, date, date), Profile.findOne({ userId: uid }).lean(), FoodLog.distinct('date', { userId: uid })]);
  const d = days[0];
  const bal = dayBalance(profile, { eaten: d.calories, workout: d.caloriesBurned - d.stepCalories, steps: d.stepCalories });
  const e = expectedEnergy(profile);
  const macros = macroTargets(bal.target, profile?.currentWeightKg, e?.direction, profile?.goals?.proteinTarget);
  res.set('Cache-Control', 'private, max-age=60').json({
    success: true, date,
    calories: { eaten: Math.round(d.calories), budget: Math.round(bal.budget), remaining: Math.round(bal.remaining) },
    protein: { eaten: Math.round(d.protein), target: macros.protein },
    fiber: { eaten: Math.round(d.fiber * 10) / 10, target: macros.fiber },
    water: { ml: d.waterMl, target: profile?.goals?.waterTargetMl || 3000 },
    steps: { count: d.steps, target: profile?.goals?.stepsTarget || 10000 },
    streak: computeStreaks(dates, date).current,
  });
}));

module.exports = router;
