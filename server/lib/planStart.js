// Re-saving a plan used to restart progress at 0 (start weight = today's weight, start date = today), which silently shrank "kg done".
// Now the start is only reset when the person asks for a fresh start. Pure functions, no database.
const MODES = ['keep', 'fresh'];

/** Is there an active plan with a usable start we could keep? */
const hasStart = (plan) => !!(plan && plan.active && Number(plan.startKg) > 0 && plan.startDate);

/**
 * @param plan       profile.plan as saved
 * @param requested  'keep' | 'fresh' | undefined (older apps send nothing)
 * @param currentKg  profile.currentWeightKg, @param today 'YYYY-MM-DD'
 * @returns {{mode:'keep'|'fresh', startKg:number, startDate:string}}
 * With an active plan and no choice we KEEP: an old app that does not ask must never wipe progress.
 */
function resolveStart({ plan, requested, currentKg, today }) {
  const can = hasStart(plan);
  const mode = MODES.includes(requested) ? requested : (can ? 'keep' : 'fresh');
  if (mode === 'keep' && can) return { mode: 'keep', startKg: Number(plan.startKg), startDate: String(plan.startDate).slice(0, 10) };
  return { mode: 'fresh', startKg: Number(currentKg), startDate: today };
}

/** What the apps show in the "keep your old start, or start fresh?" prompt. null when there is nothing to ask. */
function startChoice({ plan, currentKg, today }) {
  if (!hasStart(plan)) return null;
  const same = Number(plan.startKg) === Number(currentKg) && String(plan.startDate).slice(0, 10) === today;
  if (same) return null;
  return { keep: { startKg: Number(plan.startKg), startDate: String(plan.startDate).slice(0, 10) }, fresh: { startKg: Number(currentKg), startDate: today } };
}

module.exports = { MODES, hasStart, resolveStart, startChoice };
