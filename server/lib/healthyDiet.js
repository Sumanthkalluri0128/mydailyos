// "Perfect healthy day": a balanced full-day plan built from a curated pool of nutritious foods.
// It does NOT depend on what the person has logged before. Foods are added to their list only when they apply the plan.
// Row: [name, unit, servingSize, kcal, protein, carbs, fat, fiber, diets, meals, role, note]
//   diets: v = vegetarian, e = eggetarian, n = non-veg   (a vegetarian food is allowed in all three)
//   meals: b breakfast, l lunch, d dinner, s snacks
const P = [
  // protein-first breakfasts
  ['Moong dal chilla', 'piece', 1, 120, 7, 15, 3, 3, 'v', 'b', 'main', 'High protein, slow energy'],
  ['Besan chilla with veggies', 'piece', 1, 130, 7, 14, 5, 3, 'v', 'b', 'main', 'Protein and fibre'],
  ['Egg bhurji (2 eggs)', 'serving', 1, 190, 13, 3, 14, 1, 'en', 'b', 'main', 'Complete protein'],
  ['Boiled eggs', 'egg', 2, 140, 12, 1, 10, 0, 'en', 'bs', 'main', 'Easy protein'],
  ['Vegetable oats upma', 'bowl', 1, 210, 7, 32, 6, 5, 'v', 'b', 'main', 'Beta-glucan fibre'],
  ['Ragi dosa', 'dosa', 2, 240, 6, 44, 5, 4, 'v', 'b', 'main', 'Calcium-rich millet'],
  ['Idli with sambar', 'plate', 1, 250, 9, 46, 3, 5, 'v', 'b', 'main', 'Light and fermented'],
  ['Paneer bhurji', 'katori', 1, 230, 15, 5, 17, 1, 'v', 'bd', 'main', 'Protein-rich, low carb'],
  ['Greek yogurt (plain)', 'cup', 1, 130, 15, 6, 4, 0, 'v', 'bs', 'main', 'Probiotic protein'],
  ['Sprouts salad', 'katori', 1, 130, 9, 20, 1, 5, 'v', 'bs', 'main', 'Fibre and protein'],
  ['Masala omelette (2 eggs)', 'serving', 1, 200, 13, 3, 15, 1, 'en', 'bd', 'main', 'With onion and tomato'],
  // lunch / dinner proteins
  ['Dal tadka', 'katori', 1, 150, 8, 20, 4, 5, 'v', 'ld', 'protein', 'Plant protein'],
  ['Rajma masala', 'katori', 1, 200, 9, 28, 5, 7, 'v', 'l', 'protein', 'Very high fibre'],
  ['Chana masala', 'katori', 1, 210, 9, 28, 7, 7, 'v', 'ld', 'protein', 'Fibre and iron'],
  ['Grilled paneer tikka', 'serving', 1, 240, 16, 6, 17, 1, 'v', 'ld', 'protein', 'Grilled, little oil'],
  ['Tofu and vegetable stir-fry', 'katori', 1, 190, 14, 10, 11, 4, 'v', 'ld', 'protein', 'Light and filling'],
  ['Soya chunk curry', 'katori', 1, 210, 22, 14, 7, 5, 'v', 'ld', 'protein', 'Highest plant protein'],
  ['Chicken breast curry (light)', 'katori', 1, 230, 28, 6, 10, 1, 'n', 'ld', 'protein', 'Lean protein'],
  ['Grilled chicken tikka', 'serving', 1, 210, 30, 3, 8, 0, 'n', 'ld', 'protein', 'Lean and high protein'],
  ['Fish curry (light, 150 g)', 'katori', 1, 220, 26, 5, 11, 1, 'n', 'ld', 'protein', 'Omega-3 rich'],
  ['Grilled fish with lemon', 'fillet', 1, 200, 28, 1, 9, 0, 'n', 'ld', 'protein', 'Omega-3 rich'],
  ['Egg curry (2 eggs)', 'katori', 1, 240, 14, 6, 17, 1, 'en', 'ld', 'protein', 'Complete protein'],
  ['Moong dal soup', 'bowl', 1, 120, 8, 18, 2, 4, 'v', 'd', 'protein', 'Light on the stomach'],
  // carbs
  ['Roti (whole wheat)', 'roti', 2, 200, 6, 34, 4, 5, 'v', 'ld', 'carb', 'Whole grain'],
  ['Jowar roti', 'roti', 2, 190, 6, 38, 2, 5, 'v', 'ld', 'carb', 'Gluten-free millet'],
  ['Bajra roti', 'roti', 2, 200, 6, 36, 4, 6, 'v', 'ld', 'carb', 'Iron-rich millet'],
  ['Brown rice (cooked)', 'katori', 1, 165, 3.5, 35, 1.3, 2.5, 'v', 'l', 'carb', 'More fibre than white'],
  ['Quinoa pulao', 'katori', 1, 200, 7, 33, 5, 4, 'v', 'ld', 'carb', 'Complete plant protein'],
  ['Millet khichdi', 'katori', 1, 210, 8, 36, 4, 5, 'v', 'ld', 'carb', 'Gentle and filling'],
  // vegetables and salads
  ['Mixed vegetable sabzi (light oil)', 'katori', 1, 110, 3, 12, 5, 4, 'v', 'ld', 'veg', 'Colourful vegetables'],
  ['Palak (spinach) sabzi', 'katori', 1, 100, 4, 8, 6, 4, 'v', 'ld', 'veg', 'Iron and folate'],
  ['Bhindi stir-fry', 'katori', 1, 100, 2.5, 9, 6, 3.5, 'v', 'ld', 'veg', 'Fibre-rich'],
  ['Lauki (bottle gourd) sabzi', 'katori', 1, 80, 2, 8, 4, 3, 'v', 'ld', 'veg', 'Very light'],
  ['Cucumber, tomato and carrot salad', 'bowl', 1, 50, 2, 10, 0.5, 3, 'v', 'ld', 'veg', 'Raw vegetables, big volume'],
  ['Cabbage and beans poriyal', 'katori', 1, 95, 3, 10, 5, 4, 'v', 'ld', 'veg', 'South Indian style'],
  // dairy
  ['Curd (homemade, plain)', 'katori', 1, 90, 5, 7, 4, 0, 'v', 'ld', 'dairy', 'Probiotic'],
  ['Buttermilk (chaas)', 'glass', 1, 40, 2, 4, 1, 0, 'v', 'ls', 'dairy', 'Hydrating and light'],
  ['Skimmed milk', 'glass', 1, 90, 8, 12, 0.5, 0, 'v', 'bs', 'dairy', 'Calcium and protein'],
  // fruit
  ['Apple', 'medium', 1, 95, 0.5, 25, 0.3, 4.5, 'v', 'bs', 'fruit', 'Fibre'],
  ['Banana', 'medium', 1, 105, 1.3, 27, 0.4, 3, 'v', 'bs', 'fruit', 'Potassium'],
  ['Papaya', 'katori', 1, 60, 1, 15, 0.3, 2.5, 'v', 'bs', 'fruit', 'Digestive'],
  ['Guava', 'medium', 1, 68, 2.5, 14, 1, 5, 'v', 'bs', 'fruit', 'Vitamin C and fibre'],
  ['Orange', 'medium', 1, 62, 1.2, 15, 0.2, 3, 'v', 'bs', 'fruit', 'Vitamin C'],
  ['Mixed berries or pomegranate', 'katori', 1, 80, 1.2, 19, 0.5, 4, 'v', 'bs', 'fruit', 'Antioxidants'],
  // snacks
  ['Almonds (10)', 'handful', 1, 70, 2.5, 2.5, 6, 1.5, 'v', 's', 'snack', 'Healthy fats'],
  ['Walnuts (4 halves)', 'handful', 1, 80, 1.8, 1.7, 8, 0.8, 'v', 's', 'snack', 'Omega-3'],
  ['Roasted chana', 'handful', 1, 100, 5.5, 15, 1.7, 4, 'v', 's', 'snack', 'Crunchy protein'],
  ['Roasted makhana', 'bowl', 1, 90, 3, 17, 0.5, 1, 'v', 's', 'snack', 'Light crunchy snack'],
  ['Nuts and seeds trail mix', 'handful', 1, 120, 4, 8, 8, 2, 'v', 's', 'snack', 'Nuts and seeds'],
  ['Hummus with cucumber sticks', 'serving', 1, 110, 4, 10, 6, 3, 'v', 's', 'snack', 'Protein and fibre'],
  ['Sattu drink', 'glass', 1, 120, 7, 19, 1.5, 4, 'v', 's', 'snack', 'Cooling protein drink'],
  ['Protein smoothie (curd, banana, seeds)', 'glass', 1, 200, 12, 28, 5, 4, 'v', 'bs', 'snack', 'Great after a workout'],
];

