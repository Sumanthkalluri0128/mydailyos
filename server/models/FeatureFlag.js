const mongoose = require('mongoose');
// A feature flag (see lib/flags.js). Managed by admins only; contains no personal data besides the emails an admin chooses to list.
const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  enabled: { type: Boolean, default: false },
  percent: { type: Number, default: 0, min: 0, max: 100 },
  allow: { type: [String], default: [] },
  deny: { type: [String], default: [] },
  description: { type: String, default: '' },
}, { timestamps: true });
module.exports = mongoose.models.FeatureFlag || mongoose.model('FeatureFlag', schema);
