// "What should I eat next?" — ranks foods by how well one serving fills what is still missing today.
const MEAL_HINT = {
  breakfast: /oat|egg|idli|dosa|poha|upma|paratha|toast|bread|milk|curd|banana|smoothie|besan|chilla|sprout|muesli/i,
  lunch: /roti|rice|dal|sabzi|paneer|chicken|curry|rajma|chole|khichdi|salad|curd/i,
  dinner: /roti|dal|sabzi|paneer|chicken|soup|salad|khichdi|fish|egg|tofu/i,
  snacks: /nut|almond|fruit|apple|banana|sprout|chana|curd|yogurt|makhana|roast|buttermilk|protein|egg/i,
};

/**
 * @param foods     candidate foods (per-serving values)
 * @param remaining { calories, protein, fiber }  what is left today (can be <=0)
 * @param opts      { mealType, recentIds:Set, favoriteIds:Set, limit }
 */
function suggestFoods(foods, remaining, { mealType, recentIds = new Set(), favoriteIds = new Set(), limit = 6 } = {}) {
  const kcalLeft = Math.max(0, Number(remaining.calories) || 0);
  const pLeft = Math.max(0, Number(remaining.protein) || 0);
  const fLeft = Math.max(0, Number(remaining.fiber) || 0);
  if (kcalLeft < 40) return [];
  const hint = MEAL_HINT[mealType];
  const scored = [];
  for (const f of foods) {
    const kcal = Number(f.calories) || 0;
    if (kcal <= 0 || kcal > kcalLeft * 1.05) continue;           // must fit in what's left
    const protein = Number(f.protein) || 0, fiber = Number(f.fiber) || 0;
    const proteinFill = pLeft ? Math.min(protein / pLeft, 0.5) : 0; // one serving filling half the gap is a great hit
    const fiberFill = fLeft ? Math.min(fiber / fLeft, 0.5) : 0;
    const density = (protein * 4 + fiber * 6) / Math.max(kcal, 30); // nutrients per calorie
    let score = proteinFill * 2 + fiberFill * 1.5 + Math.min(density, 1.2) * 0.8;
    if (hint && hint.test(f.name)) score += 0.25;
    if (favoriteIds.has(String(f._id))) score += 0.2;
    if (recentIds.has(String(f._id))) score += 0.15;               // familiar foods are more likely to be eaten
    const sugar = Number(f.sugar) || 0;
    if (sugar > 15) score -= 0.2;
    if (score <= 0.15) continue;
    const why = [];
    if (protein >= 8 && pLeft) why.push(`${Math.round(protein)} g protein`);
    if (fiber >= 3 && fLeft) why.push(`${Math.round(fiber * 10) / 10} g fibre`);
    why.push(`${Math.round(kcal)} kcal`);
    scored.push({ food: f, score, reason: why.join(' · ') });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

module.exports = { suggestFoods };
