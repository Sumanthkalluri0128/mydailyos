// One exercise of one finished workout, with every set's weight and what that weight MEANS, so lifts can be tracked over time.
//   mode: each = the weight of ONE dumbbell (hands says how many were moved), total = bar + plates or the machine stack together,
//         bw = body weight (weightKg is only the EXTRA weight, 0 for none), assist = how much a machine helped, none = no weight.
//   weightKg  what the person typed (the number every progression rule reads).   totalKg  what that moved in one rep, in all (worked out on the device).
// Written for every finished workout whichever plan it came from (Smart, Classic or a personal plan). Private to the person: in export and deletion.
const mongoose = require('mongoose');

const setSchema = new mongoose.Schema({
  reps: { type: Number, min: 0, max: 1000, default: 0 },
  seconds: { type: Number, min: 0, max: 7200, default: 0 },
  weightKg: { type: Number, min: 0, max: 1000, default: 0 },
  totalKg: { type: Number, min: 0, max: 3000, default: 0 },
  rpe: { type: Number, min: 1, max: 10, default: null },
}, { _id: false });

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  clientId: { type: String, required: true, maxlength: 140 },      // `${sessionId}:${exerciseId}`: sending the same workout twice never doubles it
  sessionId: { type: String, required: true, maxlength: 80 },
  date: { type: String, required: true },
  planId: { type: String, default: '', maxlength: 60 },
  title: { type: String, default: '', maxlength: 80 },
  exerciseId: { type: String, required: true, maxlength: 80 },
  name: { type: String, default: '', maxlength: 120 },
  cat: { type: String, default: '', maxlength: 30 },
  muscles: { type: [{ type: String, maxlength: 30 }], default: [] },
  mode: { type: String, enum: ['each', 'total', 'bw', 'assist', 'none'], default: 'total' },
  hands: { type: Number, min: 0, max: 2, default: 0 },
  timed: { type: Boolean, default: false },
  bodyKg: { type: Number, min: 0, max: 500, default: 0 },
  sets: { type: [setSchema], default: [] },
  topKg: { type: Number, min: 0, max: 1000, default: 0 },         // heaviest typed weight of the day
  volumeKg: { type: Number, min: 0, default: 0 },                 // sum of totalKg x reps
}, { timestamps: true });
schema.index({ userId: 1, date: -1 });
schema.index({ userId: 1, exerciseId: 1, date: -1 });
schema.index({ userId: 1, clientId: 1 }, { unique: true });

module.exports = mongoose.model('LiftEntry', schema);
