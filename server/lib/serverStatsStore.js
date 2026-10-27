// One shared stats object for this process, saved to MongoDB every 5 minutes (only when something changed) and loaded on start.
const { createStats } = require('./serverStats');

const stats = createStats();
let timer = null;

async function load() {
  try { const doc = await require('../models/ServerStat').findOne({ key: 'main' }).lean(); if (doc) stats.restore(doc.data); } catch (e) { console.warn('Stats load warning:', e.message); }
}
async function save() {
  if (!stats.isDirty()) return;
  try { await require('../models/ServerStat').updateOne({ key: 'main' }, { $set: { data: stats.toJSON() } }, { upsert: true }); stats.clean(); } catch (e) { console.warn('Stats save warning:', e.message); }
}
function startPersisting() {
  if (timer) return;
  load().then(() => { timer = setInterval(save, 5 * 60_000); timer.unref(); });
}
module.exports = { stats, load, save, startPersisting };
