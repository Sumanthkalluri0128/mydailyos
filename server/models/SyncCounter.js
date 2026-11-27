// The per-person counter behind SyncRecord.seq.
const mongoose = require('mongoose');
const schema = new mongoose.Schema({ userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true }, seq: { type: Number, default: 0 } });
module.exports = mongoose.model('SyncCounter', schema);
