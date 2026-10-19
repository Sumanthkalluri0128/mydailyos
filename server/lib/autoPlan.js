// "Plan my week from what I actually eat."
//   analyzeHabits  reads the food log: what is eaten at each meal, how often, the usual portion and the biggest portion ever logged
//   buildAutoPlan  fills days and meals ONLY with foods from that history (the shared catalogue is a last resort), then checks the
//                  whole day against the calorie budget, the protein / fat / carb / fibre ranges and the sugar and sodium ceilings.
//
// "Limits" built in (all derived from the person's own history, so nothing feels foreign):
//   * how often    a food can appear at most ceil(usual times per week x 1.25) times in the week (indulgent foods: no more than they
//                  already have, and never more than 2 times) and never twice on the same day in the same meal
//   * how much     portion between half and 1.5x the usual portion, never above the biggest portion ever logged (x1.1)
//   * the day      calories inside the budget (never under the safe floor), protein at least the minimum, carbs and fat under their
//                  maximums, sugar and sodium under their ceilings
const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'];
const SHARE = { breakfast: 0.25, lunch: 0.34, dinner: 0.31, snacks: 0.10 };
const INDULGENT = /(biryani|pizza|burger|fries|samosa|pakora|bhatura|puri\b|jalebi|gulab|halwa|ice ?cream|cake|cookie|chocolate|pastry|sweet|mithai|ladoo|laddu|barfi|chips|namkeen|cola|soda|juice|fried|butter chicken|makhani|korma|cream|malai|naan|maggi|noodles)/i;
const CARBISH = /\b(roti|chapati|chapatti|phulka|rice|idli|dosa|poha|upma|paratha|bread|oats|khichdi|daliya|ragi|jowar|bajra|pasta|noodles|cornflakes|muesli|toast)\b/i;
const PROTEINISH = /\b(dal|dhal|paneer|chicken|egg|eggs|curd|yogurt|yoghurt|rajma|chole|chana|fish|tofu|sprouts?|soy|lentil|moong|sambar|whey|milk|cottage)\b/i;
const n0 = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const r1 = (x) => Math.round(x * 10) / 10;
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const dayDiff = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/**
 * @param logs FoodLog rows: { foodId, foodName, mealType, date, consumedQuantity, servingUnit, nutritionTotal }
 * @returns { loggedDays, byMeal: { breakfast: [habit] ... }, byFood: Map(foodId -> habit) }
 *   habit: { foodId, name, mealType, count, perWeek, usualQty, maxQty, unit, lastDate, kcal, protein, indulgent, weeklyCap }
 */
function analyzeHabits(logs, today) {
  const days = new Set(logs.map((l) => l.date));
  const loggedDays = Math.max(1, days.size);
  const byKey = new Map();
  for (const l of logs) {
    if (!l.foodId || !l.foodName) continue;
    const key = `${l.mealType}|${l.foodId}`;
    const h = byKey.get(key) || { foodId: String(l.foodId), name: l.foodName, mealType: l.mealType, dates: new Set(), qtys: [], unit: l.servingUnit, lastDate: '', kcalSum: 0, proteinSum: 0, n: 0, sugar: 0 };
    h.dates.add(l.date); h.qtys.push(n0(l.consumedQuantity)); h.n += 1;
    h.kcalSum += n0(l.nutritionTotal?.calories); h.proteinSum += n0(l.nutritionTotal?.protein); h.sugar += n0(l.nutritionTotal?.sugar);
    if (l.date > h.lastDate) h.lastDate = l.date;
    byKey.set(key, h);
  }
  const byMeal = Object.fromEntries(MEALS.map((m) => [m, []]));
  const byFood = new Map();
  for (const h of byKey.values()) {
    const count = h.dates.size;
    const perWeek = r1((count / loggedDays) * 7);
    const indulgent = INDULGENT.test(h.name) || h.sugar / h.n > 18;
    const raw = Math.max(1, Math.ceil(perWeek * 1.25));
    const habit = {
      foodId: h.foodId, name: h.name, mealType: h.mealType, count, perWeek, unit: h.unit, lastDate: h.lastDate,
      usualQty: r1(median(h.qtys)), maxQty: r1(Math.max(...h.qtys)),
      kcal: Math.round(h.kcalSum / h.n), protein: r1(h.proteinSum / h.n), indulgent,
      weeklyCap: indulgent ? Math.min(2, Math.max(1, Math.min(raw, Math.ceil(perWeek)))) : Math.min(7, raw),
      daysAgo: h.lastDate && today ? dayDiff(h.lastDate, today) : null,
    };
    byMeal[h.mealType]?.push(habit);
    const prev = byFood.get(habit.foodId);
    if (!prev || prev.count < habit.count) byFood.set(habit.foodId, habit);
  }
  for (const m of MEALS) byMeal[m].sort((a, b) => b.count - a.count);
  return { loggedDays, byMeal, byFood };
}

