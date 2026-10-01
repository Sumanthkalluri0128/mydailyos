// Streaks + badges, computed on the fly from data we already store.
// Pure functions only (no DB) so they can be unit-tested.
const { addDays } = require('./dates');

/**
 * Given a Set of "YYYY-MM-DD" strings on which the goal was met, returns the
 * current streak (ending today, or yesterday if today isn't done *yet* — so a
 * streak isn't shown as broken at 9am) and the best streak ever.
 */
function computeStreak(dateSet, today) {
  if (!dateSet || dateSet.size === 0) return { current: 0, best: 0 };

  const sorted = [...dateSet].sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = addDays(sorted[i - 1], 1) === sorted[i] ? run + 1 : 1;
    if (run > best) best = run;
  }

  let cursor = dateSet.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (dateSet.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }
  return { current, best };
}

const STREAK_BADGES = [
  { id: 'water-3', streak: 'water', target: 3, emoji: '💧', title: 'Hydration Habit', description: 'Hit your water goal 3 days in a row.' },
  { id: 'water-7', streak: 'water', target: 7, emoji: '🌊', title: '7-Day Water Streak', description: 'Hit your water goal 7 days in a row.' },
  { id: 'water-30', streak: 'water', target: 30, emoji: '🐳', title: 'Water Master', description: 'Hit your water goal 30 days in a row.' },
  { id: 'log-7', streak: 'logging', target: 7, emoji: '📒', title: 'Week of Logging', description: 'Log something in FlexFit 7 days in a row.' },
  { id: 'log-30', streak: 'logging', target: 30, emoji: '🗓️', title: 'Monthly Momentum', description: 'Log something 30 days in a row.' },
  { id: 'log-100', streak: 'logging', target: 100, emoji: '🏅', title: 'Unstoppable', description: 'Log something 100 days in a row.' },
  { id: 'workout-3', streak: 'workout', target: 3, emoji: '🏃', title: 'On a Roll', description: 'Work out 3 days in a row.' },
  { id: 'workout-7', streak: 'workout', target: 7, emoji: '🏋️', title: 'Iron Week', description: 'Work out 7 days in a row.' },
  { id: 'habit-7', streak: 'habit', target: 7, emoji: '🔥', title: 'Habit Builder', description: 'Complete a habit 7 days in a row.' },
  { id: 'habit-30', streak: 'habit', target: 30, emoji: '💎', title: 'Habit Hero', description: 'Complete a habit 30 days in a row.' },
];

const TOTAL_BADGES = [
  { id: 'tasks-1', total: 'tasksCompleted', target: 1, emoji: '✅', title: 'First Task', description: 'Complete your first task.' },
  { id: 'tasks-10', total: 'tasksCompleted', target: 10, emoji: '📋', title: '10 Tasks Done', description: 'Complete 10 tasks.' },
  { id: 'tasks-30', total: 'tasksCompleted', target: 30, emoji: '🎯', title: '30 Tasks Completed', description: 'Complete 30 tasks.' },
  { id: 'tasks-100', total: 'tasksCompleted', target: 100, emoji: '🏆', title: 'Centurion', description: 'Complete 100 tasks.' },
  { id: 'workouts-1', total: 'workouts', target: 1, emoji: '💪', title: 'First Workout', description: 'Log your first workout.' },
  { id: 'workouts-10', total: 'workouts', target: 10, emoji: '⚡', title: '10 Workouts', description: 'Log 10 workouts.' },
  { id: 'workouts-50', total: 'workouts', target: 50, emoji: '🥇', title: '50 Workouts', description: 'Log 50 workouts.' },
  { id: 'meals-50', total: 'foodEntries', target: 50, emoji: '🍽️', title: 'Mindful Eater', description: 'Log 50 food entries.' },
  { id: 'weighins-10', total: 'weighIns', target: 10, emoji: '⚖️', title: 'Consistent Weigher', description: 'Record your weight 10 times.' },
  { id: 'water-100l', total: 'waterLiters', target: 100, emoji: '🚰', title: '100 Litres', description: 'Drink 100 litres in total.' },
  { id: 'habits-50', total: 'habitCompletions', target: 50, emoji: '🌱', title: '50 Habit Check-offs', description: 'Check off habits 50 times.' },
];

/**
 * @param days   array of {date, waterMl, exerciseMinutes, calories, tasksCompleted, habitsCompleted, weighIn}
 * @param totals lifetime totals {tasksCompleted, workouts, foodEntries, weighIns, waterLiters, habitCompletions}
 * @param goals  {waterTargetMl}
 */
function buildAchievements({ days, totals, goals, today }) {
  const waterTarget = Number(goals?.waterTargetMl) || 3000;

  const sets = { water: new Set(), logging: new Set(), workout: new Set(), habit: new Set() };
  for (const d of days) {
    if (d.waterMl >= waterTarget) sets.water.add(d.date);
    if (d.exerciseMinutes > 0) sets.workout.add(d.date);
    if (d.habitsCompleted > 0) sets.habit.add(d.date);
    if (
      d.waterMl > 0 || d.calories > 0 || d.exerciseMinutes > 0 ||
      d.tasksCompleted > 0 || d.habitsCompleted > 0 || d.weighIn
    ) sets.logging.add(d.date);
  }

  const streaks = {};
  for (const key of Object.keys(sets)) streaks[key] = computeStreak(sets[key], today);

  const badges = [];
  for (const b of STREAK_BADGES) {
    const s = streaks[b.streak];
    const progress = Math.min(b.target, Math.max(s.current, s.best));
    badges.push({ id: b.id, emoji: b.emoji, title: b.title, description: b.description, target: b.target, progress, unlocked: s.best >= b.target || s.current >= b.target });
  }
  for (const b of TOTAL_BADGES) {
    const value = Number(totals?.[b.total]) || 0;
    badges.push({ id: b.id, emoji: b.emoji, title: b.title, description: b.description, target: b.target, progress: Math.min(b.target, Math.floor(value)), unlocked: value >= b.target });
  }

  const nextUp = badges
    .filter((b) => !b.unlocked)
    .sort((a, b) => b.progress / b.target - a.progress / a.target)[0] || null;

  return { streaks, badges, unlockedCount: badges.filter((b) => b.unlocked).length, nextUp };
}

module.exports = { computeStreak, buildAchievements, STREAK_BADGES, TOTAL_BADGES };
