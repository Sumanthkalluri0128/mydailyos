// GET /api/flags: which flags are on for the signed-in person. Clients cache the answer (see utils/flags on web and mobile).
const express = require('express');
const FeatureFlag = require('../models/FeatureFlag');
const { requireAuth } = require('../middleware/auth');
const { wrap } = require('../lib/http');
const { evaluateAll } = require('../lib/flags');

const router = express.Router();
router.get('/', requireAuth, wrap(async (req, res) => {
  const flags = await FeatureFlag.find({}).lean();
  res.json({ success: true, flags: evaluateAll(flags, req.user), at: Date.now() });
}));
module.exports = router;
