// The "I ate heavy for a few days, what now?" brain: a weekly energy ledger. Pure and deterministic (no clock, no DB).
// The phone has the same rules in MyDailyOSMobile/src/utils/overEngine.ts (checked by the same scenarios), so every screen agrees.
//   1. Each day is judged against ITS OWN budget (target + earned activity bonus, from energy.dayBalance).
//   2. Days with (almost) nothing logged are UNKNOWN, not "zero kcal": no fake deficit, no fake surplus.
//   3. Lighter days earn capped credit (30 % of target a day): under-logging is the usual reason a deficit looks bigger than it is.
//   4. Only the UNPAID weekly surplus matters. A small one is normal swing and gets NO cut.
//   5. A cut is never a full pay-back: a share is recovered (logging error and water weight are real), spread over a few days, with a
//      hard per-day cap and the calorie floor always held. The honest leftover is reported.
//   6. A heavy day right after a very light day (restrict -> overeat) gets "eat regular meals", not another cut.
//   7. If the weight trend is NOT rising after a heavy week, the numbers (target or log) are probably off: review, do not cut.
const { addDays } = require('./dates');
const { dayBalance, expectedEnergy, goalDirection, KCAL_PER_KG } = require('./energy');

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r10 = (v) => Math.round(v / 10) * 10;

const RULES = {
  unloggedBelow: 0.35,   // a day under 35 % of target is "not really logged"
  underDayBelow: 0.75,   // a logged day under 75 % of target is an under-eating day
  creditCap: 0.30,       // a light day earns at most 30 % of target back toward the week
  overTolerance: 0.08,   // same line as the rest of the app (caloriesOnTrack): up to 8 % (min 100 kcal) over budget is not "over"
  noiseWeek: 0.05,       // a weekly surplus under 5 % of the weekly target gets no cut
  weekTier: 0.20,        // a surplus over 20 % of the weekly target, or 4+ over days, is a week-level problem
  capShare: 0.12, capKcal: 250,
  share: { single: 0.5, streak: 0.6, week: 0.4 },
  maxDays: { single: 3, streak: 4, week: 5 },
  closeOfDayHour: 21,    // from 21:00 local, today counts as finished (needs `hour`)
};

/**
 * @param o.profile  profile for the shared energy model (may be null: falls back to `target`)
 * @param o.days     ascending [{date, calories, caloriesBurned?}] (today may be in it, half-logged)
 * @param o.target / o.floor / o.today / o.direction  override the profile-derived ones (the server already has them)
 * @param o.hour     local hour 0-23 of "now" (null = unknown: today only counts once it is already over)
 * @param o.weightTrendPerWeek kg/week or null
 */
