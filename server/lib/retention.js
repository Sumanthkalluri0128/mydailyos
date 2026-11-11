// Water weight hides progress. Before the coach reads a slow or flat week as a stall, it checks for the usual short-term causes of
// extra water on the scale. If one is present it waits ONE more week (never more than once every 21 days), so you are never cut
// because of a salty dinner, a diet break, a new training block or a bad-sleep week. Pure.
const { diffDays } = require('./dates');

/**
 * @param o.days [{date, calories, ...}] ascending (35 days)   o.today   o.target kcal   o.dietBreakEnded 'YYYY-MM-DD'|null   o.dietBreakActive
 * @param o.sleepAvg hours (last 7 nights) | null   o.trainingJump true when this week has clearly more / harder training than the last
 */
function retentionFlags({ days = [], today, target, dietBreakActive = false, dietBreakEnded = null, sleepAvg = null, trainingJump = false, sex = '' } = {}) {
  const reasons = [];
  const recent = days.filter((d) => d.date <= today && diffDays(d.date, today) < 3);
  if (target > 0 && recent.some((d) => Number(d.calories) > target * 1.25)) reasons.push({ id: 'heavy-day', text: 'A heavier or saltier day in the last 3 days can hold 0.5 to 1.5 kg of water for several days.' });
  if (dietBreakActive || (dietBreakEnded && diffDays(dietBreakEnded, today) >= 0 && diffDays(dietBreakEnded, today) <= 7)) reasons.push({ id: 'diet-break', text: 'After a diet break the body refills its carbohydrate stores, and each gram holds water. This is not fat.' });
  if (trainingJump) reasons.push({ id: 'new-training', text: 'New or harder training makes muscles hold water while they repair. It fades in one to two weeks.' });
  if (sleepAvg !== null && sleepAvg < 6) reasons.push({ id: 'low-sleep', text: 'Short sleep raises stress hormones, which hold water.' });
  const note = sex === 'female' ? 'Water also shifts across the monthly cycle, often up to 2 kg before a period, so compare the same phase week to week.' : '';
  return { likely: reasons.length > 0, reasons, note };
}

/** One wait per 21 days: stops "it's just water" from becoming a permanent excuse. */
const mayWait = (st, today) => !(st && st.retWaitedOn && diffDays(st.retWaitedOn, today) < 21);

module.exports = { retentionFlags, mayWait };
