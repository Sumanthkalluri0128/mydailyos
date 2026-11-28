// The "I ate heavy for a few days, what now?" brain. Pure and deterministic (no React, no clock) so it can be tested.
// It replaces guesswork with a weekly energy ledger:
//   1. Each day is judged against ITS OWN budget (target + earned activity bonus), using the shared energy model.
//   2. Days with (almost) nothing logged are UNKNOWN, not "zero kcal": they never create a fake deficit or a fake surplus.
//   3. Lighter days earn credit toward the week, but capped, because under-logging is the most common reason a deficit looks bigger than it is.
//   4. Only the unpaid weekly surplus matters. A small one is normal noise and gets NO cut at all.
//   5. A cut is never a full pay-back: we recover a share of it (logging error and water weight are real), spread over a few days,
//      with a hard per-day cap and the calorie floor always held.
//   6. If the heavy day follows a very light day (restrict -> overeat cycle), the right advice is to eat normally, not to cut.
import { calorieFloorOf, dayBalance, estimateBurn, expectedEnergy, goalDirection, KCAL_PER_KG, type EnergyProfile } from './energy';

export type HistDay = { date: string; calories: number; caloriesBurned?: number; eventExtra?: number };
export type OverTier = 'none' | 'single' | 'streak' | 'week';
export type OverCause = 'undereating_cycle' | 'pace_too_aggressive' | 'low_logging' | null;
export type OverPlanDay = { date: string; kcal: number };
export type OverAdvice = {
  level: 'watch' | 'reduce' | 'high';
  headline: string; detail: string;
  perDay: number; days: number; skipCut: boolean; todayTarget: number; tomorrowTarget: number;
};
export type OverResult = {
  tier: OverTier; runDays: number; overDays7: number; message: string;
  target: number; floor: number; cause: OverCause; needsEasierPace: boolean;
  advice: OverAdvice | null; plan: OverPlanDay[];
  ledger: { loggedDays: number; unloggedDays: number; weekNet: number; unpaid: number; recovered: number; leftover: number; fatG: number; delayDays: number | null; confidence: 'low' | 'medium' | 'high' };
};

export type OverInput = { profile: EnergyProfile | null; history: HistDay[]; today: string; hour: number; eatenToday?: number };

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r10 = (v: number) => Math.round(v / 10) * 10;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const shift = (s: string, k: number) => { const [y, m, d] = s.split('-').map(Number); return ymd(new Date(y, m - 1, d + k)); };

// Tunables, in one place so they can be defended (and tested).
export const OVER_RULES = {
  unloggedBelow: 0.35,    // a day under 35 % of target is treated as "not really logged"
  underDayBelow: 0.75,    // a logged day under 75 % of target counts as an under-eating day
  creditCap: 0.30,        // a light day can earn at most 30 % of target back toward the week
  overTolerance: 0.08,    // same 8 % line as the rest of the app: up to 8 % (min 100 kcal) over budget is not an over day
  noiseWeek: 0.05,        // a weekly surplus under 5 % of the weekly target gets no cut
  weekTier: 0.20,         // a weekly surplus over 20 % of the weekly target, or 4+ over days, is a week-level problem
  capShare: 0.12, capKcal: 250, // a trim is at most 12 % of target and 250 kcal per day
  share: { single: 0.5, streak: 0.6, week: 0.4 },     // share of the surplus we try to recover (never 100 %)
  maxDays: { single: 3, streak: 4, week: 5 },
  closeOfDayHour: 21,     // from 21:00 today counts as finished
} as const;

