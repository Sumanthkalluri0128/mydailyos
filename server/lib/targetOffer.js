// "You are N weeks behind plan" used to be just a sentence. This turns it into a choice the person can make with one tap:
//   A. move the target date to the date the CURRENT trend really reaches the goal, or
//   B. raise the planned pace a little (never past the safe limit or the calorie floor, never while recovery, strength or logging say "not now").
// The coach never picks for the person and never applies this on its own: both options need a tap, are undoable, and an offer can be snoozed.
// Pure and deterministic. Returns structured data only (ids + numbers); the apps turn it into words in the person's language.
const { addDays, diffDays } = require('./dates');
const { maxSafeWeeklyLossKg } = require('./trendWeight');
const { KCAL_PER_KG } = require('./energy');

const OFFER = { behindWeeks: 3, maxRaise: 0.25, minRaise: 0.1, adherenceMin: 0.75, snoozeDays: 14 };
const r2 = (x) => Math.round(x * 100) / 100;
const ceil05 = (x) => Math.ceil(x * 20 - 1e-9) / 20;
const floor05 = (x) => Math.floor(x * 20 + 1e-9) / 20;

/**
 * @param o.today  o.direction 'lose'|'gain'|'maintain'  o.e expectedEnergy(profile)  o.floor calorie floor
 * @param o.plan profile.plan ({active, byDate, paceKg})  o.forecast goalForecast() result  o.currentKg latest trend weight
 * @param o.adherence 0..1|null   o.blockers {recoveryLow, strengthDown, dietBreak, underEating}   o.snoozedUntil 'YYYY-MM-DD'|''
 * @param o.pending true while another coach change waits for a tap or a change is still being judged
 * @returns null | {id, behindWeeks, refDate, remainingKg, date: option|null, pace: option|null, paceBlocked: ''|reason}
 */
function targetOffer({ today, direction, e, floor, plan = {}, forecast, currentKg, adherence = null, blockers = {}, snoozedUntil = '', pending = false } = {}) {
  if (!today || !forecast || !e || direction === 'maintain' || forecast.direction === 'maintain') return null;
  if (pending || (snoozedUntil && snoozedUntil > today)) return null;
  const byDate = plan && plan.active && plan.byDate ? String(plan.byDate).slice(0, 10) : '';
  const cur = forecast.atCurrent, atPlan = forecast.atPlan;
  const refDate = byDate || (atPlan ? atPlan.date : '');
  if (!refDate) return null;

  // How far behind: the current trend against the date the person is aiming for. A stalled trend has no date, so the plan pace decides.
  let late = 0;
  if (cur) late = diffDays(refDate, cur.date) / 7;
  else if (byDate && atPlan) late = diffDays(byDate, atPlan.date) / 7;
  const behindWeeks = Math.ceil(late - 1e-9);
  if (behindWeeks < OFFER.behindWeeks) return null;

  // A. a date that is honest about the pace you really have (or the plan pace, when the trend is not moving yet)
  const newDate = cur ? cur.date : atPlan ? atPlan.date : '';
  const date = plan && plan.active && newDate && newDate > refDate
    ? { id: 'date', apply: { type: 'targetDate', byDate: newDate, from: byDate }, newDate, fromDate: byDate || '', weeks: cur ? cur.weeks : atPlan.weeks } : null;

  // B. a faster pace, only when it is safe and the basics are in place
  let pace = null, paceBlocked = '';
  const why = direction !== 'lose' ? 'direction' : blockers.underEating ? 'under-eating' : blockers.dietBreak ? 'diet-break' : blockers.recoveryLow ? 'recovery' : blockers.strengthDown ? 'strength'
    : e.atFloor ? 'floor' : (adherence === null || adherence < OFFER.adherenceMin) ? 'adherence' : '';
  if (why) paceBlocked = why;
  else {
    const P = Number(plan && plan.paceKg) > 0 ? Number(plan.paceKg) : e.pace;
    const weeksLeft = Math.max(1, diffDays(today, refDate) / 7);
    const needed = forecast.remainingKg / weeksLeft;
    const cap = Math.min(1, maxSafeWeeklyLossKg(currentKg || e.weightKg), P + OFFER.maxRaise);
    const to = floor05(Math.min(cap, ceil05(needed)));
    if (to < P + OFFER.minRaise - 1e-9) paceBlocked = 'safe-limit';
    else {
      const kcal = Math.round((e.tdee - (to * KCAL_PER_KG) / 7) / 10) * 10;
      if (kcal < floor) paceBlocked = 'floor';
      else {
        const weeks = Math.ceil(forecast.remainingKg / to);
        const finish = addDays(today, weeks * 7);
        const apply = e.mode === 'manual' ? { type: 'calorie', calorieTarget: kcal, from: e.calorieTarget, planPaceKg: to } : { type: 'pace', weeklyPaceKg: to, from: e.pace, calorieTarget: kcal, planPaceKg: to };
        pace = { id: 'pace', apply, fromPace: r2(P), toPace: to, kcal, perDayLess: Math.max(0, Math.round(e.calorieTarget - kcal)), finishDate: finish, finishWeeks: weeks, reachesDate: finish <= refDate };
      }
    }
  }
  if (!date && !pace) return null;
  return { id: 'behind-target', behindWeeks, refDate, remainingKg: forecast.remainingKg, date, pace, paceBlocked: pace ? '' : paceBlocked };
}

module.exports = { OFFER, targetOffer };
