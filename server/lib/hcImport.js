// Health Connect exercise sessions -> activity logs. Pure rules (no database): type mapping, normalising, duplicate protection.
// Duplicate protection has two layers: the same session never imports twice (stable id), and the same workout seen by two
// apps (for example a watch app and Samsung Health) is skipped when it overlaps one already imported.

// Health Connect ExerciseSessionRecord type numbers -> activity names in our catalogue.
const TYPE_TO_ACTIVITY = {
  2: 'Badminton - Recreational', 5: 'Basketball', 8: 'Cycling - Moderate', 9: 'Indoor cycling / Spin class', 13: 'Bodyweight circuit',
  14: 'Cricket', 16: 'Bhangra / Garba dance', 25: 'Elliptical trainer', 33: 'Cult – Meditation', 36: 'HIIT', 37: 'Hiking / Trekking',
  54: 'Rowing machine', 53: 'Rowing machine', 56: 'Running - Moderate', 57: 'Running - Moderate', 64: 'Football / Soccer', 66: 'Squash',
  68: 'Stair Climbing', 69: 'Stair Climbing', 70: 'Strength Training', 71: 'Cult – Stretching / Mobility', 73: 'Swimming - Moderate',
  74: 'Swimming - Moderate', 75: 'Table Tennis', 76: 'Tennis', 78: 'Volleyball / Throwball', 79: 'Walking - Moderate', 81: 'Strength Training',
  83: 'Yoga', 10: 'HIIT',
};
const FALLBACK = 'Other workout';

const mapExercise = (typeId) => TYPE_TO_ACTIVITY[Number(typeId)] || FALLBACK;

const APPS = {
  'com.sec.android.app.shealth': 'Samsung Health', 'com.google.android.apps.fitness': 'Google Fit', 'com.fitbit.FitbitMobile': 'Fitbit',
  'com.garmin.android.apps.connectmobile': 'Garmin Connect', 'com.huawei.health': 'Huawei Health', 'com.mi.health': 'Mi Fitness',
  'com.xiaomi.wearable': 'Mi Fitness', 'com.google.android.apps.healthdata': 'Health Connect',
};
const appLabel = (pkg) => APPS[String(pkg || '')] || (pkg ? String(pkg).slice(0, 60) : 'Health Connect');

/** One raw session {id, type, startTime, endTime, date, app, avgHr, maxHr, title} -> a clean record, or null if unusable. */
function normalizeSession(raw) {
  const id = String(raw?.id || '').trim();
  const start = Date.parse(raw?.startTime), end = Date.parse(raw?.endTime);
  if (!id || id.length > 120 || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const minutes = Math.round((end - start) / 60000);
  if (minutes < 1 || minutes > 1440) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw?.date || ''))) return null;
  const hr = (x) => (Number.isFinite(Number(x)) && Number(x) >= 30 && Number(x) <= 250 ? Math.round(Number(x)) : null);
  return {
    clientId: `hc:${id}`.slice(0, 140), date: raw.date, startMs: start, endMs: end, durationMinutes: minutes,
    activityName: mapExercise(raw.type), sourceApp: appLabel(raw.app), avgHeartRate: hr(raw.avgHr), maxHeartRate: hr(raw.maxHr),
    title: String(raw.title || '').slice(0, 80),
  };
}

/** Fraction of the SHORTER session that is covered by the overlap (0..1). */
function overlapRatio(a, b) {
  const o = Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs);
  return o <= 0 ? 0 : o / Math.min(a.endMs - a.startMs, b.endMs - b.startMs);
}

/**
 * Decide what to import. existing = [{clientId, startMs, endMs}] already imported (any app).
 * Returns { fresh: [...], skipped: [{clientId, reason}] }. Also dedupes inside the batch.
 */
function planImport(rawSessions, existing = []) {
  const seen = existing.map((e) => ({ clientId: e.clientId, startMs: e.startMs, endMs: e.endMs }));
  const fresh = [], skipped = [];
  for (const raw of (rawSessions || []).slice(0, 200)) {
    const s = normalizeSession(raw);
    if (!s) { skipped.push({ clientId: String(raw?.id || ''), reason: 'invalid' }); continue; }
    if (seen.some((e) => e.clientId === s.clientId)) { skipped.push({ clientId: s.clientId, reason: 'already-imported' }); continue; }
    if (seen.some((e) => e.startMs && overlapRatio(s, e) >= 0.6)) { skipped.push({ clientId: s.clientId, reason: 'overlaps' }); continue; }
    fresh.push(s); seen.push(s);
  }
  return { fresh, skipped };
}

module.exports = { mapExercise, normalizeSession, overlapRatio, planImport, appLabel, FALLBACK, TYPE_TO_ACTIVITY };
