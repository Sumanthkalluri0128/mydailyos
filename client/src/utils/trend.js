// Time-window moving average. Uses calendar days (not "the last N entries"),
// so a gap in weigh-ins doesn't distort the line.
function dayNumber(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

/**
 * @param points  [{ date: "YYYY-MM-DD", value: number }] (any order, duplicates per day are averaged)
 * @param windowDays number of calendar days to average over (default 7, inclusive of the current day)
 * @returns [{ date, value, avg }] sorted by date
 */
export function movingAverage(points, windowDays = 7) {
  const byDay = new Map();
  for (const p of points) {
    const v = Number(p.value);
    if (!p.date || !Number.isFinite(v)) continue;
    const entry = byDay.get(p.date) || { sum: 0, n: 0 };
    entry.sum += v;
    entry.n += 1;
    byDay.set(p.date, entry);
  }
  const daily = [...byDay.entries()]
    .map(([date, e]) => ({ date, value: e.sum / e.n, day: dayNumber(date) }))
    .sort((a, b) => a.day - b.day);

  return daily.map((p, i) => {
    let sum = 0;
    let n = 0;
    for (let j = i; j >= 0 && p.day - daily[j].day < windowDays; j--) {
      sum += daily[j].value;
      n++;
    }
    return { date: p.date, value: p.value, avg: sum / n };
  });
}
