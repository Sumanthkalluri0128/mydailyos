require('dotenv').config();
const mongoose = require('mongoose');
const { createApp } = require('./app');
const { initMonitoring } = require('./lib/monitoring');

initMonitoring();

const PORT = Number(process.env.PORT) || 5001;
const allowedOrigins = [
  'http://localhost:5173',
  ...(process.env.CLIENT_URL || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean),
];

for (const name of ['MONGO_URI', 'JWT_SECRET']) {
  if (!process.env[name]) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

const app = createApp({ allowedOrigins });

// Cold starts matter on free hosting: start answering immediately (/api/health responds in milliseconds, so the apps' wake-up
// pings and Render's health check succeed right away) and finish the database work in the background. Requests that need the
// database simply wait for the connection (up to 30 s) instead of failing.
mongoose.set('bufferTimeoutMS', 30_000);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`FlexFit server running on port ${PORT}`);
  console.log(`Allowed CORS origins: ${allowedOrigins.join(', ')}`);
  const mail = require('./lib/mailer').mailStatus();
  console.log(mail.ready ? `Mail: sending via ${mail.provider}` : 'Mail: NOT CONFIGURED — password-reset emails cannot be sent (see SETUP_V5.md)');
  console.log(require('./lib/googleClient').configured() ? 'Google: sign-in enabled' : 'Google: not configured (the Continue with Google button is hidden)');
  require('./lib/keepAwake').startKeepAwake(); // stops the free instance sleeping while it is awake
});

mongoose
  .connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20_000, maxPoolSize: 10 })
  .then(() => {
    console.log('MongoDB connected');
    // Everything below runs in the background; none of it blocks requests.
    // Unique indexes that make offline replays idempotent (additive; never drops anything).
    Promise.all(Object.values(mongoose.models).map((Model) => Model.createIndexes().catch((e) => console.warn(`Index warning (${Model.modelName}):`, e.message))));
    // Fill the shared food catalogue on first run (adds missing foods only; never edits or deletes).
    if (process.env.SEED_FOODS !== 'false') {
      require('./lib/foodCatalogue').seedFoods().then((r) => r.added && console.log(`Seeded ${r.added} catalogue foods`)).catch((e) => console.warn('Food seed warning:', e.message));
    }
    // Same for the exercise list (incl. Cult.fit formats): add anything missing, never delete or overwrite.
    if (process.env.SEED_ACTIVITIES !== 'false') {
      require('./lib/activityCatalogue').seedActivities().then((r) => r.added && console.log(`Seeded ${r.added} exercises`)).catch((e) => console.warn('Exercise seed warning:', e.message));
    }
    // Opt-in weekly emails: checked hourly, sent once per week (Monday, UTC). Hosts that sleep can use `npm run send-weekly` as a cron job instead.
    if (process.env.WEEKLY_EMAIL_SCHEDULER !== 'false') {
      const tick = () => { if (new Date().getUTCDay() === 1) require('./lib/weeklyDigest').sendWeeklyDigests().then((r) => r.sent && console.log(`Weekly emails sent: ${r.sent}`)).catch((e) => console.warn('Weekly email warning:', e.message)); };
      setInterval(tick, 60 * 60_000).unref();
      setTimeout(tick, 30_000).unref();
    }
  })
  .catch((error) => {
    console.error('MongoDB connection failed:', error);
    process.exit(1);
  });
