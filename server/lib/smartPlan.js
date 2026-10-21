// Balanced meal planner. The older "plan from what I eat" planner (autoPlan.js) can only repeat a person's own history, so a week
// built from it is as balanced as their habits are. This one builds every plate from ROLES, the way a dietitian would:
//
//     breakfast  a main (carb or protein-rich) + a protein / dairy partner + fruit
//     lunch      protein + carb + vegetables (+ curd or buttermilk)
//     dinner     protein + carb (lighter) + vegetables
//     snacks     fruit / nuts / curd / roasted chana, small
//
// and checks the whole day against the person's protein / carb / fat / fibre ranges and the sugar and sodium ceilings.
//   * Foods the person already eats get a bonus, so the plan still feels like theirs (mode 'balanced'); mode 'mine' leans on them harder.
//   * The shared catalogue and a curated healthy pool fill every gap, so the plan is never limited by a thin food log.
//   * Variety: a food is not repeated on consecutive days, a protein dish family (dal, paneer, chicken ...) is not doubled in a day,
//     and every food has a weekly cap (treats: one a week).
//   * Each day has its OWN calorie target, so the lighter days after a heavy day are planned lighter (see intakeAdvice.js).
//   * Diet: vegetarian / eggetarian / non-veg. Inferred from the food log, or chosen by the person.
const { FOODS: CURATED } = require('./healthyDiet');
const { createRules, SWEET: SWEET_RE } = require('./planRules');
const { addDays: addDaysIso } = require('./dates');

const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'];
const SHARE = { breakfast: 0.25, lunch: 0.34, dinner: 0.30, snacks: 0.11 };
const n0 = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 2) / 2;

// ---------------------------------------------------------------------------------------------------------------- classify
const NONVEG = /\b(chicken|mutton|lamb|fish|prawns?|shrimp|crab|keema|beef|pork|meat|tuna|salmon|sausage|bacon|kebabs?|kababs?|seekh|rohu|pomfret|surmai|hilsa|squid|ham)\b/i;
const EGG = /\b(eggs?|omelette|omelet|anda)\b/i;
const FRUIT = /\b(apple|banana|orange|mosambi|sweet lime|mango|papaya|guava|pears?|grapes?|watermelon|muskmelon|melon|pomegranate|berries|berry|strawberr\w*|kiwi|pineapple|chikoo|sapota|peach|plum|lychee|litchi|custard apple|sitaphal|fruit)\b/i;
const NOT_FRUIT = /\b(juice|shake|jam|cake|pie|ice ?cream|pudding|halwa|candy|chaat|smoothie|lassi|milkshake|dried|barfi|kulfi|custard|sherbet|syrup|pickle|dal|pappu|curry|sabzi|rice|panna|aam|gravy|masala)\b/i;
const SNACKY = /\b(almonds?|walnuts?|cashews?|pistachios?|peanuts?|nuts|makhana|fox nuts?|roasted|sprouts?|trail mix|seeds?|popcorn|murmura|puffed rice|hummus|sattu|egg white|dry fruits?|dates?|khakhra|boiled eggs?)\b/i;
const CARB = /\b(roti|rotis|chapati|chapatti|phulka|rice|idli|dosa|poha|upma|paratha|parantha|bread|toast|oats|khichdi|daliya|dalia|porridge|ragi|jowar|bajra|millet|pasta|noodles|cornflakes|muesli|cereal|thepla|uttapam|pongal|appam|puttu|dhokla|naan|kulcha|puri|bhatura|quinoa|potato|corn|bhutta|sandwich|pulao|pulav|biryani|couscous|vermicelli|semiya|sevai|vada)\b/i;
const PROTEIN = /\b(dal|dhal|daal|paneer|chicken|eggs?|omelette|omelet|rajma|chole|chhole|chana|fish|tofu|soya|soy|lentils?|moong|sambar|mutton|prawns?|keema|tikka|tandoori|kebabs?)\b/i;
const DAIRY = /\b(curd|dahi|yogurt|yoghurt|buttermilk|chaas|chhaas|chaach|lassi|milk|raita|kefir)\b/i;
const NOT_DAIRY = /\b(milkshake|kheer|payasam|cake|pudding|ice|khoa|mawa|peda|barfi|burfi|rasgulla|rasmalai|gulab|malai|sweet|chocolate|powder|biscuit|bread)\b/i;
const VEG = /\b(sabzi|sabji|subzi|salad|bhindi|palak|gobi|cauliflower|beans|vegetables?|veg|lauki|tinda|cabbage|spinach|cucumber|tomato|carrot|broccoli|mushroom|capsicum|bhaji|baingan|brinjal|bharta|methi|karela|turai|gourd|pumpkin|kaddu|peas|matar|soup|poriyal|thoran|avial|kootu|stir[- ]?fry|aloo)\b/i;
const HEAVY = /(butter|makhani|cream|malai|korma|fried|deep|biryani|pakora|pakoda|samosa|\bpuri\b|bhatura|bhature|naan|kofta|kulcha|masala dosa|\bvada\b|bonda|fries|burger|pizza|jalebi|gulab|halwa|ice ?cream|cake|cookie|chocolate|pastry|sweet|mithai|ladoo|laddu|barfi|chips|namkeen|cola|soda|juice|maggi|noodles|manchurian|chaat|\bpav\b|cheese|shahi|chilli|lollipop|\b65\b|dum|nihari|haleem|kachori|paneer tikka masala)/i;
// Raw ingredients, dry staples and condiments are not a plate of food.
const RAW = /(\((dry|uncooked)\)|\buncooked\b|\bflour\b|\batta\b|\bpowder\b|\boil\b|\bghee\b|\bsugar\b|\bjaggery\b|\bsalt\b|\bsauce\b|\bchutney\b|\bpickle\b|\bessence\b|\bsyrup\b|\bprotein bar\b|\bmayonnaise\b|\bketchup\b)/i;
const DRY_OK = /\b(oats|muesli|cornflakes|poha|daliya|dalia|vermicelli|semiya|sevai|couscous|quinoa)\b/i;
const BF_ONLY = /\b(cornflakes|muesli|cereal|pancake|porridge|toast|oats|smoothie|upma|poha|idli|dhokla|appam|puttu|sandwich|bread)\b/i;
const BF_DINNER = /\b(dosa|uttapam|chilla|cheela|daliya|dalia|omelette|omelet|bhurji|pongal)\b/i;
const BF_ANY = /\b(paratha|parantha|thepla|khichdi|sprouts?|sambar)\b/i;
const STAPLE = /\b(roti|rotis|chapati|chapatti|phulka|rice|dal|dhal|daal|curd|dahi)\b/i;

