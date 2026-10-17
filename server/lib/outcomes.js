// Outcome-based achievements in tiers (bronze / silver / gold) that celebrate real body change and healthy habits, not activity counts.
const { addDays, weekday } = require('./dates');

const KCAL_PER_KG = 7700;
const r1 = (x) => Math.round(x * 10) / 10;
const TIERS = ['bronze', 'silver', 'gold'];

const FAMILIES = [
  { id: 'fat-kg', emoji: '⚖️', unit: 'kg', title: 'Weight lost', loseOnly: true, tiers: [1, 5, 10], names: ['First kilo', 'Five kilos', 'Ten kilos'], desc: (a) => `Trend weight down ${a} kg from where you started.` },
  { id: 'fat-pct', emoji: '📉', unit: '%', title: 'Body weight lost', loseOnly: true, tiers: [2, 5, 10], names: ['2% lighter', '5% lighter', '10% lighter'], desc: (a) => `Down ${a}% of your starting body weight.` },
  { id: 'deficit', emoji: '🔥', unit: 'kg of fat', title: 'Energy deficit', loseOnly: true, tiers: [1, 3, 8], names: ['A kilo burned', 'Three kilos burned', 'Eight kilos burned'], desc: (a) => `Your logged deficit adds up to about ${a} kg of body fat.` },
  { id: 'waist', emoji: '📏', unit: 'cm', title: 'Waist', loseOnly: true, tiers: [2, 5, 10], names: ['Waist −2 cm', 'Waist −5 cm', 'Waist −10 cm'], desc: (a) => `Waist measurement down ${a} cm.` },
  { id: 'protein-week', emoji: '🥚', unit: 'weeks', title: 'Protein weeks', tiers: [1, 4, 12], names: ['Protein week', 'Protein month', 'Protein quarter'], desc: (a) => `${a} full week${a === 1 ? '' : 's'} with protein on target on 6 of 7 days.` },
  { id: 'muscle', emoji: '💪', unit: 'weeks', title: 'Muscle protection', tiers: [1, 4, 8], names: ['Muscle guard', 'Muscle shield', 'Muscle fortress'], desc: (a) => `${a} week${a === 1 ? '' : 's'} with protein on target and 2+ strength sessions, so you lose fat and keep muscle.` },
  { id: 'comeback', emoji: '🌅', unit: 'comebacks', title: 'Comeback', tiers: [1, 3, 6], names: ['Comeback', 'Resilient', 'Unshakeable'], desc: (a) => `You came back after a break ${a} time${a === 1 ? '' : 's'}. Coming back is the skill that matters most.` },
];

/**
 * @param v {direction, startKg, trendKg, startWaistCm, waistCm, deficitKcal, proteinWeeks, muscleWeeks, comebacks}
 */
function buildOutcomeBadges(v) {
  const lose = v.direction === 'lose';
  const lost = v.startKg > 0 && v.trendKg > 0 ? Math.max(0, v.startKg - v.trendKg) : 0;
  const values = {
    'fat-kg': r1(lost),
    'fat-pct': v.startKg > 0 ? r1((lost / v.startKg) * 100) : 0,
    deficit: r1(Math.max(0, v.deficitKcal || 0) / KCAL_PER_KG),
    waist: v.startWaistCm > 0 && v.waistCm > 0 ? r1(Math.max(0, v.startWaistCm - v.waistCm)) : 0,
    'protein-week': v.proteinWeeks || 0,
    muscle: v.muscleWeeks || 0,
    comeback: v.comebacks || 0,
  };
  const out = [];
  for (const f of FAMILIES) {
    if (f.loseOnly && !lose) continue;
    const value = values[f.id];
    const reached = f.tiers.map((t) => value >= t);
    const idx = reached.lastIndexOf(true);
    const next = f.tiers[idx + 1] ?? null;
    const prevAt = idx >= 0 ? f.tiers[idx] : 0;
    out.push({
      id: f.id, emoji: f.emoji, family: f.title, unit: f.unit, value,
      tier: idx >= 0 ? TIERS[idx] : null,
      name: idx >= 0 ? f.names[idx] : f.names[0],
      description: f.desc(idx >= 0 ? f.tiers[idx] : f.tiers[0]),
      tiers: f.tiers.map((at, i) => ({ tier: TIERS[i], at, name: f.names[i], reached: reached[i] })),
      nextAt: next, progress: next ? Math.max(0, Math.min(1, (value - prevAt) / (next - prevAt))) : 1,
    });
  }
  const unlocked = out.filter((b) => b.tier);
  return { badges: out, unlocked: unlocked.length, next: out.filter((b) => b.nextAt).sort((a, b) => b.progress - a.progress)[0] || null, deficitKg: values.deficit };
}

/**
 * Whole Mon–Sun weeks (last `weeks` of them, this one excluded until it ends) that met the bar.
 * @param days [{date, calories, protein}]; strengthDates Set of dates with logged sets
 */
function weeklyFlags(days, strengthDates, proteinTarget, today, weeks = 26) {
  if (!(proteinTarget > 0)) return { proteinWeeks: 0, muscleWeeks: 0 };
  const monday = addDays(today, -((weekday(today) + 6) % 7));
  const by = new Map(days.map((d) => [d.date, d]));
  let proteinWeeks = 0, muscleWeeks = 0;
  for (let w = 1; w <= weeks; w += 1) {
    const start = addDays(monday, -7 * w);
    let proteinDays = 0, strength = 0;
    for (let i = 0; i < 7; i += 1) {
      const d = addDays(start, i); const row = by.get(d);
      if (row && row.calories > 0 && row.protein >= proteinTarget * 0.9) proteinDays += 1;
      if (strengthDates.has(d)) strength += 1;
    }
    if (proteinDays >= 6) proteinWeeks += 1;
    if (proteinDays >= 5 && strength >= 2) muscleWeeks += 1;
  }
  return { proteinWeeks, muscleWeeks };
}

/** Cumulative deficit: for each logged day, (maintenance + earned activity) − eaten, only counting positive days. Crash-low days earn nothing extra. */
function cumulativeDeficit(days, maintenanceKcal, floorKcal = 1200) {
  if (!(maintenanceKcal > 0)) return 0;
  let total = 0;
  for (const d of days) {
    if (!(d.calories > 0)) continue;
    const eaten = Math.max(d.calories, floorKcal); // eating under the floor does not "earn" a bigger deficit
    total += Math.max(0, maintenanceKcal - eaten);
  }
  return Math.round(total);
}

module.exports = { buildOutcomeBadges, weeklyFlags, cumulativeDeficit, FAMILIES, TIERS };
