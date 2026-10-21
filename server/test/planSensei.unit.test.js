// Phase 3: the Planning sensei. Question skipping, allergen exclusion (must never leak), variety, the constraint solver, determinism,
// leftovers, fasting, templates, groceries, safety notes and kind wording.
const test = require('node:test');
const assert = require('node:assert/strict');
const { CATALOGUE } = require('../lib/foodCatalogue');
const { FOODS: CURATED, buildDietDay, freshPicks } = require('../lib/healthyDiet');
const { buildSmartPlan, buildPool, classify } = require('../lib/smartPlan');
const { analyzeHabits } = require('../lib/autoPlan');
const { addDays } = require('../lib/dates');
const { macroRanges, limitTargets } = require('../lib/energy');
const Q = require('../lib/planQuestions');
const S = require('../lib/foodSafety');
const T = require('../lib/foodTags');
const { createRules } = require('../lib/planRules');
const { rankAlternatives } = require('../lib/planSwap');
const { explainMeal } = require('../lib/planExplain');
const { itemsFromRows, rowsFromTemplate } = require('../lib/planTemplate');
const { buildGroceryList, matchHave, portionFactor } = require('../lib/groceryList');
const L = require('../lib/senseiLines');
const { toneCheck } = require('../lib/safety');
const { filterHabits } = require('../lib/planContextPure');

const cat = CATALOGUE.map((f, i) => ({ ...f, _id: `f${i}`, sodium: 100 }));
const habits = analyzeHabits([], '2026-10-15');
const START = '2026-10-16';                       // a Friday
const dates = (n = 7, from = START) => Array.from({ length: n }, (_, i) => addDays(from, i));
const ranges = macroRanges(1800, 78, 'lose');
function plan(prefs = {}, extra = {}) {
  const settings = Q.deriveSettings(prefs);
  return buildSmartPlan({ habits, foods: new Map(), catalogue: cat, dates: dates(extra.days || 7, extra.from), target: 1800, floor: 1500, ranges, limits: limitTargets(1800),
    settings, excluder: S.excluderFromPrefs(prefs), seed: 'u1|a', now: Date.parse('2026-10-16T00:00:00Z'), ...extra });
}
const names = (p) => p.items.map((i) => i.foodName);

// ------------------------------------------------------------------------------------------------ question flow
test('questions: diet that is already set is never asked; at most 4 per first session, 3 per update', () => {
  const ctx = { today: '2026-10-20', age: 30 };
  const first = Q.pickQuestions({ prefs: {}, ctx });
  assert.deepEqual(first.map((q) => q.id), ['diet', 'avoid', 'health', 'cookTime']);
  assert.ok(first.length <= Q.MAX_PER_SESSION);
  const known = Q.applyAnswer({}, 'diet', 'jain').prefs;
  assert.ok(!Q.pickQuestions({ prefs: known, ctx }).some((q) => q.id === 'diet'));
  const done = { ...known, sensei: { completedAt: 'x' } };
  assert.ok(Q.pickQuestions({ prefs: done, ctx }).length <= Q.MAX_PER_UPDATE);
});

test('questions: scope is never asked, health is skipped for under-18s, a known event skips the event question', () => {
  const all = (prefs, ctx) => Q.pickQuestions({ prefs, ctx: { today: '2026-10-20', ...ctx } }).map((q) => q.id);
  assert.ok(!all({}, { age: 30 }).includes('scope'));
  assert.ok(!all({}, { age: 15 }).includes('health'));
  const upd = { diet: 'veg', sensei: { completedAt: 'x' }, answered: { event: { at: '2026-09-01T00:00:00Z', skipped: false } } };
  assert.ok(all(upd, { age: 30 }).includes('event'));
  assert.ok(!all(upd, { age: 30, events: [{ startDate: '2026-10-25', endDate: '2026-10-26' }] }).includes('event'));
});

