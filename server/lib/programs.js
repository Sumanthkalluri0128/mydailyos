// Beginner "training arcs": 4-8 week programs that ramp gradually. Pure data and rules, no database.
// Ramp rules (checked in the tests): no week adds more than 25% total reps over the last build week, one extra set at most
// every 3 build weeks, a lighter "rest arc" week in programs of 6+ weeks, and the step goal rises by 500 a week up to the person's own target.
// No medical claims. Gym weights are left for the person to pick, then "beat last time" takes over.

const STEP_RAMP = 500;
const MAX_WEEKLY_REP_GROWTH = 1.25;
const DEFAULT_BASE_STEPS = 3000;

const ARC_EPISODES = ['The First Step', 'Finding Your Rhythm', 'Power Awakens', 'Second Wind', 'Rising Strength', 'The Big Push', 'Final Episode'];
const REST_EPISODE = 'Rest Arc';

// type: 'reps' = reps per set, 'hold' = seconds per set. step = how much one build week adds, max = ceiling.
const ex = (name, sets, reps, step = 1, max = reps + 6, type = 'reps') => ({ name, sets, reps, step, max, type });

const BODYWEIGHT_DAYS = [
  [ex('Bodyweight Squat', 2, 8, 2, 20), ex('Incline Push-ups', 2, 6, 1, 15), ex('Glute Bridge', 2, 10, 2, 20), ex('Plank', 2, 15, 5, 45, 'hold')],
  [ex('Reverse Lunge', 2, 6, 1, 14), ex('Push-ups', 2, 4, 1, 12), ex('Superman Hold', 2, 10, 2, 30, 'hold'), ex('Mountain Climbers', 2, 12, 2, 30)],
  [ex('Bodyweight Squat', 2, 10, 2, 22), ex('Incline Push-ups', 2, 8, 1, 16), ex('Glute Bridge', 2, 12, 2, 22), ex('Plank', 2, 20, 5, 50, 'hold')],
];
const GYM_DAYS = [
  [ex('Goblet Squat', 2, 8, 1, 12), ex('Dumbbell Bench Press', 2, 8, 1, 12), ex('Seated Cable Row', 2, 8, 1, 12), ex('Plank', 2, 20, 5, 50, 'hold')],
  [ex('Romanian Deadlift', 2, 8, 1, 12), ex('Dumbbell Shoulder Press', 2, 8, 1, 12), ex('Lat Pulldown', 2, 8, 1, 12), ex('Glute Bridge', 2, 10, 2, 20)],
  [ex('Leg Press', 2, 10, 1, 14), ex('Push-ups', 2, 6, 1, 14), ex('Seated Cable Row', 2, 10, 1, 14), ex('Biceps Curl', 2, 10, 1, 14)],
];

const DEFS = [
  { id: 'bw-4', title: 'Starter Arc: No Equipment', weeks: 4, equipment: 'none', days: BODYWEIGHT_DAYS, summary: 'Four gentle weeks of bodyweight moves, three short sessions a week.' },
  { id: 'bw-6', title: 'Rising Arc: No Equipment', weeks: 6, equipment: 'none', days: BODYWEIGHT_DAYS, summary: 'Six weeks of bodyweight strength with a rest arc in week 4.' },
  { id: 'gym-8', title: 'Iron Arc: Basic Gym', weeks: 8, equipment: 'gym', days: GYM_DAYS, summary: 'Eight weeks on simple machines and dumbbells, with a rest arc in week 4.' },
];

const isRestWeek = (week, weeks) => weeks >= 6 && week === 4;
const buildWeeksBefore = (week, weeks) => (weeks >= 6 && week > 4 ? week - 2 : week - 1); // build weeks completed before this one

