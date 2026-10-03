const mongoose = require('mongoose');

// One collection for every simple measurement: steps, sleep, heart rate, blood pressure, glucose, body measurements.
// `value` is the main number (steps, hours, bpm, systolic, mg/dL, cm); `value2` is the second number (diastolic).
const TYPES = ['steps', 'sleep', 'heartRate', 'bloodPressure', 'glucose', 'waist', 'chest', 'hips', 'arm', 'thigh'];

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    clientId: { type: String },
    type: { type: String, enum: TYPES, required: true },
    date: { type: String, required: true },
    time: { type: String, default: '' },
    value: { type: Number, required: true },
    value2: { type: Number, default: null },
    source: { type: String, enum: ['manual', 'device'], default: 'manual' },
    notes: { type: String, default: '', maxlength: 300 },
  },
  { timestamps: true }
);
schema.index({ userId: 1, type: 1, date: -1 });
schema.index({ userId: 1, clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } });

module.exports = mongoose.model('HealthLog', schema);
module.exports.TYPES = TYPES;
