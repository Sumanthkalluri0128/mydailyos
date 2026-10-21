// "Why this plate?": one friendly sentence per meal, built from what the planner recorded for each item (its short reasons) and the meal's totals.
// No judgement words: it says what the plate does for the person ("32 g protein in 480 kcal, uses leftover dal and takes about 15 minutes").
const SPECIAL = /leftover|already have|you love|favourite|no cooking|minutes to cook|fits the cuisine|as you like|double batch/i;

const lc = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s);

/** @param items  the meal's items (planned ones are explained; logged ones are ignored)  @param o { proteinGoal } */
function explainMeal(items = [], { proteinGoal = 0 } = {}) {
  const planned = items.filter((i) => (i.status || 'planned') === 'planned');
  if (!planned.length) return '';
  const kcal = Math.round(planned.reduce((s, i) => s + (Number(i.calories) || 0), 0));
  const prot = Math.round(planned.reduce((s, i) => s + (Number(i.protein) || 0), 0));
  const bits = [];
  for (const it of planned) {
    for (const seg of String(it.why || '').split(' · ')) {
      const t = seg.trim();
      if (!t || !SPECIAL.test(t)) continue;
      const lo = t.match(/^leftover (.+?) from /i);
      const bit = lo ? `uses your leftover ${lo[1].replace(/\s*\([^)]*\)/g, '')}` : lc(t);
      if (!bits.some((b) => b.toLowerCase() === bit.toLowerCase())) bits.push(bit);
    }
  }
  const pct = proteinGoal > 0 ? Math.round((prot / proteinGoal) * 100) : 0;
  const head = prot >= 5 ? `${prot} g protein${pct >= 10 ? ` (about ${pct}% of your day)` : ''} in ${kcal} kcal` : `${kcal} kcal of light, easy food`;
  const tail = bits.slice(0, 2);
  return `${head}${tail.length ? `, ${tail.join(' and ')}` : ''}.`.replace(/^./, (c) => c.toUpperCase());
}

/** Attach `why` (and `locked`) to every meal of a day view, in place. */
function explainDay(day, { proteinGoal = 0 } = {}) {
  for (const m of Object.keys(day.meals || {})) {
    const meal = day.meals[m];
    const planned = (meal.items || []).filter((i) => i.status === 'planned');
    meal.why = planned.length ? explainMeal(planned, { proteinGoal }) : '';
    meal.locked = planned.length > 0 && planned.every((i) => i.locked);
  }
  return day;
}

module.exports = { explainMeal, explainDay };
