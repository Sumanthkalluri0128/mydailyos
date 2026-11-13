// READ-ONLY. Explains why a user's calorie target is what it is. Writes nothing to the database.
// Run from the server folder:   node scripts/diagnoseCalories.js you@email.com
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Profile = require('../models/Profile');
const ActivityLog = require('../models/ActivityLog');
const HealthLog = require('../models/HealthLog');
const E = require('../lib/energy');
const { buildHistory } = require('../lib/progress');
const { strengthDatesIn } = require('../lib/dailyCoachData');
const { isTrained, activityLabel, appLevelFor, nextAutoActivity } = require('../lib/dailyCoach');
const { measuredFrom } = require('../lib/measuredMaintenance');
const { addDays } = require('../lib/dates');

const ymd = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const kcal = (x) => (x == null ? '-' : Math.round(x).toLocaleString('en-US'));

(async () => {
  const email = (process.argv[2] || '').toLowerCase().trim();
  if (!email) { console.log('Usage: node scripts/diagnoseCalories.js you@email.com'); process.exit(1); }
  await mongoose.connect(process.env.MONGO_URI);
  const user = await User.findOne({ email }).lean();
  if (!user) { console.log('No user with that email.'); process.exit(1); }
  const uid = user._id;
  const p = (await Profile.findOne({ userId: uid }).lean()) || {};
  const today = process.argv[3] || ymd(new Date());
  const y1 = addDays(today, -1), y2 = addDays(today, -2);

  console.log(`\n=== ${email}   today=${today} ===`);
  console.log('Profile:', { sex: p.sex, age: p.age, heightCm: p.heightCm, weightKg: p.currentWeightKg, activityMode: p.activityMode, activityLevel: p.activityLevel,
    targetKg: p.goals?.targetWeightKg, pace: p.goals?.weeklyPaceKg, calorieMode: p.goals?.calorieMode, savedCalorieTarget: p.goals?.calorieTarget, calorieFloor: p.goals?.calorieFloor || '(default)', bodyType: p.goals?.bodyType });
  console.log('Stored autoActivity:', JSON.stringify(p.autoActivity));
  console.log('Stored measuredTdee:', JSON.stringify(p.measuredTdee));

  const hist = await buildHistory(uid, addDays(today, -34), today);
  const strength = await strengthDatesIn(uid, addDays(today, -34), today);
  console.log('\nLast 7 days as the server sees them (steps = synced health data; exMin = exercise log minutes):');
  for (const d of hist.days.slice(-7)) {
    const tr = isTrained(d, strength); const lab = activityLabel(d, tr);
    console.log(`  ${d.date}  steps=${String(d.steps).padStart(6)}  exMin=${String(d.exerciseMinutes).padStart(3)}  sets=${strength.has(d.date) ? 'yes' : 'no '}  trained=${tr ? 'Y' : 'n'}  label=${lab}  -> level=${appLevelFor(lab, d, tr)}  food=${kcal(d.calories)}`);
  }
  const rawSteps = await HealthLog.find({ userId: uid, type: 'steps', date: { $gte: addDays(today, -4) } }).select('date value updatedAt').lean();
  console.log('Raw HealthLog steps rows:', rawSteps.map((r) => `${r.date}=${r.value}`).join(', ') || 'NONE (steps are not syncing)');
  const acts = await ActivityLog.find({ userId: uid, date: { $gte: addDays(today, -4) } }).select('date activityName durationMinutes').lean();
  console.log('Raw exercise log rows:', acts.map((a) => `${a.date} ${a.activityName} ${a.durationMinutes}min`).join(' | ') || 'NONE (workouts are not reaching the server)');

  const row = (date) => { const r = hist.days.find((d) => d.date === date); return r ? { row: r, trained: isTrained(r, strength) } : null; };
  const next = nextAutoActivity(p.autoActivity, p, row(y1), row(y2), today);
  console.log('\nWhat the auto-activity rule would store now:', JSON.stringify(next));

  const pure = E.expectedEnergy({ ...p, activityMode: 'manual', measuredTdee: null });
  const live = E.expectedEnergy(p);
  const meas = measuredFrom(p, hist.days, today);
  console.log('\nPure formula (your chosen level, no adjustments): maintenance', kcal(pure?.tdee), '-> target', kcal(pure?.calorieTarget));
  console.log('LIVE target the app uses:', kcal(live?.calorieTarget), '| maintenance', kcal(live?.tdee), '| atFloor', live?.atFloor, '| level used:', E.activityLevelOf(p));
  console.log('Measured maintenance reading now:', meas ? JSON.stringify(meas) : 'not enough data (needs 4+ weigh-ins over 14+ days and 10+ logged days)');
  console.log('measuredTdee blended in:', live?.measuredTdee, live?.measuredRatio);

  console.log('\n--- Verdict ---');
  if (live && pure && live.calorieTarget < pure.calorieTarget) {
    if (live.measuredTdee && live.tdee < pure.tdee * 0.97) console.log('Measured-maintenance blend is lowering your maintenance (weight trend vs food log).');
    if (E.activityLevelOf(p) !== p.activityLevel) console.log(`Auto-activity is using "${E.activityLevelOf(p)}" instead of your chosen "${p.activityLevel}".`);
    if (live.atFloor) console.log('The result is being held at the safety floor.');
  } else console.log('Live target equals the pure formula; nothing is lowering it.');
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
