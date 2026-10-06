// Weekly progress email: summary + nutrient averages + weight-trend note, as plain text.
const Profile = require('../models/Profile');
const User = require('../models/User');
const WeightLog = require('../models/WeightLog');
const { buildHistory } = require('./progress');
const { buildWeeklySummary, weekContaining } = require('./weekly');
const { weeklyNutrients } = require('./nutrients');
const { detectPlateau } = require('./plateau');
const { dailyTarget, expectedEnergy, macroTargets } = require('./energy');
const { addDays, weekday, todayUtc } = require('./dates');
const { sendMail } = require('./mailer');

/** Everything the digest (and the weekly screens) need for the 7 days ending on `end`. */
async function weeklyBundle(userId, end, profile) {
  const start = addDays(end, -6);
  const { days } = await buildHistory(userId, addDays(start, -7), end);
  const target = dailyTarget(profile);
  const e = expectedEnergy(profile);
  const macros = macroTargets(target, profile?.currentWeightKg, e?.direction, profile?.goals?.proteinTarget);
  const summary = buildWeeklySummary({ current: days.slice(7), previous: days.slice(0, 7), goals: { ...(profile?.goals || {}), calorieTarget: target } });
  const nutrients = weeklyNutrients(days.slice(7), macros);
  return { summary, nutrients, macros, target };
}

async function plateauFor(userId, today, profile, target) {
  const weights = await WeightLog.find({ userId, date: { $gte: addDays(today, -30), $lte: today } }).select('date weightKg').lean();
  return detectPlateau({ weights, profile: profile || {}, today, target });
}

function digestText({ name, summary, nutrients, plateau }) {
  const s = summary, L = [];
  L.push(`Hi ${name || 'there'},`, '', `Your week ${s.from} to ${s.to} on FlexFit:`, '');
  L.push(`- Active on ${s.activeDays} of 7 days`);
  L.push(`- Average intake: ${s.averages.calories} kcal/day, ${s.averages.protein} g protein`);
  L.push(`- Exercise: ${s.totals.exerciseMinutes} min total, water ${Math.round(s.averages.waterMl)} ml/day`);
  L.push(`- Goals hit: calories ${s.goalDays.calories}/7, protein ${s.goalDays.protein}/7, water ${s.goalDays.water}/7, exercise ${s.goalDays.exercise}/7`);
  if (s.weight) L.push(`- Weight: ${s.weight.start} -> ${s.weight.end} kg (${s.weight.change > 0 ? '+' : ''}${s.weight.change})`);
  if (nutrients.loggedDays) {
    L.push('', 'Nutrients (daily average vs target):');
    for (const r of nutrients.rows) L.push(`- ${r.label}: ${r.average} g of ${r.target} g (${r.percentOfTarget}%)`);
    if (nutrients.tip) L.push('', `Tip: ${nutrients.tip}`);
  }
  if (plateau && plateau.status !== 'insufficient_data' && plateau.status !== 'on_track') L.push('', `Weight trend: ${plateau.message}`);
  L.push('', 'Keep going - small, consistent days add up.', '', '- FlexFit');
  return L.join('\n');
}

async function digestFor(userId, end) {
  const [profile, user] = await Promise.all([Profile.findOne({ userId }).lean(), User.findById(userId).select('name email').lean()]);
  if (!user) return null;
  const b = await weeklyBundle(userId, end, profile);
  const plateau = await plateauFor(userId, end, profile, b.target);
  return { user, subject: `Your FlexFit week: ${b.summary.from} – ${b.summary.to}`, text: digestText({ name: user.name?.split(' ')[0], summary: b.summary, nutrients: b.nutrients, plateau }) };
}

/** Sends last week's (Mon–Sun) digest to everyone who opted in and hasn't received it yet. Safe to call repeatedly. */
async function sendWeeklyDigests({ today = todayUtc(), send = sendMail } = {}) {
  const lastWeek = weekContaining(addDays(today, -1), weekday);
  const people = await Profile.find({ 'notify.weeklyEmail': true, 'notify.lastWeeklyEmail': { $ne: lastWeek.from } }).select('userId').lean();
  let sent = 0, failed = 0;
  for (const p of people) {
    try {
      const d = await digestFor(p.userId, lastWeek.to);
      if (!d) continue;
      await send({ to: d.user.email, subject: d.subject, text: d.text });
      await Profile.updateOne({ userId: p.userId }, { $set: { 'notify.lastWeeklyEmail': lastWeek.from } });
      sent += 1;
    } catch (e) { failed += 1; console.warn('Weekly email failed:', e.message); }
  }
  return { week: lastWeek, sent, failed };
}

module.exports = { weeklyBundle, plateauFor, digestText, digestFor, sendWeeklyDigests };
