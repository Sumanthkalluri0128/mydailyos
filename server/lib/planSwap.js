// "Swap this meal": three ranked alternatives, each with the reason it was chosen. The pool is already filtered by the person's rules
// (allergens, diet mode, dislikes, kitchen, budget, foods marked "not available"), so an excluded food can never be offered here.
const r2 = (x) => Math.round(x * 2) / 2;
const r1 = (x) => Math.round(x * 10) / 10;

function rankAlternatives({ item, pool, rules, weekCounts = new Map(), plannedNames = new Set(), otherFamilies = new Set(), limit = 3, role: roleIn }) {
  const role = roleIn || item.role;
  const meal = item.mealType;
  const date = item.date;
  const out = [];
  for (const c of pool) {
    if (c.role !== role) continue;
    if (!(c.meals.has(meal) || c.famMeals.has(meal))) continue;
    if (c.key === String(item.foodId) || c.name === item.foodName || plannedNames.has(c.name.toLowerCase())) continue;
    if (c.heavy && !c.habit && c.role !== 'sweet') continue;
    if (rules && !rules.okFor(c, { meal, date })) continue;
    const servings = Math.min(4, Math.max(0.5, r2(item.calories / Math.max(c.per.calories, 20))));
    const kcal = c.per.calories * servings;
    if (Math.abs(kcal - item.calories) > Math.max(40, item.calories * 0.3)) continue;
    const close = 1 - Math.abs(kcal - item.calories) / Math.max(item.calories, 60);
    const protein = c.per.protein * servings;
    const b = rules && rules.active ? rules.bonus(c, servings, { meal, role, date }) : { sc: 0, reasons: [] };
    const fresh = (weekCounts.get(c.key) || 0) === 0;
    let score = close + (c.habit ? 0.35 : 0) + Math.min(0.4, (protein * 4) / Math.max(kcal, 40)) + b.sc + (fresh ? 0.25 : 0);
    if (role === 'protein' && c.family && otherFamilies.has(c.family)) score -= 0.6;
    const reasons = [...b.reasons].sort((a, z) => a.p - z.p).map((r) => r.t);
    if (protein >= (item.protein || 0) + 3) reasons.push(`${Math.round(protein - (item.protein || 0))} g more protein`);
    if (c.habit && c.habit.perWeek >= 1) reasons.push('one of your regulars');
    if (fresh && role === 'protein') reasons.push('a different protein source this week');
    const diff = Math.round(kcal - item.calories);
    reasons.push(Math.abs(diff) <= 25 ? 'about the same calories' : diff < 0 ? `${Math.abs(diff)} kcal lighter` : `${diff} kcal more`);
    const text = reasons.slice(0, 2).join(' · ');
    out.push({ score, row: {
      foodId: c.id, name: c.name, servings, quantity: r1(c.size * servings), unit: c.unit, calories: Math.round(kcal), protein: r1(protein),
      familiar: !!c.habit, curated: c.source === 'curated' && !c.id, reason: text[0].toUpperCase() + text.slice(1),
    } });
  }
  return out.sort((a, b) => b.score - a.score || a.row.name.localeCompare(b.row.name)).slice(0, limit).map((x) => x.row);
}

module.exports = { rankAlternatives };
