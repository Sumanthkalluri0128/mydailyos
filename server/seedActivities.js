// Manual run:  node seedActivities.js
// The server now seeds exercises automatically at startup (lib/activityCatalogue.js). This script does the same thing on
// demand. It only ADDS missing activities — it no longer deletes anything (the old version wiped the whole collection).
require("dotenv").config();
const mongoose = require("mongoose");
const { seedActivities } = require("./lib/activityCatalogue");

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const r = await seedActivities();
    console.log(`Added ${r.added} new activities (catalogue has ${r.total}).`);
    await mongoose.connection.close();
  } catch (error) {
    console.error("Failed to seed activities:", error);
    process.exit(1);
  }
})();