/** role + meals a food belongs to, from its name. role 'other' = not usable in a balanced plate. */
function classify(name) {
  const nm = String(name || '');
  if (RAW.test(nm) && !(/\(dry\)/i.test(nm) && DRY_OK.test(nm) && !/\b(flour|atta|powder)\b/i.test(nm))) return { role: 'other', meals: new Set(), nonveg: false, egg: false, heavy: false };
  const nonveg = NONVEG.test(nm), egg = EGG.test(nm) && !/\bpaneer\b/i.test(nm);
  let role = 'other';
  if (FRUIT.test(nm) && !NOT_FRUIT.test(nm) && !CARB.test(nm)) role = 'fruit';
  else if (SNACKY.test(nm) && !CARB.test(nm) && !/\b(curry|masala|gravy)\b/i.test(nm)) role = 'snack';
  else if (CARB.test(nm)) role = 'carb';
  else if (PROTEIN.test(nm)) role = 'protein';
  else if (DAIRY.test(nm) && !NOT_DAIRY.test(nm)) role = 'dairy';
  else if (VEG.test(nm)) role = 'veg';
  else if (SWEET_RE.test(nm)) role = 'sweet';   // only planned when the person asked for sweets (setup: sweet cravings)

  let meals;
  switch (role) {
    case 'fruit': meals = ['breakfast', 'snacks']; break;
    case 'snack': meals = /\b(sprouts?|boiled eggs?|sattu|oats|nuts|almonds?|walnuts?)\b/i.test(nm) ? ['breakfast', 'snacks'] : ['snacks']; break;
    case 'dairy': meals = /\b(raita|curd|dahi)\b/i.test(nm) ? ['breakfast', 'lunch', 'dinner', 'snacks'] : /\b(buttermilk|chaas|chhaas|chaach|lassi)\b/i.test(nm) ? ['lunch', 'snacks'] : ['breakfast', 'snacks']; break;
    case 'carb': meals = BF_ONLY.test(nm) ? ['breakfast'] : BF_DINNER.test(nm) ? ['breakfast', 'dinner'] : BF_ANY.test(nm) ? ['breakfast', 'lunch', 'dinner'] : ['lunch', 'dinner']; break;
    case 'protein': meals = /\b(bhurji|omelette|omelet)\b/i.test(nm) ? ['breakfast', 'dinner'] : /\b(boiled eggs?|sprouts?|sambar|egg)\b/i.test(nm) ? ['breakfast', 'lunch', 'dinner'] : ['lunch', 'dinner']; break;
    case 'veg': meals = /\bsoup\b/i.test(nm) ? ['dinner', 'snacks'] : ['lunch', 'dinner']; break;
    case 'sweet': meals = ['snacks']; break;
    default: meals = [];
  }
  return { role, meals: new Set(meals), nonveg, egg, heavy: HEAVY.test(nm) };
}