const FOODS = P.map(([name, unit, size, kcal, protein, carbs, fat, fiber, diets, meals, role, note]) => ({ name, unit, size, kcal, protein, carbs, fat, fiber, diets, meals, role, note }));

// small deterministic PRNG so "today" is stable on refresh and "another version" changes it
function rng(seedStr) { let h = 2166136261; for (const c of String(seedStr)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; }; }
const allowed = (f, diet) => (diet === 'n' ? true : diet === 'e' ? f.diets.includes('v') || f.diets.includes('e') : f.diets.includes('v'));
const round25 = (x) => Math.round(x * 4) / 4;

function pickFrom(list, rand, avoid = new Set(), proteinBias = 0.65) {
  const pool = list.filter((f) => !avoid.has(f.name));
  const use = pool.length ? pool : list;
  const ranked = [...use].sort((a, b) => (b.protein / Math.max(b.kcal, 40)) - (a.protein / Math.max(a.kcal, 40)));
  const top = ranked.slice(0, Math.max(3, Math.ceil(ranked.length * (0.35 + (1 - proteinBias) * 0.5))));
  return top[Math.floor(rand() * top.length)];
}

const SPLIT = { breakfast: 0.25, lunch: 0.33, dinner: 0.27, snacks: 0.15 };
const TEMPLATE = {
  breakfast: [['main', 'b'], ['fruit', 'b'], ['dairy', 'b']],
  lunch: [['carb', 'l'], ['protein', 'l'], ['veg', 'l'], ['dairy', 'l']],
  dinner: [['protein', 'd'], ['veg', 'd'], ['carb', 'd']],
  snacks: [['fruit', 's'], ['snack', 's']],
};

