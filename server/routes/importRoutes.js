// Import food logs and weight history from another app's CSV. Two steps, always: preview (dry run, nothing saved) then commit.
const express = require('express');
const Food = require('../models/Food');
const FoodLog = require('../models/FoodLog');
const WeightLog = require('../models/WeightLog');
const Profile = require('../models/Profile');
const { requireAuth } = require('../middleware/auth');
const { wrap, HttpError } = require('../lib/http');
const { parseCsv } = require('../lib/csv');
const I = require('../lib/csvImport');
const { refreshStoredTarget } = require('../lib/profileEnergy');
const v = require('../lib/validate');

const router = express.Router();
router.use(requireAuth);
const MAX_ROWS = 5000;

function readBody(req) {
  const text = v.string(req.body?.csv, 'csv', { max: 3_000_000, required: true });
  const rows = parseCsv(text);
  if (rows.length < 2) throw new HttpError(400, 'The file needs a header row and at least one data row.');
  if (rows.length - 1 > MAX_ROWS) throw new HttpError(400, `That file has more than ${MAX_ROWS} rows. Split it into smaller files.`);
  const headers = rows[0].map((h) => String(h).trim());
  const det = I.detect(headers);
  // the person may correct the column mapping: { field: columnIndex | null }
  const given = req.body?.mapping && typeof req.body.mapping === 'object' ? req.body.mapping : null;
  const mapping = given ? Object.fromEntries(Object.entries(given).filter(([f, i]) => f in I.SYN && Number.isInteger(i) && i >= 0 && i < headers.length)) : det.mapping;
  const kind = ['food', 'weight'].includes(req.body?.kind) ? req.body.kind : det.kind;
  const order = req.body?.dateOrder === 'mdy' ? 'mdy' : 'dmy';
  return { headers, data: rows.slice(1), det, mapping, kind, order };
}

async function build(uid, b) {
  if (b.kind === 'weight') {
    if (b.mapping.date === undefined || b.mapping.weight === undefined) return { built: null, need: ['date', 'weight'].filter((f) => b.mapping[f] === undefined) };
    const existing = await WeightLog.find({ userId: uid }).select('date weightKg').lean();
    return { built: I.buildWeight(b.data, b.mapping, { order: b.order, existing, headers: b.headers }) };
  }
  if (b.kind === 'food') {
    const need = ['date', 'calories'].filter((f) => b.mapping[f] === undefined);
    if (need.length) return { built: null, need };
    const existing = await FoodLog.find({ userId: uid, source: 'import' }).select('date mealType foodName nutritionTotal').lean();
    const also = await FoodLog.find({ userId: uid, date: { $in: [...new Set(b.data.map((r) => I.parseDate(r[b.mapping.date], b.order).date).filter(Boolean))].slice(0, 2000) } }).select('date mealType foodName nutritionTotal').lean();
    const all = [...existing, ...also].map((l) => ({ date: l.date, mealType: l.mealType, foodName: l.foodName, calories: l.nutritionTotal?.calories || 0 }));
    return { built: I.buildFood(b.data, b.mapping, { order: b.order, existing: all }) };
  }
  return { built: null, need: ['kind'] };
}

// POST /api/import/preview { csv, kind?, mapping?, dateOrder? } -> detection + dry-run summary. Nothing is saved.
router.post('/preview', wrap(async (req, res) => {
  const b = readBody(req);
  const { built, need } = await build(req.user.id, b);
  res.json({ success: true, headers: b.headers, kind: b.kind, detected: b.det.kind, mapping: b.mapping, fields: b.kind === 'weight' ? I.WEIGHT_FIELDS : I.FOOD_FIELDS, missing: need || [], rowsInFile: b.data.length,
    summary: built ? I.summarize(b.kind, built) : null, cultNote: I.CULT_NOTE });
}));

// POST /api/import/commit — same body as preview. Re-running the same file adds nothing (duplicates are detected).
router.post('/commit', wrap(async (req, res) => {
  const uid = req.user.id;
  const b = readBody(req);
  const { built, need } = await build(uid, b);
  if (!built) throw new HttpError(400, `Choose the ${need.join(' and ')} column first.`);
  let saved = 0;
  if (b.kind === 'food' && built.rows.length) {
    let base = await Food.findOne({ userId: uid, hidden: true, name: 'Imported entry' });
    if (!base) base = await Food.create({ userId: uid, hidden: true, name: 'Imported entry', servingSize: 1, servingUnit: 'serving', calories: 0, units: [{ label: 'serving', quantity: 1 }], notes: 'Placeholder for entries imported from a CSV file' });
    const docs = built.rows.map((r) => {
      const t = { calories: r.calories, protein: r.protein, carbohydrates: r.carbohydrates, fat: r.fat, fiber: r.fiber, sugar: r.sugar, sodium: r.sodium };
      return { userId: uid, foodId: base._id, date: r.date, mealType: r.mealType, foodName: r.name, baseServingSize: 1, servingUnit: 'serving', consumedQuantity: 1, servings: 1, nutritionPerServing: t, nutritionTotal: t, notes: 'Imported from CSV', source: 'import' };
    });
    for (let i = 0; i < docs.length; i += 500) saved += (await FoodLog.insertMany(docs.slice(i, i + 500))).length;
  }
  if (b.kind === 'weight' && built.rows.length) {
    for (const r of built.rows) {
      const old = await WeightLog.findOne({ userId: uid, date: r.date });
      if (old) { old.weightKg = r.weightKg; await old.save(); } else await WeightLog.create({ userId: uid, date: r.date, weightKg: r.weightKg, notes: 'Imported from CSV' });
      saved += 1;
    }
    const latest = await WeightLog.findOne({ userId: uid }).sort({ date: -1, createdAt: -1 }).lean();
    const profile = await Profile.findOneAndUpdate({ userId: uid }, { $set: { currentWeightKg: latest ? latest.weightKg : null } }, { upsert: true, new: true });
    await refreshStoredTarget(Profile, profile);
  }
  res.status(201).json({ success: true, saved, skippedDuplicates: built.duplicates.length, skippedProblems: built.problems.length });
}));

module.exports = router;