function analyseOverDays({ profile = null, days = [], today, target: targetIn = null, floor: floorIn = null, direction: dirIn = null, hour = null, weightTrendPerWeek = null, paceKg = null }) {
  const R = RULES;
  const e = profile ? expectedEnergy(profile) : null;
  const target = n(targetIn) > 0 ? n(targetIn) : (profile ? dayBalance(profile, { eaten: 0 }).target : 0);
  const floor = n(floorIn) > 0 ? n(floorIn) : (profile?.sex === 'male' ? 1500 : 1200);
  const direction = dirIn || (profile ? goalDirection(e?.weightKg ?? profile.currentWeightKg, profile.goals?.targetWeightKg) : 'lose');
  const gap = e?.gap ?? 0;
  const pace = n(paceKg) > 0 ? n(paceKg) : n(profile?.goals?.weeklyPaceKg);
  const none = (message = '', extra = {}) => ({
    level: 'none', tier: 'none', runDays: 0, overDays7: 0, weekExcess: 0, lastExcess: 0, lastOverDate: null, perDay: 0, days: 0, startDate: null, adjusted: [],
    todayTarget: target || null, tomorrowTarget: target || null, skipCut: false, headline: '', detail: '', message, cause: null, needsEasierPace: false,
    ledger: { loggedDays: 0, unloggedDays: 0, weekNet: 0, unpaid: 0, recovered: 0, leftover: 0, fatG: 0, delayDays: null, confidence: 'low' }, ...extra,
  });
  if (!(target > 0) || !today || direction === 'gain') return none();

  const by = new Map(days.map((d) => [d.date, d]));
  const eatenOf = (date) => Math.max(0, n(by.get(date)?.calories));
  const tol = Math.max(100, R.overTolerance * target);
  const rows = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)).map((date) => {
    const eaten = eatenOf(date);
    const burned = Math.max(0, n(by.get(date)?.caloriesBurned));
    const b = profile ? dayBalance(profile, { eaten, workout: burned }) : { budget: target };
    const v = eaten - b.budget;
    if (date === today && !(v > tol) && !(hour !== null && hour >= R.closeOfDayHour)) return { date, eaten, v, state: 'open' };
    if (eaten < R.unloggedBelow * target) return { date, eaten, v, state: 'unlogged' };
    if (v > tol) return { date, eaten, v, state: 'over' };
    return { date, eaten, v, state: eaten < R.underDayBelow * target ? 'under' : 'ok' };
  });

  const counted = rows.filter((r) => r.state !== 'open' && r.state !== 'unlogged');
  const loggedDays = counted.length;
  const unloggedDays = rows.filter((r) => r.state === 'unlogged').length;
  const weekNet = Math.round(counted.reduce((s, r) => s + Math.max(r.v, -R.creditCap * target), 0));
  const unpaid = Math.max(0, weekNet);
  const overRows = rows.filter((r) => r.state === 'over');
  const overDays7 = overRows.length;
  const weeklyTarget = 7 * target;
  const confidence = loggedDays >= 6 ? 'high' : loggedDays >= 4 ? 'medium' : 'low';

  let lastIdx = -1;
  for (let i = rows.length - 1; i >= 0; i--) if (rows[i].state !== 'open') { lastIdx = i; break; }
  let runDays = 0;
  for (let i = lastIdx; i >= 0 && rows[i].state === 'over'; i--) runDays++;
  const heavy = lastIdx >= 0 && rows[lastIdx].state === 'over' ? rows[lastIdx] : null;
  const lastOver = overRows.length ? overRows[overRows.length - 1] : null;
  const lastExcess = lastOver ? Math.round(lastOver.v) : 0;
  const before = runDays > 0 && lastIdx - runDays >= 0 ? rows[lastIdx - runDays] : null;
  const underDays7 = rows.filter((r) => r.state === 'under').length;
  const cycle = runDays > 0 && (before?.state === 'under' || underDays7 >= 2);

  const tier = overDays7 === 0 ? 'none' : (overDays7 >= 4 || unpaid >= R.weekTier * weeklyTarget) ? 'week' : runDays >= 2 ? 'streak' : 'single';
  const base = { runDays, overDays7, weekExcess: Math.round(unpaid), lastExcess, lastOverDate: lastOver ? lastOver.date : null, tier };
  const ledgerOf = (o = {}) => ({ loggedDays, unloggedDays, weekNet, unpaid, recovered: 0, leftover: unpaid, fatG: Math.round((unpaid / KCAL_PER_KG) * 1000), delayDays: gap > 0 ? Math.round(unpaid / gap) : null, confidence, ...o });

  // The last heavy day must be recent (it is the thing we are reacting to); an old over day inside the week is history, not a trigger.
  const recent = overRows.some((r) => r.date >= addDays(today, -2));
  if (!recent && !(unpaid >= R.weekTier * weeklyTarget && overDays7 >= 2)) return none('', { ...base, tier: 'none', ledger: ledgerOf() });

  const cap = Math.max(0, Math.min(r10(R.capShare * target), R.capKcal, target - floor));
  const canEase = pace > 0.25;
  const needsEasierPace = direction === 'lose' && canEase && (cap < 60 || (e?.atFloor ?? false) || (tier === 'week' && gap > 0.2 * (e?.tdee ?? Infinity)) || (pace >= 0.75 && tier !== 'single'));
  const flat = direction === 'lose' && weightTrendPerWeek !== null && weightTrendPerWeek <= 0.1 && loggedDays >= 4 && tier !== 'single';

  let skipWhy = null; let cause = null;
  const lowLog = unloggedDays >= 2 ? ` ${unloggedDays} day${unloggedDays > 1 ? 's have' : ' has'} no food logged, so this is a minimum estimate.` : '';
  const watery = ' A salty or high-carb day can move the scale 0.5 to 1.5 kg, mostly water.';
  if (cycle) { skipWhy = 'The heavy day followed a very light one. Cutting again feeds that see-saw. Eat three regular meals tomorrow instead.'; cause = 'undereating_cycle'; }
  else if (flat) { skipWhy = 'Your weight is not going up even though the log says you are over, so the target is probably a bit low or some meals are logged heavy. Review the numbers instead of eating less.'; cause = 'target_or_log'; }
  else if (unpaid <= 0) skipWhy = 'The lighter days earlier this week more than cover this one. Nothing to fix, eat your normal plan.';
  else if (unpaid < R.noiseWeek * weeklyTarget) skipWhy = `Your week is only about ${Math.round(unpaid).toLocaleString('en-US')} kcal over after the lighter days. That is normal swing, not a problem.`;
  else if (cap === 0) { skipWhy = `Your target is already at the safe minimum, so there is nothing safe to trim.${needsEasierPace ? ' A slower pace is the right lever.' : ''}`; if (needsEasierPace) cause = 'pace_too_aggressive'; }
  if (!cause && needsEasierPace && tier !== 'single') cause = 'pace_too_aggressive';
  if (!cause && confidence === 'low' && unloggedDays >= 3) cause = 'low_logging';

  const startDate = (rows[rows.length - 1].state !== 'open') ? addDays(today, 1) : null;
  if (skipWhy) {
    return { ...none(skipWhy, base), level: 'watch', skipCut: true, headline: skipWhy, cause, needsEasierPace, tier,
      detail: unpaid > 0 ? `Over by about ${Math.round(heavy ? heavy.v : lastExcess).toLocaleString('en-US')} kcal on the heavy day; about ${Math.round((unpaid / KCAL_PER_KG) * 1000).toLocaleString('en-US')} g of fat at most.${watery}${lowLog}` : `The heavy day was over its budget, but your week is still under budget.${lowLog}`,
      ledger: ledgerOf(), startDate };
  }
  if (!heavy && !(unpaid >= R.weekTier * weeklyTarget)) return none('', { ...base, ledger: ledgerOf() });

  const t = tier === 'none' ? 'single' : tier;
  const share = R.share[t] * (confidence === 'low' ? 0.7 : 1);
  const toRecover = unpaid * share;
  const nDays = Math.min(R.maxDays[t], Math.max(1, Math.ceil(toRecover / cap)));
  const perDay = Math.min(cap, Math.max(10, Math.ceil(toRecover / nDays / 10) * 10));
  const recovered = perDay * nDays;
  const leftover = Math.max(0, unpaid - recovered);
  const delayDays = direction === 'lose' && gap > 0 ? Math.max(0, Math.round(leftover / gap)) : null;

  const todayRow = rows[rows.length - 1];
  const startToday = todayRow.state === 'open' && todayRow.eaten <= target - perDay - 150;
  const start = startToday ? today : addDays(today, 1);
  const adjusted = Array.from({ length: nDays }, (_, i) => ({ date: addDays(start, i), target: Math.max(floor, target - perDay), trim: Math.min(perDay, target - floor) }));
  const adj = new Map(adjusted.map((a) => [a.date, a.target]));
  const level = unpaid < 0.15 * weeklyTarget ? 'reduce' : 'high';
  const headline = t === 'week' ? `This week is about ${Math.round(unpaid).toLocaleString('en-US')} kcal over. Reset gently, do not crash.`
    : t === 'streak' ? `${runDays} heavier days in a row. A small, spread-out trim is enough.` : 'One heavy day. A small trim over the next days settles it.';
  const rising = weightTrendPerWeek !== null && weightTrendPerWeek > 0.1 && direction === 'lose';
  const detail = `${rising ? 'Your weight trend is edging up, so this matters a little more. ' : ''}Week balance: about ${Math.round(unpaid).toLocaleString('en-US')} kcal over (about ${Math.round((unpaid / KCAL_PER_KG) * 1000).toLocaleString('en-US')} g of fat).${watery} `
    + `Trim ${perDay} kcal a day for ${nDays} day${nDays > 1 ? 's' : ''} (about ${recovered.toLocaleString('en-US')} kcal, never below ${floor.toLocaleString('en-US')}).`
    + (leftover > 0 ? ` The remaining ~${Math.round(leftover).toLocaleString('en-US')} kcal settles with your normal pace${delayDays ? `, about ${delayDays} day${delayDays > 1 ? 's' : ''} later` : ''}.` : '') + lowLog;
  return { ...none(headline, base), level, tier, perDay, days: nDays, startDate: start, adjusted, todayTarget: adj.get(today) ?? target, tomorrowTarget: adj.get(addDays(today, 1)) ?? target,
    headline, detail, cause, needsEasierPace, ledger: ledgerOf({ recovered, leftover, delayDays }) };
}

/** Kcal burned by a brisk walk (MET 3.5) at this body weight, rounded to 5. */
function walkKcal(weightKg, minutes = 15) { const w = n(weightKg) > 0 ? n(weightKg) : 70; return Math.round((((3.5 * 3.5 * w) / 200) * minutes) / 5) * 5; }

module.exports = { analyseOverDays, walkKcal, RULES };
