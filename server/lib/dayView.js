// One merged view of a day for the meal planner: what is LOGGED (eaten), what is still PLANNED, and what is SUGGESTED.
// Pure functions (no database), so web, mobile and the tests all rely on the same rules.
//
//   reconcile      pairs each planned item with the log that already covers it, so nothing is counted twice
//   mergeDay       logged + planned items per meal, with kcal / protein totals and an overall day total
//   dayBudget      eaten / planned / remaining for the day, with the SAME budget Home uses (target + activity bonus)
//   mealGaps       what a meal is still short of (protein, fibre, vegetables, calories)
//   addOnsFor      up to `limit` add-ons that fill a REAL gap of a meal that already has something in it
//   chefHint       a structured hint per meal / day that the clients turn into the chef character's line
const { buildPool } = require('./smartPlan');
const { explainDay } = require('./planExplain');

const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'];
// How the day's protein / fibre goal is shared between meals (same shares the planner uses).
const SHARE = { breakfast: 0.25, lunch: 0.34, dinner: 0.30, snacks: 0.11 };
const n0 = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const r0 = (x) => Math.round(n0(x));
const r1 = (x) => Math.round(n0(x) * 10) / 10;
const KEYS = ['calories', 'protein', 'fiber', 'carbohydrates', 'fat'];
const emptyTotals = () => ({ calories: 0, protein: 0, fiber: 0, carbohydrates: 0, fat: 0 });
const addTotals = (a, b) => { const o = { ...a }; for (const k of KEYS) o[k] = n0(o[k]) + n0(b?.[k]); return o; };
const roundTotals = (t) => ({ calories: r0(t.calories), protein: r1(t.protein), fiber: r1(t.fiber), carbohydrates: r0(t.carbohydrates), fat: r0(t.fat) });
const idOf = (x) => (x === undefined || x === null ? '' : String(x));

// ------------------------------------------------------------------------------------------------ normalise
/** A FoodLog row as a planner item. */
function fromLog(l) {
  const n = l.nutritionTotal || {};
  return {
    id: idOf(l._id), status: 'logged', source: 'log', date: l.date, mealType: l.mealType,
    foodId: idOf(l.foodId), foodName: l.foodName, quantity: r1(l.consumedQuantity), servingUnit: l.servingUnit || '',
    calories: r0(n.calories), protein: r1(n.protein), fiber: r1(n.fiber), carbohydrates: r0(n.carbohydrates), fat: r0(n.fat),
    fromPlan: false, planId: null,
  };
}
/** A MealPlan row as a planner item (still to eat). */
function fromPlan(p) {
  return {
    id: idOf(p._id), status: 'planned', source: 'plan', date: p.date, mealType: p.mealType,
    foodId: idOf(p.foodId), foodName: p.foodName, quantity: r1(p.quantity), servingUnit: p.servingUnit || '',
    calories: r0(p.calories), protein: r1(p.protein), fiber: r1(p.fiber), carbohydrates: r0(p.carbohydrates), fat: r0(p.fat),
    why: p.why || '', auto: !!p.auto, rescue: !!p.rescue, role: p.role || '',
    locked: !!p.locked, leftover: !!p.leftover, cookMin: p.cookMin ?? null, cookNote: p.cookNote || '',
  };
}

// ------------------------------------------------------------------------------------------------ reconcile
/**
 * Pairs planned rows with logged rows so an eaten planned food is counted ONCE (as logged).
 *  1. a plan row already marked logged with a logId  -> pairs with that log
 *  2. a plan row marked logged without a logId       -> hidden (the log it created is the truth)
 *  3. an unlogged plan row whose date + meal + food matches a log that nothing else claimed (the person logged it
 *     directly instead of tapping "Log") -> counts as done, paired with that log
 * Returns { pending: plan rows still to eat, paired: Map(planId -> logId), done: plan rows that are covered by a log }.
 */
function reconcile(plans = [], logs = []) {
  const claimed = new Set();
  const paired = new Map();
  const logById = new Map(logs.map((l) => [idOf(l._id), l]));
  for (const p of plans) {
    if (p.logged && p.logId && logById.has(idOf(p.logId))) { paired.set(idOf(p._id), idOf(p.logId)); claimed.add(idOf(p.logId)); }
  }
  const pending = []; const done = [];
  for (const p of plans) {
    const pid = idOf(p._id);
    if (paired.has(pid)) { done.push(p); continue; }
    if (p.logged) { done.push(p); continue; }
    const hit = logs.find((l) => !claimed.has(idOf(l._id)) && l.date === p.date && l.mealType === p.mealType && idOf(l.foodId) === idOf(p.foodId));
    if (hit) { claimed.add(idOf(hit._id)); paired.set(pid, idOf(hit._id)); done.push(p); continue; }
    pending.push(p);
  }
  return { pending, paired, done };
}

