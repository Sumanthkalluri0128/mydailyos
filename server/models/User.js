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
    // Set when the person signs in with Google (their stable Google account id). Nothing else from Google is stored.
    googleId: { type: String },
  },
  { timestamps: true }
);

schema.index({ googleId: 1 }, { unique: true, partialFilterExpression: { googleId: { $type: 'string' } } });

module.exports = mongoose.model('User', schema);
