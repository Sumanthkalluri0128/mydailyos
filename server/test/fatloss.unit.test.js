const test = require('node:test');
const assert = require('node:assert/strict');
const { smoothTrend, corridorAt, corridorStatus, buildTrend, maxSafeWeeklyLossKg, trendRate } = require('../lib/trendWeight');
const { gradeCalories, dayScore, weeklyScore, weekUsage } = require('../lib/fatLossScore');
const { overStatus, spreadCorrection, rootCauses, localHour } = require('../lib/overDays');
const { buildMeals, lightOptions, makeItFit, rescueDay, macroCaps } = require('../lib/mealBuilder');
const { previewFit } = require('../lib/fitCheck');
const { buildOutcomeBadges, weeklyFlags, cumulativeDeficit } = require('../lib/outcomes');
const { safetyReport, toneCheck } = require('../lib/safety');
const { derivePlan, rewardLadder, breakAdvice, eventAdvice, pickFocus } = require('../lib/northStar');
const { whatIf } = require('../lib/whatIf');
const { buildPatterns } = require('../lib/patterns');
const { navyBodyFat } = require('../lib/bodyFat');
const { oilKcal, recipeOilTsp } = require('../lib/oil');
const { computeStreaks, weeklyStreak } = require('../lib/streaks');
const { suggestFoods } = require('../lib/suggest');
const { addDays } = require('../lib/dates');

const day = (i, over = {}) => ({ date: addDays('2026-10-01', i), calories: 1800, protein: 120, steps: 9000, waterMl: 3000, ...over });
const run = (n, f = () => ({})) => Array.from({ length: n }, (_, i) => day(i, f(i)));

// ------------------------------------------------------------------ trend weight
test('trend weight smooths a noisy scale and ignores a one-day spike', () => {
  const pts = [80, 79.8, 79.9, 79.7, 81.5, 79.6, 79.5].map((w, i) => ({ date: addDays('2026-10-01', i), weightKg: w }));
  const s = smoothTrend(pts);
  assert.equal(s.length, 7);
  assert.ok(s[4].trendKg < 80.3, 'a +1.8 kg water spike barely moves the trend');
  assert.ok(s[6].trendKg < s[0].trendKg, 'but the real downward drift shows');
});

test('corridor follows the plan pace, stops at the goal, and classifies the trend', () => {
  const plan = { startKg: 80, targetKg: 74, startDate: '2026-10-01', paceKgPerWeek: 0.5 };
  assert.equal(corridorAt(plan, '2026-10-01').expected, 80);
  assert.equal(corridorAt(plan, '2026-10-15').expected, 79);
  assert.equal(corridorAt(plan, '2027-06-01').expected, 74, 'never expects you below the goal');
  const c = corridorAt(plan, '2026-10-15');
  assert.equal(corridorStatus(79.2, c), 'inside');
  assert.equal(corridorStatus(77, c), 'ahead');
  assert.equal(corridorStatus(81, c), 'behind');
});

test('"inside the corridor this week" is rewarded only with enough weigh-ins', () => {
  const plan = { startKg: 80, targetKg: 74, startDate: '2026-10-01', paceKgPerWeek: 0.5 };
  const w = [0, 3, 6, 9, 12, 14].map((i) => ({ date: addDays('2026-10-01', i), weightKg: 80 - i * 0.07 }));
  const t = buildTrend({ weights: w, plan, today: '2026-10-15' });
  assert.equal(t.week.rewarded, true);
  assert.equal(t.current.status, 'inside');
  const one = buildTrend({ weights: [w[5]], plan, today: '2026-10-15' });
  assert.equal(one.week.rewarded, false, 'a single weigh-in is not enough');
  assert.equal(trendRate(smoothTrend(w), '2026-10-15') < 0, true);
});

test('safe pace is about 1% of body weight a week and never above 1 kg', () => {
  assert.equal(maxSafeWeeklyLossKg(80), 0.8);
  assert.equal(maxSafeWeeklyLossKg(150), 1);
});

