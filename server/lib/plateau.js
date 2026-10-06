// Weight-trend check: is the scale actually moving the way the goal says it should?
const { goalDirection } = require('./energy');
const { diffDays } = require('./dates');

const r2 = (x) => Math.round(x * 100) / 100;

/** Least-squares slope in kg per week over [{date, weightKg}] (oldest first). */
function slopePerWeek(points) {
  const t0 = points[0].date;
  const xs = points.map((p) => diffDays(t0, p.date)), ys = points.map((p) => Number(p.weightKg));
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i += 1) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  return den ? (num / den) * 7 : 0;
}

/**
 * @param weights  weigh-ins [{date, weightKg}] in any order
 * @param profile  profile-like object (goals.targetWeightKg, goals.weeklyPaceKg, sex, currentWeightKg)
 * @param today    YYYY-MM-DD
 * @param target   today's calorie target (kcal)
 */
function detectPlateau({ weights, profile = {}, today, target = null, windowDays = 21 }) {
  const recent = weights
    .filter((w) => w.date <= today && diffDays(w.date, today) < windowDays)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const span = recent.length ? diffDays(recent[0].date, recent[recent.length - 1].date) : 0;
  const base = { status: 'insufficient_data', weighIns: recent.length, spanDays: span, slopeKgPerWeek: null, suggestedKcalChange: 0, message: 'Log your weight at least 3 times over two weeks and FlexFit will check your trend.' };
  if (recent.length < 3 || span < 12) return base;

  const slope = r2(slopePerWeek(recent));
  const latest = Number(recent[recent.length - 1].weightKg);
  const goals = profile.goals || {};
  const direction = goalDirection(latest, goals.targetWeightKg);
  const pace = Number(goals.weeklyPaceKg) || 0.5;
  const out = { ...base, slopeKgPerWeek: slope };

  if (direction === 'maintain') {
    out.status = Math.abs(slope) <= 0.25 ? 'on_track' : 'drifting';
    out.message = out.status === 'on_track' ? 'Your weight is steady — right where a maintenance goal wants it.' : `Your weight is ${slope > 0 ? 'creeping up' : 'drifting down'} by about ${Math.abs(slope)} kg a week.`;
    return out;
  }

  const want = direction === 'lose' ? -1 : 1;          // sign we want the slope to have
  const progress = slope * want;                        // positive = moving the right way
  const floor = profile.sex === 'male' ? 1500 : 1200;
  const step = 100 + (pace >= 0.75 ? 50 : 0);

  if (progress >= pace * 0.5) { out.status = 'on_track'; out.message = `You're ${direction === 'lose' ? 'losing' : 'gaining'} about ${Math.abs(slope)} kg a week — on track.`; return out; }

  const canCut = direction === 'gain' || target === null || target - step >= floor;
  const change = direction === 'lose' ? (canCut ? -step : 0) : step;
  out.suggestedKcalChange = change;
  if (progress < -0.1) {
    out.status = 'wrong_direction';
    out.message = `Your weight is moving the other way (${slope > 0 ? '+' : ''}${slope} kg/week). Check that everything is being logged — sauces, oils, drinks — before changing your target.`;
  } else {
    out.status = 'plateau';
    out.message = `Your weight has been flat for about ${Math.round(span / 7)} weeks. First check logging accuracy (oil, portions, weekends).` +
      (change ? ` If that looks right, try ${change > 0 ? '+' : ''}${change} kcal a day for two weeks.` : ` You're already near the safe minimum, so consider more daily steps instead of eating less.`);
  }
  return out;
}

module.exports = { detectPlateau, slopePerWeek };