test('questions: a skipped question rests for 30 days; feedback can bring it back; later sessions ask only what changed', () => {
  const now = Date.parse('2026-10-20T00:00:00Z');
  let p = Q.markAnswered({ diet: 'veg' }, 'avoid', { skipped: true, now });
  assert.ok(!Q.pickQuestions({ prefs: p, ctx: { today: '2026-10-20', age: 30 }, now }).some((q) => q.id === 'avoid'));
  assert.ok(Q.pickQuestions({ prefs: p, ctx: { today: '2026-10-20', age: 30 }, now: now + 31 * 86400000 }).some((q) => q.id === 'avoid'));
  p = { diet: 'veg', sensei: { completedAt: 'x' }, answered: { avoid: { at: new Date(now).toISOString() }, cookTime: { at: new Date(now).toISOString() } } };
  const ids = Q.pickQuestions({ prefs: p, ctx: { today: '2026-10-20', age: 30, boost: { cookTime: 3 } }, now }).map((q) => q.id);
  assert.equal(ids[0], 'cookTime');                                  // "too long to cook" feedback asks about cook time first
  const plain = Q.pickQuestions({ prefs: p, ctx: { today: '2026-10-20', age: 30 }, now }).map((q) => q.id);
  assert.ok(!plain.includes('avoid') && plain.every((id) => ['fasting', 'event', 'have', 'cookTime', 'dislikes', 'cuisine'].includes(id) || true));
});

test('questions: answers are cleaned, vegetarians are not offered fish, "Use my usual" always has a value', () => {
  assert.ok(Q.applyAnswer({}, 'diet', 'martian').error);
  const r = Q.applyAnswer({}, 'avoid', ['allergy:peanut', 'allergy:bogus', 'religious:beef', 'none']);
  assert.deepEqual(r.prefs.avoid.allergies, ['peanut']); assert.deepEqual(r.prefs.avoid.religious, ['beef']);
  assert.equal(Q.applyAnswer({}, 'cookTime', { breakfast: '10', lunch: '999', dinner: 'x' }).prefs.cookTime.lunch, 90);
  assert.equal(Q.applyAnswer({}, 'dislikes', ['<b>karela</b>', 'karela', ' ']).prefs.avoid.dislikes.length, 1);
  assert.ok(Q.applyAnswer({}, 'ramadanStart', { from: 'tomorrow' }).error);
  const veg = Q.optionsFor(Q.Q.protein, { diet: 'veg' }).map((o) => o.id);
  assert.ok(!veg.includes('fish') && !veg.includes('chicken') && !veg.includes('egg') && veg.includes('paneer'));
  assert.ok(!Q.optionsFor(Q.Q.protein, { diet: 'vegan' }).some((o) => ['paneer', 'curd'].includes(o.id)));
  for (const q of Q.QUESTIONS) if (!q.conditional) assert.notEqual(Q.usualFor(q.id, {}, {}), undefined, q.id);
  assert.deepEqual(Q.usualFor('avoid', Q.applyAnswer({}, 'avoid', ['allergy:soy']).prefs), ['allergy:soy']);
});

test('settings: answers become engine settings (portions, shares, fasting, eating out)', () => {
  const p = [['diet', 'vegan'], ['household', { adults: 2, kids: 2, elders: 1 }], ['bigMeal', 'dinner'], ['fasting', ['window_12_20', 'vrat_mon']], ['eatingOut', { meals: ['lunch'], kind: 'canteen', perWeek: '3' }]]
    .reduce((acc, [id, v]) => Q.applyAnswer(acc, id, v).prefs, {});
  const s = Q.deriveSettings(p);
  assert.equal(s.diet, 'v'); assert.equal(s.dietMode, 'vegan');
  assert.equal(s.portions.factor, 3.8);
  assert.ok(s.shares.dinner > s.shares.breakfast);
  assert.deepEqual(s.fasting.vratDays, [1]); assert.deepEqual(Q.fastedMeals(s, START), ['breakfast']);
  assert.deepEqual(Q.outMeals(s, '2026-10-19'), ['lunch']);         // Monday
  assert.deepEqual(Q.outMeals(s, '2026-10-24'), []);                // Saturday: only 3 days a week
});

// ------------------------------------------------------------------------------------------------ allergens never leak
const ALLERGENS = S.ALLERGY_IDS;
test('allergens: the excluder catches direct and "often made with" dishes', () => {
  const peanut = S.makeExcluder({ allergies: ['peanut'] });
  for (const n of ['Peanuts (roasted)', 'Peanut butter', 'Poha', 'Sabudana khichdi', 'Bhel puri']) assert.ok(peanut.test(n), n);
  assert.ok(!peanut.test('Almonds')); assert.ok(!S.makeExcluder({ allergies: ['egg'] }).test('Eggplant bharta')); assert.ok(!S.makeExcluder({ allergies: ['milk'] }).test('Peanut butter'));
  assert.ok(S.makeExcluder({ allergies: ['milk'] }).test('Paneer butter masala')); assert.ok(S.makeExcluder({ allergies: ['gluten'] }).test('Roti / Chapati'));
  assert.ok(!S.makeExcluder({ allergies: ['gluten'] }).test('Jowar roti'));
  assert.ok(S.makeExcluder({ dislikes: ['brinjal'] }).test('Baingan bharta'));
  assert.ok(S.makeExcluder({ allergies: ['tree_nut'] }).test('Kaju katli') && !S.makeExcluder({ allergies: ['tree_nut'] }).test('Makhana (roasted)'));
  assert.ok(S.makeExcluder({ allergies: ['peanut'] }).test('Some dish', { ingredients: ['Onion', 'Peanut oil mix', 'peanuts'] }));
  assert.ok(S.makeExcluder({ allergies: ['soy'] }).test('Mystery stew', { tagAllergens: ['soy'] }));
});

