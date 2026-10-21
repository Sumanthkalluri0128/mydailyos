// Pure helpers used with the plan context (no database): the habit filter and the safety adjustment.
const { macroRanges } = require('./energy');

/** For "plan from what I log" (mode mine): drop excluded foods from the habits and the food map before planning. */
function filterHabits(habits, foods, excluder) {
  if (!excluder || excluder.empty) return { habits, foods };
  const ok = (f) => !excluder.test(f.name || f.foodName || '', { ingredients: f.ingredients });
  const keepIds = new Set([...foods.entries()].filter(([, f]) => ok(f)).map(([id]) => String(id)));
  const byFood = new Map([...habits.byFood.entries()].filter(([id, h]) => keepIds.has(String(id)) || (!foods.has(id) && excluder.ok(h.name || ''))));
  const byMeal = Object.fromEntries(Object.entries(habits.byMeal).map(([m, list]) => [m, list.filter((h) => byFood.has(String(h.foodId)))]));
  return { habits: { ...habits, byFood, byMeal }, foods: new Map([...foods.entries()].filter(([id]) => keepIds.has(String(id)))) };
}


/** Pregnancy, under 18 and medical conditions: the plan is sized for maintenance (no calorie cut), never an aggressive target. */
function adjustCoreForSafety(core, safety) {
  if (!safety || !safety.maintenanceOnly || !core || !core.energy || !(core.energy.tdee > 0)) return core;
  const target = Math.max(core.floor, Math.round(core.energy.tdee / 10) * 10);
  return { ...core, target, direction: 'maintain', ranges: macroRanges(target, core.profile.currentWeightKg, 'maintain', undefined) };
}

module.exports = { filterHabits, adjustCoreForSafety };