/**
 * @param target   daily kcal budget   @param proteinGoal grams   @param diet 'v' | 'e' | 'n'   @param seed any string (e.g. date + version)
 * @returns { meals:[{mealType, budget, items:[{name, servings, unit, kcal, protein, fiber, note}], kcal}], totals, tips }
 */
function buildDietDay({ target, proteinGoal = 0, floor = 1200, diet = 'v', seed = 'x', excluder = null }) {
  const POOL = excluder && !excluder.empty ? FOODS.filter((f) => excluder.ok(f.name)) : FOODS;   // allergens, diet mode and dislikes never reach the plate
  const goal = Math.max(floor, Math.round((Number(target) || 1800) / 10) * 10);
  const rand = rng(`${seed}|${diet}`);
  const used = new Set();
  const meals = [];
  for (const [mealType, share] of Object.entries(SPLIT)) {
    const budget = goal * share;
    let picked = [];
    for (const [role, m] of TEMPLATE[mealType]) {
      const cands = POOL.filter((f) => allowed(f, diet) && f.meals.includes(m) && f.role === role || (role === 'main' && f.role === 'main' && f.meals.includes(m) && allowed(f, diet)));
      if (!cands.length) continue;
      if (role === 'dairy' && mealType === 'breakfast' && picked.some((x) => /yogurt|milk|smoothie/i.test(x.f.name))) continue;
      picked.push({ f: pickFrom(cands, rand, used, role === 'protein' || role === 'main' ? 0.9 : 0.4), role });
    }
    // breakfast: if the main is already big, drop the optional dairy to keep it realistic
    const isScalable = (role) => role === 'main' || role === 'protein' || role === 'carb';
    const fixed = picked.filter((x) => !isScalable(x.role)).reduce((s, x) => s + x.f.kcal, 0);
    const flex = picked.filter((x) => isScalable(x.role)).reduce((s, x) => s + x.f.kcal, 0) || 1;
    const k = Math.max(0.6, Math.min(2.5, (budget - fixed) / flex));
    const make = (f, servings) => ({ name: f.name, servings, unit: f.unit, size: f.size, qty: f.size * servings, kcal: Math.round(f.kcal * servings), protein: Math.round(f.protein * servings * 10) / 10, carbs: Math.round(f.carbs * servings), fat: Math.round(f.fat * servings * 10) / 10, fiber: Math.round(f.fiber * servings * 10) / 10, note: f.note });
    const items = picked.map(({ f, role }) => { used.add(f.name); const it = make(f, isScalable(role) ? Math.max(0.5, round25(k)) : 1); Object.defineProperty(it, '_f', { value: f }); Object.defineProperty(it, '_flex', { value: isScalable(role) }); return it; });
    meals.push({ mealType, budget: Math.round(budget), items, kcal: items.reduce((s, i) => s + i.kcal, 0) });
  }
  // second pass: if rounding and caps left the day short, grow the flexible items (mains, proteins, carbs) a little
  for (let pass = 0; pass < 3; pass++) {
    const total = meals.reduce((a, m) => a + m.items.reduce((b, i) => b + i.kcal, 0), 0);
    const gap = goal - total;
    if (gap < goal * 0.05) break;
    const flexKcal = meals.reduce((a, m) => a + m.items.filter((i) => i._flex).reduce((b, i) => b + i.kcal, 0), 0) || 1;
    const factor = 1 + gap / flexKcal;
    for (const m of meals) {
      m.items = m.items.map((i) => { if (!i._flex) return i; const servings = Math.min(3, round25(i.servings * factor)); if (servings === i.servings) return i; const f = i._f; const n = { name: f.name, servings, unit: f.unit, size: f.size, qty: f.size * servings, kcal: Math.round(f.kcal * servings), protein: Math.round(f.protein * servings * 10) / 10, carbs: Math.round(f.carbs * servings), fat: Math.round(f.fat * servings * 10) / 10, fiber: Math.round(f.fiber * servings * 10) / 10, note: f.note }; Object.defineProperty(n, '_f', { value: f }); Object.defineProperty(n, '_flex', { value: true }); return n; });
      m.kcal = m.items.reduce((a, i) => a + i.kcal, 0);
    }
  }
  const sum = (k) => Math.round(meals.reduce((s, m) => s + m.items.reduce((a, i) => a + i[k], 0), 0) * 10) / 10;
  const totals = { kcal: sum('kcal'), protein: sum('protein'), carbs: sum('carbs'), fat: sum('fat'), fiber: sum('fiber'), target: goal };
  const tips = [
    totals.protein >= proteinGoal * 0.9 || !proteinGoal ? `Protein ${totals.protein} g covers your goal.` : `Protein is ${totals.protein} g against a ${proteinGoal} g goal. Add a glass of milk, an extra egg or curd to close the gap.`,
    `Fibre ${totals.fiber} g from vegetables, dal, fruit and whole grains.`,
    'Aim for 2.5 to 3 litres of water and a 20 to 30 minute walk.',
    'Eat the protein first at each meal; it keeps you full for longer.',
  ];
  return { meals, totals, tips, diet };
}

