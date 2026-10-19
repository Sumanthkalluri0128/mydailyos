// Applies data/micronutrients.csv to the shared catalogue foods. Re-runnable and additive:
//   * blank cells are skipped (never turn "unknown" into 0, never erase a value)
//   * only catalogue foods (userId null) are touched, never a person's own foods
//   node scripts/importMicros.js --dry-run   (no database needed)
//   node scripts/importMicros.js             (needs MONGO_URI)
const { loadFile } = require('../lib/microImport');

async function main() {
  const dry = process.argv.includes('--dry-run');
  const { updates, problems } = loadFile();
  console.log(`${updates.length} foods with data, ${problems.length} problem(s)`);
  problems.forEach((p) => console.log(' !', p));
  if (problems.length) { console.log('Fix the problems above, then run again.'); process.exitCode = 1; return; }
  if (dry) { updates.slice(0, 20).forEach((u) => console.log(' -', u.name, JSON.stringify(u.set))); return; }
  require('dotenv').config();
  const mongoose = require('mongoose');
  const Food = require('../models/Food');
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set');
  await mongoose.connect(process.env.MONGO_URI);
  const ops = updates.map((u) => ({ updateOne: { filter: { name: u.name, userId: null }, update: { $set: u.set } } }));
  let modified = 0; let matched = 0;
  for (let i = 0; i < ops.length; i += 300) { const r = await Food.bulkWrite(ops.slice(i, i + 300), { ordered: false }); modified += r.modifiedCount || 0; matched += r.matchedCount || 0; }
  console.log(`Matched ${matched} of ${updates.length} catalogue foods, updated ${modified}.`);
  if (matched < updates.length) console.log('Some names did not match a catalogue food exactly — check spelling in the CSV.');
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