// ------------------------------------------------------------------ graded score
test('calorie grading is graded, not pass/fail, and never rewards crash intake', () => {
  assert.equal(gradeCalories(1800, 1800), 1);
  assert.ok(gradeCalories(2100, 1800) < 1 && gradeCalories(2100, 1800) > 0.6);
  assert.ok(gradeCalories(3200, 1800) >= 0.15, 'an over day keeps partial credit');
  assert.ok(gradeCalories(900, 1800) <= 0.2, 'very low intake is not rewarded');
  assert.equal(gradeCalories(0, 1800), null);
});

test('one heavy day is absorbed by the weekly budget', () => {
  const t = { calories: 1800, direction: 'lose', protein: 120, steps: 10000, waterMl: 3000 };
  const days = run(7, (i) => (i === 5 ? { calories: 2700 } : { calories: 1700 })); // 2026-10-06 is heavy; the week runs Mon 5 – Sun 11
  const wk = weeklyScore(days, t, '2026-10-07');
  const heavy = wk.days.find((d) => d.date === '2026-10-06').score;
  assert.ok(heavy < wk.score, 'that day scores lower than the week');
  assert.ok(wk.score >= 80, `week score ${wk.score} stays high`);
  assert.equal(wk.budget.absorbed, true);
  assert.equal(dayScore(day(0, { calories: 0, waterMl: 0, steps: 0 }), t), null, 'an empty day is no data, not zero');
});

test('week usage counts unlogged past days at the target', () => {
  const days = [{ date: '2026-10-12', calories: 1000 }];
  const u = weekUsage(days, 1800, '2026-10-15'); // Mon 12 .. Wed 14 before Thu 15
  assert.equal(u.usedBeforeToday, 1000 + 1800 + 1800);
  assert.equal(u.daysLeft, 4);
});

// ------------------------------------------------------------------ over days
test('one over day gets a gentle note, not a plan', () => {
  const days = run(7, (i) => (i === 6 ? { calories: 2300 } : {}));
  const s = overStatus({ days, target: 1800, today: '2026-10-07' });
  assert.equal(s.tier, 'single');
  assert.equal(toneCheck(s.message).ok, true);
});

test('2–3 over days in a row trigger the course-correct tier; unlogged days break the run', () => {
  const days = run(7, (i) => (i >= 4 ? { calories: 2300 } : {}));
  assert.equal(overStatus({ days, target: 1800, today: '2026-10-07' }).tier, 'streak');
  const gap = run(7, (i) => (i === 4 ? { calories: 0 } : i >= 5 ? { calories: 2300 } : {}));
  assert.equal(overStatus({ days: gap, target: 1800, today: '2026-10-07' }).runDays, 2);
});

test('a half-logged today is not "over"; the run is counted from yesterday', () => {
  const days = run(7, (i) => (i === 6 ? { calories: 400 } : i >= 4 ? { calories: 2300 } : {}));
  assert.equal(overStatus({ days, target: 1800, today: '2026-10-07' }).runDays, 2);
});

test('a week over on average becomes a root-cause review', () => {
  const days = run(7, () => ({ calories: 2100 }));
  assert.equal(overStatus({ days, target: 1800, today: '2026-10-07', weightTrendPerWeek: 0.3 }).tier, 'week');
});

test('"always over but weight not rising" points at the target or the log, not the person', () => {
  const days = run(7, () => ({ calories: 2100 }));
  const s = overStatus({ days, target: 1800, today: '2026-10-07', weightTrendPerWeek: -0.1 });
  assert.equal(s.cause, 'target_or_log');
});

test('an aggressive pace with persistent overs offers an easier pace instead of guilt', () => {
  const days = run(7, () => ({ calories: 2100 }));
  const s = overStatus({ days, target: 1800, today: '2026-10-07', paceKg: 0.75, weightTrendPerWeek: 0.2 });
  assert.equal(s.cause, 'pace_too_aggressive');
  assert.equal(s.easierPace, 0.5);
  assert.equal(toneCheck(s.message).ok, true);
});

test('the correction is spread over 3–4 days, 150–250 kcal, and never below the floor', () => {
  const c = spreadCorrection({ overKcal: 900, target: 1800, floor: 1200 });
  assert.ok(c.perDay >= 150 && c.perDay <= 250);
  assert.ok(c.days >= 3 && c.days <= 4);
  assert.ok(c.newTarget >= 1200);
  const tight = spreadCorrection({ overKcal: 900, target: 1250, floor: 1200 });
  assert.equal(tight.perDay, 0, 'near the floor: no cut at all');
  assert.equal(tight.safe, false);
  assert.equal(spreadCorrection({ overKcal: 900, target: 1800, floor: 1200, avgIntake7: 1220 }).perDay, 0, 'already eating very little: no cut');
  assert.equal(spreadCorrection({ overKcal: 0, target: 1800 }), null);
  assert.equal(toneCheck(c.note).ok, true);
});

