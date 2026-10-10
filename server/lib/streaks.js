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
  return { current, longest, loggedToday, totalDays: set.size, last14, frozen, freezeUsedThisWeek: usedWeeks.has(weekKey(today)) };
}

module.exports = { computeStreaks };
