// One-off helper: foods created before per-user custom foods existed are shared,
// read-only catalogue entries. Run this to hand them to one account so that
// person can edit/delete them again:
//
//   npm run claim-foods -- you@example.com
//
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Food = require('../models/Food');

(async () => {
  const email = String(process.argv[2] || '').trim().toLowerCase();
  if (!email) { console.error('Usage: npm run claim-foods -- <account-email>'); process.exit(1); }
  await mongoose.connect(process.env.MONGO_URI);
  const user = await User.findOne({ email });
  if (!user) { console.error(`No account found for ${email}`); process.exit(1); }
  const r = await Food.updateMany({ $or: [{ userId: null }, { userId: { $exists: false } }] }, { $set: { userId: user._id } });
  console.log(`Assigned ${r.modifiedCount} shared foods to ${email}.`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
