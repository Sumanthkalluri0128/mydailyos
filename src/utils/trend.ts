// Time-window moving average (calendar days, not "last N entries", so gaps between
// weigh-ins don't distort the line). Mirrors the web client's utils/trend.js.
export type TrendPoint = { date: string; value: number };
export type TrendResult = { date: string; value: number; avg: number };

function dayNumber(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

export function movingAverage(points: TrendPoint[], windowDays = 7): TrendResult[] {
  const byDay = new Map<string, { sum: number; n: number }>();
  for (const p of points) {
    const v = Number(p.value);
    if (!p.date || !Number.isFinite(v)) continue;
    const e = byDay.get(p.date) || { sum: 0, n: 0 };
    e.sum += v;
    e.n += 1;
    byDay.set(p.date, e);
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
