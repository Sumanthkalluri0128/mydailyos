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

mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    // Make sure the unique indexes that make offline replays idempotent exist (additive; never drops anything).
    for (const Model of Object.values(mongoose.models)) {
      await Model.createIndexes().catch((e) => console.warn(`Index warning (${Model.modelName}):`, e.message));
    }
    // Fill the shared food catalogue on first run (adds missing foods only; never edits or deletes).
    if (process.env.SEED_FOODS !== 'false') {
      require('./lib/foodCatalogue').seedFoods().then((r) => r.added && console.log(`Seeded ${r.added} catalogue foods`)).catch((e) => console.warn('Food seed warning:', e.message));
    }
    // Same for the exercise list (incl. Cult.fit formats): add anything missing, never delete or overwrite.
    if (process.env.SEED_ACTIVITIES !== 'false') {
      require('./lib/activityCatalogue').seedActivities().then((r) => r.added && console.log(`Seeded ${r.added} exercises`)).catch((e) => console.warn('Exercise seed warning:', e.message));
    }
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`FlexFit server running on port ${PORT}`);
      console.log(`Allowed CORS origins: ${allowedOrigins.join(', ')}`);
      const mail = require('./lib/mailer').mailStatus();
      console.log(mail.ready ? `Mail: sending via ${mail.provider}` : 'Mail: NOT CONFIGURED — password-reset emails cannot be sent (see SETUP_V5.md)');
      console.log(require('./lib/googleClient').configured() ? 'Google: sign-in + Sheets enabled' : 'Google: not configured (sign-in and Sheets backup are hidden)');
    });
  })
  .catch((error) => {
    console.error('MongoDB connection failed:', error);
    process.exit(1);
  });