// ------------------------------------------------------------------------------------------------ merge
/**
 * @param o.date, o.today   ISO dates; days before today are history (read-only)
 * @param o.logs            FoodLog rows of that day
 * @param o.plans           MealPlan rows of that day
 * @returns { date, readOnly, kind, meals: { breakfast: { items, logged, planned, total }, ... }, logged, planned, total }
 */
function mergeDay({ date, today, logs = [], plans = [] }) {
  const readOnly = date < today;
  const kind = date < today ? 'past' : date === today ? 'today' : 'future';
  const { pending, paired } = reconcile(plans, logs);
  const planOfLog = new Map([...paired.entries()].map(([planId, logId]) => [logId, planId]));
  const meals = Object.fromEntries(MEALS.map((m) => [m, { items: [], logged: emptyTotals(), planned: emptyTotals(), total: emptyTotals() }]));
  for (const l of logs) {
    if (!meals[l.mealType]) continue;
    const it = fromLog(l);
    const pid = planOfLog.get(it.id);
    if (pid) { it.fromPlan = true; it.planId = pid; }
    meals[l.mealType].items.push(it);
    meals[l.mealType].logged = addTotals(meals[l.mealType].logged, it);
  }
  // History is read-only: leftover plans from days that are over are not shown (they were never eaten).
  if (!readOnly) {
    for (const p of pending) {
      if (!meals[p.mealType]) continue;
      const it = fromPlan(p);
      meals[p.mealType].items.push(it);
      meals[p.mealType].planned = addTotals(meals[p.mealType].planned, it);
    }
  }
  let logged = emptyTotals(), planned = emptyTotals();
  for (const m of MEALS) {
    const mm = meals[m];
    mm.total = addTotals(mm.logged, mm.planned);
    // eaten first, then planned, then the order they were created
    mm.items.sort((a, b) => (a.status === b.status ? 0 : a.status === 'logged' ? -1 : 1));
    logged = addTotals(logged, mm.logged); planned = addTotals(planned, mm.planned);
    mm.logged = roundTotals(mm.logged); mm.planned = roundTotals(mm.planned); mm.total = roundTotals(mm.total);
  }
  return { date, kind, readOnly, meals, logged: roundTotals(logged), planned: roundTotals(planned), total: roundTotals(addTotals(logged, planned)) };
}

// ------------------------------------------------------------------------------------------------ budget
/**
 * The day bar: eaten so far, planned, remaining. `budget` is what Home shows as the day's budget
 * (target + the extra food earned by activity, see energy.dayBalance); `trim` is the "lighter day" cut after a heavy day.
 *   remaining      = budget - eaten                 (exactly Home's "left"; negative = over)
 *   remainingAfterPlan = remaining - planned        (what is still free once the plan is eaten)
 * Planned food never reduces `eaten`, so the eaten number always matches Home.
 */
function dayBudget({ budget, trim = 0, logged, planned }) {
  const base = Math.max(0, r0(budget));
  const b = Math.max(0, base - Math.max(0, r0(trim)));
  const eaten = r0(logged?.calories), plan = r0(planned?.calories);
  return { budget: b, homeBudget: base, trim: Math.max(0, r0(trim)), eaten, planned: plan, remaining: b - eaten, remainingAfterPlan: b - eaten - plan };
}

// ------------------------------------------------------------------------------------------------ gaps
const VEG_ROLE = /\b(sabzi|sabji|subzi|salad|bhindi|palak|gobi|cauliflower|beans|vegetables?|veg|lauki|tinda|cabbage|spinach|cucumber|tomato|carrot|broccoli|mushroom|capsicum|bhaji|baingan|brinjal|bharta|methi|karela|turai|gourd|pumpkin|kaddu|peas|matar|soup|poriyal|thoran|avial|kootu|stir[- ]?fry|raita)\b/i;
const MAIN_MEALS = ['lunch', 'dinner'];

/**
 * What one meal is still short of, given the meal's items (logged + planned) and what is left of the day.
 * A gap is REAL only when it is big enough to matter AND the day still has room for it:
 *   protein   meal protein is below 60 % of the meal's share of the day's protein goal, by at least 8 g
 *   fibre     meal fibre is below 60 % of its share of the day's fibre goal, by at least 3 g
 *   veg       lunch / dinner with food in it but no vegetables at all
 * `kcalRoom` is what the day can still take; nothing is suggested when there is under 40 kcal of room.
 */
