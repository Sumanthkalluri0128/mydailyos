// Run on a schedule (e.g. a Render Cron Job every Monday): node scripts/sendWeekly.js
require('dotenv').config();
const mongoose = require('mongoose');
const { sendWeeklyDigests } = require('../lib/weeklyDigest');
(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const r = await sendWeeklyDigests();
  console.log(`Weekly emails for week of ${r.week.from}: sent ${r.sent}, failed ${r.failed}`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