// A protein dish "family", so lunch and dinner do not both end up as dal (or both paneer ...).
const familyOf = (name) => { const m = String(name).toLowerCase().match(/\b(dal|dhal|daal|sambar|rajma|chole|chhole|chana|paneer|tofu|soya|soy|egg|eggs|omelette|chicken|fish|mutton|prawns?|moong|sprouts?|curd|dahi|yogurt|yoghurt|roti|rice|idli|dosa|oats|poha|upma|paratha)\b/); return m ? m[1].replace(/^(dhal|daal)$/, 'dal').replace(/^eggs$|^omelette$/, 'egg').replace(/^chhole$/, 'chole').replace(/^(dahi|yogurt|yoghurt)$/, 'curd') : String(name).toLowerCase().split(/[\s(]/)[0]; };

// ---------------------------------------------------------------------------------------------------------------- pool
const WEEKLY_CAP = { protein: 3, carb: 5, veg: 4, dairy: 5, fruit: 5, snack: 4 };
const ROLE_SHARE = { protein: 0.34, carb: 0.36, veg: 0.14, dairy: 0.12, fruit: 0.12, snack: 0.5 };

function toCandidate(f, source, forced, allowSweet) {
  const c = forced || classify(f.name);
  if (c.role === 'other' || !(n0(f.calories) > 0) || n0(f.calories) > 650) return null;
  if (c.role === 'sweet' && (!allowSweet || n0(f.calories) > 260)) return null;
  const size = n0(f.servingSize) || 1;
  return {
    key: f._id ? String(f._id) : `c:${String(f.name).toLowerCase()}`, id: f._id ? String(f._id) : null, source, doc: f, name: f.name, unit: f.servingUnit || 'serving', size,
    per: { calories: n0(f.calories), protein: n0(f.protein), carbohydrates: n0(f.carbohydrates), fat: n0(f.fat), fiber: n0(f.fiber), sugar: n0(f.sugar), sodium: n0(f.sodium) },
    role: c.role, meals: c.meals, nonveg: c.nonveg, egg: c.egg, heavy: c.heavy || n0(f.sugar) > 18 || n0(f.calories) > 450, family: familyOf(f.name), note: f.note || f.notes || '',
  };
}

/** Everything a plate can be made from, with the person's own foods first (they win a name clash). */
function buildPool({ foods, userFoods = [], catalogue = [], habits, diet = 'v', useCurated = true, rules = null, allowSweet = false }) {
  const seen = new Set(); const pool = [];
  const famFor = new Map();       // `${meal}|${foodId}` -> habit
  const famAny = new Map();       // foodId -> best habit
  if (habits) {
    for (const m of MEALS) for (const h of habits.byMeal[m] || []) famFor.set(`${m}|${h.foodId}`, h);
    for (const h of habits.byFood.values()) famAny.set(String(h.foodId), h);
  }
  const add = (f, source, forced) => {
    if (!f || f.hidden) return;
    const k = String(f.name).trim().toLowerCase();
    if (seen.has(k)) return;
    const c = toCandidate(f, source, forced, allowSweet);
    if (!c) return;
    seen.add(k);
    if (diet !== 'n' && c.nonveg) return;
    if (diet === 'v' && c.egg) return;
    if (rules && !rules.poolOk(c)) return;                  // allergens, diet mode, dislikes, kitchen, budget ... never shown
    c.habit = famAny.get(String(f._id)) || null;
    c.famMeals = new Set(MEALS.filter((m) => famFor.has(`${m}|${f._id}`)));
    pool.push(c);
  };
  for (const f of foods.values()) add(f, 'mine');
  for (const f of userFoods) add(f, 'mine');
  for (const f of catalogue) add(f, 'catalogue');
  if (useCurated) {
    for (const x of CURATED) {
      const letters = { b: 'breakfast', l: 'lunch', d: 'dinner', s: 'snacks' };
      const role = x.role === 'main' ? (x.protein >= 10 ? 'protein' : 'carb') : x.role;
      add({ name: x.name, servingSize: x.size, servingUnit: x.unit, calories: x.kcal, protein: x.protein, carbohydrates: x.carbs, fat: x.fat, fiber: x.fiber, sugar: 0, sodium: 0, note: x.note }, 'curated',
        { role, meals: new Set([...x.meals].map((l) => letters[l]).filter(Boolean)), nonveg: x.diets === 'n', egg: x.diets === 'en', heavy: false });
    }
  }
  return pool;
}

/** 'v' | 'e' | 'n' from what the person has logged (any non-veg food -> n, else any egg -> e, else v). */
function inferDiet(names = []) {
  let egg = false;
  for (const nm of names) { if (NONVEG.test(nm)) return 'n'; if (EGG.test(nm) && !/\bpaneer\b/i.test(nm)) egg = true; }
  return egg ? 'e' : 'v';
}

// small deterministic PRNG: the same inputs give the same plan on refresh; a new `variant` gives a different one
function rng(seedStr) { let h = 2166136261; for (const ch of String(seedStr)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; }; }

const per = (c, s) => ({ calories: c.per.calories * s, protein: c.per.protein * s, carbohydrates: c.per.carbohydrates * s, fat: c.per.fat * s, fiber: c.per.fiber * s, sugar: c.per.sugar * s, sodium: c.per.sodium * s });
const zero = () => ({ calories: 0, protein: 0, carbohydrates: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 });
const add = (a, b) => { const o = { ...a }; for (const k of Object.keys(b)) o[k] = n0(o[k]) + n0(b[k]); return o; };
const round = (t) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, k === 'fiber' || k === 'protein' ? r1(v) : Math.round(v)]));

const SLOTS = {
  breakfast: [{ roles: ['carb', 'protein'] }, { roles: ['protein', 'dairy'], skipIf: (p) => p.some((x) => x.c.per.protein * x.s >= 12) }, { roles: ['fruit'], optional: true }],
  lunch: [{ roles: ['protein'] }, { roles: ['carb'] }, { roles: ['veg'] }, { roles: ['dairy'], optional: true }],
  dinner: [{ roles: ['protein'] }, { roles: ['carb'] }, { roles: ['veg'] }],
  snacks: [{ roles: ['fruit', 'snack', 'dairy'] }, { roles: ['snack', 'fruit', 'dairy'], optional: true }, { roles: ['sweet'], optional: true, sweet: true }],
};

