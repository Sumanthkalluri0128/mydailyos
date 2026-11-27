// One synced record (a logged exercise, a body measurement, the body goal ...) from a person's device. Private to the person; included in
// export and in account deletion (routes/accountRoutes.js). `seq` is the person's own increasing counter: devices ask for "everything after seq N".
const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  space: { type: String, required: true, maxlength: 20 },
  kind: { type: String, required: true, maxlength: 20 },
  rid: { type: String, required: true, maxlength: 80 },
  data: { type: mongoose.Schema.Types.Mixed, default: null },
  // NOT called updatedAt: Mongoose's timestamps option owns that name and would overwrite it with the server clock on every update.
  changedAt: { type: Number, required: true },       // when the person last changed it, on their device (ms); decides conflicts
  deleted: { type: Boolean, default: false },
  seq: { type: Number, required: true },
}, { timestamps: true, minimize: false });
schema.index({ userId: 1, space: 1, kind: 1, rid: 1 }, { unique: true });
schema.index({ userId: 1, space: 1, seq: 1 });
module.exports = mongoose.model('SyncRecord', schema);
