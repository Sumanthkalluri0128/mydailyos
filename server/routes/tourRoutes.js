// The app tour's progress. The steps themselves are in data/tourContent.json (shared with both apps).
//   GET    /api/tour            progress + the first-week checklist + live "What's new" hotspots + the path for the person's goal
//   PATCH  /api/tour            { status, goal, mode, step, stepsDone, never, checklistDismissed, coachmarksSeen, whatsNewSeen }
//   POST   /api/tour/event      { action }  a real action happened (water_logged, food_logged, ...): marks steps and checklist items
//   POST   /api/tour/complete   finish the tour (or the checklist): unlocks the Rookie sticker and journey step once
//   DELETE /api/tour            replay: clears progress, keeps the Rookie sticker
// Nothing here is sent to any third party; progress is plain profile data (exported and deleted with the account).
const express = require('express');
const Profile = require('../models/Profile');
const FoodLog = require('../models/FoodLog');
const WaterLog = require('../models/WaterLog');
const WeightLog = require('../models/WeightLog');
const ActivityLog = require('../models/ActivityLog');
const MealPlan = require('../models/MealPlan');
const FoodPreference = require('../models/FoodPreference');
const { requireAuth } = require('../middleware/auth');
const { wrap, HttpError } = require('../lib/http');
const { todayUtc } = require('../lib/dates');
const T = require('../lib/tour');

const router = express.Router();
router.use(requireAuth);

async function load(uid) {
  const [profile, prefs] = await Promise.all([Profile.findOne({ userId: uid }).lean(), FoodPreference.findOne({ userId: uid }, { coach: 1 }).lean()]);
  return { profile: profile || {}, coachChosen: !!(prefs && prefs.coach && prefs.coach.who) };
}
const save = (uid, tour) => Profile.updateOne({ userId: uid }, { $set: { tour } });

/** Counts of things made since the tour began (so an old account does not finish the checklist on day one). */
async function countsSince(uid, startedAt) {
  if (!startedAt) return {};
  const since = new Date(startedAt);
  if (Number.isNaN(+since)) return {};
  const q = { userId: uid, createdAt: { $gte: since } };
  const [food, water, weight, activity, plan] = await Promise.all([FoodLog, WaterLog, WeightLog, ActivityLog, MealPlan].map((M) => M.countDocuments(q)));
  return { food, water, weight, activity, plan };
}

async function state(uid) {
  const { profile, coachChosen } = await load(uid);
  const tour = T.normalise(profile.tour);
  const suggestedGoal = T.goalFromProfile(profile);
  const goal = tour.goal || suggestedGoal;
  const counts = await countsSince(uid, tour.startedAt);
  const checklist = T.checklistFrom({ tour, counts, coachChosen });
  return {
    tour, goal, goalKnown: !!goal, coachKnown: coachChosen,
    path: T.pathFor(goal, tour.mode), checklist,
    whatsNew: T.whatsNewFor(tour, todayUtc()).map((w) => w.id),
    rookie: { unlocked: !!tour.stickerAt, at: tour.stickerAt || null },
  };
}

router.get('/', wrap(async (req, res) => { res.json({ success: true, ...(await state(req.user.id)) }); }));

router.patch('/', wrap(async (req, res) => {
  const { profile } = await load(req.user.id);
  const next = T.applyPatch(profile.tour, req.body, new Date().toISOString());
  await save(req.user.id, next);
  res.json({ success: true, ...(await state(req.user.id)) });
}));

router.post('/event', wrap(async (req, res) => {
  const action = req.body && req.body.action;
  if (!T.ACTIONS.includes(action)) throw new HttpError(400, 'Unknown tour action');
  const { profile } = await load(req.user.id);
  await save(req.user.id, T.applyEvent(profile.tour, action));
  res.json({ success: true, ...(await state(req.user.id)) });
}));

router.post('/complete', wrap(async (req, res) => {
  const { profile } = await load(req.user.id);
  const done = T.applyPatch(profile.tour, { status: 'done' }, new Date().toISOString());
  const { tour, unlocked } = T.reward(done, new Date().toISOString());
  await save(req.user.id, tour);
  res.json({ success: true, unlockedSticker: unlocked, ...(await state(req.user.id)) });
}));

router.delete('/', wrap(async (req, res) => {
  const { profile } = await load(req.user.id);
  const old = T.normalise(profile.tour);
  const fresh = T.applyPatch({ ...T.blank(), stickerAt: old.stickerAt, goal: old.goal, mode: old.mode, coachmarksSeen: old.coachmarksSeen, whatsNewSeen: old.whatsNewSeen }, { status: 'active' }, new Date().toISOString());
  await save(req.user.id, fresh);
  res.json({ success: true, ...(await state(req.user.id)) });
}));

module.exports = router;
