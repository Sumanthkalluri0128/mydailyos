// Safety layer. Gamifying weight needs guard rails: underweight and rapid-loss warnings, a very-low-intake check, "hide numbers" mode,
// and a tone check so nothing we write shames the person.
const { goalDirection } = require('./energy');
const { maxSafeWeeklyLossKg } = require('./trendWeight');

const bmi = (kg, cm) => (kg > 0 && cm > 0 ? kg / ((cm / 100) ** 2) : null);

/**
 * @param profile      Profile-like (currentWeightKg, heightCm, sex, goals.targetWeightKg, safety.hideNumbers)
 * @param trendRate    kg/week from the trend line (negative = losing), or null
 * @param avgIntake7   average logged kcal over the last 7 days, and `loggedDays7`
 */
function safetyReport({ profile = {}, trendRate = null, avgIntake7 = null, loggedDays7 = 0 }) {
  const flags = [];
  const w = Number(profile.currentWeightKg), h = Number(profile.heightCm);
  const goals = profile.goals || {};
  const direction = goalDirection(w, goals.targetWeightKg);
  const floor = profile.sex === 'male' ? 1500 : 1200;
  const nowBmi = bmi(w, h), goalBmi = bmi(Number(goals.targetWeightKg), h);

  if (nowBmi !== null && nowBmi < 18.5 && direction === 'lose') flags.push({ id: 'underweight', severity: 'alert', title: 'Your weight is already in the low range', detail: 'For your height, losing more is not recommended. We have paused weight-loss rewards. Please talk to a doctor or dietitian about a healthy plan.' });
  else if (goalBmi !== null && goalBmi < 18.5 && direction === 'lose') flags.push({ id: 'goal-too-low', severity: 'alert', title: 'That goal weight is below the healthy range', detail: `For your height a healthy goal is at least ${Math.round(18.5 * ((h / 100) ** 2) * 10) / 10} kg. Pick a goal at or above that.` });

  if (trendRate !== null && direction === 'lose' && -trendRate > maxSafeWeeklyLossKg(w) * 1.2) flags.push({ id: 'rapid-loss', severity: 'alert', title: 'You are losing faster than is healthy', detail: `Your trend is down about ${Math.round(-trendRate * 100) / 100} kg a week. Around ${maxSafeWeeklyLossKg(w)} kg (1% of body weight) is the limit we recommend. Eating a little more protects muscle and energy.` });
  if (avgIntake7 !== null && loggedDays7 >= 4 && avgIntake7 < floor * 0.9) flags.push({ id: 'low-intake', severity: 'notice', title: 'Your intake looks very low', detail: `You average about ${Math.round(avgIntake7)} kcal on logged days, below the ${floor} kcal we treat as a safe minimum. If some meals are missing from the log, add them; if not, please eat a little more.` });
  if (direction === 'lose' && Number(goals.weeklyPaceKg) > maxSafeWeeklyLossKg(w)) flags.push({ id: 'pace-high', severity: 'notice', title: 'Your chosen pace is above the recommended rate', detail: `The recommended maximum for you is about ${maxSafeWeeklyLossKg(w)} kg a week.` });

  const level = flags.some((f) => f.severity === 'alert') ? 'alert' : flags.length ? 'notice' : 'ok';
  return { level, flags, hideNumbers: !!profile.safety?.hideNumbers, pauseWeightRewards: flags.some((f) => f.id === 'underweight' || f.id === 'goal-too-low') };
}

// Words and phrases we never use. Messages in this app are checked against this list in the tests.
const SHAME = /\b(cheat(ed|ing)?|blew it|fail(ed|ure)?|guilty|guilt|bad day|burn(ed)? (it|that) off|earn (your|that) (food|meal)|punish|disgusting|lazy|pathetic|sinful|gluttony|no excuses)\b/i;
const toneCheck = (text) => { const m = String(text || '').match(SHAME); return { ok: !m, match: m ? m[0] : null }; };

module.exports = { safetyReport, toneCheck, SHAME, bmi };
