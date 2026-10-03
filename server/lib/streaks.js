const { addDays } = require('./dates');

/** `dates` = distinct YYYY-MM-DD days with at least one food entry. A streak survives until the day ends. */
function computeStreaks(dates, today) {
  const set = new Set(dates);
  const loggedToday = set.has(today);
  let current = 0;
  let cursor = loggedToday ? today : addDays(today, -1);
  while (set.has(cursor)) { current += 1; cursor = addDays(cursor, -1); }

  const sorted = [...set].sort();
  let longest = 0; let run = 0; let prev = null;
  for (const d of sorted) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = d;
  }
  const last14 = Array.from({ length: 14 }, (_, i) => { const d = addDays(today, i - 13); return { date: d, logged: set.has(d) }; });
  return { current, longest, loggedToday, totalDays: set.size, last14 };
}

module.exports = { computeStreaks };
