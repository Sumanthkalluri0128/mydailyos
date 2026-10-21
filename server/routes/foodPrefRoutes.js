// The Planning sensei's private Food Preferences.
//   GET    /api/food-prefs                 prefs + summary chips + safety note + sticker state
//   GET    /api/food-prefs/flow            the 3-4 questions to ask now (adaptive), the lines the sensei says, what the profile already knows
//   POST   /api/food-prefs/answer          { id, value | skipped | usual }  saves one answer at once (so leaving half-way loses nothing)
//   POST   /api/food-prefs/complete        finish a session: unlocks the "Meal Sensei" sticker the first time
//   PUT    /api/food-prefs/coach           { who, tone }
//   GET/POST/DELETE /api/food-prefs/feedback   loved / too heavy / too long to cook / not available; per person, resettable
//   DELETE /api/food-prefs                 forget everything (answers and feedback)
// Allergies, intolerances and health answers are health data: stored only here, exported with the account, deleted with the account.
const express = require('express');
const FoodPreference = require('../models/FoodPreference');
const Profile = require('../models/Profile');
const FoodLog = require('../models/FoodLog');
const Food = require('../models/Food');
const MealPlan = require('../models/MealPlan');
const { requireAuth } = require('../middleware/auth');
const { wrap, HttpError } = require('../lib/http');
const v = require('../lib/validate');
const { todayUtc, addDays } = require('../lib/dates');
const { inferDiet } = require('../lib/smartPlan');
const { dailyTarget } = require('../lib/energy');
const { norm } = require('../lib/foodSafety');
const Q = require('../lib/planQuestions');
const L = require('../lib/senseiLines');

const router = express.Router();
router.use(requireAuth);

const DIET_FROM_CODE = { v: 'veg', e: 'egg', n: 'nonveg' };
const FEEDBACK_KINDS = { loved: 'loved', too_heavy: 'heavy', too_long: 'long', not_available: 'na' };
const GOAL_LABEL = { lose: 'Lose weight', gain: 'Gain weight', maintain: 'Stay where you are' };

const toPlain = (doc) => (doc ? JSON.parse(JSON.stringify(doc)) : {});
const strip = (p) => { const { _id, __v, userId, createdAt, updatedAt, ...rest } = p; return rest; };

async function loadAll(uid) {
  const [doc, profile] = await Promise.all([FoodPreference.findOne({ userId: uid }).lean(), Profile.findOne({ userId: uid }).lean()]);
  return { doc, prefs: strip(toPlain(doc)), profile: profile || {} };
}

/** Saves the fields an answer changed (and the answered marker) in one update. */
async function savePrefs(uid, before, after, qid) {
  const $set = {};
  for (const k of Object.keys(after)) {
    if (k === 'answered' || k === 'feedback' || k === 'sensei' || k === 'coach') continue;
    if (JSON.stringify(after[k]) !== JSON.stringify(before[k])) $set[k] = after[k];
  }
  if (after.answered && after.answered[qid]) $set[`answered.${qid}`] = after.answered[qid];
  const doc = await FoodPreference.findOneAndUpdate({ userId: uid }, { $set, $setOnInsert: { userId: uid } }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }).lean();
  return strip(toPlain(doc));
}

function safetyOf(profile, prefs) { return Q.planSafety(profile, prefs); }

function publicState(prefs, profile, ctx = {}) {
  return {
    prefs,
    chips: Q.summaryChips(prefs, ctx),
    safety: safetyOf(profile, prefs),
    setupDone: Q.isSetupDone(prefs),
    sensei: { sticker: !!(prefs.sensei && prefs.sensei.stickerAt), stickerAt: prefs.sensei?.stickerAt || null, sessions: prefs.sensei?.sessions || 0 },
    coach: prefs.coach || { who: '', tone: '' },
  };
}

/** feedback -> which questions to ask earlier ("too long to cook" three times: ask about cook time) */
function boostFrom(prefs) {
  const sum = (k) => (prefs.feedback || []).reduce((s, f) => s + (f[k] || 0), 0);
  const boost = {};
  if (sum('long') >= 2) boost.cookTime = 3;
  if (sum('heavy') >= 2) boost.spiceOil = 2;
  if (sum('na') >= 2) boost.have = 2;
  return boost;
}