function mealGaps({ mealType, items = [], ranges, remainingKcal }) {
  const share = SHARE[mealType] || 0.25;
  const t = items.reduce((a, it) => addTotals(a, it), emptyTotals());
  const pWant = n0(ranges?.protein?.goal) * share, fWant = n0(ranges?.fiber?.goal) * share;
  const gaps = { kcalRoom: Math.max(0, r0(remainingKcal)), protein: 0, fiber: 0, veg: false };
  if (items.length && n0(remainingKcal) >= 40) {
    if (pWant && t.protein < pWant * 0.6 && pWant - t.protein >= 8) gaps.protein = r0(pWant - t.protein);
    if (fWant && t.fiber < fWant * 0.6 && fWant - t.fiber >= 3) gaps.fiber = r1(fWant - t.fiber);
    if (MAIN_MEALS.includes(mealType) && !items.some((it) => VEG_ROLE.test(it.foodName))) gaps.veg = true;
  }
  gaps.any = gaps.protein > 0 || gaps.fiber > 0 || gaps.veg;
  gaps.totals = roundTotals(t);
  return gaps;
}

// ------------------------------------------------------------------------------------------------ add-ons
const GAP_WORD = { protein: 'protein', fiber: 'fibre', veg: 'vegetables' };
/** "add curd or a boiled egg for protein" */
const addOnText = (names, gap) => `add ${names.join(' or ')} for ${GAP_WORD[gap]}`;

/**
 * Add-ons for a meal that already has food in it. Each add-on must (a) fix a real gap of the meal, (b) fit the day's remaining
 * calories, (c) suit the meal, (d) not already be in it, and (e) respect the diet (the pool is built for it).
 * @param o.pool        buildPool() candidates
 * @param o.items       the meal's logged + planned items
 * @param o.remainingKcal  budget - eaten - planned for the whole day
 * @returns { suggestions: top `limit`, more: the next ones, gaps, text }
 */
function addOnsFor({ mealType, items = [], ranges, remainingKcal, pool = [], limit = 3, more = 5, usedKeys = new Set() }) {
  const gaps = mealGaps({ mealType, items, ranges, remainingKcal });
  const out = { gaps, suggestions: [], more: [], text: '' };
  if (!gaps.any) return out;
  const have = new Set(items.map((it) => String(it.foodName).toLowerCase()).concat(items.map((it) => it.foodId).filter(Boolean)));
  const cands = [];
  for (const c of pool) {
    if (c.heavy || !(c.meals.has(mealType) || c.famMeals?.has(mealType))) continue;
    if (have.has(String(c.name).toLowerCase()) || (c.id && have.has(c.id)) || usedKeys.has(c.key)) continue;
    const kcal = c.per.calories;
    if (!(kcal > 0) || kcal > gaps.kcalRoom || kcal > 320) continue;
    // which gap does one serving fix? An add-on has to be a small, dense top-up, not a second meal:
    //   protein  >= 5 g and >= 6 g per 100 kcal (curd, boiled egg, paneer, sprouts, buttermilk ...), never a starch or a fruit
    //   veg      a vegetable dish
    //   fibre    >= 3 g and >= 3 g per 100 kcal (vegetables, fruit, sprouts, nuts)
    const per100 = (x) => (x * 100) / Math.max(kcal, 40);
    let gap = null, fill = 0;
    const protOk = gaps.protein > 0 && c.per.protein >= 5 && per100(c.per.protein) >= 6 && ['protein', 'dairy', 'snack'].includes(c.role);
    const vegOk = gaps.veg && c.role === 'veg';
    const fibOk = gaps.fiber > 0 && c.per.fiber >= 3 && per100(c.per.fiber) >= 3 && ['veg', 'fruit', 'snack'].includes(c.role);
    if (protOk) { gap = 'protein'; fill = Math.min(1, c.per.protein / gaps.protein); }
    else if (vegOk) { gap = 'veg'; fill = 0.8; }
    else if (fibOk) { gap = 'fiber'; fill = Math.min(1, c.per.fiber / gaps.fiber); }
    if (!gap) continue;
    const dens = gap === 'protein' ? per100(c.per.protein) / 12 : per100(c.per.fiber) / 8;
    const score = Math.min(1.2, dens) * 1.6 + fill + (c.habit ? 0.4 : 0) + (c.source === 'curated' ? 0.1 : 0) - kcal / 500;
    cands.push({ c, gap, score });
  }
  cands.sort((a, b) => b.score - a.score);
  // one suggestion per kind of food (no "sprouts salad" twice), and the first three spread over different roles so they feel different
  const seenFam = new Set(); const distinct = [];
  for (const x of cands) { if (seenFam.has(x.c.family)) continue; seenFam.add(x.c.family); distinct.push(x); }
  const chosen = []; const seenRole = new Set();
  for (const x of distinct) { if (chosen.length >= limit) break; if (!seenRole.has(x.c.role)) { chosen.push(x); seenRole.add(x.c.role); } }
  for (const x of distinct) { if (chosen.length >= limit) break; if (!chosen.includes(x)) chosen.push(x); }
  chosen.sort((a, b) => b.score - a.score);
  const view = (x) => ({
    key: x.c.key, foodId: x.c.id, name: x.c.name, servings: 1, quantity: r1(x.c.size), servingUnit: x.c.unit,
    calories: r0(x.c.per.calories), protein: r1(x.c.per.protein), fiber: r1(x.c.per.fiber), carbohydrates: r0(x.c.per.carbohydrates), fat: r0(x.c.per.fat),
    gap: x.gap, curated: x.c.source === 'curated' && !x.c.id, familiar: !!x.c.habit,
    why: `Fills ${GAP_WORD[x.gap]}: +${r1(x.gap === 'fiber' ? x.c.per.fiber : x.gap === 'veg' ? x.c.per.fiber : x.c.per.protein)} g`,
  });
  out.suggestions = chosen.map(view);
  out.more = distinct.filter((x) => !chosen.includes(x)).slice(0, more).map(view);
  const mainGap = gaps.protein ? 'protein' : gaps.veg ? 'veg' : 'fiber';
  const names = out.suggestions.filter((s) => s.gap === mainGap).slice(0, 2).map((s) => s.name.replace(/\s*\(.*?\)\s*/g, ' ').trim().toLowerCase());
  if (names.length) out.text = addOnText(names, mainGap);
  return out;
}