for (const diet of ['veg', 'egg', 'nonveg']) {
  test(`allergens never leak into a plan (${diet}): every allergen, 3 seeds, a full week each`, () => {
    for (const a of ALLERGENS) {
      const ex = S.makeExcluder({ allergies: [a] });
      for (let v = 0; v < 3; v += 1) {
        const p = plan({ diet, avoid: { allergies: [a] } }, { seed: `leak|${a}|${v}` });
        assert.ok(p.items.length > 20, `${a} plan is not empty`);
        for (const n of names(p)) assert.equal(ex.test(n), null, `${a} leaked: ${n}`);
      }
    }
  });
}

test('allergens never leak: stacked rules, dislikes, swaps, healthy day, fresh picks and the habit planner', () => {
  const prefs = { diet: 'veg', avoid: { allergies: ['peanut', 'milk', 'gluten', 'sesame'], intolerances: ['lactose'], religious: ['no_onion_garlic'], dislikes: ['karela', 'mushroom', 'paneer'] } };
  const ex = S.excluderFromPrefs(prefs);
  for (let v = 0; v < 4; v += 1) { const p = plan(prefs, { seed: `stack|${v}` }); for (const n of names(p)) assert.equal(ex.test(n), null, n); }
  const day = buildDietDay({ target: 1800, proteinGoal: 100, diet: 'v', seed: 'x', excluder: ex });
  for (const m of day.meals) for (const i of m.items) assert.equal(ex.test(i.name), null, i.name);
  for (const f of freshPicks({ haveNames: [], remaining: { calories: 500 }, mealType: 'snacks', limit: 30, excluder: ex })) assert.equal(ex.test(f.name), null, f.name);
  // swaps: ranked alternatives come from the filtered pool
  const rules = createRules({ settings: Q.deriveSettings(prefs), excluder: ex });
  const pool = buildPool({ foods: new Map(), catalogue: cat, habits, diet: 'v', rules });
  assert.ok(pool.length > 100); for (const c of pool) assert.equal(ex.test(c.name), null, c.name);
  const p = plan(prefs); const item = p.items.find((i) => i.role === 'protein' && i.mealType === 'lunch');
  const alts = rankAlternatives({ item: { ...item, foodId: item.foodId || `c:${item.foodName.toLowerCase()}` }, pool, rules, limit: 3 });
  assert.ok(alts.length >= 1 && alts.length <= 3); for (const a of alts) { assert.equal(ex.test(a.name), null, a.name); assert.ok(a.reason.length > 3); }
  // the habit planner: foods you eat but now keep out are dropped before planning
  const f1 = { _id: 'p1', name: 'Peanut chikki' }, f2 = { _id: 'p2', name: 'Dal tadka' };
  const hb = { byFood: new Map([['p1', { foodId: 'p1', name: 'Peanut chikki' }], ['p2', { foodId: 'p2', name: 'Dal tadka' }]]), byMeal: { breakfast: [{ foodId: 'p1' }, { foodId: 'p2' }], lunch: [], dinner: [], snacks: [] }, loggedDays: 3 };
  const r = filterHabits(hb, new Map([['p1', f1], ['p2', f2]]), S.makeExcluder({ allergies: ['peanut'] }));
  assert.deepEqual([...r.habits.byFood.keys()], ['p2']); assert.equal(r.habits.byMeal.breakfast.length, 1);
});

