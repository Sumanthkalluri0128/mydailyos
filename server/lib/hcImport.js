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

// ---- The same workout logged by hand (or in the Gym log) AND recorded by a watch -------------------------------------------------
// Manual and Gym log entries have no clock times, so "the same session" is judged by day, kind of activity and minutes. A watch session is
// skipped (the person's own entry wins) when what they logged that day in the same kind of activity covers at least COVER of its minutes.
// COVER is 40 %, not 100 %, because the Gym log counts only the time spent on sets and rest, which is less than the whole visit.
// Minutes are shared out: 30 logged minutes cover one 60-minute watch session once, never two. Nothing is stored for a skipped session,
// so deleting your entry and syncing again imports the watch session. The caller offers the longest sessions first, and expects a request to carry
// whole days (the phone sends the last 7 days on every sync), so the same sync always gives the same answer.
const COVER = 0.4;
const groupOf = (category) => (String(category || '').toLowerCase() === 'strength' ? 'strength' : String(category || 'other').toLowerCase());

/** manualRows: [{date, category, durationMinutes}] of everything the person logged themselves (not from Health Connect). */
function manualBudget(manualRows) {
  const left = new Map();
  for (const r of manualRows || []) {
    const k = `${r.date}|${groupOf(r.category)}`;
    left.set(k, (left.get(k) || 0) + Math.max(0, Number(r.durationMinutes) || 0));
  }
  return {
    /** true when the person's own entries already account for this watch session (and uses those minutes up). */
    covers(date, category, minutes) {
      const k = `${date}|${groupOf(category)}`, have = left.get(k) || 0;
      if (!(minutes > 0) || have < COVER * minutes) return false;
      left.set(k, Math.max(0, have - minutes));
      return true;
    },
  };
}

/**
 * The same rule applied to ALL of a day's watch sessions together: the ones already imported and the ones about to be, so the result does not depend on
 * which arrived first (the watch import or the person's own entry). Longest session first; an imported one wins a tie over a new one.
 *   manualRows: [{date, category, durationMinutes}]    existing: [{_id, date, category, durationMinutes}]    fresh: [{clientId, date, category, durationMinutes}]
 * Returns { skipFresh: Set of clientIds not to import, dropExisting: [_id of imported sessions the person's own entries now cover] }.
 */
function partitionHc({ manualRows, existing = [], fresh = [] }) {
  const items = [
    ...existing.map((e) => ({ ...e, isExisting: true })),
    ...fresh.map((f) => ({ ...f, isExisting: false })),
  ].sort((a, b) => (b.durationMinutes - a.durationMinutes) || (Number(b.isExisting) - Number(a.isExisting)) || ((a.startMs || 0) - (b.startMs || 0)));
  const budget = manualBudget(manualRows);
  const skipFresh = new Set(), dropExisting = [];
  for (const it of items) {
    if (!budget.covers(it.date, it.category, it.durationMinutes)) continue;
    if (it.isExisting) dropExisting.push(it._id); else skipFresh.add(it.clientId);
  }
  return { skipFresh, dropExisting };
}

module.exports = { mapExercise, normalizeSession, overlapRatio, planImport, manualBudget, partitionHc, groupOf, COVER, appLabel, FALLBACK, TYPE_TO_ACTIVITY };
