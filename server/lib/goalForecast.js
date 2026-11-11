// "When will I get there?" Two honest dates: at the pace the trend line shows now, and at the pace the plan intends.
// Linear and rounded on purpose (loss slows a little as weight drops), so the wording says "about". Pure.
const { addDays } = require('./dates');
const { maxSafeWeeklyLossKg } = require('./trendWeight');

const r1 = (x) => Math.round(x * 10) / 10;
const MAX_WEEKS = 104;

function eta(remainingKg, ratePerWeek, today) {
  if (!(ratePerWeek > 0.02)) return null;
  const weeks = remainingKg / ratePerWeek;
  if (!(weeks <= MAX_WEEKS)) return null;
  return { weeks: Math.ceil(weeks), date: addDays(today, Math.ceil(weeks * 7)), ratePerWeek: r1(ratePerWeek * 100) / 100 };
}

/**
 * @param o.currentKg   latest TREND weight (not a single scale reading)
 * @param o.targetKg    goal weight
 * @param o.rateKgWk    trend rate, kg/week, negative = losing (null when unknown)
 * @param o.planKgWk    the pace the plan intends, kg/week, always positive
 */
function goalForecast({ currentKg, targetKg, rateKgWk = null, planKgWk = null, today }) {
  const c = Number(currentKg), t = Number(targetKg);
  if (!(c > 0) || !(t > 0) || !today) return null;
  const direction = t < c - 0.4 ? 'lose' : t > c + 0.4 ? 'gain' : 'maintain';
  if (direction === 'maintain') return { direction, remainingKg: 0, atCurrent: null, atPlan: null, message: 'You are at your goal weight. The aim now is to hold it.' };
  const remaining = r1(Math.abs(t - c));
  const toward = rateKgWk === null ? null : direction === 'lose' ? -rateKgWk : rateKgWk;
  let plan = Number(planKgWk) > 0 ? Number(planKgWk) : null;
  if (plan && direction === 'lose') plan = Math.min(plan, maxSafeWeeklyLossKg(c));      // never promise a date that needs an unsafe pace
  const atCurrent = toward === null ? null : eta(remaining, toward, today);
  const atPlan = plan ? eta(remaining, plan, today) : null;
  let message;
  if (toward === null) message = atPlan ? `At your planned pace you would reach ${t} kg in about ${atPlan.weeks} weeks. Weigh in a few times and I can show where you really are.` : 'Weigh in a few times and I can estimate a date.';
  else if (toward <= 0.02) message = atPlan ? `The trend is not moving toward ${t} kg yet. At the planned pace it would take about ${atPlan.weeks} weeks, so the coach is working on getting you back on that pace.` : `The trend is not moving toward ${t} kg yet.`;
  else if (!atCurrent) message = `At today's pace ${t} kg is more than two years away. The coach will look at what can change.`;
  else if (atPlan) {
    const diff = atCurrent.weeks - atPlan.weeks;
    message = diff <= 1 ? `On pace: about ${atCurrent.weeks} weeks to ${t} kg.` : `At today's pace: about ${atCurrent.weeks} weeks. On plan it would be ${atPlan.weeks}, so you are about ${diff} weeks behind. Getting back on pace is the fastest safe fix.`;
  } else message = `At today's pace: about ${atCurrent.weeks} weeks to ${t} kg.`;
  const behindWeeks = atCurrent && atPlan ? Math.max(0, atCurrent.weeks - atPlan.weeks) : null;
  // A trend over a few weeks is not exact, so one date would promise too much: also show an earliest and a latest date (rate 25% faster / slower,
  // the faster one never beyond the safe weekly limit).
  let range = null;
  if (atCurrent && toward > 0.02) {
    const fast = direction === 'lose' ? Math.min(toward * 1.25, maxSafeWeeklyLossKg(c)) : toward * 1.25;
    const earliest = eta(remaining, Math.max(fast, toward), today), latest = eta(remaining, toward * 0.75, today);
    if (earliest && latest && latest.weeks > earliest.weeks) range = { earliest: { weeks: earliest.weeks, date: earliest.date }, latest: { weeks: latest.weeks, date: latest.date } };
  }
  return { direction, remainingKg: remaining, atCurrent, atPlan, behindWeeks, range, message };
}

module.exports = { goalForecast, eta };