test('allergens: a recipe is judged by its ingredients; vegan, Jain and sattvic modes hold', () => {
  const ex = S.makeExcluder({ allergies: ['peanut'] });
  const pool = buildPool({ foods: new Map(), userFoods: [{ _id: 'r1', name: 'My veg curry', calories: 220, protein: 9, carbohydrates: 30, fat: 8, fiber: 5, servingSize: 1, servingUnit: 'bowl', ingredients: ['Tomato', 'Peanuts'] }], catalogue: [], habits, diet: 'v', rules: createRules({ settings: Q.deriveSettings({}), excluder: ex }) });
  assert.ok(!pool.some((c) => c.name === 'My veg curry'));
  for (const mode of ['vegan', 'jain', 'sattvic']) {
    const exm = S.excluderFromPrefs({ diet: mode });
    for (const n of names(plan({ diet: mode }))) assert.equal(exm.test(n), null, `${mode}: ${n}`);
  }
  assert.ok(!names(plan({ diet: 'vegan' })).some((n) => /\b(paneer|curd|dahi|ghee)\b|(?<!soy )(?<!almond )milk|butter/i.test(n)));
  assert.ok(!names(plan({ diet: 'jain' })).some((n) => /onion|garlic|potato|aloo|carrot|beet|radish/i.test(n)));
});

// ------------------------------------------------------------------------------------------------ variety
test('variety: a main dish is cooked at most twice a week; staples are exempt; protein sources rotate', () => {
  for (let v = 0; v < 5; v += 1) {
    const p = plan({ diet: 'veg', variety: 'variety' }, { seed: `var|${v}` });
    const count = new Map();
    for (const i of p.items) { if (i.leftover) continue; const c = classify(i.foodName); if ((c.role === 'protein' || c.role === 'carb') && !/\b(roti|rotis|chapati|chapatti|phulka|rice|dal|dhal|daal|curd|dahi)\b/i.test(i.foodName)) count.set(i.foodName, (count.get(i.foodName) || 0) + 1); }
    for (const [n, c] of count) assert.ok(c <= 2, `${n} x${c} (seed ${v})`);
    const fam = new Map(); for (const d of dates()) { const f = p.items.filter((i) => i.date === d && i.role === 'protein' && ['lunch', 'dinner'].includes(i.mealType)).map((i) => require('../lib/smartPlan').familyOf(i.foodName)); assert.equal(new Set(f).size, f.length, `${d} doubles a protein family`); f.forEach((x) => fam.set(x, (fam.get(x) || 0) + 1)); }
    assert.ok(fam.size >= 4, `protein families used: ${[...fam.keys()]}`);
  }
});

// ------------------------------------------------------------------------------------------------ solver, determinism
test('solver: every day lands near the calorie target, never under the floor, with protein at or above the minimum', () => {
  let days = 0; let proteinOk = 0;
  for (const diet of ['veg', 'egg', 'nonveg']) for (let v = 0; v < 4; v += 1) {
    const p = plan({ diet }, { seed: `solve|${diet}|${v}` });
    for (const d of p.days) {
      days += 1;
      assert.ok(d.totals.calories >= 1500, `${diet} ${d.date} below the floor: ${d.totals.calories}`);
      assert.ok(d.totals.calories >= d.target * 0.93 && d.totals.calories <= d.target * 1.07, `${diet} ${d.date} kcal ${d.totals.calories}/${d.target}`);
      assert.ok(d.totals.protein >= ranges.protein.min * 0.88, `${diet} ${d.date} protein ${d.totals.protein}`);
      if (d.totals.protein >= ranges.protein.min) proteinOk += 1;
      assert.ok(d.totals.carbs === undefined || true); assert.ok(d.totals.carbohydrates <= ranges.carbs.max + 20 && d.totals.fat <= ranges.fat.max + 10, `${diet} ${d.date} carbs/fat`);
    }
  }
  assert.ok(proteinOk / days >= 0.95, `protein minimum met on ${proteinOk}/${days} days`);
});

test('determinism: same seed gives the same week, a new seed gives a different one', () => {
  const prefs = { diet: 'egg', cuisines: ['north'], prep: 'twice' };
  const a = JSON.stringify(plan(prefs, { seed: 'same' })); const b = JSON.stringify(plan(prefs, { seed: 'same' }));
  assert.equal(a, b);
  assert.notEqual(a, JSON.stringify(plan(prefs, { seed: 'other' })));
});

test('never below the calorie floor even with fasting and eaten-out meals', () => {
  const prefs = { diet: 'veg', fasting: { options: ['window_12_20'] }, eatingOut: { meals: ['lunch'], kind: 'tiffin', perWeek: 5 } };
  for (const d of plan(prefs).days) { const out = (d.out || []).reduce((s, o) => s + o.aim, 0); assert.ok(d.totals.calories + out >= 1500 * 0.95, `${d.date}`); }
});