// ------------------------------------------------------------------------------------------------ chef hint
/**
 * A structured hint the clients turn into a line from the chef character, in the character's own voice.
 *  { kind: 'open' | 'partial' | 'done' | 'over', mealType, kcal, protein }
 * 'open'    nothing in the meal: it is open, with the kcal and protein that are still free for it
 * 'partial' something is in the meal but a real gap remains
 * 'done'    nothing left to fix
 */
function chefHint({ mealType, mealTotals, planned, gaps, remainingKcal, ranges }) {
  const share = SHARE[mealType] || 0.25;
  const hasFood = n0(mealTotals?.calories) > 0 || n0(planned?.calories) > 0;
  const room = Math.max(0, r0(remainingKcal));
  if (!hasFood) {
    const protein = ranges ? Math.max(0, r0(n0(ranges.protein.goal) * share)) : 0;
    return { kind: room < 40 ? 'over' : 'open', mealType, kcal: Math.min(room, r0(room * (share / 0.3))), protein };
  }
  if (gaps?.any) return { kind: 'partial', mealType, kcal: room, protein: r0(gaps.protein), fiber: r1(gaps.fiber), veg: !!gaps.veg };
  return { kind: 'done', mealType, kcal: room, protein: 0 };
}

// ------------------------------------------------------------------------------------------------ whole range
/**
 * Builds the merged response for a range of days. All inputs are plain rows, so this is easy to test.
 * @param o.dates       the days to show
 * @param o.today       the person's today
 * @param o.logs        FoodLog rows in the range
 * @param o.plans       MealPlan rows in the range
 * @param o.budgets     { date: homeBudgetKcal }  Home's budget for each day (target + activity bonus)
 * @param o.trims       { date: kcal }  "lighter day" cut per day
 * @param o.ranges      macroRanges()
 * @param o.foods, o.userFoods, o.catalogue, o.habits, o.diet   inputs for the add-on pool
 */
