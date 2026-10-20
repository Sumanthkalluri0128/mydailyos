// Macro-aware suggestions that stay useful when the day is nearly used up:
//   buildMeals    whole plates (roti + dal + sabzi) that fit the remaining kcal AND protein, with carb / fat caps respected
//   lightOptions  near-zero-calorie choices (buttermilk, clear soup, cucumber, black coffee) for when you are over or nearly out
//   makeItFit     swaps or smaller portions of things already logged today, with the kcal saved
//   rescueDay     a gentle one-day plan for tomorrow
const { swapFor } = require('./swaps');

const CARB = /\b(roti|chapati|chapatti|phulka|rice|idli|dosa|poha|upma|paratha|bread|oats|khichdi|daliya|millet|ragi|jowar|bajra)\b/i;
const PROTEIN = /\b(dal|dhal|paneer|chicken|egg|eggs|curd|yogurt|yoghurt|rajma|chole|chana|fish|tofu|sprouts?|soy|lentil|moong|sambar|tandoori)\b/i;
const VEG = /\b(sabzi|sabji|salad|bhindi|palak|gobi|cauliflower|beans|veg|vegetable|mixed veg|lauki|tinda|cabbage|spinach|raita|cucumber)\b/i;
const HEAVY = /butter|makhani|cream|malai|korma|fried|deep|biryani|pakora|samosa|puri|bhatura|naan|kofta|masala dosa/i;

