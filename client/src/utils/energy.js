// ONE energy model for FlexFit. The same logic lives in:
//   - server/lib/energy.js
//   - client/src/utils/energy.js      (this file, web)
//   - src/utils/energy.ts             (mobile)
// All three are checked against test/fixtures/energy-fixtures.json, so they cannot drift apart silently.
// If you change a rule here, change it in all three and regenerate the fixtures (see test/energy.unit.test.js).

const ACTIVITY_MULTIPLIER = { sedentary: 1.2, light: 1.375, moderate: 1.55, very_active: 1.725, extra_active: 1.9 };
const SEDENTARY = ACTIVITY_MULTIPLIER.sedentary;
const KCAL_PER_KG = 7700;          // ~energy in 1 kg of body weight
const KCAL_PER_STEP_PER_KG = 0.0005; // 10,000 steps at 70 kg ≈ 350 kcal
const DEFAULT_TARGET = 1800;

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Mifflin-St Jeor resting energy. null when weight/height/age are missing. 'other'/unspecified uses the midpoint. */
function bmr({ weightKg, heightCm, ageYears, sex } = {}) {
  const w = n(weightKg), h = n(heightCm), a = n(ageYears);
  if (!(w > 0 && h > 0 && a > 0)) return null;
  const base = 10 * w + 6.25 * h - 5 * a;
  return sex === 'male' ? base + 5 : sex === 'female' ? base - 161 : base - 78;
}

function goalDirection(current, target) {
  const c = n(current), t = n(target);
  if (!c || !t) return 'maintain';
  if (t < c - 0.4) return 'lose';
  if (t > c + 0.4) return 'gain';
  return 'maintain';
}

/**
 * The activity level the calorie target uses. "manual" (or no automatic reading yet) = the level the person chose.
 * "auto" = the level worked out from recent days (lib/dailyCoach.js): it only moves after 2 days in a row agree, so one lazy day
 * never changes what you eat. Identical in the server, web and mobile copies.
 */
function activityLevelOf(p) {
  const a = p && p.autoActivity;
  return p && p.activityMode === 'auto' && a && ACTIVITY_MULTIPLIER[a.targetLevel] ? a.targetLevel : (p && p.activityLevel);
}

/**
 * The safe minimum calories. Your own number (Profile > goals.calorieFloor, 1,000-3,000) wins; otherwise 1,500 for men and 1,200 for
 * everyone else. EVERY screen and engine reads this one function, so none of them can suggest less than the floor you set.
 */
function calorieFloorOf(p) {
  const f = Number(p && p.goals && p.goals.calorieFloor);
  return Number.isFinite(f) && f >= 1000 ? Math.round(f) : (p && p.sex === 'male' ? 1500 : 1200);
}

/**
 * The person's plan. Returns null only when we cannot calculate one (weight, height or age missing).
 *
 *   mode 'auto'   -> calorieTarget is calculated from the body + goal + pace (default)
 *   mode 'manual' -> calorieTarget is the number the person typed in Profile (goals.calorieTarget)
 *
 * baselineActivityKcal is the activity already baked into the maintenance number (the part of the
 * multiplier above "sedentary"). Only activity BEYOND it earns extra food — otherwise steps and workouts would
 * be counted twice (once in the multiplier, once as logged).
 */
function expectedEnergy(p) {
  if (!p) return null;
  const weightKg = n(p.currentWeightKg), heightCm = n(p.heightCm), age = n(p.age);
  const b = bmr({ weightKg, heightCm, ageYears: age, sex: p.sex });
  if (b === null) return null;

  const mult = ACTIVITY_MULTIPLIER[activityLevelOf(p)] || ACTIVITY_MULTIPLIER.moderate;
  const tdee = Math.round(b * mult);
  const goals = p.goals || {};
  const direction = goalDirection(weightKg, goals.targetWeightKg);
  const pace = Math.min(1, Math.max(0.1, n(goals.weeklyPaceKg) || 0.5));
  const gap = direction === 'maintain' ? 0 : Math.round((pace * KCAL_PER_KG) / 7);
  const floor = calorieFloorOf(p); // never a crash diet
  const raw = direction === 'lose' ? tdee - gap : direction === 'gain' ? tdee + gap : tdee;
  // Never below the safety floor — and when the goal is to lose, never above maintenance (the floor could otherwise push a small,
  // low-activity person into a surplus).
  const autoTarget = Math.round((direction === 'lose' ? Math.min(Math.max(floor, raw), tdee) : Math.max(floor, raw)) / 10) * 10;

  const manual = goals.calorieMode === 'manual' && n(goals.calorieTarget) > 0;
  return {
    weightKg,
    bmr: Math.round(b),
    tdee,
    direction,
    pace,
    gap,
    atFloor: direction === 'lose' && raw < floor,
    autoTarget,
    mode: manual ? 'manual' : 'auto',
    calorieTarget: manual ? Math.round(n(goals.calorieTarget)) : autoTarget,
    baselineActivityKcal: Math.max(0, tdee - Math.round(b * SEDENTARY)),
  };
}