function questionView(q, prefs, ctx, index, total) {
  const usual = Q.usualFor(q.id, prefs, ctx);
  return {
    id: q.id, type: q.type, group: q.group, ask: q.ask, hint: q.hint || '', options: Q.optionsFor(q, prefs) || undefined, groups: q.groups, fields: q.fields, suggestions: q.suggestions,
    max: q.max, allowNone: !!q.allowNone, exclusive: q.exclusive || undefined, needsConsent: !!q.needsConsent, usual, skippable: true, index, total,
  };
}

router.get('/', wrap(async (req, res) => {
  const { prefs, profile } = await loadAll(req.user.id);
  res.json({ success: true, ...publicState(prefs, profile, { days: Number(req.query.days) || 7 }) });
}));

router.get('/flow', wrap(async (req, res) => {
  const uid = req.user.id;
  const today = req.query.today ? v.date(req.query.today, 'today') : todayUtc();
  const { prefs, profile } = await loadAll(uid);
  const logs = await FoodLog.find({ userId: uid, date: { $gt: addDays(today, -60), $lte: today } }).select('foodName').lean();
  const names = logs.map((l) => l.foodName).filter(Boolean);
  const events = (profile.plan && profile.plan.events) || [];
  const ctx = { today, age: Number(profile.age) || 0, events: events.map((e) => ({ startDate: e.startDate, endDate: e.endDate || e.startDate })), boost: boostFrom(prefs), inferredDiet: names.length >= 5 ? DIET_FROM_CODE[inferDiet(names)] : '' };
  const mode = req.query.mode === 'update' ? 'update' : req.query.mode === 'setup' ? 'setup' : (Q.isSetupDone(prefs) ? 'update' : 'setup');
  // ?only=cookTime : just that one question (used when a chip on the setup card is tapped to edit it)
  const only = req.query.only && Q.Q[String(req.query.only)] ? [Q.Q[String(req.query.only)]] : null;
  const picked = only || Q.pickQuestions({ prefs, ctx: { ...ctx, mode }, now: Date.now() });
  const questions = picked.map((q, i) => questionView(q, prefs, ctx, i, picked.length));
  const known = [];
  const target = dailyTarget(profile);
  if (profile.goals && profile.goals.targetWeightKg && profile.currentWeightKg) known.push({ label: 'Goal', value: GOAL_LABEL[profile.currentWeightKg > profile.goals.targetWeightKg ? 'lose' : profile.currentWeightKg < profile.goals.targetWeightKg ? 'gain' : 'maintain'] });
  if (target > 0) known.push({ label: 'Daily calories', value: `${Math.round(target).toLocaleString('en-US')} kcal` });
  if (prefs.diet) known.push({ label: 'Diet', value: Q.DIET_OPTIONS.find((o) => o.id === prefs.diet)?.label || prefs.diet });
  const lines = { tones: L.TONES, ask: L.ASK, intro: L.INTRO, update: L.UPDATE, react: L.GENERIC_REACT, specific: L.REACT, skip: L.SKIP, usual: L.USUAL, done: L.DONE, coach: L.COACH };
  res.json({
    success: true, mode, questions, known, maxPerSession: mode === 'update' ? Q.MAX_PER_UPDATE : Q.MAX_PER_SESSION, lines,
    ...publicState(prefs, profile, ctx),
  });
}));

router.post('/answer', wrap(async (req, res) => {
  const uid = req.user.id;
  const qid = String(req.body?.id || '');
  const q = Q.Q[qid];
  if (!q) throw new HttpError(400, 'Unknown question');
  const { prefs: before, profile } = await loadAll(uid);
  let after = before;
  if (req.body?.skipped === true) after = Q.markAnswered(before, qid, { skipped: true });
  else {
    const useUsual = req.body?.usual === true;
    const value = useUsual ? Q.usualFor(qid, before, {}) : req.body?.value;
    if (value === null || value === undefined) { if (!useUsual) throw new HttpError(400, 'Missing answer'); after = Q.markAnswered(before, qid, { usual: true }); }
    else {
      const r = Q.applyAnswer(before, qid, value);
      if (r.error) throw new HttpError(400, r.error);
      after = Q.markAnswered(r.prefs, qid, { usual: useUsual });
    }
  }
  const saved = await savePrefs(uid, before, after, qid);
  const follow = req.body?.skipped === true ? null : Q.followUp(qid, saved);
  const ctx = { today: req.body?.today ? v.date(req.body.today, 'today') : todayUtc() };
  res.json({ success: true, followUp: follow ? questionView(follow, saved, ctx, 0, 1) : null, ...publicState(saved, profile, ctx) });
}));