function buildDayViews(o) {
  const { dates, today, logs = [], plans = [], budgets = {}, trims = {}, ranges, diet = 'v', suggest = true } = o;
  const pool = suggest ? buildPool({ foods: o.foods || new Map(), userFoods: o.userFoods || [], catalogue: o.catalogue || [], habits: o.habits, diet, rules: o.rules || null }) : [];
  return dates.map((date) => {
    const day = mergeDay({ date, today, logs: logs.filter((l) => l.date === date), plans: plans.filter((p) => p.date === date) });
    const bud = dayBudget({ budget: budgets[date] ?? 0, trim: trims[date] || 0, logged: day.logged, planned: day.planned });
    const hasBudget = bud.homeBudget > 0;
    const used = new Set();
    for (const m of MEALS) {
      const meal = day.meals[m];
      meal.suggestions = []; meal.more = []; meal.hint = null;
      if (day.readOnly) continue;
      // suggestions only sit next to a meal that already has food (logged or planned); empty meals get the planner / a hungry chef
      const items = meal.items;
      const gapsIn = hasBudget ? addOnsFor({ mealType: m, items, ranges, remainingKcal: bud.remainingAfterPlan, pool, usedKeys: used }) : { gaps: mealGaps({ mealType: m, items, ranges, remainingKcal: 0 }), suggestions: [], more: [], text: '' };
      meal.suggestions = gapsIn.suggestions.map((s) => ({ ...s, status: 'suggested' }));
      meal.more = gapsIn.more.map((s) => ({ ...s, status: 'suggested' }));
      for (const s of meal.suggestions) used.add(s.key);
      meal.addOnText = gapsIn.text;
      meal.gaps = { protein: gapsIn.gaps.protein, fiber: gapsIn.gaps.fiber, veg: gapsIn.gaps.veg };
      meal.hint = chefHint({ mealType: m, mealTotals: meal.logged, planned: meal.planned, gaps: gapsIn.gaps, remainingKcal: bud.remainingAfterPlan, ranges });
    }
    const allDone = !day.readOnly && MEALS.some((m) => day.meals[m].logged.calories > 0) && MEALS.every((m) => day.meals[m].planned.calories === 0 && !day.meals[m].items.some((it) => it.status === 'planned'))
      && MEALS.filter((m) => m !== 'snacks').every((m) => day.meals[m].logged.calories > 0);
    explainDay(day, { proteinGoal: o.ranges && o.ranges.protein ? o.ranges.protein.goal : 0 });
    const dayOut = o.dayInfo ? o.dayInfo(date, bud.homeBudget) : null;
    return { ...day, budget: bud, complete: allDone, hasBudget, ...(dayOut ? { plan: dayOut } : {}) };
  });
}

// ------------------------------------------------------------------------------------------------ planning summary
/**
 * What "Plan this day / Plan my week" treated as fixed, and the add-ons for meals that are only PARTLY logged.
 *   fixed[]   per day: which meals already hold logged food, what was eaten, the budget and what is left to plan
 *   addOns[]  per partly-logged meal with a real gap: { date, mealType, text, suggestions }
 * @param o.dates      days that were planned
 * @param o.logs       FoodLog rows of those days
 * @param o.plans      plan rows still to eat (kept + newly built), already normalised: { date, mealType, foodId, foodName, calories, ... }
 * @param o.budgets    { date: kcal } the budget used for planning that day (Home budget minus any lighter-day cut)
 * @param o.pool       buildPool() candidates
 */
function fixedSummary({ dates, logs = [], plans = [], budgets = {}, ranges, pool = [] }) {
  const fixed = []; const addOns = [];
  for (const date of dates) {
    const day = mergeDay({ date, today: date, logs: logs.filter((l) => l.date === date), plans: plans.filter((p) => p.date === date).map((p) => ({ logged: false, ...p })) });
    const bud = dayBudget({ budget: budgets[date] ?? 0, logged: day.logged, planned: day.planned });
    const loggedMeals = MEALS.filter((m) => day.meals[m].logged.calories > 0);
    fixed.push({ date, loggedMeals, eaten: bud.eaten, planned: bud.planned, budget: bud.budget, remaining: bud.remaining, remainingAfterPlan: bud.remainingAfterPlan, protein: day.logged.protein });
    for (const m of loggedMeals) {
      const r = addOnsFor({ mealType: m, items: day.meals[m].items, ranges, remainingKcal: bud.remainingAfterPlan, pool });
      if (r.suggestions.length) addOns.push({ date, mealType: m, text: r.text, gaps: { protein: r.gaps.protein, fiber: r.gaps.fiber, veg: r.gaps.veg }, suggestions: r.suggestions });
    }
  }
  return { fixed, addOns };
}

module.exports = { MEALS, SHARE, reconcile, mergeDay, dayBudget, mealGaps, addOnsFor, chefHint, buildDayViews, fixedSummary, fromLog, fromPlan };