export function analyseOverDays(inp: OverInput): OverResult {
  const { profile, today, hour } = inp;
  const e = expectedEnergy(profile);
  const base = dayBalance(profile, { eaten: 0 });
  const target = base.target;
  const floor = calorieFloorOf(profile);
  const direction = goalDirection(e?.weightKg ?? profile?.currentWeightKg, profile?.goals?.targetWeightKg);
  const gap = e?.gap ?? 0;
  const R = OVER_RULES;

  // 7 calendar days ending today; one row per date (the last row for a date wins, so a refreshed day replaces a stale one).
  const byDate = new Map<string, HistDay>();
  for (const h of inp.history || []) if (h?.date) byDate.set(h.date, h);
  const eatenTodayLive = inp.eatenToday != null ? n(inp.eatenToday) : n(byDate.get(today)?.calories);
  const dates = Array.from({ length: 7 }, (_, i) => shift(today, i - 6));

  type Row = { date: string; eaten: number; budget: number; v: number; state: 'unlogged' | 'under' | 'ok' | 'over' | 'open' };
  const rows: Row[] = dates.map((date) => {
    const h = byDate.get(date);
    const isToday = date === today;
    const eaten = Math.max(0, isToday ? eatenTodayLive : n(h?.calories));
    const burned = Math.max(0, n(h?.caloriesBurned));
    const b = dayBalance(profile, { eaten, workout: burned, extra: n(h?.eventExtra) }); // a feast inside a festival / trip / diet-break window is not an over day
    const v = eaten - b.budget;
    const tol = Math.max(100, R.overTolerance * target);
    // Today only counts once it is over budget already (it cannot get un-eaten) or the day is basically finished.
    if (isToday && !(v > tol) && hour < R.closeOfDayHour) return { date, eaten, budget: b.budget, v, state: 'open' };
    if (eaten < R.unloggedBelow * target) return { date, eaten, budget: b.budget, v, state: 'unlogged' };
    if (v > tol) return { date, eaten, budget: b.budget, v, state: 'over' };
    return { date, eaten, budget: b.budget, v, state: eaten < R.underDayBelow * target ? 'under' : 'ok' };
  });

  const counted = rows.filter((r) => r.state !== 'open' && r.state !== 'unlogged');
  const loggedDays = counted.length;
  const unloggedDays = rows.filter((r) => r.state === 'unlogged').length;
  const credit = (v: number) => Math.max(v, -R.creditCap * target); // light days earn capped credit
  const weekNet = Math.round(counted.reduce((s, r) => s + credit(r.v), 0));
  const overDays7 = rows.filter((r) => r.state === 'over').length;

  // Run of over-days ending at the latest counted day (an open "today" is skipped, an unlogged day breaks the run).
  let runDays = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].state === 'open') continue;
    if (rows[i].state === 'over') runDays++; else break;
  }
  const lastCounted = [...rows].reverse().find((r) => r.state !== 'open');
  const heavyDay = lastCounted?.state === 'over' ? lastCounted : null;

  const confidence: 'low' | 'medium' | 'high' = loggedDays >= 6 ? 'high' : loggedDays >= 4 ? 'medium' : 'low';
  const weeklyTarget = 7 * target;
  const unpaid = Math.max(0, weekNet);

  // Restrict -> overeat: the day BEFORE the heavy run was very light (or two light days in the week). Cutting again feeds the cycle.
  const lastIdx = (() => { for (let i = rows.length - 1; i >= 0; i--) if (rows[i].state !== 'open') return i; return -1; })();
  const before = runDays > 0 && lastIdx - runDays >= 0 ? rows[lastIdx - runDays] : undefined; // the day just before the heavy run
  const underDays7 = rows.filter((r) => r.state === 'under').length;
  const cycle = runDays > 0 && (before?.state === 'under' || underDays7 >= 2);

  const tier: OverTier = runDays === 0 && overDays7 === 0 ? 'none'
    : (overDays7 >= 4 || unpaid >= R.weekTier * weeklyTarget) ? 'week'
    : runDays >= 2 ? 'streak' : 'single';

  const empty = (message: string, cause: OverCause = null): OverResult => ({
    tier: 'none', runDays, overDays7, message, target, floor, cause, needsEasierPace: false, advice: null, plan: [],
    ledger: { loggedDays, unloggedDays, weekNet, unpaid, recovered: 0, leftover: unpaid, fatG: Math.round((unpaid / KCAL_PER_KG) * 1000), delayDays: null, confidence },
  });
  if (!heavyDay && tier === 'none') return empty('On track this week.');
  if (!heavyDay) return empty('Your latest day is within budget.');

  const fatG = Math.round((unpaid / KCAL_PER_KG) * 1000);
  const overTodayOnly = Math.round(Math.max(0, heavyDay.v));

  // Hard limits on any trim.
  const cap = Math.max(0, Math.min(r10(R.capShare * target), R.capKcal, target - floor));
  const needsEasierPace = direction === 'lose' && (cap < 60 || (e?.atFloor ?? false) || (tier === 'week' && gap > 0.2 * (e?.tdee ?? Infinity)));

  // Reasons NOT to cut at all.
  let skipWhy: string | null = null;
  let cause: OverCause = null;
  if (direction === 'gain') skipWhy = 'You are eating for gain, so a heavier day does not need paying back.';
  else if (cycle) { skipWhy = 'The heavy day followed a very light one. Cutting again feeds that see-saw. Eat three regular meals tomorrow instead.'; cause = 'undereating_cycle'; }
  else if (unpaid <= 0) skipWhy = 'The lighter days earlier this week more than cover this one. Nothing to fix, eat your normal plan.';
  else if (unpaid < R.noiseWeek * weeklyTarget) skipWhy = `Your week is only about ${Math.round(unpaid).toLocaleString()} kcal over after the lighter days. That is normal swing, not a problem.`;
  else if (cap === 0) { skipWhy = `Your target is already at the safe minimum, so there is nothing safe to trim.${needsEasierPace ? ' A slower pace is the right lever.' : ''}`; cause = needsEasierPace ? 'pace_too_aggressive' : null; }
  if (!cause && needsEasierPace && tier !== 'single') cause = 'pace_too_aggressive';
  if (!cause && confidence === 'low' && unloggedDays >= 3) cause = 'low_logging';

  const lowLog = unloggedDays >= 2 ? ` ${unloggedDays} day${unloggedDays > 1 ? 's have' : ' has'} no food logged, so this is a minimum estimate.` : '';
  const watery = ' A salty or high-carb day can move the scale 0.5 to 1.5 kg, mostly water.';
  const lvl = (): OverAdvice['level'] => skipWhy ? 'watch' : unpaid < 0.15 * weeklyTarget ? 'reduce' : 'high';

  if (skipWhy) {
    const advice: OverAdvice = {
      level: 'watch', headline: skipWhy, skipCut: true, perDay: 0, days: 0, todayTarget: target, tomorrowTarget: target,
      detail: unpaid > 0 ? `Over by about ${overTodayOnly.toLocaleString()} kcal on the heavy day; about ${fatG.toLocaleString()} g of fat at most.${watery}${lowLog}` : `The heavy day was about ${overTodayOnly.toLocaleString()} kcal over its budget, but your week is still under budget.${lowLog}`,
    };
    return { tier, runDays, overDays7, message: skipWhy, target, floor, cause, needsEasierPace, advice, plan: [],
      ledger: { loggedDays, unloggedDays, weekNet, unpaid, recovered: 0, leftover: unpaid, fatG, delayDays: gap > 0 ? Math.round(unpaid / gap) : null, confidence } };
  }

  // The spread: recover a share of the surplus (not all), a few days, never above the cap, never below the floor.
  const t = tier === 'week' ? 'week' : tier === 'streak' ? 'streak' : 'single';
  const share = R.share[t] * (confidence === 'low' ? 0.7 : 1);
  const toRecover = unpaid * share;
  const days = Math.min(R.maxDays[t], Math.max(1, Math.ceil(toRecover / cap)));
  const perDay = Math.min(cap, Math.max(10, Math.ceil(toRecover / days / 10) * 10));
  const recovered = perDay * days;
  const leftover = Math.max(0, unpaid - recovered);
  const delayDays = direction === 'lose' && gap > 0 ? Math.max(0, Math.round(leftover / gap)) : null;

  // Start today only if today is still open and there is real room left in it; otherwise tomorrow.
  const todayRow = rows[rows.length - 1];
  const trimmedToday = target - perDay;
  const startToday = todayRow.state === 'open' && todayRow.eaten <= trimmedToday - 150;
  const startDate = startToday ? today : shift(today, 1);
  const plan: OverPlanDay[] = Array.from({ length: days }, (_, i) => ({ date: shift(startDate, i), kcal: Math.max(floor, target - perDay) }));
  const todayTarget = plan.find((p) => p.date === today)?.kcal ?? target;
  const tomorrowTarget = plan.find((p) => p.date === shift(today, 1))?.kcal ?? target;

  const headline = t === 'week'
    ? `This week is about ${Math.round(unpaid).toLocaleString()} kcal over. Reset gently, do not crash.`
    : t === 'streak' ? `${runDays} heavier days in a row. A small, spread-out trim is enough.`
    : 'One heavy day. A small trim over the next days settles it.';
  const detail = `Week balance: about ${Math.round(unpaid).toLocaleString()} kcal over (about ${fatG.toLocaleString()} g of fat).${watery} `
    + `Trim ${perDay} kcal a day for ${days} day${days > 1 ? 's' : ''} (≈ ${recovered.toLocaleString()} kcal, never below ${floor.toLocaleString()}).`
    + (leftover > 0 ? ` The remaining ~${Math.round(leftover).toLocaleString()} kcal settles with your normal pace${delayDays ? `, about ${delayDays} day${delayDays > 1 ? 's' : ''} later` : ''}.` : '')
    + lowLog;
  const advice: OverAdvice = { level: lvl(), headline, detail, perDay, days, skipCut: false, todayTarget, tomorrowTarget };
  return { tier, runDays, overDays7, message: headline, target, floor, cause, needsEasierPace, advice, plan,
    ledger: { loggedDays, unloggedDays, weekNet, unpaid, recovered, leftover, fatG, delayDays, confidence } };
}

/** Kcal a brisk 15-minute walk (MET 3.5) burns beyond resting, at this body weight, rounded to 5. Used instead of a fixed "60 to 80". */
export function walkKcal(weightKg?: number | null, minutes = 15): number {
  const w = n(weightKg) > 0 ? n(weightKg) : 70;
  return Math.round(estimateBurn(3.5, w, minutes) / 5) * 5;
}
