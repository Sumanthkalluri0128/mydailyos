// Simple vs Advanced mode: which screens a user sees. Nothing is ever deleted; `showAll` shows everything.
// New users start with CORE; the rest unlock from simple usage counts (or via the "Show all features" switch).
// Pure: counts in, lists out. Ids match the web nav pages and the mobile Profile rows.
const CORE = ['dashboard', 'foodLogger', 'progress', 'task', 'water', 'weight', 'exercise', 'planner', 'food'];

// id -> { when(counts) -> bool, hint } ; hint is the one-line "how to unlock" (shown in Profile).
const UNLOCKS = {
  recipes: { when: (c) => c.foodLogs >= 5 || c.plannedDays >= 1, hint: 'Log 5 meals or plan a day.' },
  health: { when: (c) => c.activeDays >= 3, hint: 'Use the app on 3 different days.' },
  goals: { when: (c) => c.weightLogs >= 2 || c.activeDays >= 5, hint: 'Log your weight twice or use the app on 5 days.' },
  habit: { when: (c) => c.activeDays >= 7, hint: 'Use the app on 7 different days.' },
  achievements: { when: (c) => c.activeDays >= 5, hint: 'Use the app on 5 different days.' },
  weekly: { when: (c) => c.activeDays >= 7, hint: 'Use the app on 7 different days.' },
  northstar: { when: (c) => c.activeDays >= 14, hint: 'Use the app on 14 different days.' },
};
const ALWAYS = ['profile'];
const ALL = [...ALWAYS, ...CORE, ...Object.keys(UNLOCKS)];

const num = (x) => { const n = Number(x); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; };
const cleanCounts = (c = {}) => ({ foodLogs: num(c.foodLogs), plannedDays: num(c.plannedDays), weightLogs: num(c.weightLogs), activeDays: num(c.activeDays) });

// `seen`: ids the client already announced. Returns what to show, what is still locked and what just unlocked.
function featureView({ counts, showAll = false, seen = [] } = {}) {
  const c = cleanCounts(counts);
  const seenSet = new Set(Array.isArray(seen) ? seen : []);
  const earned = [...ALWAYS, ...CORE, ...Object.keys(UNLOCKS).filter((id) => UNLOCKS[id].when(c))];
  const visible = showAll ? ALL.slice() : earned;
  const locked = ALL.filter((id) => !earned.includes(id)).map((id) => ({ id, hint: UNLOCKS[id].hint }));
  // only unlocks count as "new" (core is never announced), and only if the user is not in show-all mode
  const newly = showAll ? [] : earned.filter((id) => UNLOCKS[id] && !seenSet.has(id));
  return { showAll: !!showAll, visible, locked, newlyUnlocked: newly, counts: c };
}

module.exports = { CORE, UNLOCKS, ALL, ALWAYS, cleanCounts, featureView };