test('root causes find late snacks, repeat foods and trigger tags on over days', () => {
  const days = run(10, (i) => (i % 2 === 0 ? { calories: 2400 } : { calories: 1700 }));
  const rows = [];
  for (const d of days) {
    const over = d.calories > 1800 * 1.08;
    rows.push({ date: d.date, mealType: 'dinner', foodName: 'Rice bowl', calories: 600, createdAt: `${d.date}T14:00:00Z`, trigger: '' });
    if (over) rows.push({ date: d.date, mealType: 'snacks', foodName: 'Namkeen', calories: 450, createdAt: `${d.date}T14:30:00Z`, trigger: 'stress' });
  }
  // 14:30 UTC with IST (-330) is 20:00 local, i.e. after 6 pm
  const r = rootCauses({ rows, days, target: 1800, tzOffsetMin: -330 });
  assert.equal(r.enough, true);
  const ids = r.findings.map((f) => f.id);
  assert.ok(ids.includes('late-snacks'));
  assert.ok(ids.includes('trigger'));
  assert.match(r.findings.find((f) => f.id === 'late-snacks').title, /5 of 5 over days had 400\+ kcal of snacks after 6 pm/);
  assert.equal(localHour('2026-10-01T14:30:00Z', -330), 20);
  for (const f of r.findings) assert.equal(toneCheck(f.title + ' ' + f.detail).ok, true, f.id);
});

test('not enough over days: no findings are invented', () => {
  const days = run(10);
  assert.equal(rootCauses({ rows: [], days, target: 1800 }).enough, false);
});

// ------------------------------------------------------------------ suggestions
const F = (name, calories, protein, carbohydrates, fat, fiber, id) => ({ _id: id, name, calories, protein, carbohydrates, fat, fiber, servingSize: 1, servingUnit: 'serving' });
const FOODS = [F('Roti', 90, 3, 18, 1, 2, '1'), F('Plain rice', 130, 3, 28, 0, 0, '2'), F('Dal tadka', 150, 8, 18, 5, 4, '3'), F('Paneer bhurji', 220, 14, 5, 16, 1, '4'), F('Mixed veg sabzi', 90, 3, 10, 4, 4, '5'), F('Buttermilk (chaas)', 40, 2, 3, 1, 0, '6'), F('Butter chicken', 350, 22, 10, 24, 1, '7'), F('Clear veg soup', 30, 1, 5, 0, 1, '8')];

test('the old gap is closed: when almost nothing is left we still help (and old single-food suggestions stay empty)', () => {
  assert.deepEqual(suggestFoods(FOODS, { calories: 20, protein: 30, fiber: 10 }), []);
  const light = lightOptions(FOODS);
  assert.ok(light.length >= 3);
  assert.ok(light.every((l) => l.kcal <= 45));
  assert.ok(light.some((l) => l.food), 'at least one is loggable from the catalogue');
});

test('whole meals fit the remaining kcal and honour the carb and fat caps', () => {
  const caps = macroCaps({ ranges: { carbs: { max: 90 }, fat: { max: 30 }, protein: { goal: 120 }, fiber: { goal: 25 } }, eaten: { carbohydrates: 0, fat: 0, protein: 60, fiber: 10 } });
  assert.deepEqual([caps.carbs, caps.fat, caps.protein, caps.fiber], [90, 30, 60, 15]);
  const meals = buildMeals(FOODS, { calories: 600, protein: 35 }, { caps });
  assert.ok(meals.length >= 1);
  for (const m of meals) {
    assert.ok(m.totals.calories <= 600);
    assert.ok(m.totals.carbohydrates <= 95 && m.totals.fat <= 33);
    assert.ok(m.items.length >= 2);
  }
  assert.ok(!meals.some((m) => m.items.some((i) => /butter chicken/i.test(i.food.name))), 'heavy dishes are not suggested as a fit');
  assert.deepEqual(buildMeals(FOODS, { calories: 120, protein: 10 }), [], 'too little left for a plate');
});

