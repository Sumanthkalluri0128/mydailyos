// Sync a person's records between their devices (phone, browser). Push what changed here, pull what changed elsewhere.
// Last write wins per record; deletions travel as records. Safe to repeat: pushing the same record twice changes nothing.
const express = require('express');
const SyncRecord = require('../models/SyncRecord');
const SyncCounter = require('../models/SyncCounter');
const { requireAuth } = require('../middleware/auth');
const { wrap, HttpError } = require('../lib/http');
const R = require('../lib/recordSync');

const router = express.Router();
router.use(requireAuth);

const present = (r) => ({ kind: r.kind, rid: r.rid, data: r.deleted ? null : r.data, updatedAt: r.changedAt, deleted: !!r.deleted, seq: r.seq });
const spaceOf = (raw) => { const s = String(raw || ''); if (!R.isSpace(s)) throw new HttpError(400, 'Unknown space'); return s; };

router.post('/push', wrap(async (req, res) => {
  const space = spaceOf(req.body?.space);
  const raw = Array.isArray(req.body?.records) ? req.body.records : [];
  if (raw.length > R.MAX_RECORDS_PER_PUSH) throw new HttpError(400, `At most ${R.MAX_RECORDS_PER_PUSH} records at a time`);
  const uid = req.user.id, now = Date.now();
  const records = raw.map((r) => R.cleanIncoming(r, space, now));
  const rejected = records.filter((r) => !r).length;
  let applied = 0; const kept = [];
  const known = await SyncRecord.countDocuments({ userId: uid, space });
  let fresh = 0;
  for (const rec of records) {
    if (!rec) continue;
    const existing = await SyncRecord.findOne({ userId: uid, space, kind: rec.kind, rid: rec.rid }).lean();
    if (!R.incomingWins(existing && { updatedAt: existing.changedAt }, rec)) { kept.push(present(existing)); continue; }
    if (!existing && known + fresh >= R.MAX_RECORDS_PER_PERSON) throw new HttpError(413, 'Too many synced records');
    const { seq } = await SyncCounter.findOneAndUpdate({ userId: uid }, { $inc: { seq: 1 } }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
    await SyncRecord.updateOne({ userId: uid, space, kind: rec.kind, rid: rec.rid }, { $set: { data: rec.data, changedAt: rec.updatedAt, deleted: rec.deleted, seq } }, { upsert: true });
    if (!existing) fresh += 1;
    applied += 1;
  }
  const top = await SyncCounter.findOne({ userId: uid }).lean();
  res.json({ success: true, applied, rejected, kept, seq: top?.seq || 0 });
}));

// Everything after `since`. Clients ask from a little before their last answer (the counter is handed out slightly before a record is written,
// so a record can appear a moment after a later one); repeating a record is harmless.
router.get('/pull', wrap(async (req, res) => {
  const space = spaceOf(req.query.space);
  const since = Math.max(0, Number(req.query.since) || 0);
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 500));
  const rows = await SyncRecord.find({ userId: req.user.id, space, seq: { $gt: since } }).sort({ seq: 1 }).limit(limit + 1).lean();
  const more = rows.length > limit;
  const page = rows.slice(0, limit);
  const top = await SyncCounter.findOne({ userId: req.user.id }).lean();
  res.json({ success: true, records: page.map(present), seq: page.length ? page[page.length - 1].seq : since, latest: top?.seq || 0, more });
}));

module.exports = router;