// ---------------------------------------------------------------------------------------------------------------- planner
/**
 * @param o.habits      analyzeHabits() result (can be empty for a new person)
 * @param o.foods       Map(foodId -> Food doc) of the foods in the habits
 * @param o.userFoods   the person's other own foods (optional)
 * @param o.catalogue   shared catalogue foods
 * @param o.dates       days to plan
 * @param o.targets     { date: kcal } the target for each day (lighter after heavy days); o.target the normal one
 * @param o.floor       safe minimum;  o.ranges macroRanges();  o.limits { sodiumMg, sugar }
 * @param o.occupied    { 'date|meal': true } meals that already hold something;  o.dayBase { date: totals } what those hold
 * @param o.weekCounts  Map(foodKey -> times already eaten / planned this week)
 * @param o.meals       which meals to plan;  o.diet 'v'|'e'|'n';  o.mode 'balanced'|'mine';  o.needs recentNeeds();  o.seed string
 * @param o.avoidIndulgent  true after heavy days: no treats in the plan
 */
function buildSmartPlan(o) {
  const { habits, foods = new Map(), userFoods = [], catalogue = [], dates, targets = {}, target, floor = 1200, ranges, limits = {}, occupied = {}, dayBase = {}, meals = MEALS, mode = 'balanced', needs = {}, seed = 'x', avoidIndulgent = false, settings = null } = o;
  const diet = (settings && settings.diet) || o.diet || 'v';
  const rules = createRules({ settings, excluder: o.excluder, now: o.now, ...(o.tagsFor ? { tagsFor: o.tagsFor } : {}) });
  const shares = (settings && settings.shares) || SHARE;
  const repeatOK = !settings || settings.variety === 'repeat';
  const allowSweet = !!settings && ['daily', 'weekend'].includes(settings.sweetPlan);
  const pool = buildPool({ foods, userFoods, catalogue, habits, diet, rules, allowSweet });
  const famWeek = new Map(o.familyCounts || []); const leftoverQ = new Map(); let sweetsPlanned = 0;
  const protFams = new Set(pool.filter((c) => c.role === 'protein').map((c) => c.family));
  const famCapWeek = repeatOK ? 99 : Math.max(3, Math.ceil((dates.length * 2) / Math.max(3, protFams.size)) + 1);
  const counts = new Map(o.weekCounts || []);
  const lastUsed = new Map();        // key -> day index it was last planned
  const items = []; const days = []; const notes = new Set();
  const carbMax = ranges?.carbs?.max ?? 9999, fatMax = ranges?.fat?.max ?? 9999;
  const proteinMin = ranges?.protein?.min ?? 0, proteinGoal = ranges?.protein?.goal ?? 0, fiberGoal = ranges?.fiber?.goal ?? 0;
  const sugarCap = n0(limits.sugar) || 9999, sodiumCap = n0(limits.sodiumMg) || 99999;
  const famBonus = mode === 'mine' ? 2.4 : 1.1;
  if (!pool.length) { notes.add('There are no foods to plan from yet.'); return { items, days, notes: [...notes], limits: [], pool: 0 }; }

  const mainDish = (c) => (c.role === 'protein' || c.role === 'carb') && !STAPLE.test(c.name);
  const baseCap = (c) => (c.role === 'sweet' ? (settings && settings.sweetPlan === 'daily' ? 7 : 1) : c.habit ? Math.max(1, c.habit.weeklyCap) : c.heavy ? 1 : STAPLE.test(c.name) ? 7 : WEEKLY_CAP[c.role] || 3);
  // variety rule: a main dish is cooked at most twice a week unless the person chose "repeat my favourites"
  const capOf = (c) => (!repeatOK && mainDish(c) ? Math.min(baseCap(c), 2) : baseCap(c));
  const maxServingsOf = (c, budget) => {
    const k = c.per.calories;
    const base = k <= 80 ? 6 : k <= 150 ? 4 : k <= 300 ? 3 : 1.5;
    let cap = { carb: base, protein: Math.min(base, 2.5), veg: 2, fruit: 2, dairy: 2, snack: Math.min(base, 2), sweet: 1 }[c.role] ?? Math.min(base, 3);
    if (c.habit?.maxQty) cap = Math.min(Math.max(cap, 1), Math.max(0.5, r2((c.habit.maxQty / c.size) * 1.1)));
    return Math.max(0.5, Math.min(cap, r2((budget * 0.9) / k)));
  };

  dates.forEach((date, di) => {
    const rand = rng(`${seed}|${date}`);
    const goal = Math.max(floor, Math.round(targets[date] ?? target));
    const baseTarget = Math.max(floor, Math.round(target));
    let day = { ...zero(), ...(dayBase[date] || {}) };
    const first = items.length;
    const usedToday = new Set(); const familyToday = new Map(); let treatToday = 0;
    const info = rules.dayInfo(date, goal, floor);
    const toPlan = meals.filter((m) => !occupied[`${date}|${m}`] && !info.fasted.includes(m) && !info.out.includes(m));
    const outFrac = info.out.filter((m) => meals.includes(m)).reduce((s, m) => s + (shares[m] || 0), 0);
    const remaining = Math.max(0, goal * (1 - outFrac) - info.room - day.calories);
    const shareSum = toPlan.reduce((s, m) => s + shares[m], 0) || 1;
    const dayProtMin = proteinMin * (1 - outFrac), dayFiberGoal = fiberGoal * (1 - outFrac);
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    const sweetToday = allowSweet && !avoidIndulgent && (settings.sweetPlan === 'daily' || ((dow === 6 || dow === 0) && sweetsPlanned < Math.ceil(dates.length / 7)));

    for (const meal of toPlan) {
      const budget = (remaining * shares[meal]) / shareSum;
      if (budget < 70) { notes.add(`${date}: there is hardly any calorie budget left for ${meal}, so it was skipped.`); continue; }
      const picked = []; let m = zero();
      const proteinWant = proteinGoal * shares[meal];
      const lo = meal === 'lunch' ? leftoverQ.get(date) : null;
      if (lo && !usedToday.has(lo.c.key) && rules.okFor(lo.c, { meal, date })) { picked.push({ c: lo.c, s: lo.s, leftover: true, reasons: [{ p: 0, t: `leftover ${lo.c.name.toLowerCase()} from ${lo.from} (no cooking)` }] }); m = add(m, per(lo.c, lo.s)); }

      const allowed = (c, s) => {
        if (counts.get(c.key) >= capOf(c)) return false;
        if (usedToday.has(c.key) || picked.some((p) => p.c.key === c.key)) return false;
        if (!rules.okFor(c, { meal, date })) return false;
        if (c.role === 'protein' && !repeatOK && c.family && (famWeek.get(c.family) || 0) >= famCapWeek) return false;
        if (c.role === 'sweet') { if (!sweetToday || treatToday >= 1) return false; } else
        if (c.heavy && (avoidIndulgent || treatToday >= 1 || !c.habit)) return false;   // treats only if already part of the person's eating, one a day, none after heavy days
        const t = per(c, s);
        if (day.carbohydrates + m.carbohydrates + t.carbohydrates > carbMax + 20) return false;
        if (day.fat + m.fat + t.fat > fatMax + 10) return false;
        if (day.sodium + m.sodium + t.sodium > sodiumCap + 500) return false;
        return true;
      };
      const score = (c, s, role) => {
        const t = per(c, s); const k = Math.max(t.calories, 40);
        const fam = c.habit && (c.famMeals.has(meal) || mode === 'balanced') ? Math.min(1, c.habit.perWeek / 5) + (c.famMeals.has(meal) ? 0.25 : 0) : 0;
        const protFit = Math.min(1.4, ((t.protein * 4) / k) * 3);
        const fibFit = Math.min(1, (t.fiber * 7) / k);
        let sc = fam * famBonus + (role === 'protein' || role === 'dairy' ? protFit * (needs.protein ? 2.1 : 1.5) : protFit * 0.5) + fibFit * (needs.fiber ? 1.5 : 0.8);
        const dayGap = di - (lastUsed.get(c.key) ?? -9);
        if (dayGap === 1) sc -= 1.1; else if (dayGap === 2) sc -= 0.45;
        if (familyToday.has(c.family) && role !== 'carb') sc -= 1.4;
        if (c.heavy) sc -= 0.9;
        if (t.sugar > 15 || (needs.sugar && t.sugar > 8)) sc -= 0.6;
        if (t.sodium > 800 || (needs.sodium && t.sodium > 500)) sc -= 0.5;
        if (t.calories > (budget - m.calories) * 1.2 + 20) sc -= 1.5;
        if (role === 'veg' && c.per.calories >= 60) sc += 0.35;       // a cooked sabzi over a single boiled vegetable
        if (c.source === 'curated') sc += 0.15;                       // vetted, balanced foods get a small edge over unknown catalogue items
        sc += (c.per.calories ? Math.min(0.5, (c.per.protein * 4) / c.per.calories) * 0.4 : 0);
        if (rules.active) sc += rules.bonus(c, s, { meal, role, date }).sc;
        if (c.role === 'protein' && !repeatOK && c.family) sc -= 0.5 * Math.max(0, (famWeek.get(c.family) || 0) - 1);   // rotate protein sources through the week
        return sc + rand() * 0.45;
      };
      const initialServings = (c) => {
        if (c.role === 'veg' || c.role === 'fruit' || c.role === 'dairy') return 1;
        const usual = c.habit && c.famMeals.has(meal) && c.habit.usualQty ? c.habit.usualQty / c.size : 0;
        const w = ROLE_SHARE[c.role] || 0.3;
        const want = usual || (budget * w) / Math.max(c.per.calories, 20);
        return Math.max(0.5, Math.min(maxServingsOf(c, budget), r2(want)));
      };

      for (const slot of SLOTS[meal]) {
        if (slot.sweet && !sweetToday) continue;
        if (lo && picked.some((p) => p.leftover) && slot.roles[0] === 'protein') continue;
        if (slot.optional && !slot.sweet && m.calories >= budget * 0.85) continue;
        if (slot.skipIf && slot.skipIf(picked)) continue;
        let best = null;
        for (const role of slot.roles) {
          for (const c of pool) {
            if (c.role !== role || !(c.meals.has(meal) || c.famMeals.has(meal) && c.role !== 'other')) continue;
            const s = initialServings(c);
            if (!allowed(c, s)) continue;
            const sc = score(c, s, role) - slot.roles.indexOf(role) * 0.35;
            if (!best || sc > best.sc) best = { c, s, sc };
          }
          if (best && slot.roles.indexOf(role) === 0 && best.sc > 0.6) break;
        }
        if (!best) continue;
        picked.push({ c: best.c, s: best.s, reasons: rules.active ? rules.bonus(best.c, best.s, { meal, role: best.c.role, date }).reasons : [] });
        m = add(m, per(best.c, best.s));
      }
      if (!picked.length) { notes.add(`Not enough ${meal} foods to plan ${meal} on ${date}.`); continue; }

      // size the plate to the meal budget: nudge the big items in half-serving steps
      const scalable = () => picked.filter((p) => !p.leftover && (p.c.role !== 'veg' || p.s < 2));
      for (let g = 0; g < 14; g += 1) {
        const total = picked.reduce((a, p) => a + per(p.c, p.s).calories, 0);
        if (total > budget * 1.07 + 10) {
          const p = [...picked].filter((x) => x.s > 0.5 && !x.leftover).sort((a, b) => per(b.c, b.s).calories - per(a.c, a.s).calories)[0]; if (!p) break;
          p.s = Math.max(0.5, p.s - 0.5);
        } else if (total < budget * 0.9) {
          const wantProt = picked.reduce((a, p) => a + per(p.c, p.s).protein, 0) < proteinWant * 0.9;
          const p = scalable().filter((x) => x.s + 0.5 <= maxServingsOf(x.c, budget) && total + per(x.c, 0.5).calories <= budget * 1.07 + 10)
            .sort((a, b) => (wantProt ? b.c.per.protein / Math.max(b.c.per.calories, 30) - a.c.per.protein / Math.max(a.c.per.calories, 30) : (a.c.role === 'carb' ? 0 : 1) - (b.c.role === 'carb' ? 0 : 1)))[0];
          if (!p) break;
          p.s += 0.5;
        } else break;
      }

      for (const p of picked) {
        const t = per(p.c, p.s);
        day = add(day, t);
        usedToday.add(p.c.key); familyToday.set(p.c.family, (familyToday.get(p.c.family) || 0) + 1);
        if (!p.leftover) { counts.set(p.c.key, (counts.get(p.c.key) || 0) + 1); lastUsed.set(p.c.key, di); if (p.c.role === 'protein' && p.c.family) famWeek.set(p.c.family, (famWeek.get(p.c.family) || 0) + 1); }
        if (p.c.heavy || p.c.role === 'sweet') treatToday += 1;
        if (p.c.role === 'sweet') sweetsPlanned += 1;
        const reasons = [...(p.reasons || [])];
        if (p.c.role === 'protein' && proteinGoal && t.protein >= 10) reasons.push({ p: 4, t: `${Math.round(t.protein)} g protein toward your ${Math.round(proteinGoal)} g` });
        const it = makeItem(date, meal, p.c, p.s, t, mode, reasons);
        if (p.leftover) { it.leftover = true; it.fixed = true; }
        const tg = rules.active ? rules.tagsOf(p.c) : null;
        if (tg && tg.cookMin !== null && tg.cookMin !== undefined) it.cookMin = p.leftover ? 0 : tg.cookMin;
        const cn = rules.cookNote(p.c); if (cn) it.cookNote = cn;
        // cook once, eat twice: a batchable dinner dish is cooked double and reappears as the next day(s) lunch
        if (meal === 'dinner' && !p.leftover && settings && settings.prep !== 'fresh' && rules.batchable(p.c) && (settings.prep === 'twice' || dow === 0)) {
          const span = settings.prep === 'twice' ? 1 : 2; let n = 0;
          for (let k = 1; k <= span; k += 1) { const nd = addDaysIso(date, k); if (dates.includes(nd) && !leftoverQ.has(nd)) { leftoverQ.set(nd, { c: p.c, s: p.s, from: new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }) + ' dinner' }); n += 1; } }
          if (n) { it.fixed = true; it.why = `${it.why} · cook a double batch, it covers ${n === 1 ? "tomorrow's lunch" : 'the next two lunches'}`.slice(0, 200); }
        }
        items.push(it);
      }
    }

    // ---- end-of-day fixes: protein, fibre, then the calorie band
    const dayItems = () => items.slice(first);
    const grow = (it, s) => { // change an already planned item by `s` servings
      const c = pool.find((x) => x.key === (it.foodId || `c:${String(it.foodName).toLowerCase()}`)); if (!c) return false;
      const t = per(c, s);
      it.servings += s; it.quantity = r1(c.size * it.servings); it.calories = Math.round(it.calories + t.calories); it.protein = r1(it.protein + t.protein); it.fiber = r1(it.fiber + t.fiber);
      it.carbohydrates = Math.round(it.carbohydrates + t.carbohydrates); it.fat = Math.round(it.fat + t.fat); day = add(day, t); return true;
    };
    const addExtra = (roles, meal, why, minProtein = 0, density = (x) => (x.per.protein * 4 + x.per.fiber * 7) / x.per.calories) => {
      const room = goal * 1.04 - day.calories; if (room < 40) return false;
      const c = pool.filter((x) => roles.includes(x.role) && x.per.calories <= room && x.per.protein >= minProtein && !usedToday.has(x.key) && (counts.get(x.key) || 0) < capOf(x) + 1 && (x.meals.has(meal) || x.famMeals.has(meal)) && !(x.heavy && avoidIndulgent) && rules.okFor(x, { meal, date }))
        .sort((a, b) => density(b) - density(a))[0];
      if (!c) return false;
      const t = per(c, 1); usedToday.add(c.key); counts.set(c.key, (counts.get(c.key) || 0) + 1); lastUsed.set(c.key, di);
      const it = makeItem(date, meal, c, 1, t, mode); it.why = why; items.push(it); day = add(day, t); return true;
    };
    const lastMeal = toPlan.includes('snacks') ? 'snacks' : toPlan[toPlan.length - 1];
    if (lastMeal) {
      for (let g = 0; g < 3 && day.protein < dayProtMin; g += 1) {
        const withC = dayItems().map((it) => ({ it, c: pool.find((x) => x.key === (it.foodId || `c:${String(it.foodName).toLowerCase()}`)) })).filter((x) => x.c);
        const up = withC.filter((x) => !x.it.fixed && ['lunch', 'dinner'].includes(x.it.mealType) && x.c.role === 'protein' && x.it.servings + 0.5 <= maxServingsOf(x.c, goal * 0.4))
          .sort((a, b) => b.c.per.protein / b.c.per.calories - a.c.per.protein / a.c.per.calories)[0];
        if (up) {
          // at budget already? give up half a portion of a starch first so the bigger protein portion still fits
          let room = goal * 1.04 - day.calories;
          const need = up.c.per.calories * 0.5;
          if (room < need) {
            const carb = withC.filter((x) => x.c.role === 'carb' && x.it.servings > 0.5 && x.it.mealType === up.it.mealType).sort((a, b) => b.it.calories - a.it.calories)[0];
            if (carb) { grow(carb.it, -0.5); room = goal * 1.04 - day.calories; }
          }
          if (room >= need) { grow(up.it, 0.5); up.it.why = `${up.it.why} · bigger portion to reach your protein`; continue; }
        }
        if (!addExtra(['protein', 'dairy', 'snack'], lastMeal, 'Added to reach your protein', 8)) break;
      }
      if (dayFiberGoal && day.fiber < dayFiberGoal * 0.7) addExtra(['fruit', 'veg'], lastMeal, 'Added for fibre');
      if (ranges?.fat && !outFrac && day.fat < ranges.fat.min * 0.85) addExtra(['snack'], 'snacks', 'Healthy fats (nuts and seeds)', 0, (x) => x.per.fat / x.per.calories);
    }
    const lowBar = Math.max(floor, goal * 0.9);
    for (let g = 0; g < 8 && day.calories < lowBar && dayItems().length; g += 1) {
      const room = goal * 1.03 - day.calories;
      const up = dayItems().map((it) => ({ it, c: pool.find((x) => x.key === (it.foodId || `c:${String(it.foodName).toLowerCase()}`)) }))
        .filter((x) => x.c && !x.it.fixed && !x.c.heavy && ['carb', 'protein', 'snack'].includes(x.c.role) && x.c.per.calories * 0.5 <= room && x.it.servings + 0.5 <= maxServingsOf(x.c, goal * 0.4))
        .sort((a, b) => b.c.per.protein / b.c.per.calories - a.c.per.protein / a.c.per.calories)[0];
      if (up) { grow(up.it, 0.5); continue; }
      if (!addExtra(['fruit', 'dairy', 'snack'], lastMeal || 'snacks', 'Added so the day is not below your safe minimum')) break;
    }
    for (let g = 0; g < 8 && day.calories > goal * 1.06; g += 1) {
      const down = dayItems().filter((it) => it.servings > 0.5 && !it.fixed).sort((a, b) => b.calories - a.calories)[0]; if (!down) break;
      grow(down, -0.5);
    }

    // ---- constraint solver: nudge portions (half-servings) so the day lands inside the calorie band and the macro ranges
    if (rules.active) {
      const pool1 = (it) => pool.find((x) => x.key === (it.foodId || `c:${String(it.foodName).toLowerCase()}`));
      const cost = (d) => {
        const kc = Math.max(0, Math.abs(d.calories - (goal * (1 - outFrac) - info.room)) / goal - 0.02);   // within 2% of the target costs nothing
        let j = 4 * kc;
        if (dayProtMin) j += 6 * Math.max(0, dayProtMin * 1.02 - d.protein) / dayProtMin;
        if (ranges) { j += Math.max(0, d.carbohydrates - carbMax) / carbMax + Math.max(0, d.fat - fatMax) / fatMax + Math.max(0, ranges.fat.min * (1 - outFrac) - d.fat) / Math.max(1, ranges.fat.min) + Math.max(0, ranges.carbs.min * (1 - outFrac) - d.carbohydrates) / Math.max(1, ranges.carbs.min); }
        if (dayFiberGoal) j += 0.4 * Math.max(0, dayFiberGoal * 0.8 - d.fiber) / dayFiberGoal;
        if (d.calories < floor * (1 - outFrac)) j += 5;
        return j;
      };
      for (let pass = 0; pass < 30; pass += 1) {
        let best = null; let bestJ = cost(day) - 1e-6;
        for (const it of dayItems()) {
          if (it.fixed) continue; const c = pool1(it); if (!c) continue;
          for (const d of [0.5, -0.5]) {
            const ns = it.servings + d; if (ns < 0.5 || ns > maxServingsOf(c, goal * 0.4) + 1e-9) continue;
            const j = cost(add(day, per(c, d))); if (j < bestJ) { bestJ = j; best = { it, d }; }
          }
        }
        if (!best) break;
        grow(best.it, best.d);
      }
    }

    const t = round(day);
    const status = [];
    const outKcal = goal * outFrac + info.room;                 // the eaten-out meals and the festival room count towards the day
    if (day.calories + outKcal > goal * 1.08) status.push('over budget');
    if (day.calories + outKcal < Math.min(floor, goal) * 0.95) status.push('under the safe minimum');
    if (dayProtMin && day.protein < dayProtMin) status.push('protein below your minimum');
    if (dayFiberGoal && day.fiber < dayFiberGoal * 0.7) status.push('fibre is low');
    const balance = ranges ? {
      protein: day.protein < ranges.protein.min ? 'low' : day.protein > ranges.protein.max ? 'high' : 'ok',
      carbs: day.carbohydrates < ranges.carbs.min ? 'low' : day.carbohydrates > ranges.carbs.max ? 'high' : 'ok',
      fat: day.fat < ranges.fat.min ? 'low' : day.fat > ranges.fat.max ? 'high' : 'ok',
      fiber: day.fiber < ranges.fiber.goal ? 'low' : 'ok',
    } : null;
    const penalties = (balance ? Object.values(balance).filter((x) => x !== 'ok').length * 12 : 0) + (day.calories > goal * 1.06 ? 20 : 0) + (day.calories < goal * 0.88 ? 15 : 0) + (day.sugar > sugarCap + 8 ? 6 : 0) + (day.sodium > sodiumCap + 400 ? 6 : 0);
    const extra = {};
    if (info.out.length) extra.out = info.out.map((m) => ({ meal: m, kind: settings.out.kind, aim: Math.round(goal * (shares[m] || 0)) }));
    if (info.fasted.length) extra.fasted = info.fasted;
    if (info.room) extra.festivalRoom = info.room;
    if (info.vrat) extra.vrat = true;
    if (info.ramadan) extra.ramadan = true;
    if (info.travel) extra.travel = true;
    if (info.out.length) notes.add(`${date}: ${info.out.join(' and ')} ${info.out.length > 1 ? 'are' : 'is'} eaten out, so about ${Math.round(goal * outFrac)} kcal is kept for it.`);
    if (info.room) notes.add(`${date}: about ${info.room} kcal is kept free for the feast, enjoy it.`);
    if (info.vrat) notes.add(`${date}: vrat day, so only vrat-friendly foods are planned.`);
    if (info.ramadan) notes.add(`${date}: Ramadan, so breakfast is your suhoor and dinner is your iftar; lunch is skipped.`);
    if (info.travel) notes.add(`${date}: travel day, so only carry-friendly or no-cook foods are planned.`);
    days.push({ date, target: goal, baseTarget, trim: Math.max(0, baseTarget - goal), totals: t, status, balance, score: Math.max(0, 100 - penalties), ...extra });
  });

  const limitsOut = [...counts.entries()].map(([key, used]) => { const c = pool.find((x) => x.key === key); return c && used ? { foodId: c.id, name: c.name, usedThisWeek: used, weeklyCap: capOf(c), usualQty: c.habit?.usualQty ?? null, maxQty: c.habit?.maxQty ?? null, unit: c.unit, indulgent: c.heavy } : null; })
    .filter(Boolean).sort((a, b) => b.usedThisWeek - a.usedThisWeek).slice(0, 12);
  if (items.some((i) => i.curated)) notes.add('A few healthy foods that are not in your list yet are added to it when you save the plan.');
  return { items, days, notes: [...notes], limits: limitsOut, goal: Math.round(target), pool: pool.length, diet, mode };
}