/** The calorie target to show anywhere. Always a number: plan -> saved goal -> 1800. */
function dailyTarget(p) {
  const e = expectedEnergy(p);
  if (e) return e.calorieTarget;
  return Math.round(n(p?.goals?.calorieTarget)) || DEFAULT_TARGET;
}

/** Share of the activity ABOVE the plan's baseline that is added to the day's food budget (wearables and step formulas over-count by 15-40%). */
const EXERCISE_CREDIT = 0.7;

/**
 * Where today stands. `workout` and `steps` are calories burned (kcal) by logged exercise and by step count.
 *   bonus      = activity beyond what the target already assumes (never negative)
 *   budget     = target + bonus
 *   remaining  = budget - eaten (negative = over)
 *   net        = (maintenance + bonus) - eaten (positive = deficit, negative = surplus)
 */
function dayBalance(p, { eaten = 0, workout = 0, steps = 0, extra = 0 } = {}) {
  const e = expectedEnergy(p);
  const target = e ? e.calorieTarget : dailyTarget(p);
  const burned = Math.max(0, n(workout)) + Math.max(0, n(steps));
  const eat = Math.max(0, n(eaten));
  const baseline = e ? e.baselineActivityKcal : burned; // unknown body -> don't award anything we can't justify
  const bonus = e ? Math.max(0, Math.round((burned - baseline) * EXERCISE_CREDIT)) : 0;     // wearables and step formulas over-count, so only part of the extra activity is given back as food
  const room = Math.max(0, Math.round(n(extra))); // festival / trip / diet-break room for this day (server). Widens the budget, burns nothing, so `net` ignores it.
  const budget = target + bonus + room;
  const net = e ? e.tdee + bonus - eat : null;
  return {
    target, burned, bonus, extra: room, budget, eaten: eat,
    remaining: budget - eat,
    net,
    isDeficit: net === null ? null : net >= 0,
    fatKg: net === null ? null : Math.abs(net) / KCAL_PER_KG,
    baselineActivityKcal: e ? e.baselineActivityKcal : null,
    hasPlan: !!e,
  };
}

const stepCalories = (steps, weightKg) => Math.round(Math.max(0, n(steps)) * (n(weightKg) || 70) * KCAL_PER_STEP_PER_KG);
const stepDistanceKm = (steps) => Math.round((Math.max(0, n(steps)) * 0.762) / 10) / 100;

/** ~35 ml per kg, rounded to 50 ml, kept between 1.5 L and 5 L. */
function waterTargetMl(weightKg) {
  const w = n(weightKg);
  if (!(w > 0)) return null;
  return Math.min(5000, Math.max(1500, Math.round((w * 35) / 50) * 50));
}

/**
 * What each body goal asks of the macros (protein g per kg of body weight, fat share of calories). Chosen in the app (Profile > Body goal).
 *   lean      lean and toned          athletic  athletic, V-shape          muscular  strong and muscular          balanced  healthy, soft-fit
 * No body goal chosen = the old defaults (1.6 g/kg protein, 27 % fat).
 */
const BODY_TYPES = {
  lean: { protein: 1.8, fat: 0.27 },
  athletic: { protein: 2.0, fat: 0.25 },
  muscular: { protein: 2.2, fat: 0.25 },
  balanced: { protein: 1.6, fat: 0.30 },
};
const bodyRule = (bodyType) => BODY_TYPES[bodyType] || null;

/** Macro targets that add up to the calorie target: protein by body weight (or the saved goal), fat ~27 % (by body goal), carbs the rest. */
function macroTargets(calorieTarget, weightKg, direction, proteinOverride, bodyType) {
  // Protein: the person's own number if set, otherwise by body goal (default 1.6 g/kg, 2.0 when gaining) — capped at 35 % of calories,
  // the top of the accepted macronutrient range, so a large body on a modest budget doesn't get an extreme target.
  const rule = bodyRule(bodyType);
  const perKg = direction === 'gain' ? Math.max(2, rule ? rule.protein : 0) : (rule ? rule.protein : 1.6);
  const protein = Math.round(n(proteinOverride) || Math.min(n(weightKg) * perKg, (calorieTarget * 0.35) / 4));
  const fat = Math.round((calorieTarget * (rule ? rule.fat : 0.27)) / 9);
  const carbs = Math.max(0, Math.round((calorieTarget - protein * 4 - fat * 9) / 4));
  return { protein, fat, carbs, fiber: Math.round((calorieTarget / 1000) * 14) };
}

