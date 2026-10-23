// "Copy yesterday's lunch" / "Same as last time": pick the entries to repeat, shown to the person BEFORE anything is saved.
const { addDays } = require('./dates');

const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'];

/**
 * @param logs  past food logs [{ _id, date, mealType, foodId, foodName, consumedQuantity, servingUnit, nutritionTotal }] (any order)
 * @param opts  { meal, today, mode: 'yesterday' | 'last' }
 * @returns { date, entries, kcal } | null  — 'yesterday' means exactly the day before today; 'last' is the most recent earlier day with that meal.
 */
function pickRepeat(logs, { meal, today, mode = 'last' }) {
  if (!MEALS.includes(meal)) return null;
  const pool = (logs || []).filter((l) => l.mealType === meal && l.date < today);
  if (!pool.length) return null;
  const date = mode === 'yesterday' ? addDays(today, -1) : pool.reduce((m, l) => (l.date > m ? l.date : m), '');
  const entries = pool.filter((l) => l.date === date);
  if (!entries.length) return null;
  const kcal = Math.round(entries.reduce((s, l) => s + Number(l.nutritionTotal?.calories || 0), 0));
  return { date, entries, kcal };
}

/** Quantities the person edited in the preview: [{ id, quantity }] -> only known ids, positive numbers, max 100 entries. */
function applyEdits(entries, edits) {
  const q = new Map((edits || []).map((e) => [String(e.id), Number(e.quantity)]));
  return entries.slice(0, 100).map((e) => {
    const n = q.get(String(e._id));
    return { ...e, consumedQuantity: Number.isFinite(n) && n > 0 && n <= 100000 ? n : e.consumedQuantity };
  });
}

module.exports = { pickRepeat, applyEdits, MEALS };
