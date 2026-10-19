// Sanity-checks every catalogue food for internal consistency (no database needed): node scripts/auditFoods.js [--json]
//   Atwater:  kcal ≈ 4·protein + 4·(carbs − fibre) + 2·fibre + 9·fat   (general factors; ±15 % or ±15 kcal is normal rounding)
//   Micronutrients (when present): never negative, never above a plausible per-serving ceiling, and a serving can't hold more
//             mineral/vitamin mass than the serving weighs. Missing is fine (unknown); 0 is only accepted as a real zero.
//   Rules:    sugar ≤ carbs, fibre ≤ carbs, nothing negative, macros can't weigh more than the serving, sodium plausible.
const { CATALOGUE } = require('../lib/foodCatalogue');
const { KEYS } = require('../lib/rda');
const { MAX } = require('../lib/microParse');
const { loadFile } = require('../lib/microImport');

const num = (x) => Number(x) || 0;
function audit(foods = CATALOGUE) {
  const issues = [];
  for (const f of foods) {
    const p = num(f.protein), c = num(f.carbohydrates), fat = num(f.fat), fib = num(f.fiber), sug = num(f.sugar), kcal = num(f.calories), na = num(f.sodium);
    const calc = 4 * p + 4 * Math.max(0, c - fib) + 2 * fib + 9 * fat;
    const diff = kcal - calc;
    const tol = Math.max(15, 0.15 * Math.max(kcal, calc));
    const add = (type, msg, extra = {}) => issues.push({ name: f.name, type, msg, ...extra });
    if (Math.abs(diff) > tol) add('energy_mismatch', `lists ${kcal} kcal but macros add up to ${Math.round(calc)} kcal`, { listed: kcal, calculated: Math.round(calc), diffPct: Math.round((diff / Math.max(calc, 1)) * 100) });
    if (sug > c + 0.5) add('sugar_gt_carbs', `sugar ${sug} g exceeds carbs ${c} g`);
    if (fib > c + 0.5) add('fibre_gt_carbs', `fibre ${fib} g exceeds carbs ${c} g`);
    if ([p, c, fat, fib, sug, kcal, na].some((x) => x < 0)) add('negative', 'has a negative value');
    const gramsLike = ['g', 'ml'].includes(String(f.servingUnit).toLowerCase());
    if (gramsLike && p + c + fat > num(f.servingSize) * 1.02) add('macros_exceed_serving', `protein+carbs+fat (${p + c + fat} g) is more than the ${f.servingSize} ${f.servingUnit} serving`);
    for (const k of KEYS) {
      const m = f[k];
      if (m === null || m === undefined) continue;
      if (!Number.isFinite(Number(m)) || Number(m) < 0) { add('micro_negative', `${k} is ${m}`); continue; }
      if (Number(m) > MAX[k]) add('micro_implausible', `${k} ${m} is above the plausible ceiling ${MAX[k]} per serving`, { nutrient: k });
      if (gramsLike && num(f.servingSize) > 0 && Number(m) / 1000 > num(f.servingSize) && !/^vitamin(A|B12|D)$|^folate$/.test(k)) add('micro_exceeds_serving', `${k} ${m} mg is more than the ${f.servingSize} ${f.servingUnit} serving weighs`, { nutrient: k });
    }
    if (f.verified === true && !String(f.dataSource || '').trim()) add('verified_without_source', 'is marked verified but has no data source');
    if (kcal === 0 && (p || c || fat)) add('zero_kcal_with_macros', 'has macros but 0 kcal');
    if (gramsLike && num(f.servingSize) > 0 && kcal / f.servingSize > 9.2) add('density', `${Math.round((kcal / f.servingSize) * 10) / 10} kcal per ${f.servingUnit} is above pure fat (9)`);
  }
  return issues;
}

/** The catalogue with the reviewed data file merged in, so micronutrient values are audited before they reach the database. */
function withMicros() {
  const { updates, problems } = loadFile();
  const by = new Map(updates.map((u) => [u.name, u.set]));
  return { foods: CATALOGUE.map((f) => (by.has(f.name) ? { ...f, ...by.get(f.name) } : f)), problems };
}

if (require.main === module) {
  const merged = withMicros();
  const issues = [...audit(merged.foods), ...merged.problems.map((m) => ({ name: 'micronutrients.csv', type: 'csv_problem', msg: m }))];
  const byType = issues.reduce((a, i) => ((a[i.type] = (a[i.type] || 0) + 1), a), {});
  if (process.argv.includes('--json')) console.log(JSON.stringify({ total: CATALOGUE.length, byType, issues }, null, 2));
  else {
    console.log(`Checked ${CATALOGUE.length} foods — ${issues.length} issue(s) in ${new Set(issues.map((i) => i.name)).size} food(s)`);
    console.log(byType);
    issues.slice(0, 80).forEach((i) => console.log(` - ${i.name}: ${i.msg}`));
  }
}
module.exports = { audit, withMicros };
