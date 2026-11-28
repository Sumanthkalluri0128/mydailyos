// Pure helpers (no React Native imports) so they can be unit-tested.
/** Which old badge ids does the new shelf data still unlock? Lets the sticker collection keep working off the new badges. */
export const OLD_TO_NEW: Record<string, [string, number]> = {
  'log-7': ['log-streak', 0], 'log-30': ['log-streak', 1], 'log-100': ['log-streak', 2],
  'water-3': ['water-streak', 0], 'water-7': ['water-streak', 1], 'water-30': ['water-streak', 2],
  'habit-7': ['habit-streak', 0], 'habit-30': ['habit-streak', 1], 'habits-50': ['habit-checkins', 0],
  'meals-50': ['meals', 0], 'water-100l': ['water-total', 0],
  'workout-3': ['workout-streak', 0], 'workout-7': ['workout-streak', 1],
  'workouts-1': ['workouts', 0], 'workouts-10': ['workouts', 1], 'workouts-50': ['workouts', 2],
  'tasks-1': ['tasks', 0], 'tasks-10': ['tasks', 1], 'tasks-30': ['tasks', 2], 'tasks-100': ['tasks', 3], 'weighins-10': ['weigh-ins', 0],
};
export function oldBadgeUnlocked(shelves: any, oldId: string): boolean {
  const m = OLD_TO_NEW[oldId]; if (!m || !shelves) return false;
  const b = (shelves.shelves || []).flatMap((s: any) => s.badges).find((x: any) => x.id === m[0]);
  return !!b && b.tier - 1 >= m[1];
}
