// The DAILY decision. It works UNDER the weekly decision (lib/weeklyDecision.js) and never against it.
//
//   WEEKLY = strategy. The only engine that changes the plan (calorie target / pace, steps goal, diet break). One change at a time, with
//            cool-downs, strength / recovery / retention / cycle context.
//   DAILY  = coordination. It reads the weekly decision and the plan it left behind, then answers "what do I do TODAY, inside that plan?":
//            today's targets, the one thing to focus on (picked FROM the weekly decision, so the two always tell the same story),
//            and progress read from the trend weight. It has NO apply: it can never write a goal, so the two cannot collide.
//
// The one thing the daily layer may do for the plan is speak up EARLY. When the 14-day trend says you are losing faster than is safe, it
// does not wait for the next weekly review: fastTrend() raises a signal that makes the weekly engine re-check today (lib/weeklyRefresh.js,
// reason 'trend-fast'). The weekly engine then decides and applies (or auto-applies) with all of its context. fastTrend() uses the
// weekly engine's OWN thresholds (W.minWeighIns, W.tooFastPct), so "daily says fast" and "weekly says too fast" are the same test.
//
// Pure and deterministic (no database, no clock).
const E = require('./energy');
const { smoothTrend, trendRate } = require('./trendWeight');
const { dropOutliers } = require('./robustWeights');
const { addDays, diffDays } = require('./dates');
const D = require('./dailyCoach');
const { W } = require('./weeklyDecision');

const DW = { underDays: 3, underMargin: 150, weeklyEveryDays: 7, proteinHigh: 1.1 };
const n0 = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;

/** What the weekly decision is doing, and the ONE thing to focus on today in step with it. Stable ids, the apps translate / show them. */
const FOCUS = {
  ON_TRACK: ['follow', 'Follow the plan today. Nothing needs changing.'],
  WAIT_ONE_MORE: ['follow', 'Follow the plan today. One slow week is noise, so nothing changes yet.'],
  WAIT_EFFECT: ['follow', 'Follow the plan today. The last change needs time to show.'],
  WAIT_RETENTION: ['follow', 'Follow the plan today. Water weight may be hiding your progress.'],
  WAIT_CYCLE: ['follow', 'Follow the plan today. Your cycle may be hiding your progress.'],
  COMPOSITION_IMPROVING: ['follow', 'Follow the plan today. Your body is changing even if the scale is slow.'],
  EXPLAINED_BY_HEAVY_DAY: ['follow', 'Follow the plan today. A heavy day explains the slow week.'],
  NEED_DATA: ['weigh', 'Weigh in tomorrow morning so I can read your trend.'],
  NEED_FOOD_LOGS: ['log', 'Log everything you eat today so I can tell what is really happening.'],
  FIX_ADHERENCE: ['log', 'Stay close to your plan today: one fix, like prepping lunch or an earlier dinner.'],
  FIX_HEAVY_DAYS: ['log', 'Keep today to normal meals at normal amounts. No fasting.'],
  HIT_STEPS: ['steps', 'Reach your step goal today. It comes before any food change.'],
  LADDER_STEPS: ['steps', 'Reach your new step goal today.'],
  LADDER_WALK: ['steps', 'Add your incline walk after lifting this week.'],
  RESTORE_TRAINING: ['train', 'Do your planned session today. No doubling up.'],
  PROTECT_MUSCLE: ['protein', 'Hit your protein today and keep your lifts progressing.'],
  HOLD_STRENGTH: ['protein', 'Hit your protein today and keep every lift progressing.'],
  HOLD_RECOVERY: ['recover', 'Prioritise sleep today. Calories hold until recovery is back.'],
  TOO_FAST_RAISE: ['eat', 'Eat your full target today, protein first.'],
  UNDER_EATING: ['eat', 'Eat your full target today, protein first, in smaller more frequent meals.'],
  LADDER_CUT: ['follow', 'Follow your new target today.'],
  DIET_BREAK_DUE: ['follow', 'Follow the plan today. A diet break is suggested above.'],
  LADDER_BREAK: ['follow', 'Follow the plan today. A diet break is suggested above.'],
  REASSESS: ['log', 'Weigh your food and log it exactly today.'],
};
const PROTEIN_HIGH = new Set(['PROTECT_MUSCLE', 'HOLD_STRENGTH', 'TOO_FAST_RAISE', 'HOLD_RECOVERY']);