const LIGHT = /(buttermilk|chaas|chhaas|chaach|clear soup|vegetable soup|veg soup|tomato soup|cucumber|black coffee|green tea|lemon water|nimbu|jeera water|coconut water|salad|radish|carrot|tea \(no sugar|sprouts salad)/i;
const LIGHT_FALLBACK = [
  { name: 'Buttermilk (chaas), 1 glass', kcal: 40, tip: 'Cooling, a little protein, and it fills you up.' },
  { name: 'Clear vegetable soup, 1 bowl', kcal: 35, tip: 'Warm and filling for very few calories.' },
  { name: 'Cucumber and tomato slices', kcal: 25, tip: 'Add lemon and a pinch of chaat masala.' },
  { name: 'Black coffee or green tea (no sugar)', kcal: 5, tip: 'Good if you are craving something at night.' },
  { name: 'Jeera or lemon water', kcal: 10, tip: 'A glass of water first often settles a craving.' },
];

const n0 = (x) => Number(x) || 0;
const per = (f, s = 1) => ({ calories: n0(f.calories) * s, protein: n0(f.protein) * s, carbohydrates: n0(f.carbohydrates) * s, fat: n0(f.fat) * s, fiber: n0(f.fiber) * s });

/** Remaining room under the healthy ceilings (carbs / fat) and the aim for protein / fibre. All can be 0. */
function macroCaps({ ranges, eaten = {} }) {
  const left = (max, used) => Math.max(0, Math.round(max - n0(used)));
  return {
    carbs: ranges?.carbs ? left(ranges.carbs.max, eaten.carbohydrates) : null,
    fat: ranges?.fat ? left(ranges.fat.max, eaten.fat) : null,
    protein: ranges?.protein ? Math.max(0, Math.round(ranges.protein.goal - n0(eaten.protein))) : null,
    fiber: ranges?.fiber ? Math.max(0, Math.round(ranges.fiber.goal - n0(eaten.fiber))) : null,
  };
}

const MAX_SERVINGS = { carb: 3, protein: 2, veg: 2 };
const label = (f, s) => `${s === 1 ? '' : `${s} × `}${f.name}`;

/**
 * Whole plates. `remaining` {calories, protein}. `caps` from macroCaps. Returns up to `limit` plates, each {items, totals, reason}.
 * Items use servings of the food's own serving size so one tap can log them.
 */
function buildMeals(foods, remaining, { caps = {}, limit = 3, recentIds = new Set(), mealType } = {}) {
  const kcal = n0(remaining.calories), pLeft = Math.max(0, n0(remaining.protein));
  if (kcal < 250) return [];
  const usable = foods.filter((f) => n0(f.calories) > 0 && n0(f.calories) <= kcal && !HEAVY.test(f.name));
  const pick = (re, max) => usable.filter((f) => re.test(f.name) && !(re === PROTEIN && CARB.test(f.name) && !/dal|rajma|chole/i.test(f.name)))
    .sort((a, b) => (recentIds.has(String(b._id)) - recentIds.has(String(a._id))) || (n0(b.protein) / Math.max(n0(b.calories), 30) - n0(a.protein) / Math.max(n0(a.calories), 30)))
    .slice(0, max);
  const carbs = usable.filter((f) => CARB.test(f.name)).sort((a, b) => recentIds.has(String(b._id)) - recentIds.has(String(a._id)) || n0(a.calories) - n0(b.calories)).slice(0, 8);
  const proteins = pick(PROTEIN, 10), vegs = pick(VEG, 8);
  if (!carbs.length || !proteins.length) return [];
  const plates = [];
  for (const c of carbs) for (const p of proteins) {
    if (c === p) continue;
    for (const v of [null, ...vegs]) for (let cs = 1; cs <= MAX_SERVINGS.carb; cs += 1) for (let ps = 1; ps <= MAX_SERVINGS.protein; ps += 1) {
      const parts = [{ food: c, servings: cs }, { food: p, servings: ps }, ...(v ? [{ food: v, servings: 1 }] : [])];
      const t = parts.reduce((a, x) => { const m = per(x.food, x.servings); for (const k of Object.keys(m)) a[k] = (a[k] || 0) + m[k]; return a; }, {});
      if (t.calories > kcal || t.calories < kcal * 0.55) continue;
      if (caps.carbs !== null && caps.carbs !== undefined && t.carbohydrates > caps.carbs + 5) continue;
      if (caps.fat !== null && caps.fat !== undefined && t.fat > caps.fat + 3) continue;
      const proteinFill = pLeft ? Math.min(1, t.protein / pLeft) : 0.5;
      const closeness = 1 - Math.abs(kcal * 0.9 - t.calories) / kcal;
      const score = proteinFill * 2 + closeness + Math.min(0.5, t.fiber / 12) + (v ? 0.3 : 0) + (recentIds.has(String(c._id)) ? 0.15 : 0) + (recentIds.has(String(p._id)) ? 0.15 : 0);
      plates.push({ score, parts, t, key: `${p._id}` });
    }
  }
  plates.sort((a, b) => b.score - a.score);
  const out = []; const usedProtein = new Set();
  for (const pl of plates) {
    if (usedProtein.has(pl.key)) continue; // different protein in each suggestion, so the choices feel different
    usedProtein.add(pl.key);
    out.push({
      items: pl.parts.map((x) => ({ food: x.food, servings: x.servings, label: label(x.food, x.servings) })),
      totals: { calories: Math.round(pl.t.calories), protein: Math.round(pl.t.protein), carbohydrates: Math.round(pl.t.carbohydrates), fat: Math.round(pl.t.fat), fiber: Math.round(pl.t.fiber * 10) / 10 },
      reason: `${Math.round(pl.t.calories)} kcal · ${Math.round(pl.t.protein)} g protein${pLeft ? ` (of ${Math.round(pLeft)} g left)` : ''}`,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Near-zero options from the catalogue (loggable), topped up with simple ideas that need no logging. */
function lightOptions(foods, { limit = 5, recentIds = new Set(), maxKcal = 45 } = {}) {
  const logged = foods.filter((f) => n0(f.calories) <= maxKcal && n0(f.calories) >= 0 && LIGHT.test(f.name))
    .sort((a, b) => (recentIds.has(String(b._id)) - recentIds.has(String(a._id))) || n0(a.calories) - n0(b.calories)).slice(0, limit)
    .map((f) => ({ food: f, name: f.name, kcal: Math.round(n0(f.calories)), tip: 'Fits even when you are out of budget.' }));
  const need = Math.max(0, limit - logged.length);
  return [...logged, ...LIGHT_FALLBACK.filter((x) => !logged.some((l) => l.name.toLowerCase().includes(x.name.split(/[ ,(]/)[0].toLowerCase()))).slice(0, need).map((x) => ({ food: null, ...x }))];
}

/**
 * "Make it fit": swaps or half-portions of what is already logged today.
 * @param rows today's FoodLog rows [{_id, foodName, nutritionTotal:{calories}}]
 * @param overBy kcal over the budget (0 or negative = nothing over)
 */
function makeItFit(rows, overBy = 0) {
  const opts = [];
  for (const r of rows || []) {
    const cal = n0(r.nutritionTotal?.calories);
    if (cal < 120) continue;
    const sw = swapFor(r.foodName);
    if (sw) opts.push({ logId: String(r._id), name: r.foodName, kind: 'swap', to: sw.to, saves: Math.min(sw.saves, Math.round(cal * 0.7)), why: sw.why });
    if (cal >= 200) opts.push({ logId: String(r._id), name: r.foodName, kind: 'half', to: 'a half portion', saves: Math.round(cal / 2), why: 'Same food, half the calories.' });
  }
  opts.sort((a, b) => b.saves - a.saves);
  const seen = new Set();
  return opts.filter((o) => (seen.has(o.logId + o.kind) ? false : seen.add(o.logId + o.kind))).slice(0, 4).map((o) => ({ ...o, afterOver: Math.max(0, Math.round(n0(overBy) - o.saves)) }));
}

/**
 * A gentle one-day plan: four meals sized to a slightly lighter target (never below the floor). Returns plan rows ready for the planner.
 */
function rescueDay({ foods, target, floor = 1200, ranges, recentIds = new Set(), trim = 200, eaten = null, fixedMeals = [] }) {
  const goal = Math.max(floor, Math.round(target - Math.min(trim, Math.max(0, target - floor))));
  const SHARES = { breakfast: 0.25, lunch: 0.32, dinner: 0.3, snacks: 0.13 };
  // Food that is already logged is fixed: its meals are left alone and the day's budget is what is LEFT after it.
  const fixed = new Set(fixedMeals);
  const open = Object.keys(SHARES).filter((m) => !fixed.has(m));
  const shareSum = open.reduce((a, m) => a + SHARES[m], 0) || 1;
  const left = Math.max(0, goal - n0(eaten?.calories));
  const proteinLeft = ranges ? Math.max(0, n0(ranges.protein.goal) - n0(eaten?.protein)) : 0;
  const plan = []; let total = 0; let protein = 0;
  for (const mealType of open) {
    const share = SHARES[mealType] / shareSum;
    const budget = Math.round(left * share);
    const caps = ranges ? { carbs: Math.round(ranges.carbs.max * SHARES[mealType]), fat: Math.round(ranges.fat.max * SHARES[mealType]) } : {};
    const plates = mealType === 'snacks' ? [] : buildMeals(foods, { calories: budget, protein: proteinLeft * share }, { caps, limit: 1, recentIds, mealType });
    if (plates[0]) {
      for (const it of plates[0].items) plan.push({ mealType, foodId: it.food._id, foodName: it.food.name, servings: it.servings, quantity: n0(it.food.servingSize) * it.servings, servingUnit: it.food.servingUnit, calories: Math.round(n0(it.food.calories) * it.servings), protein: Math.round(n0(it.food.protein) * it.servings * 10) / 10, fiber: Math.round(n0(it.food.fiber) * it.servings * 10) / 10 });
      total += plates[0].totals.calories; protein += plates[0].totals.protein;
    } else if (mealType === 'snacks') {
      const l = lightOptions(foods, { limit: 1, maxKcal: Math.max(60, budget) })[0];
      if (l && l.food) { plan.push({ mealType, foodId: l.food._id, foodName: l.food.name, servings: 1, quantity: n0(l.food.servingSize), servingUnit: l.food.servingUnit, calories: Math.round(n0(l.food.calories)), protein: Math.round(n0(l.food.protein) * 10) / 10, fiber: Math.round(n0(l.food.fiber) * 10) / 10 }); total += n0(l.food.calories); }
    }
  }
  return { goal, plan, totalCalories: Math.round(total), totalProtein: Math.round(protein), eatenCalories: Math.round(n0(eaten?.calories)), remaining: Math.round(left), fixedMeals: [...fixed] };
}

module.exports = { buildMeals, lightOptions, makeItFit, rescueDay, macroCaps, CARB, PROTEIN, VEG, LIGHT };