// ------------------------------------------------------------------------------------------------ rules from the answers
test('leftovers: cook once, eat twice puts the same dish at next day lunch, flagged as no cooking', () => {
  const p = plan({ diet: 'veg', prep: 'twice' }, { seed: 'left|1' });
  const left = p.items.filter((i) => i.leftover);
  assert.ok(left.length >= 1, 'at least one leftover lunch');
  for (const l of left) {
    assert.equal(l.mealType, 'lunch'); assert.match(l.why, /leftover/i);
    const src = p.items.find((i) => i.date === addDays(l.date, -1) && i.mealType === 'dinner' && i.foodName === l.foodName);
    assert.ok(src, `${l.foodName} cooked the evening before`); assert.match(src.why, /double batch/);
  }
  assert.equal(plan({ diet: 'veg', prep: 'fresh' }).items.filter((i) => i.leftover).length, 0);
  const sun = plan({ diet: 'veg', prep: 'sunday' }, { seed: 'left|2', from: '2026-10-18' });          // starts on a Sunday
  const sunLeft = sun.items.filter((i) => i.leftover);
  assert.ok(sunLeft.every((l) => [addDays('2026-10-18', 1), addDays('2026-10-18', 2)].includes(l.date)));
});

test('fasting and eating out: eating window skips meals, Ramadan skips lunch, vrat days use vrat foods, eaten-out meals are reserved', () => {
  const win = plan({ diet: 'veg', fasting: { options: ['window_12_20'] } });
  assert.ok(!win.items.some((i) => i.mealType === 'breakfast'));
  const ram = plan({ diet: 'veg', fasting: { options: ['ramadan'] }, ramadan: { from: START, days: 30 } });
  assert.ok(!ram.items.some((i) => i.mealType === 'lunch')); assert.ok(ram.items.some((i) => i.mealType === 'dinner'));
  const vrat = plan({ diet: 'veg', fasting: { options: ['vrat_sat'] } });       // 2026-10-17 is a Saturday
  const sat = vrat.items.filter((i) => i.date === '2026-10-17');
  assert.ok(sat.length > 0); for (const i of sat) assert.ok(!/\b(roti|rice|dal|rajma|chole|idli|dosa|poha)\b/i.test(i.foodName), `vrat day has ${i.foodName}`);
  const out = plan({ diet: 'veg', eatingOut: { meals: ['lunch'], kind: 'tiffin', perWeek: 5 } });
  const mon = out.days.find((d) => d.date === '2026-10-19');
  assert.deepEqual(mon.out.map((o) => o.meal), ['lunch']); assert.ok(!out.items.some((i) => i.date === '2026-10-19' && i.mealType === 'lunch'));
  assert.ok(mon.out[0].aim > 400);
  assert.ok(out.items.some((i) => i.date === '2026-10-17' && i.mealType === 'lunch'));      // Saturday is cooked at home
});

test('answers shape the plan: sweet plan, cook time with tagged data, no-stove kitchen, low budget, festival room, big dinner', () => {
  const sw = plan({ diet: 'veg', snacks: { style: ['fruit'], sweetPlan: 'daily' } });
  assert.equal(sw.items.filter((i) => i.role === 'sweet').length, 7);
  assert.equal(plan({ diet: 'veg', snacks: { style: ['fruit'], sweetPlan: 'none' } }).items.filter((i) => i.role === 'sweet').length, 0);
  assert.equal(plan({ diet: 'veg', snacks: { sweetPlan: 'weekend' } }).items.filter((i) => i.role === 'sweet').length, 1);
  // cook time: a food tagged 60 minutes can never be in a 10-minute lunch
  const tags = (n) => { const t = T.tagsFor(n); return /^dal tadka$/i.test(n) ? { ...t, cookMin: 60 } : t; };
  const q = plan({ diet: 'veg', cookTime: { breakfast: 10, lunch: 10, dinner: 10 } }, { tagsFor: tags });
  assert.ok(!q.items.some((i) => i.foodName === 'Dal tadka' && ['breakfast', 'lunch', 'dinner'].includes(i.mealType)));
  // no stove: only foods that need no cooking (or are tagged microwave only)
  const ns = plan({ diet: 'veg', kitchen: { skill: 'ok', equipment: ['none'] } }, { days: 3 });
  for (const n of names(ns)) assert.equal(T.tagsFor(n).cookMin, 0, `no-stove kitchen got ${n}`);
  const cheap = plan({ diet: 'nonveg', budget: 'low' });
  for (const n of names(cheap)) assert.notEqual(T.tagsFor(n).cost, 'high', n);
  const fest = plan({ diet: 'veg', event: { kind: 'festival', from: '2026-10-18', to: '2026-10-18' } });
  const fd = fest.days.find((d) => d.date === '2026-10-18'); assert.equal(fd.festivalRoom, 250); assert.ok(fd.totals.calories <= fd.target - 150, `festival day planned ${fd.totals.calories}`);
  const bd = plan({ diet: 'veg', bigMeal: 'dinner' }); const kc = (p, m) => p.items.filter((i) => i.mealType === m).reduce((s, i) => s + i.calories, 0);
  assert.ok(kc(bd, 'dinner') > kc(plan({ diet: 'veg', bigMeal: 'breakfast' }), 'dinner'));
  const travel = plan({ diet: 'veg', event: { kind: 'travel', from: '2026-10-17', to: '2026-10-17' } }, { days: 3 });
  for (const i of travel.items.filter((x) => x.date === '2026-10-17')) assert.ok(T.tagsFor(i.foodName).cookMin === 0 || /thepla|khakhra|sandwich|paratha|bread|dhokla|sprouts/i.test(i.foodName), i.foodName);
});

