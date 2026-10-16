// The "journey" layer that turns daily logging into progress you can feel: XP + levels, today's quests, this week's
// missions, long-term milestones, and the person's own short / long-term goals with live progress.
// Pure functions (no database) so every number is unit-tested. All dates are "YYYY-MM-DD".
const { addDays, diffDays } = require('./dates');
const { computeStreak } = require('./achievements');

const r1 = (n) => Math.round(n * 10) / 10;
const pct = (v, t) => (t > 0 ? Math.max(0, Math.min(100, Math.round((v / t) * 100))) : 0);

/** Did this day's calories land in a healthy band for the goal direction? Needs something logged. */
function caloriesOnTrack(calories, target, direction) {
  if (!(target > 0) || !(calories > 0)) return false;
  if (direction === 'gain') return calories >= target * 0.92;
  return calories >= target * 0.6 && calories <= target * 1.08; // lose / maintain: not over, and not crash-dieting
}

/** Which of the day's targets were met. `t` = { calories, direction, protein, waterMl, steps, exerciseMinutes }. */
function dayHits(day, t = {}) {
  const d = day || {};
  return {
    log: (d.calories > 0) || (d.waterMl > 0) || (d.exerciseMinutes > 0) || (d.tasksCompleted > 0) || (d.habitsCompleted > 0) || !!d.weighIn,
    calories: caloriesOnTrack(d.calories, t.calories, t.direction),
    protein: t.protein > 0 && d.protein >= t.protein * 0.9,
    water: t.waterMl > 0 && d.waterMl >= t.waterMl,
    move: t.exerciseMinutes > 0 && d.exerciseMinutes >= t.exerciseMinutes,
    steps: t.steps > 0 && d.steps >= t.steps,
    habits: d.habitsCompleted > 0,
    tasks: d.tasksCompleted > 0,
    weigh: !!d.weighIn,
  };
}
const XP_PER = { log: 10, calories: 20, protein: 12, water: 15, move: 20, steps: 15, habits: 8, tasks: 5, weigh: 10 };

function dayXp(day, t) {
  const h = dayHits(day, t);
  let xp = 0;
  for (const k of Object.keys(XP_PER)) if (h[k]) xp += XP_PER[k];
  const full = h.calories && h.water && (h.move || h.steps);
  if (full) xp += 25; // "perfect day" bonus
  return { xp, hits: h, perfect: !!full };
}

// ---- levels: level n needs 100*n*(n-1)/2 total XP (100, 300, 600, 1000 ...), so early levels come quickly
const xpForLevel = (n) => 50 * n * (n - 1);
const RANKS = [
  [1, 'Rookie'], [5, 'Trainee'], [10, 'Challenger'], [15, 'Warrior'], [20, 'Elite'], [30, 'Master'], [40, 'Champion'], [50, 'Legend'],
];
function levelFor(xp) {
  const x = Math.max(0, Math.floor(xp));
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + (4 * x) / 50)) / 2));
  while (xpForLevel(level + 1) <= x) level++;
  while (level > 1 && xpForLevel(level) > x) level--;
  const base = xpForLevel(level), next = xpForLevel(level + 1);
  const rank = [...RANKS].reverse().find(([l]) => level >= l)[1];
  return { level, rank, xp: x, xpIntoLevel: x - base, xpForNext: next - base, xpToNext: next - x, pct: pct(x - base, next - base) };
}

/** Total XP over a list of days + one-off bonuses for streaks and weight progress. */
function buildXp(days, t, streaks) {
  let xp = 0, perfectDays = 0;
  for (const d of days) { const r = dayXp(d, t); xp += r.xp; if (r.perfect) perfectDays++; }
  const logBest = streaks?.logging?.best || 0;
  xp += Math.floor(logBest / 7) * 40; // +40 for each full week of the best logging streak
  return { xp, perfectDays };
}