/** Make sure a curated food exists in the person's own list (so it can be logged and planned). Returns the Food document. */
async function adoptFood(Food, uid, name) {
  const f = FOODS.find((x) => x.name === name);
  if (!f) return null;
  const have = await Food.findOne({ userId: uid, name: f.name, hidden: { $ne: true } });
  if (have) return have;
  return Food.create({ userId: uid, name: f.name, servingSize: f.size, servingUnit: f.unit, calories: f.kcal, protein: f.protein, carbohydrates: f.carbs, fat: f.fat, fiber: f.fiber, sugar: 0, sodium: 0, notes: f.note, units: [] });
}

/** Healthy foods that are NOT on the person's list yet, ranked by how well one serving fills what is left. */
function freshPicks({ haveNames, remaining, mealType, limit = 4, excluder = null }) {
  const m = { breakfast: 'b', lunch: 'l', dinner: 'd', snacks: 's' }[mealType];
  const have = new Set(haveNames.map((n) => String(n).toLowerCase()));
  const kcalLeft = Math.max(0, Number(remaining?.calories) || 0);
  return FOODS.filter((f) => (!excluder || excluder.ok(f.name)) && !have.has(f.name.toLowerCase()) && (!m || f.meals.includes(m)) && f.kcal <= Math.max(120, kcalLeft * 1.05))
    .map((f) => ({ f, s: (f.protein * 4 + f.fiber * 6) / Math.max(f.kcal, 40) }))
    .sort((a, b) => b.s - a.s).slice(0, limit)
    .map(({ f }) => ({ name: f.name, unit: f.unit, size: f.size, kcal: f.kcal, protein: f.protein, fiber: f.fiber, note: f.note, vegetarian: f.diets === 'v' }));
}

module.exports = { buildDietDay, adoptFood, freshPicks, FOODS };
