const mongoose = require('mongoose');
// One document ('main') with the aggregate server health numbers (see lib/serverStats.js). No personal data.
const schema = new mongoose.Schema({ key: { type: String, unique: true }, data: { type: mongoose.Schema.Types.Mixed, default: {} } }, { timestamps: true, minimize: false });
module.exports = mongoose.models.ServerStat || mongoose.model('ServerStat', schema);