test('"make it fit" shows the kcal saved by swapping or halving what is already logged', () => {
  const opts = makeItFit([{ _id: 'a', foodName: 'Butter chicken (1 bowl)', nutritionTotal: { calories: 350 } }, { _id: 'b', foodName: 'Boiled egg', nutritionTotal: { calories: 70 } }], 200);
  assert.ok(opts.length >= 2);
  assert.equal(opts[0].kind, 'swap');
  assert.ok(opts[0].saves > 0 && opts[0].afterOver === Math.max(0, 200 - opts[0].saves));
  assert.ok(!opts.some((o) => o.logId === 'b'), 'small items are left alone');
});

test('"will this fit?" reports today and the week, and explains a heavy day kindly', () => {
  const fits = previewFit({ add: { calories: 300, protein: 10 }, today: { eaten: 800, budget: 1800, protein: 40, proteinTarget: 120 }, week: { budget: 12600, usedBeforeToday: 3600, daysLeft: 5 } });
  assert.equal(fits.status, 'fits');
  const over = previewFit({ add: { calories: 900, protein: 30 }, today: { eaten: 1300, budget: 1800, protein: 40, proteinTarget: 120 }, week: { budget: 12600, usedBeforeToday: 3600, daysLeft: 5 } });
  assert.equal(over.status, 'over');
  assert.equal(over.week.absorbed, true);
  assert.equal(toneCheck(over.message).ok, true);
});

test('a rescue day is gentle: below the target but never below the floor', () => {
  const ranges = { protein: { goal: 100 }, carbs: { max: 220 }, fat: { max: 70 }, fiber: { goal: 25 } };
  const d = rescueDay({ foods: FOODS, target: 1800, floor: 1200, ranges });
  assert.equal(d.goal, 1600);
  assert.ok(d.plan.length >= 2 && d.totalCalories <= 1600);
  assert.equal(rescueDay({ foods: FOODS, target: 1250, floor: 1200, ranges }).goal, 1200);
});

// ------------------------------------------------------------------ outcomes, safety, plan
test('outcome badges are tiered and celebrate body change', () => {
  const o = buildOutcomeBadges({ direction: 'lose', startKg: 80, trendKg: 74.6, startWaistCm: 92, waistCm: 86, deficitKcal: 25000, proteinWeeks: 4, muscleWeeks: 1, comebacks: 1 });
  const by = Object.fromEntries(o.badges.map((b) => [b.id, b]));
  assert.equal(by['fat-kg'].tier, 'silver');
  assert.equal(by['fat-pct'].tier, 'silver');
  assert.equal(by.waist.tier, 'silver');
  assert.equal(by['protein-week'].tier, 'silver');
  assert.equal(by.muscle.tier, 'bronze');
  assert.equal(by.comeback.tier, 'bronze');
  assert.ok(by.deficit.value >= 3);
  assert.ok(by['fat-kg'].progress > 0 && by['fat-kg'].nextAt === 10);
  const gain = buildOutcomeBadges({ direction: 'gain', startKg: 60, trendKg: 62, proteinWeeks: 1 });
  assert.ok(!gain.badges.some((b) => b.id === 'fat-kg'), 'weight-loss badges are not shown for a gain goal');
});

test('protein weeks and muscle protection need the protein AND the strength sessions', () => {
  const days = Array.from({ length: 21 }, (_, i) => ({ date: addDays('2026-09-14', i), calories: 1800, protein: 115 }));
  const strength = new Set(['2026-09-15', '2026-09-17', '2026-09-22', '2026-09-24', '2026-09-29']);
  const f = weeklyFlags(days, strength, 120, '2026-10-05');
  assert.equal(f.proteinWeeks, 3);
  assert.equal(f.muscleWeeks, 2, 'only the two weeks with 2+ strength days count');
});

test('the deficit counter ignores crash-low days', () => {
  assert.equal(cumulativeDeficit([{ calories: 1500 }, { calories: 600 }, { calories: 0 }], 2200, 1200), 700 + 1000);
});