/** Weigh-ins after the same noise filter the weekly engine uses, and the 14-day trend. */
function trendOf(days, today) {
  const raw = (days || []).filter((d) => d.weighIn && n0(d.weightKg) > 0 && d.date <= today).map((d) => ({ date: d.date, weightKg: n0(d.weightKg) }));
  const { kept, dropped } = dropOutliers(raw);
  const series = smoothTrend(kept).filter((p) => p.date <= today);
  return {
    series, outliers: dropped.length,
    trendKg: series.length ? series[series.length - 1].trendKg : null,
    rate: series.length >= 2 ? trendRate(series, today) : null,                                  // kg/week, negative = losing (same 14-day rate as weekly)
    weighIns14: kept.filter((p) => p.date > addDays(today, -14)).length,
  };
}

/**
 * Is the trend losing faster than is safe? Exactly the weekly engine's "too fast" test (same filter, same 14-day rate, same minimum weigh-ins,
 * same share of body weight). Only for a weight-loss goal; other goals have their own ladder in the weekly engine.
 * @param o.weights ascending [{date, weightKg}] every weigh-in   @returns {fast, rate, weighIns14, trendKg}
 */
function fastTrend({ weights = [], today, direction, weightKg = 0 }) {
  if (direction !== 'lose') return { fast: false, rate: null, weighIns14: 0, trendKg: null };
  const t = trendOf((weights || []).map((w) => ({ date: w.date, weightKg: w.weightKg, weighIn: true })), today);
  const wNow = n0(weightKg) || t.trendKg || 0;
  const fast = t.rate !== null && t.weighIns14 >= W.minWeighIns && wNow > 0 && -t.rate > W.tooFastPct * wNow;
  return { fast, rate: t.rate, weighIns14: t.weighIns14, trendKg: t.trendKg };
}

/** Today's numbers from the one energy model (the plan the weekly decision left behind). */
function targetsOf(profile, e, aim) {
  const T = E.resolveTargets(profile);
  const r = T.ranges;
  const high = aim === 'high' ? Math.min(r.protein.max, Math.round(r.protein.goal * DW.proteinHigh)) : r.protein.goal;
  return { calories: e.calorieTarget, protein: { ...r.protein, aim: high }, carbs: r.carbs, fat: r.fat, fiber: r.fiber, waterMl: T.waterMl };
}

/**
 * @param o.weekly {decision, state} the CURRENT weekly decision view and the saved weekly ladder state (the caller runs the weekly engine first)
 * @returns {action, headline, messages, focus:{kind,text}, frame, progress, targets, escalate, metrics}  (no `apply`: the daily decision never changes the plan)
 */