/**
 * Healthy minimum and maximum per day for each macro, so you aim for a RANGE instead of one number. The goal (from macroTargets)
 * always sits inside it.
 *   protein  1.2 g/kg minimum while losing or gaining (1.0 maintaining; the 0.8 g/kg RDA is a bare floor, not an aim for active people),
 *            up to 2.0 g/kg (2.2 when gaining), never above 35 % of calories and never below 10 % (the accepted macronutrient range).
 *   fat      20-35 % of calories (accepted range).
 *   carbs    at least 130 g (the RDA that covers the brain) and 35 % of calories, up to 65 % (the usual range is 45-65 %; the lower
 *            floor leaves room for the higher protein used when cutting).
 *   fibre    14 g per 1,000 kcal (goal = minimum) up to about 50 g, beyond which gut discomfort becomes common.
 */
function macroRanges(calorieTarget, weightKg, direction, proteinOverride, bodyType) {
  const kcal = n(calorieTarget), w = n(weightKg);
  const goal = macroTargets(kcal, w, direction, proteinOverride, bodyType);
  const pMin = Math.max(Math.round(w * (direction === 'maintain' ? 1.0 : 1.2)), Math.round((kcal * 0.10) / 4));
  const pMax = Math.max(pMin, Math.min(Math.round(w * (direction === 'gain' ? 2.2 : Math.max(2.0, bodyRule(bodyType)?.protein || 0))), Math.round((kcal * 0.35) / 4)));
  const span = (min, max, g) => ({ min: Math.min(min, g), max: Math.max(max, g), goal: g });
  return {
    protein: span(pMin, pMax, goal.protein),
    fat: span(Math.round((kcal * 0.20) / 9), Math.round((kcal * 0.35) / 9), goal.fat),
    carbs: span(Math.max(130, Math.round((kcal * 0.35) / 4)), Math.round((kcal * 0.65) / 4), goal.carbs),
    fiber: span(goal.fiber, Math.max(50, goal.fiber), goal.fiber),
  };
}

/** 'low' | 'ok' | 'high' for a value against a { min, max } range. */
function rangeStatus(value, range) {
  const v = n(value);
  return v < range.min ? 'low' : v > range.max ? 'high' : 'ok';
}

/**
 * Soft ceilings (not goals): sodium 2,000 mg/day (WHO) and sugar at 10 % of calories (WHO guideline for FREE sugars;
 * logged sugar also includes the natural sugar in fruit and milk, so treat the sugar figure as a guide, not a rule).
 */
function limitTargets(calorieTarget) {
  return { sodiumMg: 2000, sugar: Math.round((n(calorieTarget) * 0.1) / 4) };
}

/** Weeks to reach the goal weight at the chosen pace (null when there's nothing to lose or gain). */
function weeksToGoal(currentKg, targetKg, pace = 0.5) {
  const c = n(currentKg), t = n(targetKg);
  if (!c || !t || !(pace > 0)) return null;
  const diff = Math.abs(c - t);
  return diff < 0.4 ? null : Math.ceil(diff / pace);
}

/** MET-based estimate, same formula the server uses. */
const estimateBurn = (met, weightKg, minutes) => ((met * 3.5 * weightKg) / 200) * minutes;

/** Old name kept so existing imports keep working; it now uses the shared plan (pace, manual target, activity already counted). */
function calorieBalance(energy, eaten, burned) {
  const bonus = Math.max(0, Math.round((burned - energy.baselineActivityKcal) * EXERCISE_CREDIT));
  const budget = energy.calorieTarget + bonus;
  const net = energy.tdee + bonus - eaten;
  return { budget, bonus, remaining: budget - eaten, net, isDeficit: net >= 0, fatKg: Math.abs(net) / KCAL_PER_KG };
}

export {
  activityLevelOf, calorieFloorOf,
  EXERCISE_CREDIT, ACTIVITY_MULTIPLIER, KCAL_PER_KG, KCAL_PER_STEP_PER_KG, DEFAULT_TARGET,
  bmr, goalDirection, expectedEnergy, dailyTarget, dayBalance,
  stepCalories, stepDistanceKm, waterTargetMl, macroTargets, BODY_TYPES, macroRanges, rangeStatus, limitTargets, weeksToGoal, estimateBurn, calorieBalance,
};
