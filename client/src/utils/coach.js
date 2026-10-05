// The ONE line of encouragement on Home: looks at the day so far and says the single most useful, kind thing.
// Pure and deterministic (no React, no clock of its own) so it can be tested; mobile has the same file (src/utils/coach.ts).

const pct = (v, t) => (t > 0 ? v / t : 0);

export function coachLine(i) {
  const stepsP = pct(i.steps, i.stepsTarget), waterP = pct(i.waterMl, i.waterTarget), exP = pct(i.exerciseMin, i.exerciseTarget);
  const hit = [stepsP, waterP, exP].filter((x) => x >= 1).length;
  const kcalP = pct(i.eatenKcal, i.budgetKcal);
  const stepsLeft = Math.max(0, Math.round(i.stepsTarget - i.steps));

  if (hit === 3) return { emoji: '🏆', title: 'Perfect day', text: 'Steps, water and exercise — all three goals done. Be proud of that.', tone: 'great' };
  if (i.hour >= 22 || i.hour < 5) return { emoji: '🌙', title: `${hit} of 3 goals done`, text: 'Rest well — recovery is part of the plan.', tone: 'calm' };
  if (kcalP > 1.1) return { emoji: '💪', title: 'A little over today', text: "One day won't undo your progress. A brisk 20-minute walk helps balance it.", tone: 'calm' };
  if (i.steps > 0 && stepsP >= 1) return { emoji: '🎉', title: 'Steps goal smashed', text: `${i.steps.toLocaleString()} steps and counting. Nicely done.`, tone: 'great' };
  if (stepsP >= 0.8) return { emoji: '🚶', title: 'Almost there', text: `${stepsLeft.toLocaleString()} steps to go — about ${Math.max(1, Math.ceil(stepsLeft / 100))} minutes of walking.`, tone: 'good' };
  if (i.streak && i.streak.current >= 3 && !i.streak.loggedToday && i.hour >= 17) return { emoji: '🔥', title: `Protect your ${i.streak.current}-day streak`, text: 'Log a meal today to keep it going.', tone: 'nudge' };
  if (i.hour >= 5 && i.hour < 11 && !i.meals.breakfast) return { emoji: '🍳', title: 'Fuel your morning', text: 'Log breakfast to start the day strong.', tone: 'nudge' };
  if (i.hour >= 12 && i.hour < 16 && !i.meals.lunch) return { emoji: '🥗', title: 'Lunch time', text: 'A balanced lunch keeps your afternoon energy steady.', tone: 'nudge' };
  if (i.hour >= 18 && i.hour < 22 && !i.meals.dinner) return { emoji: '🍽️', title: 'Dinner time', text: "You've left room for a proper dinner. Enjoy it.", tone: 'nudge' };
  if (i.hour >= 14 && waterP < 0.4) return { emoji: '💧', title: 'Hydration check', text: 'A glass of water now will lift your energy.', tone: 'nudge' };
  if (i.hour >= 15 && stepsP < 0.4) return { emoji: '👟', title: 'Time to move', text: 'A 10-minute walk adds about 1,000 steps.', tone: 'nudge' };
  if (hit >= 1) return { emoji: '✨', title: `${hit} goal${hit > 1 ? 's' : ''} done`, text: "You're building momentum — keep going.", tone: 'good' };
  return { emoji: '✨', title: "You're on track", text: 'Every entry you log builds the habit.', tone: 'good' };
}
