// POST /api/telemetry: the apps report AGGREGATE health numbers (no login, no ids, no content): { syncFailed, writesDropped, wakeMs }.
const express = require('express');
const { rateLimit } = require('../middleware/rateLimit');
const { stats } = require('../lib/serverStatsStore');

const router = express.Router();
router.post('/', rateLimit({ windowMs: 60_000, max: 20, message: 'Too many reports.' }), (req, res) => {
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  stats.count('syncFailed', b.syncFailed);
  stats.count('writesDropped', b.writesDropped);
  if (b.wakeMs !== undefined) stats.wake(b.wakeMs);
  res.status(204).end();
});
module.exports = router;
