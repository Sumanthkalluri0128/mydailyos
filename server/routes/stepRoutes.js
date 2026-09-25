const express = require('express');
const { requireAuth } = require('../middleware/auth');
const StepLog = require('../models/StepLog');

const router = express.Router();
router.use(requireAuth);

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

router.get('/', async (req, res) => {
  try {
    const from = String(req.query.from || '');
    const to = String(req.query.to || from);
    if (!validDate(from) || !validDate(to) || from > to) {
      return res.status(400).json({ success: false, message: 'Valid from and to dates are required (YYYY-MM-DD).' });
    }
    const logs = await StepLog.find({ userId: req.user.id, date: { $gte: from, $lte: to } })
      .sort({ date: 1 })
      .lean();
    return res.json({ success: true, logs });
  } catch (error) {
    console.error('Steps fetch failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to load step history.' });
  }
});

router.post('/sync-bulk', async (req, res) => {
  try {
    const input = Array.isArray(req.body.logs) ? req.body.logs : [];
    if (!input.length) return res.json({ success: true, synced: 0, logs: [] });

    const operations = [];
    for (const item of input.slice(0, 31)) {
      const date = String(item?.date || '');
      const steps = Number(item?.steps);
      if (!validDate(date) || !Number.isFinite(steps) || steps < 0) continue;
      operations.push({
        updateOne: {
          filter: { userId: req.user.id, date },
          update: {
            $set: {
              steps: Math.round(steps),
              source: 'Samsung Health / Health Connect',
              syncedAt: new Date(),
            },
            $setOnInsert: { userId: req.user.id, date },
          },
          upsert: true,
        },
      });
    }

    if (!operations.length) return res.status(400).json({ success: false, message: 'No valid step records were supplied.' });
    await StepLog.bulkWrite(operations, { ordered: false });
    const dates = input.map((x) => String(x?.date || '')).filter(validDate);
    const logs = await StepLog.find({ userId: req.user.id, date: { $in: dates } }).sort({ date: 1 }).lean();
    return res.json({ success: true, synced: logs.length, logs });
  } catch (error) {
    console.error('Bulk steps sync failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to save step history.' });
  }
});

router.post('/sync', async (req, res) => {
  try {
    const date = String(req.body.date || '');
    const steps = Number(req.body.steps);
    const source = String(req.body.source || 'Health Connect').trim() || 'Health Connect';

    if (!validDate(date) || !Number.isFinite(steps) || steps < 0) {
      return res.status(400).json({ success: false, message: 'Valid date and non-negative step count are required.' });
    }

    const log = await StepLog.findOneAndUpdate(
      { userId: req.user.id, date },
      {
        $set: {
          steps: Math.round(steps),
          source,
          syncedAt: new Date(),
        },
        $setOnInsert: { userId: req.user.id, date },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    return res.json({ success: true, log });
  } catch (error) {
    console.error('Steps sync failed:', error);
    return res.status(500).json({ success: false, message: 'Failed to save step count.' });
  }
});

module.exports = router;
