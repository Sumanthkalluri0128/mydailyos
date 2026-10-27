// Run on a schedule (e.g. a Render Cron Job every Sunday evening): node scripts/sendBackups.js
require('dotenv').config();
const mongoose = require('mongoose');
const { sendWeeklyBackups } = require('../lib/backupEmail');
const { buildExportFiles } = require('../routes/accountRoutes');
(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const r = await sendWeeklyBackups({ exportFiles: buildExportFiles });
  console.log(`Backup emails for week of ${r.week.from}: sent ${r.sent}, failed ${r.failed}`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
