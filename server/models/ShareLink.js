const mongoose = require('mongoose');
// One private weekly-summary link per person (shared with ONE chosen person). Only a hash of the secret is stored, so the link
// can be shown once. Deleting the document revokes it. Included in the export (without the hash) and deleted with the account.
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  tokenHash: { type: String, required: true, unique: true, index: true },
  label: { type: String, default: '', maxlength: 40 },        // who it is for ("Asha"), only shown to you and on the page header
  fields: { type: [String], default: [] },
  views: { type: Number, default: 0 },
  lastViewedAt: { type: Date, default: null },
}, { timestamps: true });
module.exports = mongoose.model('ShareLink', schema);