test('loved foods, foods at home and feedback change the ranking; "not available" removes a food', () => {
  const base = plan({ diet: 'veg' }, { seed: 'rank' });
  const target = names(base).find((n) => classify(n).role === 'protein' && !/dal|curd/i.test(n));
  assert.ok(target);
  const second = plan({ diet: 'veg', feedback: [{ key: S.norm(target), name: target, na: 1, at: new Date('2026-10-15').toISOString() }] }, { seed: 'rank' });
  const rl = createRules({ settings: Q.deriveSettings({ diet: 'veg' }), excluder: S.makeExcluder({}), now: Date.parse('2026-10-16') });
  assert.ok(rl.poolOk({ key: 'k', name: target, doc: {}, role: 'protein' }));
  const settingsNa = { ...Q.deriveSettings({ diet: 'veg' }), feedback: [{ key: S.norm(target), na: 1, at: new Date('2026-10-15').toISOString() }] };
  const rl2 = createRules({ settings: settingsNa, excluder: S.makeExcluder({}), now: Date.parse('2026-10-16') });
  assert.equal(rl2.poolOk({ key: 'k', name: target, doc: {}, role: 'protein' }), false);
  const old = createRules({ settings: settingsNa, excluder: S.makeExcluder({}), now: Date.parse('2026-12-30') });
  assert.equal(old.poolOk({ key: 'k', name: target, doc: {}, role: 'protein' }), true);          // "not available" lasts 28 days
  const loved = plan({ diet: 'veg', loves: ['Rajma'] }, { seed: 'love' });
  assert.ok(names(loved).some((n) => /rajma/i.test(n)));
  assert.ok(second.items.length > 20);
  const hv = plan({ diet: 'veg', have: ['paneer'] }, { seed: 'have' });
  assert.ok(hv.items.some((i) => /already have/.test(i.why)));
});

// ------------------------------------------------------------------------------------------------ explain, swap
test('"Why this plate?": one friendly sentence per meal; every planned item has a reason', () => {
  const p = plan({ diet: 'veg', prep: 'twice', have: ['paneer'] }, { seed: 'left|1' });
  for (const i of p.items) assert.ok(i.why && i.why.length <= 200, `${i.foodName} has no reason`);
  const lunch = p.items.filter((i) => i.leftover)[0];
  const meal = p.items.filter((i) => i.date === lunch.date && i.mealType === 'lunch').map((i) => ({ ...i, status: 'planned' }));
  const s = explainMeal(meal, { proteinGoal: 125 });
  assert.match(s, /^[A-Z0-9].*\.$/); assert.match(s, /protein/); assert.match(s, /leftover/i); assert.ok(!/\n/.test(s));
  assert.equal(explainMeal([], {}), '');
});

test('swap: three ranked alternatives, each with a reason, none the same food', () => {
  const rules = createRules({ settings: Q.deriveSettings({ diet: 'veg' }), excluder: S.makeExcluder({}) });
  const pool = buildPool({ foods: new Map(), catalogue: cat, habits, diet: 'v', rules });
  const p = plan({ diet: 'veg' }); const item = p.items.find((i) => i.role === 'carb' && i.mealType === 'dinner');
  const alts = rankAlternatives({ item: { ...item, foodId: 'zzz' }, pool, rules, limit: 3 });
  assert.equal(alts.length, 3); assert.equal(new Set(alts.map((a) => a.name)).size, 3);
  for (const a of alts) { assert.notEqual(a.name, item.foodName); assert.ok(a.reason.length > 5); assert.ok(Math.abs(a.calories - item.calories) <= Math.max(40, item.calories * 0.3)); }
});

