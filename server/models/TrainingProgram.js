const mongoose = require('mongoose');

// One active training arc per person. Progress = which weekly "episodes" and sessions were finished.
const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    programId: { type: String, required: true },
    startDate: { type: String, required: true },
    baseSteps: { type: Number, default: 3000, min: 0, max: 100000 },
    done: { type: [{ week: Number, day: Number, date: String, _id: false }], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('TrainingProgram', schema);
