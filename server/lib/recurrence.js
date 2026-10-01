// Decides whether a recurring task "lands" on a given date.
const { weekday, parse, toStr, diffDays } = require('./dates');

function daysInMonth(y, m0) {
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
}

/**
 * @param rule   'daily' | 'weekdays' | 'weekly' | 'monthly' | 'none'
 * @param anchor "YYYY-MM-DD" of a task instance in the series
 * @param target "YYYY-MM-DD" date being tested
 */
function recurrenceMatches(rule, anchor, target) {
  if (rule === 'none' || !rule) return false;
  if (diffDays(anchor, target) <= 0) return false; // only ever generates *later* dates
  switch (rule) {
    case 'daily':
      return true;
    case 'weekdays': {
      const d = weekday(target);
      return d >= 1 && d <= 5;
    }
    case 'weekly':
      return weekday(anchor) === weekday(target);
    case 'monthly': {
      const a = parse(anchor);
      const t = parse(target);
      // Clamp e.g. the 31st to the last day of shorter months.
      const want = Math.min(a.getUTCDate(), daysInMonth(t.getUTCFullYear(), t.getUTCMonth()));
      return t.getUTCDate() === want;
    }
    default:
      return false;
  }
}

/** The next date after `from` on which the rule fires (used for "create the next occurrence"). */
function nextOccurrence(rule, anchor) {
  if (!rule || rule === 'none') return null;
  const limit = 400;
  let cursor = parse(anchor);
  for (let i = 0; i < limit; i++) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const s = toStr(cursor);
    if (recurrenceMatches(rule, anchor, s)) return s;
  }
  return null;
}

module.exports = { recurrenceMatches, nextOccurrence };
