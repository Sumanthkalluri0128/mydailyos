const mongoose = require('mongoose');
// One document per person: which stickers they own and how many packs they have opened.
const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    owned: { type: [String], default: [] },
    packsOpened: { type: Number, default: 0, min: 0 },
    recent: { type: [{ id: String, at: Date }], default: [] },
  },
  { timestamps: true }
);
module.exports = mongoose.model('Collection', schema);
