// Weekly progress email: summary + nutrient averages + weight-trend note, as plain text.
const Profile = require('../models/Profile');
const User = require('../models/User');
const WeightLog = require('../models/WeightLog');
const { buildHistory } = require('./progress');
const { buildWeeklySummary, weekContaining } = require('./weekly');
const { weeklyNutrients } = require('./nutrients');
const { detectPlateau } = require('./plateau');
const { dailyTarget, expectedEnergy, macroTargets, limitTargets, waterTargetMl } = require('./energy');
const { addDays, weekday, todayUtc } = require('./dates');
const { sendMail } = require('./mailer');
const { renderWeeklyEmail } = require('./emailTemplate');
const { unsubscribeUrl, appUrl } = require('./unsubscribe');

/** Everything the digest (and the weekly screens) need for the 7 days ending on `end`. */
async function weeklyBundle(userId, end, profile) {
  const start = addDays(end, -6);
  const { days } = await buildHistory(userId, addDays(start, -7), end);
  const target = dailyTarget(profile);
  const e = expectedEnergy(profile);
  const macros = macroTargets(target, profile?.currentWeightKg, e?.direction, profile?.goals?.proteinTarget);
  const g = profile?.goals || {};
  const goals = {
    ...g, calorieTarget: target,
    proteinTarget: g.proteinTarget || macros.protein,
    waterTargetMl: waterTargetMl(profile?.currentWeightKg) || g.waterTargetMl || null,
    exerciseMinutesTarget: g.exerciseMinutesTarget || null,
  };
  const scoreKeys = ['calories', 'protein', 'water', ...(goals.exerciseMinutesTarget ? ['exercise'] : [])];
  const summary = buildWeeklySummary({ current: days.slice(7), previous: days.slice(0, 7), goals });
  const nutrients = weeklyNutrients(days.slice(7), macros, limitTargets(target));
  return { summary, nutrients, macros, target, scoreKeys };
}

async function plateauFor(userId, today, profile, target) {
  const weights = await WeightLog.find({ userId, date: { $gte: addDays(today, -30), $lte: today } }).select('date weightKg').lean();
  return detectPlateau({ weights, profile: profile || {}, today, target });
}

async function digestFor(userId, end) {
  const [profile, user] = await Promise.all([Profile.findOne({ userId }).lean(), User.findById(userId).select('name email').lean()]);
  if (!user) return null;
  const b = await weeklyBundle(userId, end, profile);
  const plateau = await plateauFor(userId, end, profile, b.target);
  const unsub = unsubscribeUrl(userId);
  const mail = renderWeeklyEmail({ name: user.name, summary: b.summary, nutrients: b.nutrients, plateau, target: b.target, scoreKeys: b.scoreKeys, appUrl: appUrl(), unsubscribeUrl: unsub });
  const headers = unsub ? { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined;
  return { user, ...mail, headers };
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
      await send({ to: d.user.email, subject: d.subject, text: d.text, html: d.html, headers: d.headers });
      await Profile.updateOne({ userId: p.userId }, { $set: { 'notify.lastWeeklyEmail': lastWeek.from } });
      sent += 1;
    } catch (e) { failed += 1; console.warn('Weekly email failed:', e.message); }
  }
  return { week: lastWeek, sent, failed };
}

module.exports = { weeklyBundle, plateauFor, digestFor, sendWeeklyDigests };
