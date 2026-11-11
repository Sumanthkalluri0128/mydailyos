// THE RESTORE DRILL, as a test: seed an account, make a backup exactly the way the app does, delete everything, restore, compare.
// Runs on a throw-away in-memory MongoDB (see test/helpers/mongo.js). Passing means your emailed backups really can bring your data back.
const test = require('node:test');
const assert = require('node:assert/strict');
const dbHelper = require('./helpers/mongo');
const skip = dbHelper.skipReason();

test('backup -> wipe -> restore brings every row back, with links intact', { skip }, async () => {
  const mongoose = require('mongoose');
  await mongoose.connect(await dbHelper.start());
  try {
    const { buildExportFiles } = require('../routes/accountRoutes');
    const { restoreBackup } = require('../lib/restore');
    const User = require('../models/User');
    const col = (n) => require(`../models/${n}`).collection;
    const user = await User.collection.insertOne({ name: 'Drill', email: 'drill@x.dev', createdAt: new Date() });
    const userId = user.insertedId; const oid = () => new mongoose.Types.ObjectId();
    const habitId = oid(); const medId = oid(); const foodId = oid();
    await col('Habit').insertOne({ _id: habitId, userId, name: 'Walk', createdAt: new Date() });
    await col('HabitLog').insertMany([1, 2, 3].map((d) => ({ userId, habitId, habitName: 'Walk', date: `2026-10-0${d}`, completed: true })));
    await col('Food').insertOne({ _id: foodId, userId, name: 'My dal', servingSize: 1, servingUnit: 'cup', calories: 180, createdAt: new Date() });
    await col('FoodLog').insertMany([1, 2].map((d) => ({ userId, date: `2026-10-0${d}`, foodId, foodName: 'My dal', mealType: 'lunch', consumedQuantity: 1, servingUnit: 'cup', nutritionTotal: { calories: 180 }, createdAt: new Date() })));
    await col('WeightLog').insertOne({ userId, date: '2026-10-01', weightKg: 70.5, createdAt: new Date() });
    await col('Medicine').insertOne({ _id: medId, userId, name: 'Vit D', createdAt: new Date() });
    await col('MedLog').insertOne({ userId, medId, date: '2026-10-01', time: '08:00', createdAt: new Date() });
    await col('Recipe').insertOne({ userId, name: 'Dal rice', servings: 2, ingredients: [{ foodId, quantity: 1, servingUnit: 'cup' }], createdAt: new Date() });
    await col('Profile').insertOne({ userId, heightCm: 170 });

    const files = await buildExportFiles(userId);
    const backup = JSON.parse(files.find((f) => /\.json$/.test(f.filename)).content.toString('utf8'));     // what the person would download

    const names = ['Habit', 'HabitLog', 'Food', 'FoodLog', 'WeightLog', 'Medicine', 'MedLog', 'Recipe', 'Profile'];
    const before = {}; for (const n of names) before[n] = await col(n).countDocuments({ userId });
    for (const n of names) await col(n).deleteMany({ userId });                                           // the disaster
    for (const n of names) assert.equal(await col(n).countDocuments({ userId }), 0);

    const dry = await restoreBackup(backup, userId);
    assert.equal(dry.applied, false); assert.equal(await col('FoodLog').countDocuments({ userId }), 0);
    const done = await restoreBackup(backup, userId, { apply: true });
    for (const n of names) assert.equal(await col(n).countDocuments({ userId }), before[n], `${n} count`);
    const habit = await col('Habit').findOne({ userId }); const log = await col('HabitLog').findOne({ userId });
    assert.equal(String(log.habitId), String(habit._id));                                                  // links survived
    assert.ok((await col('FoodLog').findOne({ userId })).createdAt instanceof Date);                       // dates are dates again
    assert.ok(done.counts.recipes.inserted === 1);                                                          // recipes are in the backup now

    const again = await restoreBackup(backup, userId, { apply: true });                                    // second run: nothing doubles
    for (const n of names) assert.equal(await col(n).countDocuments({ userId }), before[n], `${n} after 2nd restore`);
    assert.equal(again.counts.habitLogs.inserted, 0);
  } finally { await mongoose.disconnect(); await dbHelper.stop(); }
});
