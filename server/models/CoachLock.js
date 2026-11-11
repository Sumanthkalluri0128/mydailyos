const mongoose = require('mongoose');

// A short lease on "the weekly coach is working for this person", shared by every server instance. The in-process queue in
// routes/coachRoutes.js stops two requests in ONE process from racing; this document stops two PROCESSES (several Render instances) from doing it.
// The unique index on userId is what makes it a lock: a second insert for the same person fails. A lease always expires (TTL), so a crashed
// instance can never block someone forever.
const S = mongoose.Schema;
const schema = new S({
  userId: { type: S.Types.ObjectId, required: true, unique: true },
  owner: { type: String, required: true },
  until: { type: Date, required: true },
});
schema.index({ until: 1 }, { expireAfterSeconds: 60 });   // the database cleans up expired leases by itself

module.exports = mongoose.model('CoachLock', schema);
