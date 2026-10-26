// Medicine and supplement checklist (private health data; included in the export and removed with the account).
// GET /api/meds?date=&now=HH:mm -> { meds, checklist }   POST / PUT /:id DELETE /:id   POST /:id/take { date, time, taken }
const express = require('express');
const mongoose = require('mongoose');
const Medicine = require('../models/Medicine');
const MedLog = require('../models/MedLog');
const { requireAuth } = require('../middleware/auth');
const { wrap, HttpError } = require('../lib/http');
const v = require('../lib/validate');
const { todayUtc } = require('../lib/dates');
const M = require('../lib/medicines');

const router = express.Router();
router.use(requireAuth);
const MAX_MEDS = 30;
const oid = (id) => { if (!mongoose.isValidObjectId(id)) throw new HttpError(404, 'Not found'); return id; };
const clean = (b) => { try { return M.cleanMed(b); } catch (e) { throw new HttpError(400, e.message); } };

async function view(uid, date, nowHm) {
  const [meds, logs] = await Promise.all([Medicine.find({ userId: uid }).sort({ createdAt: 1 }).lean(), MedLog.find({ userId: uid, date }).lean()]);
  return { meds, checklist: M.checklist({ meds, logs, date, nowHm }), note: M.NOTE };
}
router.get('/', wrap(async (req, res) => {
  const date = req.query.date ? v.date(req.query.date) : todayUtc();
  res.json({ success: true, ...(await view(req.user.id, date, v.time(req.query.now) || '00:00')) });
}));
// Reminder times left today. Quiet hours (default 22:00 to 07:00) never ring; those doses move to the end of quiet time.
router.get('/reminders', wrap(async (req, res) => {
  const date = v.date(req.query.date), nowHm = v.time(req.query.now, { optional: false });
  const quiet = { start: v.time(req.query.quietStart) || '22:00', end: v.time(req.query.quietEnd) || '07:00' };
  const [meds, logs] = await Promise.all([Medicine.find({ userId: req.user.id, active: true }).lean(), MedLog.find({ userId: req.user.id, date }).lean()]);
  const takenKeys = new Set(logs.map((l) => `${l.medId}|${l.time}`));
  res.json({ success: true, reminders: M.planReminders({ meds, date, quiet, nowHm, takenKeys }), note: M.NOTE });
}));
router.post('/', wrap(async (req, res) => {
  if ((await Medicine.countDocuments({ userId: req.user.id })) >= MAX_MEDS) throw new HttpError(400, `You can keep up to ${MAX_MEDS} items`);
  const med = await Medicine.create({ userId: req.user.id, ...clean(req.body) });
  res.status(201).json({ success: true, med });
}));
router.put('/:id', wrap(async (req, res) => {
  const med = await Medicine.findOneAndUpdate({ _id: oid(req.params.id), userId: req.user.id }, clean({ active: true, ...req.body }), { new: true });
  if (!med) throw new HttpError(404, 'Not found');
  res.json({ success: true, med });
}));
router.delete('/:id', wrap(async (req, res) => {
  const med = await Medicine.findOneAndDelete({ _id: oid(req.params.id), userId: req.user.id });
  if (!med) throw new HttpError(404, 'Not found');
  await MedLog.deleteMany({ userId: req.user.id, medId: med._id });
  res.json({ success: true });
}));
router.post('/:id/take', wrap(async (req, res) => {
  const med = await Medicine.findOne({ _id: oid(req.params.id), userId: req.user.id }).lean();
  if (!med) throw new HttpError(404, 'Not found');
  const date = v.date(req.body?.date), time = v.time(req.body?.time, { optional: false });
  if (!med.times.includes(time)) throw new HttpError(400, 'That time is not on this medicine');
  const key = { userId: req.user.id, medId: med._id, date, time };
  if (req.body?.taken === false) await MedLog.deleteOne(key);
  else await MedLog.updateOne(key, { $setOnInsert: { takenAt: new Date() } }, { upsert: true });
  res.json({ success: true, ...(await view(req.user.id, date, v.time(req.body?.now) || '23:59')) });
}));
module.exports = router;
