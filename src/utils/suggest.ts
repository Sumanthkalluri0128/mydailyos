// "What can I eat with the calories and protein I have left?" — ranks the person's own foods.
export type SuggestFood = { _id: string; name: string; calories: number; protein: number; servingSize: number; servingUnit: string };
export type Suggestion = { food: SuggestFood; fits: string };

/** Foods whose one-serving calories fit in what's left, preferring higher protein per calorie when protein is short. */
export function suggestFoods(foods: SuggestFood[], kcalLeft: number, proteinLeft: number, limit = 4): Suggestion[] {
  if (kcalLeft < 40) return [];
  const needProtein = proteinLeft > 10;
  return foods
    .filter((f) => f.calories > 0 && f.calories <= kcalLeft)
    .map((f) => ({ f, score: (needProtein ? (f.protein / f.calories) * 100 * 3 : 0) + Math.min(1, f.calories / kcalLeft) * 2 + (f.protein >= 8 ? 1 : 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ f }) => ({ food: f, fits: `${Math.round(f.calories)} kcal · ${Math.round(f.protein)} g protein per ${f.servingSize}${f.servingUnit}` }));
}

export type Nudge = { id: string; icon: string; text: string; action?: 'food' | 'water' | 'steps' | 'weight' };

/** Smart in-app reminders based on the time of day and what's missing. */
export function buildNudges(o: { hour: number; mealsLogged: Record<string, boolean>; waterMl: number; waterTarget: number; steps: number; stepsTarget: number; kcalLeft: number }): Nudge[] {
  const n: Nudge[] = [];
  const { hour, mealsLogged: m } = o;
  if (hour >= 10 && !m.breakfast) n.push({ id: 'breakfast', icon: '🌅', text: "You haven't logged breakfast yet.", action: 'food' });
  if (hour >= 14 && !m.lunch) n.push({ id: 'lunch', icon: '☀️', text: "You haven't logged lunch yet.", action: 'food' });
  if (hour >= 21 && !m.dinner) n.push({ id: 'dinner', icon: '🌙', text: "You haven't logged dinner yet.", action: 'food' });
  const expectedWater = o.waterTarget * Math.min(1, Math.max(0, (hour - 7) / 14));
  if (hour >= 12 && o.waterMl < expectedWater * 0.7) n.push({ id: 'water', icon: '💧', text: `You're ${Math.round(o.waterTarget - o.waterMl)} ml short of today's water goal.`, action: 'water' });
  if (hour >= 17 && o.stepsTarget > 0 && o.steps < o.stepsTarget * 0.6) n.push({ id: 'steps', icon: '🚶', text: `${(o.stepsTarget - o.steps).toLocaleString()} steps to go — a walk before dinner would close the gap.`, action: 'steps' });
  return n.slice(0, 3);
}
