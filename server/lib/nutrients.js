// Seven-day nutrient averages vs. targets, so "low fibre all week" is visible instead of hidden in daily noise.
const r1 = (x) => Math.round(x * 10) / 10;

/**
 * @param days    day rows from buildHistory (needs calories, protein, carbohydrates, fat, fiber)
 * @param targets { protein, carbs, fat, fiber }
 */
function weeklyNutrients(days, targets, limits = null) {
  const logged = days.filter((d) => d.calories > 0);
  const n = logged.length;
  const avg = (k) => (n ? r1(logged.reduce((s, d) => s + (Number(d[k]) || 0), 0) / n) : 0);
  const rows = [
    { key: 'protein', label: 'Protein', field: 'protein', target: targets.protein, higherIsBetter: true },
    { key: 'fiber', label: 'Fibre', field: 'fiber', target: targets.fiber, higherIsBetter: true },
    { key: 'carbs', label: 'Carbs', field: 'carbohydrates', target: targets.carbs, higherIsBetter: false },
    { key: 'fat', label: 'Fat', field: 'fat', target: targets.fat, higherIsBetter: false },
  ].map((r) => {
    const average = avg(r.field);
    const pct = r.target ? Math.round((average / r.target) * 100) : null;
    const daysHit = r.target ? logged.filter((d) => (r.higherIsBetter ? d[r.field] >= r.target : d[r.field] <= r.target * 1.1)).length : 0;
    const lowDays = r.higherIsBetter && r.target ? logged.filter((d) => d[r.field] < r.target * 0.7).map((d) => d.date) : [];
    let status = 'ok';
    if (n >= 3 && pct !== null) status = r.higherIsBetter ? (pct < 70 ? 'low' : pct < 90 ? 'near' : 'ok') : (pct > 120 ? 'high' : 'ok');
    return { key: r.key, label: r.label, target: r.target, average, percentOfTarget: pct, daysHit, lowDays, status };
  });
  const worst = rows.filter((r) => r.status === 'low').sort((a, b) => a.percentOfTarget - b.percentOfTarget)[0];
  const tip = worst
    ? (worst.key === 'fiber' ? 'Fibre is running low: add dal, vegetables, fruit with skin, oats or whole grains.' : 'Protein is running low: add eggs, paneer, curd, dal, soy or lean meat.')
    : null;
  // Ceilings (sugar, sodium): lower is better. Sodium only appears when logged foods actually carry sodium data
  // (the shared catalogue has none), otherwise a perfect-looking 0 mg would be misleading.
  const limitRows = [];
  if (limits && n) {
    const mk = (key, label, unit, limit, field, minDigits = 1) => {
      const average = Math.round((logged.reduce((s, d) => s + (Number(d[field]) || 0), 0) / n) * minDigits) / minDigits;
      const pct = limit ? Math.round((average / limit) * 100) : null;
      return { key, label, unit, limit, average, percentOfLimit: pct, status: pct === null ? 'ok' : pct > 120 ? 'high' : pct > 100 ? 'near' : 'ok' };
    };
    if (limits.sugar) limitRows.push(mk('sugar', 'Sugar (total)', 'g', limits.sugar, 'sugar'));
    const sodium = mk('sodium', 'Sodium', 'mg', limits.sodiumMg, 'sodium');
    if (limits.sodiumMg && sodium.average > 0) limitRows.push(sodium);
  }
  return { loggedDays: n, rows, limits: limitRows, tip };
}

module.exports = { weeklyNutrients };
