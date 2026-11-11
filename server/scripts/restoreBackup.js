#!/usr/bin/env node
// Restore a downloaded backup file into an account.
//   node scripts/restoreBackup.js --file flexfit-export-2026-11-05.json --email you@example.com          (dry run: only counts)
//   node scripts/restoreBackup.js --file flexfit-export-2026-11-05.json --email you@example.com --apply  (really restores)
// MONGO_URI must point at the database. The account must already exist (sign up again first if it was deleted).
// To practise without touching real data: point MONGO_URI at an empty test database, or run `npm run restore:drill`.
require('dotenv').config();
const fs = require('node:fs');
const mongoose = require('mongoose');
const { restoreBackup } = require('../lib/restore');

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : null; };
(async () => {
  const file = arg('file'); const email = (arg('email') || '').toLowerCase(); const apply = process.argv.includes('--apply');
  if (!file || !email) { console.error('Usage: node scripts/restoreBackup.js --file <backup.json> --email <account email> [--apply]'); process.exit(2); }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  const User = require('../models/User');
  const user = await User.findOne({ email }).select('_id email').lean();
  if (!user) { console.error(`No account with email ${email}. Sign up with that email first, then run this again.`); process.exit(1); }
  const r = await restoreBackup(data, user._id, { apply });
  console.log(apply ? 'RESTORED' : 'DRY RUN (nothing written; add --apply to restore)');
  for (const [k, c] of Object.entries(r.counts)) console.log(`  ${k.padEnd(18)} in file ${String(c.inFile).padStart(5)}${apply ? `   added ${String(c.inserted).padStart(5)}   already there ${String(c.skipped).padStart(5)}` : ''}`);
  await mongoose.disconnect();
})().catch((e) => { console.error('Restore failed:', e.message); process.exit(1); });