test('safety layer: underweight, rapid loss, very low intake, and hide-numbers are reported', () => {
  const under = safetyReport({ profile: { currentWeightKg: 48, heightCm: 170, goals: { targetWeightKg: 45 } } });
  assert.equal(under.level, 'alert');
  assert.equal(under.pauseWeightRewards, true);
  const rapid = safetyReport({ profile: { currentWeightKg: 80, heightCm: 175, goals: { targetWeightKg: 70, weeklyPaceKg: 0.5 } }, trendRate: -1.4 });
  assert.ok(rapid.flags.some((f) => f.id === 'rapid-loss'));
  const low = safetyReport({ profile: { currentWeightKg: 80, heightCm: 175, sex: 'female', goals: { targetWeightKg: 70 } }, avgIntake7: 900, loggedDays7: 6 });
  assert.ok(low.flags.some((f) => f.id === 'low-intake'));
  assert.equal(safetyReport({ profile: { currentWeightKg: 80, heightCm: 175, goals: { targetWeightKg: 76 }, safety: { hideNumbers: true } } }).hideNumbers, true);
  for (const f of [...under.flags, ...rapid.flags, ...low.flags]) assert.equal(toneCheck(f.title + ' ' + f.detail).ok, true, f.id);
});

test('tone check flags shaming language', () => {
  assert.equal(toneCheck('You blew it today, burn it off tomorrow').ok, false);
  assert.equal(toneCheck('Burn that off with a long run').ok, false);
  assert.equal(toneCheck('A little over today is completely normal').ok, true);
});

test('the north-star plan derives a safe pace and refuses unhealthy goals', () => {
  const ok = derivePlan({ currentKg: 80, targetKg: 74, byDate: '2027-03-15', today: '2026-10-17', heightCm: 172 });
  assert.equal(ok.feasible, true);
  assert.ok(ok.paceKg >= 0.25 && ok.paceKg <= 0.8);
  assert.equal(ok.focus.length, 3);
  const rushed = derivePlan({ currentKg: 80, targetKg: 74, byDate: '2026-11-17', today: '2026-10-17', heightCm: 172 });
  assert.equal(rushed.feasible, false);
  assert.ok(rushed.paceKg <= rushed.capKg);
  assert.ok(rushed.suggestedDate > '2026-11-17');
  const unhealthy = derivePlan({ currentKg: 60, targetKg: 50, byDate: '2027-03-15', today: '2026-10-17', heightCm: 172 });
  assert.equal(unhealthy.ok, false);
  assert.ok(unhealthy.minTargetKg >= 54);
});

test('focus habits go to the weakest areas', () => {
  assert.deepEqual(pickFocus({ logging: 0.9, protein: 0.2, steps: 0.3, water: 0.4, sleep: 0.95, strength: 0.1 }), ['strength', 'protein', 'steps']);
});

test('reward ladder: the person\'s own rewards unlock as weight is lost', () => {
  const l = rewardLadder([{ id: 'a', atKg: 5, text: 'Trip' }, { id: 'b', atKg: 3, text: 'New shoes' }], 3.4);
  assert.equal(l[0].text, 'New shoes');
  assert.equal(l[0].reached, true);
  assert.equal(l[1].reached, false);
  assert.equal(l[1].remainingKg, 1.6);
});

test('maintenance break is suggested after 8–12 weeks, never pushed during a break', () => {
  assert.equal(breakAdvice({ weeksSince: 5 }).state, 'none');
  assert.equal(breakAdvice({ weeksSince: 9 }).state, 'soon');
  assert.equal(breakAdvice({ weeksSince: 13 }).state, 'due');
  assert.equal(breakAdvice({ weeksSince: 13, onBreak: true }).state, 'on-break');
});

test('event mode banks a little before, relaxes during, recovers gently after, never below the floor', () => {
  const ev = [{ title: 'Diwali', startDate: '2026-10-20', endDate: '2026-10-22' }];
  assert.equal(eventAdvice(ev, '2026-10-18', 1800).phase, 'before');
  assert.equal(eventAdvice(ev, '2026-10-18', 1800).adjust, -150);
  assert.equal(eventAdvice(ev, '2026-10-21', 1800).phase, 'during');
  assert.equal(eventAdvice(ev, '2026-10-21', 1800).adjust, 0);
  const after = eventAdvice(ev, '2026-10-24', 1800);
  assert.equal(after.phase, 'after');
  assert.ok(after.adjust >= -200);
  assert.equal(eventAdvice(ev, '2026-10-24', 1250, 1200).adjust, -50, 'limited by the floor');
  assert.equal(eventAdvice(ev, '2026-11-30', 1800).phase, 'none');
  for (const d of ['2026-10-18', '2026-10-21', '2026-10-24']) assert.equal(toneCheck(eventAdvice(ev, d, 1800).message).ok, true);
});

