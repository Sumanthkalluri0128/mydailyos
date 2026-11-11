// Planner learning from what is really eaten: finds the ONE main meal that is usually short on protein and suggests concrete swaps
// that fit the person's diet (veg / vegan / anything). Fixing the weakest meal is the cheapest way to hit the protein target, and
// protein is what protects muscle while dieting. Pure.
const SWAPS = {
  breakfast: { any: ['3-egg omelette with toast', 'paneer bhurji with roti', 'moong dal chilla with curd', 'Greek curd with oats and nuts'], veg: ['paneer bhurji with roti', 'moong dal chilla with curd', 'Greek curd with oats and nuts', 'besan chilla with paneer'], vegan: ['tofu scramble with toast', 'moong dal chilla', 'soy milk oats with peanut butter', 'sprouts and chana salad'] },
  lunch: { any: ['dal + curd + chicken or egg curry', 'rajma or chole with curd and salad', 'fish curry with rice and dal'], veg: ['dal + curd + paneer sabzi', 'rajma or chole with curd and salad', 'soya chunk curry with roti'], vegan: ['dal + soya chunk curry', 'rajma or chole with salad', 'tofu stir-fry with brown rice'] },
  dinner: { any: ['grilled chicken or fish with dal and sabzi', 'egg curry with roti', 'paneer tikka with salad'], veg: ['paneer tikka with salad', 'dal + curd + sabzi', 'soya chunk pulao with raita'], vegan: ['tofu or tempeh with dal and sabzi', 'soya chunk pulao', 'chana masala with roti'] },
};
const dietKey = (d) => (/vegan/i.test(d || '') ? 'vegan' : /veg|jain/i.test(d || '') && !/non/i.test(d || '') ? 'veg' : 'any');

/**
 * @param o.rows [{date, mealType, protein}] last 14 days   o.proteinTarget grams a day   o.diet
 * @returns null | {meal, avgG, goalG, shortG, swaps[], text}
 */
function mealProteinGap({ rows = [], proteinTarget = 0, diet = '' } = {}) {
  if (!(proteinTarget > 0)) return null;
  const goal = proteinTarget / 3;
  const per = {};
  for (const r of rows) {
    if (!SWAPS[r.mealType]) continue;
    const p = per[r.mealType] || (per[r.mealType] = { byDay: {} });
    p.byDay[r.date] = (p.byDay[r.date] || 0) + (Number(r.protein) || 0);
  }
  let worst = null;
  for (const [meal, p] of Object.entries(per)) {
    const vals = Object.values(p.byDay);
    if (vals.length < 5) continue;                                  // too few logged days to say "usually"
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    if (avg < goal * 0.7 && (!worst || avg / goal < worst.avg / goal)) worst = { meal, avg, n: vals.length };
  }
  if (!worst) return null;
  const swaps = SWAPS[worst.meal][dietKey(diet)].slice(0, 3);
  const shortG = Math.round(goal - worst.avg);
  return { meal: worst.meal, avgG: Math.round(worst.avg), goalG: Math.round(goal), shortG, swaps,
    text: `Your ${worst.meal} usually has about ${Math.round(worst.avg)} g of protein, ${shortG} g under a fair share of your ${Math.round(proteinTarget)} g. Fixing this one meal is the easiest win. Try: ${swaps.join('; ')}.` };
}

module.exports = { mealProteinGap };