function dailyQuests(day, t, steps) {
  const d = day || {};
  const h = dayHits(d, t);
  const q = [];
  const add = (id, icon, title, value, target, unit, done, hint) => q.push({ id, icon, title, value: Math.round(value), target: Math.round(target), unit, pct: pct(value, target), done: !!done, xp: XP_PER[id] || 0, hint });
  if (t.calories > 0) {
    const eaten = d.calories || 0;
    add('calories', '🍽️', t.direction === 'gain' ? 'Fuel up to your target' : 'Stay inside your calorie budget', eaten, t.calories, 'kcal', h.calories,
      eaten === 0 ? 'Log your first meal to start this quest.' : t.direction === 'gain' ? `${Math.max(0, Math.round(t.calories * 0.92 - eaten))} kcal to go.` : eaten > t.calories * 1.08 ? 'Over budget today — a lighter next meal and a walk bring it back.' : `${Math.max(0, Math.round(t.calories - eaten))} kcal left.`);
  }
  if (t.protein > 0) add('protein', '🥚', 'Hit your protein', d.protein || 0, t.protein, 'g', h.protein, `${Math.max(0, Math.round(t.protein * 0.9 - (d.protein || 0)))} g to go.`);
  if (t.waterMl > 0) add('water', '💧', 'Drink your water', d.waterMl || 0, t.waterMl, 'ml', h.water, `${Math.max(0, Math.round(t.waterMl - (d.waterMl || 0)))} ml to go.`);
  if (t.steps > 0) add('steps', '👟', 'Walk your steps', d.steps || 0, t.steps, 'steps', h.steps, `${Math.max(0, Math.round(t.steps - (d.steps || 0)))} steps to go.`);
  if (t.exerciseMinutes > 0) add('move', '🏋️', 'Train', d.exerciseMinutes || 0, t.exerciseMinutes, 'min', h.move, `${Math.max(0, Math.round(t.exerciseMinutes - (d.exerciseMinutes || 0)))} min to go.`);
  return { quests: q, done: q.filter((x) => x.done).length, total: q.length, xpEarned: q.filter((x) => x.done).reduce((a, x) => a + x.xp, 0), xpAvailable: q.reduce((a, x) => a + x.xp, 0) };
}

/** Missions for the 7 days ending `today` (a rolling week, so there is always something in reach). */
function weeklyMissions(days, t, today) {
  const week = days.filter((d) => d.date > addDays(today, -7) && d.date <= today);
  const count = (key) => week.filter((d) => dayHits(d, t)[key]).length;
  const defs = [
    { id: 'wk-log', icon: '📒', title: 'Log something on 6 days', key: 'log', target: 6, xp: 60 },
    { id: 'wk-cal', icon: '🎯', title: 'Land your calories on 5 days', key: 'calories', target: 5, xp: 80 },
    { id: 'wk-water', icon: '💧', title: 'Hit your water goal on 5 days', key: 'water', target: 5, xp: 60 },
    { id: 'wk-move', icon: '🔥', title: 'Move or train on 4 days', key: 'move', target: 4, xp: 70, alt: 'steps' },
  ];
  const missions = defs.map((m) => {
    const value = m.alt ? week.filter((d) => { const h = dayHits(d, t); return h[m.key] || h[m.alt]; }).length : count(m.key);
    return { id: m.id, icon: m.icon, title: m.title, value, target: m.target, pct: pct(value, m.target), done: value >= m.target, xp: m.xp };
  });
  return { missions, done: missions.filter((m) => m.done).length, total: missions.length };
}

const STREAK_STEPS = [3, 7, 14, 30, 60, 100, 180, 365];
function streakMilestones(streak) {
  const best = Math.max(streak?.current || 0, streak?.best || 0);
  const next = STREAK_STEPS.find((s) => s > (streak?.current || 0)) || null;
  return { current: streak?.current || 0, best: streak?.best || 0, next, toNext: next ? next - (streak?.current || 0) : 0, reached: STREAK_STEPS.filter((s) => best >= s) };
}

/**
 * The weight journey: start -> target in four checkpoints. `startKg` is the first weigh-in (or the profile weight),
 * `currentKg` the latest. Works for losing and gaining; `weeksLeft` uses the chosen pace.
 */
function weightJourney({ startKg, currentKg, targetKg, paceKgPerWeek = 0.5 }) {
  const s = Number(startKg), c = Number(currentKg), g = Number(targetKg);
  if (!(s > 0) || !(c > 0) || !(g > 0) || Math.abs(s - g) < 0.2) return null;
  const dir = g < s ? 'lose' : 'gain';
  const total = Math.abs(s - g);
  const done = Math.max(0, Math.min(total, dir === 'lose' ? s - c : c - s));
  const overshoot = dir === 'lose' ? c < g - 0.05 : c > g + 0.05;
  const checkpoints = [0.25, 0.5, 0.75, 1].map((f, i) => {
    const kg = r1(dir === 'lose' ? s - total * f : s + total * f);
    return { label: ['First quarter', 'Halfway', 'Final stretch', 'Goal'][i], kg, reached: done >= total * f - 0.001 };
  });
  const remaining = Math.max(0, total - done);
  const pace = Number(paceKgPerWeek) > 0 ? Number(paceKgPerWeek) : 0.5;
  return { direction: dir, startKg: r1(s), currentKg: r1(c), targetKg: r1(g), totalKg: r1(total), doneKg: r1(done), remainingKg: r1(remaining), pct: pct(done, total), weeksLeft: remaining > 0 ? Math.ceil(remaining / pace) : 0, reached: remaining <= 0.05 || overshoot, checkpoints };
}

