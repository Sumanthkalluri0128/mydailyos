// Plan helpers that touch the Profile document (kept apart from northStar.js, which is pure).
const { expectedEnergy } = require('./energy');
const { addDays } = require('./dates');

/**
 * ONE diet-break mechanism, shared by the plan screen and the coach: a window {from, to} in CoachState.dietBreak. While it runs, each day's food
 * budget is widened up to MAINTENANCE (lib/coachH.js dayEffect), and maintenance is the measured one when there is enough data (energy.blendTdee).
 * Nothing in the profile's calorie goal is changed, so there is nothing to restore and a break can never leave a wrong target behind.
 * `plan.breakUntil` is only a mirror so the plan screens can show "on a break until ...".
 */
const BREAK_DAYS = { default: 7, max: 14 };

/** Starts a break of `days` (default 7, up to 14). Returns the CoachState window to save and the profile mirror to set. */
function startBreak(profile, today, days = BREAK_DAYS.default) {
  const e = expectedEnergy(profile);
  if (!e) return { ok: false, reason: 'Add your height, age and weight first so we can work out maintenance.' };
  const p = profile.plan || {};
  if (p.breakUntil && p.breakUntil >= today) return { ok: true, already: true, until: p.breakUntil, maintenance: e.tdee };
  const len = Math.min(BREAK_DAYS.max, Math.max(1, Math.round(Number(days) || BREAK_DAYS.default)));
  const until = addDays(today, len - 1);
  return { ok: true, window: { kind: 'plan-break', from: today, to: until }, set: { 'plan.breakUntil': until }, until, maintenance: e.tdee, measured: e.measuredTdee };
}

/** Ends a break (early, or because it has run out): clears the mirror. A break started by an OLDER version (it had changed the calorie goal) is restored too. */
function endBreak(profile, today) {
  const p = profile.plan || {};
  if (!p.breakUntil) return null;
  const legacy = p.breakPrev && p.breakPrev.mode;
  return {
    ...(legacy ? { 'goals.calorieMode': p.breakPrev.mode, ...(p.breakPrev.mode === 'manual' && p.breakPrev.target ? { 'goals.calorieTarget': p.breakPrev.target } : {}), 'plan.breakPrev.mode': '' } : {}),
    'plan.breakUntil': '', 'plan.lastBreakEnd': today,
  };
}
const breakExpired = (profile, today) => !!profile.plan?.breakUntil && profile.plan.breakUntil < today;

module.exports = { startBreak, endBreak, breakExpired, BREAK_DAYS };