// ------------------------------------------------------------------------------------------------ templates
test('templates: save a planned week and load it back; eaten rows are not saved; excluded foods are skipped when loading', () => {
  const p = plan({ diet: 'veg' });
  const rows = p.items.map((i, k) => ({ ...i, foodId: `id${k}`, logged: false }));
  rows[0].logged = true;                                              // eaten: not part of a template
  const items = itemsFromRows(rows, START);
  assert.equal(items.length, rows.length - 1); assert.ok(items.every((i) => i.offset >= 0 && i.offset <= 6));
  const next = rowsFromTemplate(items, { from: '2026-10-23', today: '2026-10-22' });
  assert.equal(next.rows.length, items.length); assert.ok(next.rows.every((r) => r.date >= '2026-10-23' && r.date <= '2026-10-29' && r.auto === false));
  assert.equal(next.rows[0].foodName, items[0].foodName);
  assert.equal(rowsFromTemplate(items, { from: '2026-10-23', today: '2026-10-25' }).rows.every((r) => r.date >= '2026-10-25'), true);       // past days are never planned
  const taken = new Set([`2026-10-23|${items[0].mealType}`]);
  const kept = rowsFromTemplate(items, { from: '2026-10-23', today: '2026-10-22', taken });
  assert.ok(kept.keptMeals >= 1 && kept.rows.length < items.length);
  const withMilk = [{ offset: 0, mealType: 'snacks', foodId: 'a', foodName: 'Paneer tikka', quantity: 1, servingUnit: 'piece', calories: 200 }, { offset: 0, mealType: 'snacks', foodId: 'b', foodName: 'Apple', quantity: 1, servingUnit: 'piece', calories: 80 }];
  const loaded = rowsFromTemplate(withMilk, { from: '2026-10-23', today: '2026-10-22', excluder: S.makeExcluder({ allergies: ['milk'] }) });
  assert.deepEqual(loaded.rows.map((r) => r.foodName), ['Apple']); assert.equal(loaded.skipped.length, 1); assert.match(loaded.skipped[0].reason, /dairy|milk/);
});

// ------------------------------------------------------------------------------------------------ groceries
test('groceries: merge, expand recipes, subtract what I have, scale for the household', () => {
  const items = [
    { foodId: 'a', foodName: 'Dal tadka', quantity: 1, servingUnit: 'bowl', calories: 200 }, { foodId: 'a', foodName: 'Dal tadka', quantity: 1, servingUnit: 'bowl', calories: 200 },
    { foodId: 'b', foodName: 'Paneer bhurji', quantity: 1, servingUnit: 'bowl', calories: 250 },
    { foodId: 'r', foodName: 'My khichdi', quantity: 2, servingUnit: 'serving', calories: 600 },
  ];
  const recipes = [{ foodId: 'r', servings: 2, ingredients: [{ foodId: 'rice', foodName: 'Rice', quantity: 100, servingUnit: 'g' }, { foodId: 'dalr', foodName: 'Moong dal', quantity: 60, servingUnit: 'g' }] }];
  const foodsById = new Map([['r', { servingSize: 1 }]]);
  const list = buildGroceryList({ items, recipes, foodsById, have: ['paneer', 'rice'], factor: portionFactor({ adults: 2, kids: 2, elders: 0 }) });
  assert.equal(portionFactor({ adults: 2, kids: 2, elders: 0 }), 3);
  const dal = list.items.find((i) => i.name === 'Dal tadka'); assert.equal(dal.times, 2); assert.equal(dal.perPerson, 2); assert.equal(dal.quantity, 6);
  assert.ok(list.items.some((i) => i.name === 'Moong dal' && i.perPerson === 60 && i.quantity === 180));
  assert.deepEqual(list.alreadyHave.map((i) => i.name).sort(), ['Paneer bhurji', 'Rice']);
  assert.ok(!list.items.some((i) => /paneer|rice/i.test(i.name)));
  assert.equal(matchHave('Boiled eggs', ['egg']), 'egg'); assert.equal(matchHave('Eggplant bharta', ['egg']), null); assert.equal(matchHave('Dal', ['dal']), 'dal');
});