/** Nutrition for `servings` servings of a food (per-serving values on the food). */
const per = (f, s) => ({
  calories: n0(f.calories) * s, protein: n0(f.protein) * s, carbohydrates: n0(f.carbohydrates) * s, fat: n0(f.fat) * s,
  fiber: n0(f.fiber) * s, sugar: n0(f.sugar) * s, sodium: n0(f.sodium) * s,
});
const add = (a, b) => { const o = { ...a }; for (const k of Object.keys(b)) o[k] = n0(o[k]) + b[k]; return o; };
const zero = () => ({ calories: 0, protein: 0, carbohydrates: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 });
const round = (t) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, k === 'fiber' || k === 'protein' ? r1(v) : Math.round(v)]));

/** Servings (in 0.5 steps) that match the usual portion of this food, clamped to the person's own range. */
function servingsFor(food, habit, factor = 1) {
  const size = n0(food.servingSize) || 1;
  const usual = habit?.usualQty ? habit.usualQty / size : 1;
  const maxS = habit?.maxQty ? Math.max(0.5, (habit.maxQty / size) * 1.1) : 3;
  const s = Math.min(maxS, Math.max(0.5, usual * factor));
  return Math.max(0.5, Math.round(s * 2) / 2);
}

/**
 * @param o.habits     result of analyzeHabits
 * @param o.foods      Map(foodId -> Food doc) for every food in the habits (plus candidates from the catalogue)
 * @param o.catalogue  fallback foods when history has too little for a meal
 * @param o.dates      days to plan, e.g. ['2026-10-19', ...]
 * @param o.target     calories per day;  o.floor safe minimum;  o.ranges macroRanges();  o.limits { sodiumMg, sugar }
 * @param o.occupied   { 'date|meal': true } meals that already hold something (left alone)
 * @param o.dayBase    { date: totals } what is already planned on a day (counts toward the budget)
 * @param o.weekCounts Map(foodId -> times already eaten/planned this week) so the weekly cap is honoured
 * @param o.meals      which meals to plan
 */
