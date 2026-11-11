// "Is the person getting stronger, holding, or losing strength?" from their OWN logged lifts.
// The diet coach reads this so it never keeps cutting calories while strength falls (muscle is being lost), and protects a deficit
// that is working while lifts keep rising. Pure, no database. Easy / return weeks are lighter on purpose and are ignored.
const { epley } = require('./strength');
const { diffDays } = require('./dates');

const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/**
 * @param o.sessions  BodyPlanSession-like rows {date, status, phase, exercises:[{id, done, sets:[{reps, weightKg}]}]}
 * @param o.activity  ActivityLog-like rows {date, activityName, sets:[{reps, weightKg}]}
 * @param o.today     'YYYY-MM-DD'
 * @returns {status:'up'|'flat'|'down'|'unknown', pct, lifts, recentDays, note}
 */
function strengthTrend({ sessions = [], activity = [], today, recentDays = 21, baselineDays = 42 } = {}) {
  if (!today) return { status: 'unknown', pct: null, lifts: 0 };
  const rows = new Map(); // lift -> [{age, e1rm}]
  const add = (key, date, weightKg, reps) => {
    const age = diffDays(date, today);
    if (age < 0 || age >= recentDays + baselineDays) return;
    const w = Number(weightKg), r = Number(reps);
    if (!(w > 0) || !(r >= 1) || r > 12) return;               // bodyweight and very high reps are not a clean strength signal
    const e = epley(w, r);
    if (!e) return;
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push({ age, e1rm: e });
  };
  for (const s of sessions) {
    if (!s || !s.date || s.status === 'skipped' || s.phase === 'easy' || s.phase === 'back') continue;
    for (const ex of s.exercises || []) {
      if (ex.done === false) continue;
      for (const st of ex.sets || []) add(`s:${ex.id}`, s.date, st.weightKg, st.reps);
    }
  }
  for (const a of activity) {
    if (!a || !a.date || !a.sets || !a.sets.length) continue;
    for (const st of a.sets) add(`a:${a.activityName}`, a.date, st.weightKg, st.reps);
  }
  const changes = [];
  for (const list of rows.values()) {
    const recent = list.filter((x) => x.age < recentDays).map((x) => x.e1rm);
    const base = list.filter((x) => x.age >= recentDays).map((x) => x.e1rm);
    if (!recent.length || !base.length) continue;
    const b = Math.max(...base);
    changes.push((Math.max(...recent) - b) / b);
  }
  if (changes.length < 2) return { status: 'unknown', pct: null, lifts: changes.length, note: 'Log at least two lifts over a few weeks and the coach can read your strength.' };
  const pct = Math.round(median(changes) * 1000) / 10;      // median % change in estimated 1RM, recent vs earlier best
  const status = pct <= -4 ? 'down' : pct >= 2 ? 'up' : 'flat';
  const note = status === 'down' ? `Your lifts are about ${Math.abs(pct)}% below your recent best. Falling strength while dieting is the early sign of muscle loss.`
    : status === 'up' ? `Your lifts are up about ${pct}%. Muscle is being kept or built.` : 'Your lifts are holding steady.';
  return { status, pct, lifts: changes.length, note };
}

module.exports = { strengthTrend };
