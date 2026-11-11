// Weigh-in noise filter. One reading that is far from its neighbours (a salty dinner, a different scale, a typo) must not move a
// coaching decision. A reading is dropped ONLY when the other readings around it agree with each other and it does not.
// Pure; never drops the newest reading (nothing after it can confirm it) and never drops when there are too few neighbours.
const { diffDays } = require('./dates');

const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** @param points [{date, weightKg}] any order. @returns {kept, dropped} both ascending by date. */
function dropOutliers(points, { windowDays = 6, minKg = 1.5, pct = 0.02, agreeKg = 1.0 } = {}) {
  const byDate = new Map();
  for (const p of points || []) if (p && p.date && Number(p.weightKg) > 0) byDate.set(p.date, { ...p, weightKg: Number(p.weightKg) });
  const all = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const kept = [], dropped = [];
  all.forEach((p, i) => {
    const hasLater = i < all.length - 1;
    const near = all.filter((q, j) => j !== i && Math.abs(diffDays(p.date, q.date)) <= windowDays);
    if (!hasLater || near.length < 3) { kept.push(p); return; }
    const ws = near.map((q) => q.weightKg);
    const med = median(ws);
    const spread = Math.max(...ws) - Math.min(...ws);
    const off = Math.abs(p.weightKg - med);
    if (spread <= agreeKg * 2 && off > Math.max(minKg, med * pct)) dropped.push({ ...p, medianKg: Math.round(med * 10) / 10 });
    else kept.push(p);
  });
  return { kept, dropped };
}

module.exports = { dropOutliers };