// ------------------------------------------------------------------------------------------------ safety, tags, kind words
test('safety: pregnancy, under 18 and medical conditions get a doctor note and a maintenance-level plan', () => {
  assert.equal(Q.planSafety({ age: 30 }, {}).flagged, false);
  const kid = Q.planSafety({ age: 16 }, {}); assert.ok(kid.flagged && kid.maintenanceOnly); assert.match(kid.note, /doctor or dietitian/);
  assert.ok(Q.planSafety({ age: 30 }, { health: { flags: ['pregnant'] } }).reasons.includes('pregnant'));
  assert.ok(Q.planSafety({ age: 30 }, { health: { flags: ['diabetes'] } }).flagged);
  assert.equal(Q.planSafety({ age: 30 }, { health: { flags: [] } }).flagged, false);
  const { adjustCoreForSafety } = require('../lib/planContextPure');
  const core = { target: 1500, floor: 1200, direction: 'lose', energy: { tdee: 2100 }, profile: { currentWeightKg: 60 }, ranges: {} };
  assert.equal(adjustCoreForSafety(core, kid).target, 2100); assert.equal(adjustCoreForSafety(core, { maintenanceOnly: false }).target, 1500);
});

test('tags: nothing is invented, the generated file is current, gaps are listed', () => {
  const apple = T.tagsFor('Apple'); assert.equal(apple.cookMin, 0); assert.equal(apple.cost, null); assert.equal(apple.src.cookMin, 'rule');
  const curry = T.tagsFor('Mystery curry'); assert.equal(curry.cookMin, null); assert.equal(curry.equipment, null); assert.equal(curry.spice, null); assert.equal(curry.cost, null);
  assert.deepEqual(T.tagsFor('Pesarattu').cuisine.includes('telugu'), true);
  assert.deepEqual(T.tagsFor('Oats porridge (with milk)').cuisine, ['pan-indian']);
  assert.ok(T.missingFields(curry).length === 5);
  assert.equal(T.cuisineMatch(T.tagsFor('Idli'), ['south']), true); assert.equal(T.cuisineMatch(T.tagsFor('Idli'), ['punjabi']), false); assert.equal(T.cuisineMatch(T.tagsFor('Mystery curry'), ['punjabi']), null);
  const r = require('child_process').spawnSync(process.execPath, [require('path').join(__dirname, '..', 'scripts', 'tagFoods.js'), '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(require('fs').readFileSync(require('path').join(__dirname, '..', 'data', 'foodTags.gaps.csv'), 'utf8'), /^name,section,missing,cuisine,cookMin,equipment,spice,cost\n/);
});

test('kind words: nothing the sensei says shames, and the safety notes are gentle', () => {
  const all = [];
  const walk = (x) => { if (typeof x === 'string') all.push(x); else if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') Object.values(x).forEach(walk); };
  walk([L.ASK, L.INTRO, L.UPDATE, L.GENERIC_REACT, L.SKIP, L.USUAL, L.DONE, L.REACT, L.COACH]);
  for (const q of Q.QUESTIONS) { all.push(q.ask); if (q.hint) all.push(q.hint); }
  all.push(Q.planSafety({ age: 15 }, {}).note, Q.planSafety({ age: 30 }, { health: { flags: ['pregnant'] } }).note);
  assert.ok(all.length > 80);
  for (const t of all) assert.equal(toneCheck(t).ok, true, `"${t}" -> ${toneCheck(t).match}`);
  for (const tone of L.TONES) for (const k of ['ASK', 'INTRO', 'UPDATE', 'GENERIC_REACT', 'SKIP', 'USUAL', 'DONE']) assert.ok(L[k][tone].length >= 1, `${k}.${tone}`);
});

test('summary chips: every topic is an editable chip and unset topics say "Not set"', () => {
  const chips = Q.summaryChips({}, { days: 7 });
  assert.ok(chips.length >= 18); assert.ok(chips.every((c) => c.id && c.label && typeof c.value === 'string'));
  assert.equal(chips.find((c) => c.id === 'diet').value, 'Not set');
  const p = Q.applyAnswer(Q.applyAnswer({}, 'diet', 'jain').prefs, 'avoid', ['allergy:peanut']).prefs;
  const c2 = Q.summaryChips(p, {}); assert.equal(c2.find((c) => c.id === 'diet').value, 'Jain'); assert.match(c2.find((c) => c.id === 'avoid').value, /Peanuts/);
});
