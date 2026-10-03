const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    passwordChangedAt: { type: Date, default: null },
    resetCodeHash: { type: String, default: null, select: false },
    resetExpires: { type: Date, default: null, select: false },
    resetAttempts: { type: Number, default: 0, select: false },
    // Google account link (Sign in with Google + the "FlexFit data" spreadsheet kept in the person's own Drive).
    // The refresh token is stored AES-256-GCM encrypted and never selected by default.
    googleId: { type: String },
    google: {
      email: { type: String, default: '' },
      refreshTokenEnc: { type: String, default: '', select: false },
      spreadsheetId: { type: String, default: '' },
      spreadsheetUrl: { type: String, default: '' },
      connectedAt: { type: Date, default: null },
      lastSyncAt: { type: Date, default: null },
      lastSyncError: { type: String, default: '' },
      needsReconnect: { type: Boolean, default: false },
      autoSync: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

schema.index({ googleId: 1 }, { unique: true, partialFilterExpression: { googleId: { $type: 'string' } } });

module.exports = mongoose.model('User', schema);
