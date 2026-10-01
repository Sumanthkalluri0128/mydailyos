// Calendar-date helpers that operate on "YYYY-MM-DD" strings in UTC so there
// are no time-zone surprises on the server.
const pad = (n) => String(n).padStart(2, '0');

function toStr(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
function parse(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function addDays(s, n) {
  const d = parse(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toStr(d);
}
function diffDays(a, b) {
  return Math.round((parse(b) - parse(a)) / 86400000);
}
/** 0 = Sunday … 6 = Saturday */
function weekday(s) {
  return parse(s).getUTCDay();
}
function enumerate(from, to) {
  const out = [];
  for (let c = from; c <= to; c = addDays(c, 1)) out.push(c);
  return out;
}
function todayUtc() {
  return toStr(new Date());
}

module.exports = { toStr, parse, addDays, diffDays, weekday, enumerate, todayUtc };
