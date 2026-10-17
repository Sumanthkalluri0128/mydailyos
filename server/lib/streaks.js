const { addDays, diffDays, weekday } = require('./dates');

/** Monday of the week containing `d` — a "freeze" is allowed once per such week. */
const weekKey = (d) => addDays(d, -((weekday(d) + 6) % 7));

/**
 * `dates` = distinct YYYY-MM-DD days with at least one food entry. A streak survives until the day ends.
 * With `{ freeze: true }` ONE missed day per calendar week (Mon–Sun) is bridged instead of breaking the streak — never two
 * missed days in a row, and a freeze only counts once you have logged again after the gap. Frozen days are not counted as logged.
 */
function computeStreaks(dates, today, { freeze = false } = {}) {
  const set = new Set(dates);
  const loggedToday = set.has(today);
  let current = 0;
  const frozen = [];
  const usedWeeks = new Set();
  let cursor = loggedToday ? today : addDays(today, -1);
  for (;;) {
    if (set.has(cursor)) { current += 1; cursor = addDays(cursor, -1); continue; }
    const canFreeze = freeze && current > 0 && cursor < today && set.has(addDays(cursor, -1)) && !usedWeeks.has(weekKey(cursor));
    if (!canFreeze) break;
    usedWeeks.add(weekKey(cursor)); frozen.push(cursor); cursor = addDays(cursor, -1);
  }

  const sorted = [...set].sort();
  let longest = 0; let run = 0; let prev = null; let used = new Set();
  for (const d of sorted) {
    if (!prev) run = 1;
    else {
      const gap = diffDays(prev, d);
      const missed = addDays(prev, 1);
      if (gap === 1) run += 1;
      else if (freeze && gap === 2 && !used.has(weekKey(missed))) { used.add(weekKey(missed)); run += 1; }
      else { run = 1; used = new Set(); }
    }
    if (run > longest) longest = run;
    prev = d;
  }
  const last14 = Array.from({ length: 14 }, (_, i) => { const d = addDays(today, i - 13); return { date: d, logged: set.has(d), frozen: frozen.includes(d) }; });
  return { current, longest, loggedToday, totalDays: set.size, last14, frozen, freezeUsedThisWeek: usedWeeks.has(weekKey(today)), weekly: weeklyStreak(set, today), ...comebackInfo(set, today) };
}

/**
 * Forgiving "5 of 7 days" weekly streak: a Mon–Sun week counts when at least `need` of its days have a log. The week in progress never
 * breaks the streak (it simply adds to it once it reaches `need`), so a slow Monday is not a failure.
 */
function weeklyStreak(set, today, need = 5) {
  const monday = weekKey(today);
  const daysIn = (start) => Array.from({ length: 7 }, (_, i) => addDays(start, i)).filter((d) => set.has(d) && d <= today).length;
  const thisWeek = daysIn(monday);
  let weeks = 0; let cursor = addDays(monday, -7);
  while (daysIn(cursor) >= need) { weeks += 1; cursor = addDays(cursor, -7); }
  if (thisWeek >= need) weeks += 1;
  const daysLeft = 6 - ((weekday(today) + 6) % 7);
  return { need, daysThisWeek: thisWeek, hit: thisWeek >= need, weeks, daysLeft, canStillHit: thisWeek + daysLeft + (set.has(today) ? 0 : 1) >= need };
}

/**
 * Comebacks: a gap of 3+ days with nothing logged followed by logging again. Coming back is the skill that matters most for dieting,
 * so it earns a badge instead of a broken streak. `returned` is true while the latest comeback is under a week old.
 */
function comebackInfo(set, today) {
  const sorted = [...set].sort();
  let comebacks = 0; let last = null;
  for (let i = 1; i < sorted.length; i += 1) {
    const missed = diffDays(sorted[i - 1], sorted[i]) - 1;
    if (missed >= 3) { comebacks += 1; last = { on: sorted[i], missedDays: missed }; }
  }
  const returned = !!last && diffDays(last.on, today) <= 6;
  return { comebacks, comeback: returned ? last : null, lapsed: sorted.length > 0 && diffDays(sorted[sorted.length - 1], today) >= 3 ? { days: diffDays(sorted[sorted.length - 1], today) } : null };
}

module.exports = { computeStreaks, weeklyStreak, comebackInfo };
