// POST /api/telemetry: the apps report AGGREGATE health numbers (no login, no ids, no content): { syncFailed, writesDropped, wakeMs }.
const express = require('express');
const { rateLimit } = require('../middleware/rateLimit');
const { stats } = require('../lib/serverStatsStore');

const { s, body } = require('../lib/schema');
const router = express.Router();
router.post('/', rateLimit({ windowMs: 60_000, max: 20, message: 'Too many reports.' }), body(s.object({ syncFailed: s.number({ min: 0, max: 100000 }), writesDropped: s.number({ min: 0, max: 100000 }), wakeMs: s.number({ min: 0, max: 3600000 }) })), (req, res) => {
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  stats.count('syncFailed', b.syncFailed);
  stats.count('writesDropped', b.writesDropped);
  if (b.wakeMs !== undefined) stats.wake(b.wakeMs);
  res.status(204).end();
});
// A card was opened: { card: 'water' }. Only the card name is counted (no login, no person, no content).
const { CARD_IDS } = require('../lib/serverStats');
router.post('/card', rateLimit({ windowMs: 60_000, max: 60, message: 'Too many reports.' }), body(s.object({ card: s.string({ max: 20 }) })), (req, res) => {
  const id = String(req.body && req.body.card || '');
  if (CARD_IDS.includes(id)) stats.count(`card.${id}`);
  res.status(204).end();
});
module.exports = router;
