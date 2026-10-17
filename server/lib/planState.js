// Plan helpers that touch the Profile document (kept apart from northStar.js, which is pure).
const { expectedEnergy } = require('./energy');
const { addDays } = require('./dates');

/** Starts a maintenance break: hold the target at maintenance (TDEE) for `days`, remembering how to restore. */
function startBreak(profile, today, days = 14) {
  const e = expectedEnergy(profile);
  if (!e) return { ok: false, reason: 'Add your height, age and weight first so we can work out maintenance.' };
  const p = profile.plan || {};
  if (p.breakUntil && p.breakUntil >= today) return { ok: true, already: true, until: p.breakUntil };
  return {
    ok: true,
    set: {
      'plan.breakUntil': addDays(today, days), 'plan.breakPrev.mode': profile.goals?.calorieMode || 'auto', 'plan.breakPrev.target': profile.goals?.calorieTarget ?? null,
      'goals.calorieMode': 'manual', 'goals.calorieTarget': e.tdee,
    },
    until: addDays(today, days), maintenance: e.tdee,
  };
}

/** Ends a break (early, or because it has run out) and restores the previous calorie mode. */
function endBreak(profile, today) {
  const p = profile.plan || {};
  if (!p.breakUntil) return null;
  return {
    'goals.calorieMode': p.breakPrev?.mode || 'auto',
    ...(p.breakPrev?.mode === 'manual' && p.breakPrev?.target ? { 'goals.calorieTarget': p.breakPrev.target } : {}),
    'plan.breakUntil': '', 'plan.lastBreakEnd': today,
  };
}
const breakExpired = (profile, today) => !!profile.plan?.breakUntil && profile.plan.breakUntil < today;

module.exports = { startBreak, endBreak, breakExpired };