// ---------------------------------------------------------------- the person's own goals
const GOAL_METRICS = {
  workouts: { label: 'Workouts', unit: 'workouts', how: 'Days with exercise logged' },
  logDays: { label: 'Logging days', unit: 'days', how: 'Days you logged anything' },
  waterDays: { label: 'Water goal days', unit: 'days', how: 'Days you hit your water goal' },
  calorieDays: { label: 'On-target calorie days', unit: 'days', how: 'Days your calories landed in range' },
  stepsTotal: { label: 'Steps', unit: 'steps', how: 'Total steps in the period' },
  weight: { label: 'Body weight', unit: 'kg', how: 'Your latest weigh-in' },
  custom: { label: 'My own goal', unit: '', how: 'You update it yourself' },
};

/**
 * Progress of one saved goal. goal = { metric, target, startValue, startDate, deadline, manualValue, done, kind }.
 * `days` is the history covering startDate..today. Returns value, pct, status and a human line.
 */
function goalProgress(goal, days, t, today, latestWeightKg) {
  const g = goal;
  const start = g.startDate || today;
  const from = days.filter((d) => d.date >= start && d.date <= today);
  let value = 0;
  switch (g.metric) {
    case 'workouts': value = from.filter((d) => d.exerciseMinutes > 0).length; break;
    case 'logDays': value = from.filter((d) => dayHits(d, t).log).length; break;
    case 'waterDays': value = from.filter((d) => dayHits(d, t).water).length; break;
    case 'calorieDays': value = from.filter((d) => dayHits(d, t).calories).length; break;
    case 'stepsTotal': value = from.reduce((a, d) => a + (d.steps || 0), 0); break;
    case 'weight': value = Number(latestWeightKg) || Number(g.startValue) || 0; break;
    default: value = Number(g.manualValue) || 0;
  }
  const target = Number(g.target) || 0;
  let progress;
  if (g.metric === 'weight') {
    const s = Number(g.startValue), cur = value;
    const total = Math.abs(s - target);
    const moved = target < s ? s - cur : cur - s;
    progress = total > 0 ? pct(moved, total) : 0;
  } else progress = pct(value, target);
  const reached = progress >= 100 || g.done === true;
  const daysLeft = g.deadline ? diffDays(today, g.deadline) : null;
  const span = g.deadline ? Math.max(1, diffDays(start, g.deadline)) : null;
  const elapsed = span ? Math.max(0, Math.min(span, diffDays(start, today))) : null;
  // "pace" compares progress to the share of time used, so a goal can be flagged early rather than at the deadline
  const expected = span ? pct(elapsed, span) : null;
  let status = 'active';
  if (reached) status = 'done';
  else if (daysLeft !== null && daysLeft < 0) status = 'missed';
  else if (expected !== null && elapsed >= 3 && progress + 10 < expected) status = 'behind';
  else if (expected !== null && progress >= expected) status = 'ahead';
  return { value: g.metric === 'weight' ? r1(value) : Math.round(value), target, pct: Math.min(100, progress), status, daysLeft, expectedPct: expected };
}

/** Everything for the journey screen. */
function buildJourney({ days, targets, today, totals, weights, profile, goals = [] }) {
  const t = targets || {};
  const sets = { logging: new Set(), water: new Set() };
  for (const d of days) { const h = dayHits(d, t); if (h.log) sets.logging.add(d.date); if (h.water) sets.water.add(d.date); }
  const streaks = { logging: computeStreak(sets.logging, today), water: computeStreak(sets.water, today) };
  const { xp, perfectDays } = buildXp(days, t, streaks);
  const lv = levelFor(xp);
  const todayRow = days.find((d) => d.date === today) || null;
  const daily = dailyQuests(todayRow, t, t.steps);
  const weekly = weeklyMissions(days, t, today);
  const latestW = weights?.length ? Number(weights[weights.length - 1]) : Number(profile?.currentWeightKg) || null;
  const startW = weights?.length ? Number(weights[0]) : Number(profile?.currentWeightKg) || null;
  const journey = weightJourney({ startKg: startW, currentKg: latestW, targetKg: profile?.goals?.targetWeightKg, paceKgPerWeek: profile?.goals?.weeklyPaceKg });
  const decorated = goals.map((g) => ({ ...g, progress: goalProgress(g, days, t, today, latestW) }));
  return {
    level: lv, perfectDays, today: daily, week: weekly, streak: streakMilestones(streaks.logging), waterStreak: streakMilestones(streaks.water),
    weightJourney: journey, goals: decorated,
    totals: { logDays: sets.logging.size, workoutDays: days.filter((d) => d.exerciseMinutes > 0).length, ...(totals || {}) },
  };
}

module.exports = { caloriesOnTrack, dayHits, dayXp, xpForLevel, levelFor, buildXp, dailyQuests, weeklyMissions, streakMilestones, weightJourney, goalProgress, buildJourney, GOAL_METRICS, XP_PER, STREAK_STEPS };