function dailyDecision({ profile, days = [], today, weekly = null, dietBreakActive = false }) {
  const e = E.expectedEnergy(profile);
  if (!e) return { action: 'NEED_PROFILE', headline: 'Finish your profile first', messages: ['Age, height and weight are needed to work out your plan.'], focus: null, frame: null, progress: null, targets: null, escalate: { trendFast: false }, metrics: {} };

  const floor = E.calorieFloorOf(profile);
  const target = e.calorieTarget;
  const w = (weekly && weekly.decision) || null;
  const ws = (weekly && weekly.state) || {};
  const pending = !!(w && w.apply && !w.applied);
  const t = trendOf(days, today);
  const planKgWk = e.direction === 'lose' ? r2(Math.max(0.1, ((e.tdee - target) * 7) / E.KCAL_PER_KG)) : null;
  const goalKg = n0(profile.goals && profile.goals.targetWeightKg) || null;
  const fast = fastTrend({ weights: days.filter((d) => d.weighIn).map((d) => ({ date: d.date, weightKg: d.weightKg })), today, direction: e.direction, weightKg: e.weightKg });
  const lastChange = ws.lastChange || null;
  const frame = {
    target, floor, weeklyAction: w ? w.action : null, weeklyHeadline: w ? w.headline : null, pending, applied: !!(w && w.applied),
    cooling: !!lastChange && diffDays(lastChange, today) < W.coolDownDays, lastChange, level: n0(ws.level),
    // the weekly decision was made against a different calorie target than today's plan: it will be re-read, never contradicted
    stale: !!(w && w.metrics && n0(w.metrics.target) > 0 && n0(w.metrics.target) !== target && !w.applied),
  };
  const progress = { trendKg: t.trendKg, rateKgWk: t.rate, planKgWk, kgToGo: goalKg && t.trendKg ? r1(Math.abs(t.trendKg - goalKg)) : null, weighIns14: t.weighIns14, outliers: t.outliers };
  const aim = w && PROTEIN_HIGH.has(w.action) ? 'high' : 'goal';
  const targets = targetsOf(profile, e, aim);
  const metrics = { floor, target, planKgWk, rateKgWk: t.rate, weeklyDue: !ws.lastReview || diffDays(ws.lastReview, today) >= DW.weeklyEveryDays };
  const out = (action, headline, messages, focus = null) => ({ action, headline, messages, focus, frame, progress, targets, escalate: { trendFast: fast.fast }, metrics });

  // 1. a diet break is a planned pause: targets and plan hold, whatever the scale says
  if (dietBreakActive) return out('DAILY_HOLD_BREAK', 'Diet break: targets hold', ['A planned diet break is running, so today\u2019s numbers stay as they are. The coach reads your progress again when it ends.'], { kind: 'follow', text: 'Enjoy the break and keep eating at maintenance.' });

  // 2. under-eating over the last full days: safety, fixed with food, the plan is untouched (the weekly engine says the same)
  const last = days.filter((d) => d.date < today && d.date >= addDays(today, -DW.underDays));
  const logged = last.filter((d) => n0(d.calories) >= D.CFG.unloggedBelow * target);
  if (last.length === DW.underDays && logged.length === DW.underDays) {
    const avg = logged.reduce((s, d) => s + n0(d.calories), 0) / logged.length;
    if (avg < floor - DW.underMargin) return out('DAILY_UNDER_EATING', 'Eat more today', [`The last ${DW.underDays} days averaged about ${Math.round(avg)} kcal, under your safe minimum of ${floor}. The plan does not change: eat today\u2019s target in full.`], { kind: 'eat', text: FOCUS.UNDER_EATING[1] });
  }

  // 3. a weekly suggestion is waiting for a tap: the daily layer stays quiet and points at it, so there is never a second, competing suggestion
  if (pending) return out('DAILY_WEEKLY_PENDING', 'A weekly suggestion is waiting', [`${w.headline}. Review it in the weekly card; today\u2019s targets below are your current plan.`], { kind: 'review', text: 'Look at the weekly suggestion, then follow today\u2019s plan.' });

  // 4. the trend is fast: the weekly engine has been asked to re-check (see weeklyRefresh 'trend-fast'); show what it decided
  if (fast.fast) {
    const rate = (-fast.rate).toFixed(2);
    const msg = w && w.action === 'TOO_FAST_RAISE' ? `Your 14-day trend is ${rate} kg a week. The weekly coach has already responded: ${w.headline}.`
      : w && w.action === 'NEED_FOOD_LOGS' ? `Your 14-day trend is ${rate} kg a week, more than ${W.tooFastPct * 100}% of your body weight. Log your food on more days so the weekly coach can safely adjust your plan.`
      : `Your 14-day trend is ${rate} kg a week, more than ${W.tooFastPct * 100}% of your body weight. The weekly coach has been asked to re-check. Until it answers, eat your full target and keep protein up.`;
    return out('DAILY_FAST_TREND', 'You are losing faster than is safe', [msg], { kind: 'eat', text: FOCUS.TOO_FAST_RAISE[1] });
  }

  // 5. otherwise today's focus comes FROM the weekly decision, so the two always tell the same story
  const f = w && FOCUS[w.action];
  const focus = f ? { kind: f[0], text: f[1] } : (t.weighIns14 < W.minWeighIns && e.direction === 'lose' ? { kind: 'weigh', text: FOCUS.NEED_DATA[1] } : { kind: 'follow', text: FOCUS.ON_TRACK[1] });
  const L = t.rate === null ? null : -t.rate;
  let line;
  if (e.direction === 'lose' && L !== null && planKgWk) {
    const gap = r2(L - planKgWk);
    line = `Trend ${t.trendKg} kg, losing ${L.toFixed(2)} kg a week against a plan of ${planKgWk}: ${gap > 0.15 ? 'a little ahead of plan' : gap < -0.15 ? 'a little behind plan' : 'on plan'}.`;
  } else if (t.trendKg) line = `Trend weight ${t.trendKg} kg.`;
  else line = 'Weigh in a few mornings a week and I will follow your trend.';
  return out('DAILY_OK', frame.stale ? 'Plan changed: targets updated' : 'Targets are up to date', [line, focus.text], focus);
}

module.exports = { DW, FOCUS, dailyDecision, fastTrend, trendOf, targetsOf };