const WHY = { sweet: 'A small sweet, planned on purpose', protein: 'Protein source', carb: 'Energy from whole grains', veg: 'Vegetables for fibre and vitamins', dairy: 'Calcium and a little protein', fruit: 'Fruit for fibre and vitamins', snack: 'A light, filling snack' };
function makeItem(date, meal, c, servings, t, mode, reasons = []) {
  const h = c.habit;
  const lead = [...reasons].sort((a, b) => a.p - b.p).slice(0, 2).map((r) => r.t).join(' · ');
  const base = h && h.perWeek >= 1 ? `One of your regulars (about ${Math.round(h.perWeek)}×/week) · ${WHY[c.role].toLowerCase()}`
    : h ? `Something you have eaten before · ${WHY[c.role].toLowerCase()}`
      : c.source === 'curated' ? `Healthy pick${c.note ? `: ${c.note}` : ''}` : `${WHY[c.role] || 'A small sweet treat'}`;
  const why = (lead ? `${lead[0].toUpperCase()}${lead.slice(1)} · ${base[0].toLowerCase()}${base.slice(1)}` : base).slice(0, 200);
  return {
    date, mealType: meal, foodId: c.id, foodName: c.name, servings, quantity: r1(c.size * servings), servingUnit: c.unit, calories: Math.round(t.calories), protein: r1(t.protein), fiber: r1(t.fiber),
    carbohydrates: Math.round(t.carbohydrates), fat: Math.round(t.fat), why, role: c.role, weeklyCap: h?.weeklyCap ?? null, curated: c.source === 'curated' && !c.id, familiar: !!h,
  };
}

module.exports = { buildSmartPlan, buildPool, classify, inferDiet, familyOf, MEALS, SHARE };
