// "Re-plan the rest of today": after a heavy lunch or a skipped breakfast, what should the remaining meals look like?
// Principles (same spirit as overEngine): never skip a meal, never go below a minimum meal, protein stays protected, the honest
// leftover is carried by the WEEK (overEngine), not crushed into one evening. Pure.
const r5 = (x) => Math.round(x / 5) * 5;
const WEIGHT = { breakfast: 0.25, lunch: 0.35, snack: 0.1, dinner: 0.3 };
const MIN_MEAL = 300;          // never plan a "meal" smaller than this
const LIGHT = { dinner: 'Dal or paneer or egg or chicken, a big plate of vegetables, curd, and one roti or a small bowl of rice.', lunch: 'Dal or lean protein, a big salad or sabzi, curd, and a small portion of rice or one roti.', breakfast: 'Eggs or paneer bhurji or moong chilla with curd.', snack: 'Curd, roasted chana, or fruit with a few nuts.' };

/**
 * @param o.budget today's calorie budget   o.floor safe minimum for the DAY   o.eaten, o.proteinEaten, o.proteinTarget
 * @param o.logged {breakfast, lunch, snack, dinner} booleans   o.hour 0-23 local
 */
function replanRestOfDay({ budget, floor = 1200, eaten = 0, proteinEaten = 0, proteinTarget = 0, logged = {}, hour = 12 } = {}) {
  if (!(budget > 0)) return null;
  const open = [];
  if (!logged.breakfast && hour < 11) open.push('breakfast');
  if (!logged.lunch && hour < 16) open.push('lunch');
  if (!logged.snack && hour < 18) open.push('snack');
  if (!logged.dinner && hour < 23) open.push('dinner');
  if (!open.length) return null;
  const left = budget - eaten;
  const proteinLeft = Math.max(0, proteinTarget - proteinEaten);
  const mains = open.filter((s) => s !== 'snack');
  const wsum = open.reduce((t, s) => t + WEIGHT[s], 0);
  // the day may not end below the safe floor, whatever was eaten earlier
  const room = Math.max(left, floor - eaten, MIN_MEAL * mains.length);
  const over = left < MIN_MEAL * mains.length;
  const plan = open.map((slot) => {
    const share = WEIGHT[slot] / wsum;
    const kcal = Math.max(slot === 'snack' ? 0 : MIN_MEAL, r5(room * share));
    const protein = mains.includes(slot) ? Math.max(20, r5(proteinLeft / Math.max(1, mains.length))) : 0;
    return { slot, kcal, proteinG: proteinTarget > 0 ? protein : 0, idea: LIGHT[slot] };
  });
  const message = over
    ? `You are at or over today's budget. Do not skip meals: keep ${mains[mains.length - 1] || 'dinner'} light and protein-first. The extra is spread over the week, so there is nothing to make up tonight.`
    : `${Math.max(0, Math.round(left))} kcal left for ${open.join(', ')}.${proteinLeft > 0 ? ` Aim for about ${r5(proteinLeft)} g more protein.` : ''}`;
  return { over, leftKcal: Math.round(left), proteinLeftG: Math.round(proteinLeft), plan, message };
}

module.exports = { replanRestOfDay, MIN_MEAL };