router.post('/complete', wrap(async (req, res) => {
  const uid = req.user.id;
  const { prefs: before, profile } = await loadAll(uid);
  const first = !(before.sensei && before.sensei.stickerAt);
  const now = new Date();
  const doc = await FoodPreference.findOneAndUpdate({ userId: uid }, {
    $set: { 'sensei.completedAt': now, ...(first ? { 'sensei.stickerAt': now } : {}) }, $inc: { 'sensei.sessions': 1 }, $setOnInsert: { userId: uid },
  }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
  const prefs = strip(toPlain(doc));
  res.json({ success: true, unlockedSticker: first, ...publicState(prefs, profile, {}) });
}));

router.put('/coach', wrap(async (req, res) => {
  const uid = req.user.id;
  const who = String(req.body?.who || '').slice(0, 20);
  const tone = ['', 'cheer', 'calm', 'strict'].includes(req.body?.tone) ? req.body.tone : '';
  if (who && !Object.keys(L.COACH).includes(who)) throw new HttpError(400, 'Unknown coach');
  const doc = await FoodPreference.findOneAndUpdate({ userId: uid }, { $set: { coach: { who, tone } }, $setOnInsert: { userId: uid } }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
  res.json({ success: true, coach: doc.coach });
}));

// ---- feedback: per person, resettable -----------------------------------------------------------------------------------
router.get('/feedback', wrap(async (req, res) => {
  const doc = await FoodPreference.findOne({ userId: req.user.id }).select('feedback').lean();
  res.json({ success: true, items: (doc?.feedback || []).map((f) => ({ key: f.key, name: f.name, loved: f.loved || 0, heavy: f.heavy || 0, long: f.long || 0, na: f.na || 0, at: f.at })) });
}));

router.post('/feedback', wrap(async (req, res) => {
  const uid = req.user.id;
  const field = FEEDBACK_KINDS[String(req.body?.kind || '')];
  if (!field) throw new HttpError(400, 'Choose loved, too_heavy, too_long or not_available');
  let name = String(req.body?.name || '').trim();
  if (req.body?.planId) { const it = await MealPlan.findOne({ _id: v.objectId(String(req.body.planId), 'planId'), userId: uid }).select('foodName').lean(); if (it) name = it.foodName; }
  else if (req.body?.foodId) { const f = await Food.findOne({ _id: v.objectId(String(req.body.foodId), 'foodId') }).select('name').lean(); if (f) name = f.name; }
  if (!name) throw new HttpError(400, 'Which food?');
  const key = norm(name);
  let doc = await FoodPreference.findOne({ userId: uid });
  if (!doc) doc = new FoodPreference({ userId: uid });
  let f = doc.feedback.find((x) => x.key === key);
  if (!f) { doc.feedback.push({ key, name, loved: 0, heavy: 0, long: 0, na: 0 }); f = doc.feedback[doc.feedback.length - 1]; }
  f[field] = Math.min(5, (f[field] || 0) + 1);
  if (field === 'loved') f.heavy = 0;
  if (field === 'heavy') f.loved = 0;
  f.at = new Date();
  if (doc.feedback.length > 300) doc.feedback.splice(0, doc.feedback.length - 300);
  await doc.save();
  res.status(201).json({ success: true, feedback: { key, name, loved: f.loved, heavy: f.heavy, long: f.long, na: f.na } });
}));

router.delete('/feedback', wrap(async (req, res) => {
  const uid = req.user.id;
  if (req.query.name) await FoodPreference.updateOne({ userId: uid }, { $pull: { feedback: { key: norm(String(req.query.name)) } } });
  else await FoodPreference.updateOne({ userId: uid }, { $set: { feedback: [] } });
  res.json({ success: true });
}));

router.delete('/', wrap(async (req, res) => {
  await FoodPreference.deleteOne({ userId: req.user.id });
  res.json({ success: true });
}));

module.exports = router;
