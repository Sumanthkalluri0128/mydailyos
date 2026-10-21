// Week templates: save a planned week ("My cutting week") and load it onto any week later.
//   GET    /api/meal-plans/templates
//   POST   /api/meal-plans/templates            { name, from, days? }       save the planned (not yet eaten) meals of 7 days; the same name replaces
//   POST   /api/meal-plans/templates/:id/apply  { from, today, replace? }   load it; meals that already hold food are kept unless replace:true
//   PATCH  /api/meal-plans/templates/:id        { name }
//   DELETE /api/meal-plans/templates/:id
// A template is checked against the person's CURRENT exclusions every time it is loaded: a food they now keep out is skipped and reported.
const express = require('express');
const PlanTemplate = require('../models/PlanTemplate');
const MealPlan = require('../models/MealPlan');
const Food = require('../models/Food');
const { requireAuth } = require('../middleware/auth');
const { wrap, HttpError } = require('../lib/http');
const v = require('../lib/validate');
const { addDays, diffDays, todayUtc } = require('../lib/dates');
const { loadPlanContext } = require('../lib/planContext');
const { findViolations } = require('../lib/foodSafety');
const { adoptFood } = require('../lib/healthyDiet');
const { itemsFromRows, rowsFromTemplate } = require('../lib/planTemplate');

const router = express.Router();
router.use(requireAuth);
const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'];
const MAX_TEMPLATES = 40;
const visible = (uid) => ({ $or: [{ userId: null }, { userId: { $exists: false } }, { userId: uid }] });
const summary = (t) => ({
  id: String(t._id), name: t.name, items: t.items.length, days: new Set(t.items.map((i) => i.offset)).size,
  kcalPerDay: t.items.length ? Math.round(t.items.reduce((s, i) => s + (i.calories || 0), 0) / Math.max(1, new Set(t.items.map((i) => i.offset)).size)) : 0, createdAt: t.createdAt,
});

router.get('/', wrap(async (req, res) => {
  const list = await PlanTemplate.find({ userId: req.user.id }).sort({ updatedAt: -1 }).lean();
  res.json({ success: true, templates: list.map(summary) });
}));

router.post('/', wrap(async (req, res) => {
  const uid = req.user.id;
  const name = String(req.body?.name || '').trim().slice(0, 60);
  if (name.length < 2) throw new HttpError(400, 'Give the template a name');
  const from = v.date(req.body?.from, 'from');
  const rows = await MealPlan.find({ userId: uid, date: { $gte: from, $lte: addDays(from, 6) }, logged: false }).sort({ date: 1, createdAt: 1 }).lean();
  if (!rows.length) throw new HttpError(422, 'There is nothing planned in that week to save');
  const items = itemsFromRows(rows.map((r) => ({ ...r, foodId: r.foodId })), from);
  const existing = await PlanTemplate.findOne({ userId: uid, name });
  if (!existing && (await PlanTemplate.countDocuments({ userId: uid })) >= MAX_TEMPLATES) throw new HttpError(400, `You can keep up to ${MAX_TEMPLATES} templates`);
  const doc = await PlanTemplate.findOneAndUpdate({ userId: uid, name }, { $set: { items }, $setOnInsert: { userId: uid, name } }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }).lean();
  res.status(existing ? 200 : 201).json({ success: true, replaced: !!existing, template: summary(doc) });
}));

router.patch('/:id', wrap(async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 60);
  if (name.length < 2) throw new HttpError(400, 'Give the template a name');
  try {
    const doc = await PlanTemplate.findOneAndUpdate({ _id: v.objectId(req.params.id), userId: req.user.id }, { $set: { name } }, { new: true }).lean();
    if (!doc) throw new HttpError(404, 'Template not found');
    res.json({ success: true, template: summary(doc) });
  } catch (e) { if (e && e.code === 11000) throw new HttpError(409, 'You already have a template with that name'); throw e; }
}));

router.delete('/:id', wrap(async (req, res) => {
  const r = await PlanTemplate.deleteOne({ _id: v.objectId(req.params.id), userId: req.user.id });
  if (!r.deletedCount) throw new HttpError(404, 'Template not found');
  res.json({ success: true });
}));

router.post('/:id/apply', wrap(async (req, res) => {
  const uid = req.user.id;
  const t = await PlanTemplate.findOne({ _id: v.objectId(req.params.id), userId: uid }).lean();
  if (!t) throw new HttpError(404, 'Template not found');
  const from = v.date(req.body?.from, 'from');
  const today = req.body?.today ? v.date(req.body.today, 'today') : addDays(todayUtc(), -1);
  const replace = req.body?.replace === true;
  const pc = await loadPlanContext(uid, {});
  const dates = [...new Set(t.items.map((i) => addDays(from, i.offset)))].filter((d) => d >= today);
  const existing = await MealPlan.find({ userId: uid, date: { $in: dates } }).select('date mealType logged').lean();
  const taken = new Set(existing.map((e) => `${e.date}|${e.mealType}`));
  if (replace) {
    await MealPlan.deleteMany({ userId: uid, date: { $in: dates }, logged: false, locked: { $ne: true } });
    for (const e of existing.filter((x) => !x.logged)) taken.delete(`${e.date}|${e.mealType}`);
  }
  const planned = rowsFromTemplate(t.items, { from, today, taken, excluder: pc.excluder, replace: false });
  const skipped = [...planned.skipped];
  const foodIds = [...new Set(planned.rows.map((i) => String(i.foodId)))];
  const have = new Set((await Food.find({ _id: { $in: foodIds }, ...visible(uid) }).select('_id').lean()).map((f) => String(f._id)));
  const rows = [];
  for (const r of planned.rows) {
    let foodId = r.foodId;
    if (!have.has(String(foodId))) { const f = await adoptFood(Food, uid, r.foodName); if (!f) { skipped.push({ name: r.foodName, reason: 'it is no longer in your food list' }); continue; } foodId = f._id; }
    rows.push({ userId: uid, ...r, foodId, carbohydrates: r.carbohydrates || 0, fat: r.fat || 0, why: `From your template "${t.name}"` });
  }
  const saved = rows.length ? await MealPlan.insertMany(rows) : [];
  res.status(201).json({ success: true, saved: saved.length, skipped, keptMeals: planned.keptMeals });
}));

module.exports = router;
