// Turns a finished workout (sets per exercise) into ActivityLog rows. Pure: no database.
const { estimateBurn } = require('./energy');
const SECONDS_PER_SET = 90; // a set plus its rest, used only when the person did not give a duration

const cleanSets = (raw) => (Array.isArray(raw) ? raw : []).slice(0, 40)
  .map((s) => ({ reps: Math.round(Number(s?.reps)), weightKg: Math.max(0, Number(s?.weightKg) || 0) }))
  .filter((s) => s.reps >= 1 && s.reps <= 1000 && s.weightKg <= 1000);

/**
 * items: [{activityId, activityName, category, met, durationMinutes?, sets}]
 * Returns log rows. Duration is the given one, else ~90 s a set (at least 1 minute). Calories = (MET - 1) x 3.5 x kg / 200 x minutes (energy.estimateBurn: only what the exercise itself burns).
 */
function buildLogs({ userId, items, date, weightKg, label, clientId }) {
  return items.map((i, idx) => {
    const sets = cleanSets(i.sets);
    const minutes = Math.max(1, Math.round(Number(i.durationMinutes) || (sets.length * SECONDS_PER_SET) / 60));
    const met = Number(i.met) || 4;
    return {
      userId, activityId: i.activityId, date, activityName: i.activityName, category: i.category || 'Strength',
      durationMinutes: minutes, weightKg, met, caloriesBurned: estimateBurn(met, weightKg, minutes),
      sets, notes: label || '', clientId: clientId ? `${clientId}#${idx}` : undefined,
    };
  });
}

module.exports = { buildLogs, cleanSets, SECONDS_PER_SET };
