// Monthly "season recap" (Wrapped) numbers. Pure. The image itself is drawn on the device (see client wrappedCard); no server image API.
// Health numbers (calories, weight) are only included when the person turns them on (`showHealth`).
const { addDays, diffDays, weekday } = require('./dates');

const monthOf = (d) => String(d).slice(0, 7);
const monthRange = (month) => {
  const from = `${month}-01`; const [y, m] = month.split('-').map(Number);
  const to = addDays(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`, -1);
  return { from, to };
};
const mondayOf = (d) => addDays(d, -((weekday(d) + 6) % 7));

function longestRun(dates) {
  const s = [...new Set(dates)].sort(); let best = 0, run = 0, prev = null;
  for (const d of s) { run = prev && diffDays(prev, d) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = d; }
  return best;
}
/** The week (Mon-Sun) with the most logged days. Ties go to the earlier week. */
function bestWeek(dates) {
  const by = new Map();
  for (const d of new Set(dates)) { const k = mondayOf(d); by.set(k, (by.get(k) || 0) + 1); }
  let best = null;
  for (const [start, days] of [...by].sort((a, b) => a[0].localeCompare(b[0]))) if (!best || days > best.days) best = { start, days };
  return best;
}
function topFoods(names, n = 3) {
  const c = new Map();
  for (const raw of names) { const k = String(raw || '').trim(); if (k) c.set(k, (c.get(k) || 0) + 1); }
  return [...c].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([name, count]) => ({ name, count }));
}
/** Character with the most stickers owned; ties alphabetical; null when none. */
function favouriteCharacter(owned) {
  const c = new Map();
  for (const id of owned || []) { const who = String(id).split('/')[0]; if (who) c.set(who, (c.get(who) || 0) + 1); }
  const top = [...c].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return top ? { who: top[0], stickers: top[1] } : null;
}

function buildWrapped({ month, foodLogs = [], activityDates = [], owned = [], ownedBefore = null, weights = [], showHealth = false }) {
  const { from, to } = monthRange(month);
  const inMonth = (d) => d >= from && d <= to;
  const logged = [...new Set(foodLogs.filter((l) => inMonth(l.date)).map((l) => l.date))];
  const fav = favouriteCharacter(owned);
  const chars = new Set((owned || []).map((id) => String(id).split('/')[0]));
  const out = {
    month, from, to,
    daysLogged: logged.length,
    longestStreak: longestRun(logged),
    bestWeek: bestWeek(logged),
    favouriteFoods: topFoods(foodLogs.filter((l) => inMonth(l.date)).map((l) => l.foodName)),
    character: fav,
    stickersTotal: (owned || []).length,
    stickersThisMonth: ownedBefore == null ? null : Math.max(0, (owned || []).length - ownedBefore),
    charactersUnlocked: chars.size,
    workoutDays: null, avgCalories: null, weightChangeKg: null, showHealth: !!showHealth,
  };
  if (showHealth) {
    out.workoutDays = new Set(activityDates.filter(inMonth)).size;
    const kc = new Map(); for (const l of foodLogs.filter((x) => inMonth(x.date))) kc.set(l.date, (kc.get(l.date) || 0) + (Number(l.calories) || 0));
    out.avgCalories = kc.size ? Math.round([...kc.values()].reduce((a, b) => a + b, 0) / kc.size) : null;
    const w = weights.filter((x) => inMonth(x.date) && Number.isFinite(Number(x.weightKg))).sort((a, b) => a.date.localeCompare(b.date));
    out.weightChangeKg = w.length >= 2 ? Math.round((w.at(-1).weightKg - w[0].weightKg) * 10) / 10 : null;
  }
  return out;
}
module.exports = { monthOf, monthRange, longestRun, bestWeek, topFoods, favouriteCharacter, buildWrapped };
