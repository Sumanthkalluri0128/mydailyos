const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    passwordChangedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', schema);
