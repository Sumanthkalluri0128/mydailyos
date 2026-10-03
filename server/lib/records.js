/** Personal records per exercise from logged sets: heaviest set, best estimated 1RM (Epley) and total volume. */
function computeRecords(logs) {
  const byName = new Map();
  for (const log of logs) {
    for (const s of log.sets || []) {
      const w = Number(s.weightKg) || 0; const reps = Number(s.reps) || 0;
      if (!reps) continue;
      const r = byName.get(log.activityName) || { activityName: log.activityName, bestWeightKg: 0, bestWeightReps: 0, bestWeightDate: '', best1RM: 0, totalVolumeKg: 0, totalSets: 0, lastDate: '' };
      if (w > r.bestWeightKg || (w === r.bestWeightKg && reps > r.bestWeightReps)) { r.bestWeightKg = w; r.bestWeightReps = reps; r.bestWeightDate = log.date; }
      const e1 = w * (1 + reps / 30);
      if (e1 > r.best1RM) r.best1RM = Math.round(e1 * 10) / 10;
      r.totalVolumeKg += w * reps; r.totalSets += 1;
      if (log.date > r.lastDate) r.lastDate = log.date;
      byName.set(log.activityName, r);
    }
  }
  return [...byName.values()].sort((a, b) => b.lastDate.localeCompare(a.lastDate) || a.activityName.localeCompare(b.activityName));
}
module.exports = { computeRecords };