function sessionFor(def, week, dayIdx) {
  const rest = isRestWeek(week, def.weeks);
  const level = Math.max(0, buildWeeksBefore(week, def.weeks));
  const extraSet = Math.min(1, Math.floor(level / 3)); // one extra set after 3 build weeks, then reps keep climbing
  const exercises = def.days[dayIdx].map((e) => {
    const build = rest ? Math.max(0, level - 1) : level; // rest arc: back to last week's lighter load, with fewer sets
    const reps = Math.min(e.max, e.reps + (extraSet ? build - 3 : build) * e.step);
    const sets = rest ? Math.max(1, Math.ceil(e.sets / 2)) : e.sets + extraSet;
    return { name: e.name, sets, reps: rest ? e.reps : reps, type: e.type, weightKg: null };
  });
  const heavy = !rest && week > 1;
  return {
    day: dayIdx + 1,
    kind: rest ? 'rest' : heavy ? 'heavy' : 'technique',
    who: rest ? 'kakashi' : heavy ? ['goku', 'vegeta', 'bakugo'][dayIdx % 3] : 'zoro',
    scene: rest ? 'health' : heavy ? 'lift' : 'plan',
    minutes: Math.max(10, Math.round(exercises.reduce((m, e) => m + e.sets * 1.5, 0)) + 5),
    exercises,
  };
}

function buildProgram(def) {
  const weeks = [];
  let buildIdx = 0;
  for (let w = 1; w <= def.weeks; w += 1) {
    const rest = isRestWeek(w, def.weeks);
    const episode = rest ? REST_EPISODE : (w === def.weeks && def.weeks > 1 ? 'Final Episode' : ARC_EPISODES[Math.min(buildIdx, ARC_EPISODES.length - 2)]);
    if (!rest) buildIdx += 1;
    weeks.push({ week: w, episode, rest, sessions: [0, 1, 2].map((d) => sessionFor(def, w, d)) });
  }
  return { id: def.id, title: def.title, summary: def.summary, equipment: def.equipment, weeksCount: def.weeks, daysPerWeek: 3, weeks };
}

const PROGRAMS = DEFS.map(buildProgram);
const listPrograms = () => PROGRAMS.map(({ weeks, ...p }) => p);
const getProgram = (id) => PROGRAMS.find((p) => p.id === id) || null;

/** Total reps (or hold seconds) in a week: the number the ramp rule watches. */
const weekLoad = (week) => week.sessions.reduce((t, s) => t + s.exercises.reduce((u, e) => u + e.sets * e.reps, 0), 0);

/** Which week (1-based) a date falls in. Past the end = finished (week = weeks + 1). Before the start = 0. */
function weekOn(startDate, date, weeksCount) {
  const diff = Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000);
  if (diff < 0) return 0;
  return Math.min(weeksCount + 1, Math.floor(diff / 7) + 1);
}

/** Step goal for a week: +500 a week from the person's own starting average, never above their profile target. */
function stepGoalForWeek(week, baseSteps, cap) {
  const base = Math.max(1000, Math.round((Number(baseSteps) || DEFAULT_BASE_STEPS) / 100) * 100);
  const ceiling = Math.max(1000, Number(cap) || 10000);
  return Math.min(ceiling, base + STEP_RAMP * Math.max(0, week - 1));
}

/** Starting steps from the last up-to-14 days of step counts (zero days ignored). */
function baseStepsFrom(counts) {
  const days = (counts || []).map(Number).filter((n) => n > 0);
  if (days.length < 3) return DEFAULT_BASE_STEPS;
  return Math.round(days.reduce((a, b) => a + b, 0) / days.length / 100) * 100;
}

/** The next session not yet done in the current week (done = [{week, day}]), or null when the week is complete. */
function nextSession(program, week, done) {
  const w = program.weeks[week - 1];
  if (!w) return null;
  const finished = new Set((done || []).filter((d) => d.week === week).map((d) => d.day));
  const s = w.sessions.find((x) => !finished.has(x.day));
  return s ? { week, episode: w.episode, rest: w.rest, ...s } : null;
}

module.exports = { listPrograms, getProgram, weekLoad, weekOn, stepGoalForWeek, baseStepsFrom, nextSession, isRestWeek, STEP_RAMP, MAX_WEEKLY_REP_GROWTH, DEFAULT_BASE_STEPS, PROGRAMS };
