// Week templates, as pure functions (the routes only load and save). A template stores a week by weekday OFFSET (0-6), so it can be loaded onto any week.
const { addDays, diffDays } = require('./dates');
const { findViolations } = require('./foodSafety');

const KEYS = ['mealType', 'foodId', 'foodName', 'quantity', 'servingUnit', 'calories', 'protein', 'fiber', 'carbohydrates', 'fat', 'role'];

/** Planned (not yet eaten) rows of the 7 days starting `from` -> template items. */
function itemsFromRows(rows, from) {
  return rows.filter((r) => !r.logged && r.date >= from && r.date <= addDays(from, 6)).sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({ offset: diffDays(from, r.date), ...Object.fromEntries(KEYS.map((k) => [k, r[k] ?? (k === 'role' ? '' : 0)])), locked: !!r.locked }));
}

/**
 * Template items -> rows for the week starting `from`.
 *   today      days before it are never planned
 *   taken      Set('date|meal') of meals that already hold food (kept, unless replace)
 *   excluder   the person's CURRENT exclusions: a food they now keep out is skipped and reported
 * Returns { rows, skipped: [{ name, reason }], keptMeals }.
 */
function rowsFromTemplate(items, { from, today = '', taken = new Set(), excluder = null, replace = false } = {}) {
  const bad = new Map(findViolations(items, excluder).map((b) => [b.item, b.reason]));
  const rows = []; const skipped = []; const kept = new Set();
  for (const it of items) {
    if (bad.has(it)) { skipped.push({ name: it.foodName, reason: `it ${bad.get(it)}` }); continue; }
    const date = addDays(from, it.offset);
    if (date < today) continue;
    if (!replace && taken.has(`${date}|${it.mealType}`)) { kept.add(`${date}|${it.mealType}`); continue; }
    rows.push({ date, ...Object.fromEntries(KEYS.map((k) => [k, it[k]])), locked: !!it.locked, auto: false });
  }
  return { rows, skipped, keptMeals: kept.size };
}

module.exports = { itemsFromRows, rowsFromTemplate };
