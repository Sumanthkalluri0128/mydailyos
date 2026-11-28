// Which tour screen is which route (pure, so it can be unit-tested). expo-router pathnames drop the "(tabs)" group.
export const ROUTE_OF: Record<string, string> = { home: '/(tabs)', log: '/food', weight: '/weight', planner: '/plan', progress: '/(tabs)/progress', tasks: '/(tabs)/tasks', profile: '/(tabs)/profile' };
/** Which tour screen is this path? (expo-router pathnames drop the "(tabs)" group.) */
export function screenOf(path: string): string | null {
  if (path === '/' || path === '/index') return 'home';
  if (path.startsWith('/food') || path === '/log') return 'log';
  if (path.startsWith('/weight')) return 'weight';
  if (path.startsWith('/plan') || path.startsWith('/recipes')) return 'planner';
  if (path.startsWith('/progress')) return 'progress';
  if (path.startsWith('/tasks')) return 'tasks';
  if (path.startsWith('/profile')) return 'profile';
  return null;
}