function buildAutoPlan(o) {
  const { habits, foods, catalogue = [], dates, target, floor = 1200, ranges, limits = {}, occupied = {}, dayBase = {}, meals = MEALS, targets = {} } = o;
  const baseGoal = Math.max(floor, Math.round(target));
  let goal = baseGoal;   // set per day below: lighter days after heavy days get a lower target (see intakeAdvice.js)
  const counts = new Map(o.weekCounts || []);
  const items = []; const days = []; const notes = new Set();
  const lastUsed = new Map(); // foodId -> last day index it was planned (rotation)

  const habitOf = (f) => habits.byFood.get(String(f._id));
  const sugarCap = n0(limits.sugar) || 9999, sodiumCap = n0(limits.sodiumMg) || 99999;
  const carbMax = ranges?.carbs?.max ?? 9999, fatMax = ranges?.fat?.max ?? 9999;
  const proteinMin = ranges?.protein?.min ?? 0, proteinGoal = ranges?.protein?.goal ?? 0;

  dates.forEach((date, di) => {
    goal = Math.max(floor, Math.round(targets[date] ?? target));
    let day = { ...zero(), ...(dayBase[date] || {}) };
    const firstItem = items.length;
    for (const meal of meals) {
      if (occupied[`${date}|${meal}`]) continue;
      const share = SHARE[meal];
      const budget = goal * share;
      // snacks only when the person really has them
      if (meal === 'snacks' && !(habits.byMeal.snacks || []).some((h) => h.perWeek >= 2)) continue;

      // candidates: this meal's own history first; then the same food eaten at another meal; then the catalogue
      let pool = (habits.byMeal[meal] || []).map((h) => ({ food: foods.get(h.foodId), habit: h })).filter((c) => c.food && n0(c.food.calories) > 0);
      if (pool.length < 4) {
        const seen = new Set(pool.map((c) => String(c.food._id)));
        for (const m of MEALS) for (const h of habits.byMeal[m] || []) {
          const f = foods.get(h.foodId);
          if (f && !seen.has(h.foodId) && n0(f.calories) > 0 && m !== 'snacks' === (meal !== 'snacks')) { pool.push({ food: f, habit: { ...h, mealType: meal } }); seen.add(h.foodId); }
        }
      }
      let fromCatalogue = false;
      if (pool.length < 3) {
        pool = pool.concat(catalogue.filter((f) => n0(f.calories) > 0 && n0(f.calories) <= budget).slice(0, 80).map((f) => ({ food: f, habit: null })));
        fromCatalogue = true;
      }

      const picked = []; let m = zero();
      const allowed = (c, servings) => {
        const id = String(c.food._id);
        const cap = c.habit ? c.habit.weeklyCap : 2;
        if ((counts.get(id) || 0) >= cap) return false;
        if (picked.some((p) => String(p.food._id) === id)) return false;
        const t = per(c.food, servings);
        if (day.carbohydrates + m.carbohydrates + t.carbohydrates > carbMax + 15) return false;
        if (day.fat + m.fat + t.fat > fatMax + 8) return false;
        if (day.sugar + m.sugar + t.sugar > sugarCap + 8) return false;
        if (day.sodium + m.sodium + t.sodium > sodiumCap + 400) return false;
        return true;
      };
      const scoreOf = (c, servings, role) => {
        const t = per(c.food, servings);
        const dayLeftKcal = goal - day.calories - m.calories;
        if (t.calories > Math.min(budget - m.calories, dayLeftKcal) * 1.12 + 10) return -1;
        const freq = c.habit ? Math.min(1, c.habit.perWeek / 5) : 0.05;                         // foods you eat often
        const rotation = lastUsed.has(String(c.food._id)) ? Math.min(0.6, (di - lastUsed.get(String(c.food._id)) + 1) * 0.15 - 0.45) : 0.2; // not the same food every day
        const gapP = Math.max(0, (proteinGoal * share) - m.protein);
        const protFill = gapP ? Math.min(1, t.protein / gapP) : 0.2;
        const dens = (t.protein * 4 + t.fiber * 5) / Math.max(t.calories, 40);
        const isCarb = CARBISH.test(c.food.name) && !PROTEINISH.test(c.food.name), isProt = PROTEINISH.test(c.food.name);
        const hasCarb = picked.some((p) => CARBISH.test(p.food.name) && !PROTEINISH.test(p.food.name)), hasProt = picked.some((p) => PROTEINISH.test(p.food.name));
        const balance = role === 'anchor' ? 0 : (isCarb && hasCarb ? -0.6 : 0) + (isProt && !hasProt ? 0.5 : 0) + (isCarb && !hasCarb ? 0.3 : 0);
        const fit = 1 - Math.abs((budget - m.calories - t.calories) / Math.max(budget, 1));
        return freq * 1.4 + rotation + protFill * 2.2 + Math.min(dens, 1.2) * 0.9 + balance + fit * 0.6 - (c.habit?.indulgent ? 0.4 : 0);
      };

      for (let step = 0; step < 4; step += 1) {
        let best = null;
        for (const c of pool) {
          const servings = servingsFor(c.food, c.habit);
          if (!allowed(c, servings)) continue;
          const s = scoreOf(c, servings, step === 0 ? 'anchor' : 'side');
          if (s > 0 && (!best || s > best.s)) best = { c, servings, s };
        }
        if (!best) break;
        picked.push({ food: best.c.food, habit: best.c.habit, servings: best.servings });
        m = add(m, per(best.c.food, best.servings));
        if (m.calories >= budget * 0.92 && (m.protein >= proteinGoal * share * 0.8 || step >= 1)) break;
      }
      if (!picked.length) { notes.add(`Not enough ${meal} history to plan ${meal} yet. Log a few ${meal}s first.`); continue; }

      // size the plate to the budget: gently scale portions (within the person's own range) toward the meal's calories
      const flex = [...picked].sort((a, b) => per(b.food, b.servings).calories - per(a.food, a.servings).calories);
      for (let guard = 0; guard < 6; guard += 1) {
        const total = picked.reduce((a, p) => a + per(p.food, p.servings).calories, 0);
        const dayLeft = goal - day.calories;
        if (total > Math.min(budget * 1.1, dayLeft) + 5) {
          const p = flex.find((x) => x.servings > 0.5); if (!p) break;
          p.servings = Math.max(0.5, p.servings - 0.5);
        } else if (total < budget * 0.78) {
          const p = flex.find((x) => { const cap = x.habit?.maxQty ? Math.max(0.5, (x.habit.maxQty / (n0(x.food.servingSize) || 1)) * 1.1) : 2; return x.servings + 0.5 <= Math.min(cap, 3) && total + per(x.food, 0.5).calories <= Math.min(budget * 1.1, dayLeft) + 5; });
          if (!p) break;
          p.servings += 0.5;
        } else break;
      }

      let mealTotal = zero();
      for (const p of picked) {
        const t = per(p.food, p.servings); mealTotal = add(mealTotal, t);
        const id = String(p.food._id);
        counts.set(id, (counts.get(id) || 0) + 1); lastUsed.set(id, di);
        const size = n0(p.food.servingSize) || 1;
        const why = p.habit
          ? `You have this ${p.habit.perWeek >= 1 ? `about ${Math.round(p.habit.perWeek)}×/week` : 'now and then'} · usual portion${p.habit.maxQty ? ` (never over ${p.habit.maxQty} ${p.habit.unit || p.food.servingUnit})` : ''}`
          : 'From the food list (not enough history yet)';
        items.push({
          date, mealType: meal, foodId: id, foodName: p.food.name, servings: p.servings, quantity: r1(size * p.servings), servingUnit: p.food.servingUnit,
          calories: Math.round(t.calories), protein: r1(t.protein), fiber: r1(t.fiber), carbohydrates: Math.round(t.carbohydrates), fat: Math.round(t.fat),
          why, weeklyCap: p.habit?.weeklyCap ?? 2,
        });
      }
      day = add(day, mealTotal);
      if (fromCatalogue) notes.add(`Some ${meal} items come from the food list because there isn't enough history yet.`);
    }

    // end-of-day check: protein short and room left -> top up with the person's best protein food
    if (day.protein < proteinMin && goal * 1.04 - day.calories > 60) {
      const cand = [...habits.byFood.values()].map((h) => ({ h, f: foods.get(h.foodId) })).filter((c) => c.f && n0(c.f.protein) >= 8 && n0(c.f.calories) <= goal * 1.04 - day.calories && (counts.get(c.h.foodId) || 0) < c.h.weeklyCap + 1)
        .sort((a, b) => (n0(b.f.protein) / Math.max(n0(b.f.calories), 30)) - (n0(a.f.protein) / Math.max(n0(a.f.calories), 30)))[0];
      if (cand) {
        const meal = meals.includes('snacks') ? 'snacks' : meals[meals.length - 1];
        const servings = servingsFor(cand.f, cand.h);
        const t = per(cand.f, servings);
        counts.set(cand.h.foodId, (counts.get(cand.h.foodId) || 0) + 1);
        items.push({ date, mealType: meal, foodId: cand.h.foodId, foodName: cand.f.name, servings, quantity: r1((n0(cand.f.servingSize) || 1) * servings), servingUnit: cand.f.servingUnit,
          calories: Math.round(t.calories), protein: r1(t.protein), fiber: r1(t.fiber), carbohydrates: Math.round(t.carbohydrates), fat: Math.round(t.fat),
          why: 'Protein top-up from a food you already eat', weeklyCap: cand.h.weeklyCap });
        day = add(day, t);
      }
    }

    // end-of-day floor: never leave a planned day below the safe minimum. First enlarge today's own portions (inside the person's
    // biggest-ever portion); if that is not enough, repeat one food they already eat (not an indulgent one) once beyond its weekly cap.
    const lowBar = Math.max(floor, goal * 0.88);
    for (let guard = 0; guard < 8 && day.calories < lowBar && items.length > firstItem; guard += 1) {
      const room = goal * 1.02 - day.calories;
      const grow = items.slice(firstItem).map((it) => ({ it, f: foods.get(it.foodId) || catalogue.find((c) => String(c._id) === it.foodId), h: habits.byFood.get(it.foodId) }))
        .filter((x) => x.f && !x.h?.indulgent && n0(x.f.calories) * 0.5 / (n0(x.f.servingSize) || 1) * (n0(x.f.servingSize) || 1) <= room)
        .filter((x) => { const size = n0(x.f.servingSize) || 1; return !x.h?.maxQty || x.it.quantity + size * 0.5 <= x.h.maxQty * 1.1 + 0.01; })
        .sort((a, b) => (n0(b.f.protein) / Math.max(n0(b.f.calories), 30)) - (n0(a.f.protein) / Math.max(n0(a.f.calories), 30)))[0];
      if (grow) {
        const size = n0(grow.f.servingSize) || 1; const t = per(grow.f, 0.5);
        grow.it.servings += 0.5; grow.it.quantity = r1(size * grow.it.servings);
        grow.it.calories = Math.round(grow.it.calories + t.calories); grow.it.protein = r1(grow.it.protein + t.protein); grow.it.fiber = r1(grow.it.fiber + t.fiber);
        grow.it.carbohydrates = Math.round(grow.it.carbohydrates + t.carbohydrates); grow.it.fat = Math.round(grow.it.fat + t.fat);
        day = add(day, t); continue;
      }
      const extra = [...habits.byFood.values()].map((h) => ({ h, f: foods.get(h.foodId) })).filter((x) => x.f && !x.h.indulgent && n0(x.f.calories) > 0 && n0(x.f.calories) <= room && (counts.get(x.h.foodId) || 0) < x.h.weeklyCap + 1 && !items.slice(firstItem).some((i) => i.foodId === x.h.foodId))
        .sort((a, b) => b.h.perWeek - a.h.perWeek)[0];
      if (!extra) break;
      const meal = extra.h.mealType === 'snacks' || meals.includes(extra.h.mealType) ? extra.h.mealType : meals[0];
      const servings = servingsFor(extra.f, extra.h); const t = per(extra.f, servings);
      counts.set(extra.h.foodId, (counts.get(extra.h.foodId) || 0) + 1);
      items.push({ date, mealType: meal, foodId: extra.h.foodId, foodName: extra.f.name, servings, quantity: r1((n0(extra.f.servingSize) || 1) * servings), servingUnit: extra.f.servingUnit,
        calories: Math.round(t.calories), protein: r1(t.protein), fiber: r1(t.fiber), carbohydrates: Math.round(t.carbohydrates), fat: Math.round(t.fat),
        why: 'Added so the day is not below the safe minimum', weeklyCap: extra.h.weeklyCap });
      day = add(day, t);
    }
    const status = [];
    if (day.calories > goal * 1.06) status.push('over budget');
    if (day.calories < Math.min(floor, goal) * 0.95) status.push('under the safe minimum');
    if (day.protein < proteinMin) status.push('protein below your minimum');
    days.push({ date, target: goal, baseTarget: baseGoal, trim: Math.max(0, baseGoal - goal), totals: round(day), status });
  });

  const limitsOut = [...counts.entries()].map(([id, used]) => { const h = habits.byFood.get(id); return h ? { foodId: id, name: h.name, usedThisWeek: used, weeklyCap: h.weeklyCap, usualQty: h.usualQty, maxQty: h.maxQty, unit: h.unit, indulgent: h.indulgent } : null; })
    .filter(Boolean).sort((a, b) => b.usedThisWeek - a.usedThisWeek).slice(0, 12);
  return { items, days, notes: [...notes], limits: limitsOut, goal: baseGoal };
}

module.exports = { analyzeHabits, buildAutoPlan, MEALS };