// ------------------------------------------------------------------ extras
test('what-if: a one-off biryani barely moves the date, a daily habit stalls it', () => {
  const once = whatIf({ currentKg: 80, targetKg: 72, paceKg: 0.5, extraKcal: 900, today: '2026-10-17' });
  assert.ok(once.delayDays >= 0 && once.delayDays <= 4);
  assert.ok(once.series.length > 5 && once.series[0].low >= once.series[0].plan - 0.1);
  const daily = whatIf({ currentKg: 80, targetKg: 72, paceKg: 0.5, extraKcal: 900, repeatsPerWeek: 7, today: '2026-10-17' });
  assert.equal(daily.stalled, true);
  assert.equal(whatIf({ currentKg: 80, targetKg: 80, today: '2026-10-17' }), null);
});

test('pattern insights need enough data on both sides and quote real differences', () => {
  const days = Array.from({ length: 20 }, (_, i) => ({ date: addDays('2026-09-01', i), calories: i % 2 ? 2100 : 1800, steps: 6000, waterMl: 2000 }));
  const sleep = Object.fromEntries(days.map((d, i) => [d.date, i % 2 ? 5.2 : 7.8]));
  const p = buildPatterns({ days, sleep, meals: [], target: 1800 });
  const s = p.find((x) => x.id === 'sleep');
  assert.ok(s && /under 6 h/.test(s.title) && /300/.test(s.title));
  assert.deepEqual(buildPatterns({ days: days.slice(0, 4), sleep, meals: [], target: 1800 }).filter((x) => x.id === 'sleep'), []);
});

test('body-fat estimate (US Navy) is sensible and needs the right measurements', () => {
  const m = navyBodyFat({ sex: 'male', heightCm: 175, waistCm: 90, neckCm: 38 });
  assert.ok(m > 15 && m < 26);
  const f = navyBodyFat({ sex: 'female', heightCm: 162, waistCm: 80, neckCm: 32, hipCm: 100 });
  assert.ok(f > 25 && f < 40);
  assert.equal(navyBodyFat({ sex: 'female', heightCm: 162, waistCm: 80, neckCm: 32 }), null, 'women need hips');
});

test('hidden oil: 1 tsp is about 40 kcal, and recipes expose their oil', () => {
  assert.equal(oilKcal(4), 160);
  assert.equal(recipeOilTsp([{ foodName: 'Sunflower oil', quantity: 2, servingUnit: 'tbsp' }, { foodName: 'Ghee', quantity: 9, servingUnit: 'g' }, { foodName: 'Onion', quantity: 200, servingUnit: 'g' }], 4), 2);
});

// ------------------------------------------------------------------ forgiving streaks
test('weekly "5 of 7" streak survives a slow week in progress and a missed day', () => {
  const dates = ['2026-10-05', '2026-10-06', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-12']; // week 1: 5 days, this week: 1 so far
  const w = weeklyStreak(new Set(dates), '2026-10-13');
  assert.equal(w.weeks, 1, 'last week counts; this week has not broken anything yet');
  assert.equal(w.hit, false);
  assert.equal(w.canStillHit, true);
});

test('a comeback after a lapse is celebrated, and a short miss is not a lapse', () => {
  const s = computeStreaks(['2026-09-01', '2026-09-02', '2026-10-15', '2026-10-16'], '2026-10-16', { freeze: true });
  assert.equal(s.comebacks, 1);
  assert.equal(s.comeback.on, '2026-10-15');
  assert.equal(computeStreaks(['2026-10-10', '2026-10-12'], '2026-10-12', { freeze: true }).comebacks, 0);
  const lapsed = computeStreaks(['2026-10-01'], '2026-10-09', { freeze: true });
  assert.equal(lapsed.lapsed.days, 8);
});
