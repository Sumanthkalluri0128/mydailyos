// Phase 3, Section B: ONE goal, ONE daily focus, ONE level, ONE badge shelf. Pure functions (no database).
// Everything the person reads is written ONCE here (COPY and the strings below) and sent to web and mobile in the same payload,
// so both apps show identical words and numbers. Wording is always positive; tests run every string through toneCheck.
const { addDays, diffDays, weekday } = require('./dates');
const { corridorAt, corridorStatus } = require('./trendWeight');
const { computeStreaks } = require('./streaks');
const { dayHits, dailyQuests, levelFor, buildXp, xpForLevel } = require('./journey');
const { weeklyScore } = require('./fatLossScore');
const { macroRanges, limitTargets, macroTargets, waterTargetMl } = require('./energy');
const { bmi } = require('./safety');

const r1 = (x) => Math.round(x * 10) / 10;
const pct = (v, t) => (t > 0 ? Math.max(0, Math.min(100, Math.round((v / t) * 100))) : 0);

// ------------------------------------------------------------------------------------------------ plain-language copy
const COPY = {
  goal: { title: 'Your goal', none: 'Set one goal to get started', done: (kg, total) => `${kg} kg done of ${total} kg`, started: (total) => `Just getting started: ${total} kg to go`, eta: (range) => `Likely to arrive ${range}`, etaLearning: 'Add a few weigh-ins over two weeks and we will estimate your finish date.' },
  status: { ahead: 'Ahead of plan', on: 'On track', behind: 'A little behind', start: 'Just getting started', maintain: 'Staying steady', reached: 'You reached your goal' },
  focus: { title: "Today's quests", reward: 'All three done. Lovely work today.', rewardXp: (n) => `+${n} XP`, bonus: 'Bonus: steps', empty: 'Set up your profile to see your daily quests.' },
  level: { next: (xp) => `Next level in ${xp} XP`, max: 'Top rank reached' },
  score: { title: 'Weekly score', details: 'How it is made', empty: 'Log a few days to see your weekly score.' },
  badges: { next: 'Next badge', last: 'Last earned', seeAll: 'See all badges', none: 'Your first badge is close.' },
  targets: { basic: 'Basic', advanced: 'Advanced', why: 'Why this number?', useRecommended: 'Use recommended' },
  streak: { restToken: 'Rest-day token', restReady: 'You have a rest-day token this week. One quiet day will not break your streak.', restUsed: (d) => `A rest day on ${d} kept your streak safe.`, comeback: (n) => `Welcome back. Coming back after ${n} days is what matters most.` },
  recap: { title: 'Your week' },
  phase: { cut: 'Cut', maintain: 'Maintain', build: 'Build' },
  detailsLabel: 'Details',
  why: {
    noWeighIn: 'No weigh-in since your plan started, so we cannot see your trend yet. A quick weigh-in fixes that.',
    stale: (n) => `No weigh-in for ${n} days, so this may be out of date. One weigh-in updates it.`,
    few: (n) => `Only ${n} weigh-in${n === 1 ? '' : 's'} since you started, so the trend is still rough.`,
    off: (kg, dir) => `Your trend is about ${kg} kg ${dir === 'lose' ? 'above' : 'below'} where your plan expected you to be today.`,
  },
};

// ------------------------------------------------------------------------------------------------ 1. ONE GOAL
const addWeeks = (date, w) => addDays(date, Math.round(w * 7));

/**
 * Finish date as a RANGE. `remainingKg` = distance left, `plannedPace` = kg/week the plan set, `observedRate` = kg/week from the trend
 * line (positive = moving toward the goal; null when there is not enough data). Needs a trend of at least 0.05 kg/week toward the goal
 * to use it; otherwise the planned pace carries the estimate. The range is pace x0.75 .. x1.25 and is never shorter than one week wide.
 */
function etaRange({ remainingKg, plannedPace = 0.5, observedRate = null, today }) {
  const rem = Number(remainingKg);
  if (!(rem > 0.05)) return { reached: true, from: today, to: today, basis: 'reached' };
  const obs = Number(observedRate);
  const useObserved = Number.isFinite(obs) && obs >= 0.05;
  const base = useObserved ? obs : Math.max(0.1, Number(plannedPace) || 0.5);
  const fastW = rem / (base * 1.25), slowW = rem / (base * 0.75);
  let from = addWeeks(today, fastW), to = addWeeks(today, slowW);
  if (diffDays(from, to) < 7) to = addDays(from, 7);
  return { reached: false, from, to, basis: useObserved ? 'trend' : 'plan', paceKgPerWeek: r1(base * 100) / 100 };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const prettyDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
const prettyRange = (from, to) => {
  const [y1, m1] = from.split('-').map(Number), [y2, m2] = to.split('-').map(Number);
  if (y1 === y2 && m1 === m2) return `${Number(from.slice(8))}-${Number(to.slice(8))} ${MONTHS[m1 - 1]} ${y1}`;
  return `${prettyDate(from)} to ${prettyDate(to)}`;
};

/** plain status word from the existing corridor logic: no "corridor" jargon reaches the screen. */
function goalStatus({ plan, trendKg, today, reached }) {
  if (reached) return 'reached';
  if (!plan || !(trendKg > 0)) return 'start';
  if (diffDays(plan.startDate, today) < 7) return 'start';
  const s = corridorStatus(trendKg, corridorAt({ startKg: plan.startKg, targetKg: plan.targetKg, startDate: plan.startDate, paceKgPerWeek: plan.paceKg }, today));
  return s === 'inside' ? 'on' : s;
}

/**
 * One plain line saying WHY the status reads "behind", so the label is information and not a judgement.
 * `weighIns` = weight rows ({ date }). Order of reasons: nothing logged, gone quiet, too few to trust, else the real gap to the plan line.
 */
function statusWhy({ plan, weighIns = [], today, trendKg }) {
  const dates = weighIns.map((w) => String(w.date || '').slice(0, 10)).filter(Boolean).sort();
  const since = dates.filter((d) => d >= plan.startDate);
  if (!since.length) return COPY.why.noWeighIn;
  const idle = diffDays(since[since.length - 1], today);
  if (idle >= 7) return COPY.why.stale(idle);
  if (since.length < 3) return COPY.why.few(since.length);
  const c = corridorAt({ startKg: plan.startKg, targetKg: plan.targetKg, startDate: plan.startDate, paceKgPerWeek: plan.paceKg }, today);
  const gap = Math.abs(trendKg - c.expected);
  return gap >= 0.1 ? COPY.why.off(r1(gap), c.direction) : '';
}

/** The single goal card. `plan` = profile.plan; `trendKg` = latest smoothed weight; `rate` = kg/week trend (negative = losing). */
function goalCard({ plan, trendKg, rate = null, today, weighIns = null }) {
  if (!plan || !plan.active || !(plan.startKg > 0) || !(plan.targetKg > 0)) return { active: false, title: COPY.goal.title, empty: COPY.goal.none };
  const dir = plan.targetKg < plan.startKg ? 'lose' : plan.targetKg > plan.startKg ? 'gain' : 'maintain';
  const total = Math.abs(plan.startKg - plan.targetKg);
  const cur = trendKg > 0 ? trendKg : plan.startKg;
  const done = dir === 'lose' ? plan.startKg - cur : dir === 'gain' ? cur - plan.startKg : 0;
  const doneKg = Math.max(0, Math.min(total, done));
  const remaining = Math.max(0, total - doneKg);
  const reached = dir !== 'maintain' && remaining <= 0.05;
  const toward = rate == null ? null : (dir === 'lose' ? -rate : dir === 'gain' ? rate : null);
  const eta = dir === 'maintain' ? null : etaRange({ remainingKg: remaining, plannedPace: plan.paceKg, observedRate: toward, today });
  const status = dir === 'maintain' ? 'maintain' : goalStatus({ plan, trendKg: cur, today, reached });
  return {
    active: true, title: COPY.goal.title, direction: dir, startKg: r1(plan.startKg), targetKg: r1(plan.targetKg), currentKg: r1(cur),
    doneKg: r1(doneKg), totalKg: r1(total), remainingKg: r1(remaining), pct: pct(doneKg, total),
    progressLine: doneKg >= 0.05 ? COPY.goal.done(r1(doneKg), r1(total)) : COPY.goal.started(r1(total)), status, statusLine: COPY.status[status],
    statusWhy: status === 'behind' && Array.isArray(weighIns) ? statusWhy({ plan, weighIns, today, trendKg: cur }) : '',
    eta: eta && !eta.reached ? { from: eta.from, to: eta.to, basis: eta.basis, line: COPY.goal.eta(prettyRange(eta.from, eta.to)) } : null,
    etaNote: eta && !eta.reached && eta.basis === 'plan' ? COPY.goal.etaLearning : '',
  };
}

// ------------------------------------------------------------------------------------------------ 2. ONE DAILY FOCUS
const CORE_QUESTS = ['calories', 'protein', 'water'];
const FOCUS_XP = 15;

/** At most three quests (calories in range, protein, water); steps is an optional bonus that never blocks the reward. */
function dailyFocus(day, t) {
  const all = dailyQuests(day, t, t.steps).quests;
  const quests = CORE_QUESTS.map((id) => all.find((q) => q.id === id)).filter(Boolean).map((q) => ({ id: q.id, icon: q.icon, title: q.title, value: q.value, target: q.target, unit: q.unit, pct: q.pct, done: q.done, hint: q.hint }));
  const bonusQ = all.find((q) => q.id === 'steps');
  const done = quests.filter((q) => q.done).length;
  const complete = quests.length > 0 && done === quests.length;
  return { title: COPY.focus.title, quests, done, total: quests.length, complete, reward: complete ? { text: COPY.focus.reward, xp: FOCUS_XP, line: COPY.focus.rewardXp(FOCUS_XP) } : null, bonus: bonusQ ? { id: 'steps', title: COPY.focus.bonus, value: bonusQ.value, target: bonusQ.target, done: bonusQ.done } : null, empty: quests.length ? '' : COPY.focus.empty };
}
const focusDone = (day, t) => dailyFocus(day, t).complete;

// ------------------------------------------------------------------------------------------------ 3. ONE LEVEL (migrates old XP, never goes down)
const COMEBACK_XP = 30;

/**
 * XP = the old formula (so every existing level is reproduced exactly) + 15 per day with all three quests done + 30 per comeback.
 * `floor` is the highest XP ever shown to this person (stored on the profile), so the level can never drop, even if logs are deleted.
 */
function levelSummary({ days, targets, streaks, comebacks = 0, floor = 0 }) {
  const legacy = buildXp(days, targets, streaks).xp;
  const focusDays = days.filter((d) => focusDone(d, targets)).length;
  const xp = legacy + focusDays * FOCUS_XP + comebacks * COMEBACK_XP;
  const shown = Math.max(xp, Math.floor(Number(floor) || 0));
  const lv = levelFor(shown);
  return { ...lv, legacyXp: legacy, newXp: xp, raisedFloor: shown > (Number(floor) || 0) ? shown : null, nextLine: COPY.level.next(lv.xpToNext) };
}

/** Old stored levels (if any) -> XP floor, so a migrated level is at least what the old app showed. */
const migrateLevel = (oldLevel) => (Number(oldLevel) > 1 ? xpForLevel(Math.floor(Number(oldLevel))) : 0);

// ------------------------------------------------------------------------------------------------ 4. WEEKLY SCORE (was "fat-loss score")
const PARTS = [
  { id: 'food', label: 'Food', members: ['calories', 'protein'], why: 'Calories near your target and protein on most days.' },
  { id: 'movement', label: 'Movement', members: ['steps'], why: 'Steps toward your daily goal.' },
  { id: 'habits', label: 'Habits', members: ['water', 'sleep'], why: 'Water and sleep, the quiet helpers.' },
];

/** Same maths as the old fat-loss score, shown as one number with three labelled parts. */
function weeklyScoreSimple(days, t, today, sleep = {}) {
  const w = weeklyScore(days, t, today, sleep);
  if (w.score === null) return { title: COPY.score.title, score: null, label: w.label, parts: [], empty: COPY.score.empty, budget: w.budget };
  const byId = Object.fromEntries(w.components.map((c) => [c.id, c]));
  const parts = PARTS.map((p) => {
    let sum = 0, wt = 0;
    for (const m of p.members) { const c = byId[m]; if (c && c.score !== null) { sum += c.score * c.weight; wt += c.weight; } }
    return { id: p.id, label: p.label, why: p.why, score: wt ? Math.round(sum / wt) : null };
  });
  return { title: COPY.score.title, score: w.score, label: w.label, loggedDays: w.loggedDays, parts, budget: w.budget, empty: '' };
}

// ------------------------------------------------------------------------------------------------ 5. BADGES: 4 shelves, one line each
const SHELVES = [{ id: 'consistency', label: 'Consistency' }, { id: 'nutrition', label: 'Nutrition' }, { id: 'training', label: 'Training' }, { id: 'milestones', label: 'Milestones' }];
const RARITY = ['common', 'rare', 'epic', 'legendary'];
const GUARD = { 'log-streak': 'goku', 'water-streak': 'tanjiro', 'workout-streak': 'zoro' }; // optional "guardian" character ids; unknown ids simply show none

// Each family: one badge with tiers. `value(inputs)` is the number compared to `tiers`; `alt` unlocks a tier on a second measure.
const FAMILIES = [
  { id: 'log-streak', shelf: 'consistency', emoji: '📒', title: 'Logging streak', unit: 'days', tiers: [7, 30, 100], line: (n) => `Log something ${n} days in a row.`, value: (i) => i.streaks.logging },
  { id: 'water-streak', shelf: 'consistency', emoji: '💧', title: 'Water streak', unit: 'days', tiers: [3, 7, 30], line: (n) => `Hit your water goal ${n} days in a row.`, value: (i) => i.streaks.water },
  { id: 'habit-streak', shelf: 'consistency', emoji: '🔥', title: 'Habit streak', unit: 'days', tiers: [7, 30], line: (n) => `Complete a habit ${n} days in a row.`, value: (i) => i.streaks.habit },
  { id: 'habit-checkins', shelf: 'consistency', emoji: '🌱', title: 'Habit check-offs', unit: 'check-offs', tiers: [50], line: (n) => `Check off habits ${n} times.`, value: (i) => i.totals.habitCompletions },
  { id: 'comeback', shelf: 'consistency', emoji: '🌅', title: 'Comeback', unit: 'comebacks', tiers: [1, 3, 6], line: (n) => `Come back after a break ${n} time${n === 1 ? '' : 's'}.`, value: (i) => i.outcomes.comebacks },
  { id: 'protein-weeks', shelf: 'nutrition', emoji: '🥚', title: 'Protein weeks', unit: 'weeks', tiers: [1, 4, 12], line: (n) => `${n} week${n === 1 ? '' : 's'} with protein on target on 6 of 7 days.`, value: (i) => i.outcomes.proteinWeeks },
  { id: 'deficit', shelf: 'nutrition', emoji: '⚡', title: 'Steady energy', unit: 'kg of body fat', tiers: [1, 3, 8], line: (n) => `Your logged energy gap adds up to about ${n} kg of body fat.`, value: (i) => i.outcomes.deficitKg, hideWhenNotLosing: true },
  { id: 'meals', shelf: 'nutrition', emoji: '🍽️', title: 'Mindful eater', unit: 'entries', tiers: [50], line: (n) => `Log ${n} food entries.`, value: (i) => i.totals.foodEntries },
  { id: 'water-total', shelf: 'nutrition', emoji: '🚰', title: 'Water total', unit: 'litres', tiers: [100], line: (n) => `Drink ${n} litres in total.`, value: (i) => i.totals.waterLiters },
  { id: 'workout-streak', shelf: 'training', emoji: '🏃', title: 'Workout streak', unit: 'days', tiers: [3, 7], line: (n) => `Work out ${n} days in a row.`, value: (i) => i.streaks.workout },
  { id: 'workouts', shelf: 'training', emoji: '💪', title: 'Workouts', unit: 'workouts', tiers: [1, 10, 50], line: (n) => `Log ${n} workout${n === 1 ? '' : 's'}.`, value: (i) => i.totals.workouts },
  { id: 'muscle-guard', shelf: 'training', emoji: '🛡️', title: 'Muscle guard', unit: 'weeks', tiers: [1, 4, 8], line: (n) => `${n} week${n === 1 ? '' : 's'} with protein on target and 2+ strength sessions.`, value: (i) => i.outcomes.muscleWeeks },
  { id: 'weight-lost', shelf: 'milestones', emoji: '⚖️', title: 'Weight change', unit: 'kg', tiers: [1, 5, 10], altTiers: [2, 5, 10], line: (n) => `Trend weight down ${n} kg (or ${[2, 5, 10][[1, 5, 10].indexOf(n)]}% of your starting weight).`, value: (i) => i.outcomes.lostKg, alt: (i) => i.outcomes.lostPct, loseOnly: true },
  { id: 'waist', shelf: 'milestones', emoji: '📏', title: 'Waist', unit: 'cm', tiers: [2, 5, 10], line: (n) => `Waist measurement down ${n} cm.`, value: (i) => i.outcomes.waistLostCm, loseOnly: true },
  { id: 'tasks', shelf: 'milestones', emoji: '✅', title: 'Tasks done', unit: 'tasks', tiers: [1, 10, 30, 100], line: (n) => `Complete ${n} task${n === 1 ? '' : 's'}.`, value: (i) => i.totals.tasksCompleted },
  { id: 'weigh-ins', shelf: 'milestones', emoji: '📈', title: 'Weigh-ins', unit: 'weigh-ins', tiers: [10], line: (n) => `Record your weight ${n} times.`, value: (i) => i.totals.weighIns },
];

/**
 * OLD badge id -> [new family id, tier index]. Every id the old app could show (achievements.js and outcomes.js) is listed, so a
 * person who had an old badge has the matching new tier. A test checks this for every old id against real fixtures.
 */
const OLD_TO_NEW = {
  'log-7': ['log-streak', 0], 'log-30': ['log-streak', 1], 'log-100': ['log-streak', 2],
  'water-3': ['water-streak', 0], 'water-7': ['water-streak', 1], 'water-30': ['water-streak', 2],
  'habit-7': ['habit-streak', 0], 'habit-30': ['habit-streak', 1], 'habits-50': ['habit-checkins', 0],
  comeback: ['comeback', 0],
  'protein-week': ['protein-weeks', 0], deficit: ['deficit', 0], 'meals-50': ['meals', 0], 'water-100l': ['water-total', 0],
  'workout-3': ['workout-streak', 0], 'workout-7': ['workout-streak', 1],
  'workouts-1': ['workouts', 0], 'workouts-10': ['workouts', 1], 'workouts-50': ['workouts', 2], muscle: ['muscle-guard', 0],
  'fat-kg': ['weight-lost', 0], 'fat-pct': ['weight-lost', 0], waist: ['waist', 0],
  'tasks-1': ['tasks', 0], 'tasks-10': ['tasks', 1], 'tasks-30': ['tasks', 2], 'tasks-100': ['tasks', 3], 'weighins-10': ['weigh-ins', 0],
};
// Outcome families used to be bronze/silver/gold: tier N of the old badge maps to tier N of the new one.
const OLD_TIER_MAP = { 'fat-kg': 'weight-lost', 'fat-pct': 'weight-lost', deficit: 'deficit', waist: 'waist', 'protein-week': 'protein-weeks', muscle: 'muscle-guard', comeback: 'comeback' };

/**
 * @param i { streaks:{logging,water,habit,workout} (best-or-current), totals, outcomes:{lostKg,lostPct,waistLostCm,deficitKg,proteinWeeks,muscleWeeks,comebacks,direction}, earnedAt?:{id:date} }
 */
function buildShelves(i) {
  const lose = i.outcomes?.direction === 'lose';
  const shelves = SHELVES.map((s) => ({ ...s, badges: [] }));
  const all = [];
  for (const f of FAMILIES) {
    if (f.loseOnly && !lose) continue;
    if (f.hideWhenNotLosing && !lose) continue;
    const value = Number(f.value(i)) || 0;
    const alt = f.alt ? Number(f.alt(i)) || 0 : 0;
    const reached = f.tiers.map((t, k) => value >= t || (f.altTiers ? alt >= f.altTiers[k] : false));
    const idx = reached.lastIndexOf(true);
    const nextAt = f.tiers[idx + 1] ?? null;
    const prevAt = idx >= 0 ? f.tiers[idx] : 0;
    const badge = {
      id: f.id, shelf: f.shelf, emoji: f.emoji, title: f.title, unit: f.unit, value: r1(value),
      tier: idx + 1, tiers: f.tiers.length, rarity: RARITY[Math.min(idx < 0 ? 0 : idx, RARITY.length - 1)],
      earned: idx >= 0, line: f.line(nextAt ?? f.tiers[f.tiers.length - 1]), nextAt, progress: nextAt ? Math.max(0, Math.min(1, (value - prevAt) / (nextAt - prevAt))) : 1,
      earnedLine: idx >= 0 ? f.line(f.tiers[idx]) : '', guardian: GUARD[f.id] || null, earnedOn: i.earnedAt?.[f.id] || null,
    };
    shelves.find((s) => s.id === f.shelf).badges.push(badge);
    all.push(badge);
  }
  const next = all.filter((b) => b.nextAt).sort((a, b) => b.progress - a.progress)[0] || null;
  const earned = all.filter((b) => b.earned);
  const last = earned.slice().sort((a, b) => (b.earnedOn || '').localeCompare(a.earnedOn || '') || b.tier - a.tier)[0] || null;
  return { shelves, next, last, earnedCount: earned.length, total: all.length, copy: COPY.badges };
}

/** Which old badge ids does this data unlock under the OLD rules? (Used by the migration test and by the "nothing lost" check.) */
function oldUnlockedIds(old) { // old = result of achievements.buildAchievements + outcomes.buildOutcomeBadges
  const ids = new Set();
  for (const b of old.badges || []) if (b.unlocked) ids.add(b.id);
  for (const b of old.outcomeBadges || []) if (b.tier) for (const [k, t] of (b.tiers || []).entries()) if (t.reached && k === 0) ids.add(b.id);
  return ids;
}
/** Every old badge that was earned must be earned in the new shelves. Returns the list of old ids that are missing (should be empty). */
function missingAfterMigration(old, shelves) {
  const flat = Object.fromEntries(shelves.shelves.flatMap((s) => s.badges).map((b) => [b.id, b]));
  const missing = [];
  for (const id of oldUnlockedIds(old)) {
    const [fam, tier] = OLD_TO_NEW[id] || [];
    if (!fam || !flat[fam] || flat[fam].tier - 1 < tier) missing.push(id);
  }
  return missing;
}

// ------------------------------------------------------------------------------------------------ 6. STREAK with rest-day token + comeback bonus
/**
 * One rest-day token per Mon-Sun week is spent automatically on a single quiet day, so one gap never wipes a streak (two quiet days in a
 * row still end it, honestly). Coming back after 3+ quiet days earns a bonus instead of a "broken streak" message.
 */
function streakSummary(loggedDates, today) {
  const s = computeStreaks(loggedDates, today, { freeze: true });
  const usedThisWeek = s.freezeUsedThisWeek;
  return {
    current: s.current, longest: s.longest, loggedToday: s.loggedToday, restDays: s.frozen,
    token: { label: COPY.streak.restToken, available: !usedThisWeek, line: usedThisWeek ? COPY.streak.restUsed(prettyDate(s.frozen[0] || today)) : COPY.streak.restReady },
    comeback: s.comeback ? { missedDays: s.comeback.missedDays, bonusXp: COMEBACK_XP, line: COPY.streak.comeback(s.comeback.missedDays) } : null,
    comebacks: s.comebacks, last14: s.last14, weekly: s.weekly,
  };
}

// ------------------------------------------------------------------------------------------------ 5b. TARGETS
/**
 * Basic: calories, protein, water, steps, goal weight. Advanced: macro split, fibre, sugar and sodium caps, phase.
 * Every row has a `why` line and a `recommended` value (null when there is nothing to recommend, e.g. goal weight).
 * @param core { profile, target, direction, energy, ranges, floor }
 */
function targetsView({ profile, target, direction, energy, floor }) {
  const p = profile || {}; const g = p.goals || {}; const kg = Number(p.currentWeightKg) || 0;
  const recCal = energy?.autoTarget || null;
  const recProtein = target > 0 && kg > 0 ? macroTargets(target, kg, direction, null).protein : null;
  const recWater = waterTargetMl(kg);
  const ranges = target > 0 ? macroRanges(target, kg, direction, g.proteinTarget) : null;
  const limits = target > 0 ? limitTargets(target) : null;
  const row = (id, label, value, unit, recommended, why, extra = {}) => ({ id, label, value, unit, recommended, why, atRecommended: recommended != null && Number(value) === Number(recommended), ...extra });
  const basic = [
    row('calories', 'Calories', Math.round(target) || null, 'kcal', recCal, recCal ? `Worked out from your body, activity and pace (${g.weeklyPaceKg || 0.5} kg a week), and never below ${floor} kcal.` : 'Add your weight, height and age to get a worked-out number.'),
    row('protein', 'Protein', g.proteinTarget || recProtein, 'g', recProtein, 'About 1.6 g for every kg of body weight helps you keep muscle while you change your weight.'),
    row('water', 'Water', g.waterTargetMl || recWater, 'ml', recWater, 'About 35 ml for every kg of body weight, kept between 1.5 and 5 litres.'),
    row('steps', 'Steps', g.stepsTarget || 10000, 'steps', 10000, '10,000 is a friendly round goal. Raise or lower it to match your week.'),
    row('goalWeight', 'Goal weight', g.targetWeightKg || null, 'kg', null, 'Your own choice. We keep it above the healthy range for your height.'),
  ];
  const adv = ranges ? [
    row('macros', 'Macro split', `${ranges.protein.goal} P / ${ranges.carbs.goal} C / ${ranges.fat.goal} F`, 'g', null, 'Protein by body weight, fat about 27% of calories, carbs fill the rest.', { ranges }),
    row('fiber', 'Fibre', ranges.fiber.goal, 'g', ranges.fiber.goal, '14 g for every 1,000 kcal, a gentle minimum.'),
    row('sugar', 'Sugar cap', limits.sugar, 'g', limits.sugar, 'A soft ceiling at 10% of calories (WHO guide for added sugar). Fruit and milk sugars count in the log, so treat it as a guide.'),
    row('sodium', 'Sodium cap', limits.sodiumMg, 'mg', 2000, 'A soft ceiling of 2,000 mg a day (WHO guide).'),
    row('micros', 'Micronutrients', null, '', null, 'Iron, calcium, vitamin B12 and more are shown against ICMR-NIN ranges once food data is added (Section D).', { pending: true }),
  ] : [];
  const phaseId = direction === 'lose' ? 'cut' : direction === 'gain' ? 'build' : 'maintain';
  return { basic, advanced: adv, phase: { id: phaseId, label: COPY.phase[phaseId], why: 'Your phase follows your goal weight: below your weight is a cut, above is a build, equal is maintain.' }, copy: COPY.targets };
}

/** Same safety rules the app already uses, applied to a typed change. Returns { ok, value, note }. A refusal always says what to do instead. */
function checkTargetChange(key, raw, { profile = {}, floor = 1200 } = {}) {
  const x = Number(raw);
  if (!Number.isFinite(x)) return { ok: false, note: 'Please enter a number.' };
  const kg = Number(profile.currentWeightKg) || 0;
  switch (key) {
    case 'calories': return x < floor ? { ok: false, note: `We keep calories at ${floor} or more so you stay well fuelled. Try ${floor}.`, value: floor } : x > 8000 ? { ok: false, note: 'That looks too high. Please check the number.' } : { ok: true, value: Math.round(x) };
    case 'protein': return x < 20 ? { ok: false, note: 'Protein of at least 20 g keeps things simple and safe.', value: 20 } : x > 400 || (kg > 0 && x > kg * 3) ? { ok: false, note: 'That is more than we suggest. About 1.2 to 2 g per kg works well.' } : { ok: true, value: Math.round(x) };
    case 'water': return x < 500 || x > 8000 ? { ok: false, note: 'Please pick between 500 ml and 8,000 ml.' } : { ok: true, value: Math.round(x / 50) * 50 };
    case 'steps': return x < 1000 || x > 40000 ? { ok: false, note: 'Please pick between 1,000 and 40,000 steps.' } : { ok: true, value: Math.round(x / 100) * 100 };
    case 'goalWeight': {
      const h = Number(profile.heightCm);
      const b = bmi(x, h);
      if (b !== null && b < 18.5) return { ok: false, note: `For your height a healthy goal is at least ${r1(18.5 * ((h / 100) ** 2))} kg.`, value: r1(18.5 * ((h / 100) ** 2)) };
      return x < 20 || x > 400 ? { ok: false, note: 'Please enter a weight between 20 and 400 kg.' } : { ok: true, value: r1(x) };
    }
    default: return { ok: false, note: 'That target cannot be changed here.' };
  }
}

const TARGET_LABEL = { calorieTarget: 'Calories', proteinTarget: 'Protein', waterTargetMl: 'Water', stepsTarget: 'Steps', targetWeightKg: 'Goal weight', exerciseMinutesTarget: 'Exercise minutes', weeklyPaceKg: 'Weekly pace' };
/** Compare saved goals with a $set from the profile route; returns history entries to push (one per changed target). */
function diffTargets(oldGoals = {}, set = {}, today, reason = 'You changed it') {
  const out = [];
  for (const [path, to] of Object.entries(set)) {
    if (!path.startsWith('goals.')) continue;
    const key = path.slice(6); const from = oldGoals[key];
    if (!TARGET_LABEL[key] || from === to || (from == null && to == null)) continue;
    out.push({ date: today, key, label: TARGET_LABEL[key], from: from ?? null, to: to ?? null, reason });
  }
  return out;
}

/** One calm line for the newest change in the last 14 days, in positive words. */
function updatedLine(history = [], today) {
  const h = [...history].filter((x) => x && x.date && diffDays(x.date, today) <= 14 && diffDays(x.date, today) >= 0).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!h) return '';
  const why = h.reason && h.reason !== 'You changed it' ? h.reason : 'you asked for it';
  return `Updated your ${h.label.toLowerCase()} target to ${h.to}${h.key === 'targetWeightKg' ? ' kg' : ''} because ${why}.`;
}

// ------------------------------------------------------------------------------------------------ 6. phases, weekly recap
/** When to move from a cut to maintain. Only suggests; never changes anything on its own. */
function phaseSuggestion({ direction, goal, weeksSinceStart = 0, weeksSinceBreak = 0, onBreak = false }) {
  if (onBreak) return { id: 'on-break', action: null, line: 'You are on a maintenance break. Enjoy the steady weeks.' };
  if (goal?.active && goal.status === 'reached') return { id: 'to-maintain', action: 'set-maintain', line: 'You reached your goal. Switching to maintain keeps it. Set your goal weight to where you are now.' };
  if (direction === 'lose' && weeksSinceBreak >= 12) return { id: 'break', action: 'start-break', line: 'After about 12 weeks of cutting, a two-week maintenance break is a smart pause. It is optional.' };
  if (direction === 'lose' && goal?.active && goal.pct >= 90) return { id: 'near', action: null, line: 'You are close. Think about whether you want to maintain once you arrive.' };
  return null;
}

/** The week in one win. `days` = last 7 days rows; picks the most encouraging true thing. */
function weeklyRecap({ days, targets, today, streak, goal }) {
  const week = days.filter((d) => d.date > addDays(today, -7) && d.date <= today);
  const logged = week.filter((d) => dayHits(d, targets).log).length;
  const water = week.filter((d) => dayHits(d, targets).water).length;
  const protein = week.filter((d) => dayHits(d, targets).protein).length;
  const full = week.filter((d) => focusDone(d, targets)).length;
  const wins = [];
  if (full >= 1) wins.push({ id: 'quests', n: full, line: `${full} day${full === 1 ? '' : 's'} with all three quests done.` });
  if (water >= 3) wins.push({ id: 'water', n: water, line: `You hit your water goal on ${water} days.` });
  if (protein >= 3) wins.push({ id: 'protein', n: protein, line: `Protein landed on ${protein} days.` });
  if (logged >= 3) wins.push({ id: 'logging', n: logged, line: `You showed up and logged on ${logged} days.` });
  if (streak?.comeback) wins.push({ id: 'comeback', n: 1, line: streak.comeback.line });
  if (goal?.active && goal.doneKg > 0) wins.push({ id: 'goal', n: goal.doneKg, line: `${goal.doneKg} kg done of ${goal.totalKg} kg so far.` });
  const order = ['comeback', 'quests', 'goal', 'protein', 'water', 'logging'];
  wins.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const win = wins[0] || { id: 'fresh', n: 0, line: 'A fresh week is a fresh start. One small log is enough to begin.' };
  return { title: COPY.recap.title, win: win.line, id: win.id, loggedDays: logged };
}

module.exports = {
  COPY, etaRange, prettyRange, goalCard, statusWhy, goalStatus, dailyFocus, focusDone, CORE_QUESTS, FOCUS_XP, COMEBACK_XP,
  levelSummary, migrateLevel, weeklyScoreSimple, PARTS, SHELVES, FAMILIES, OLD_TO_NEW, OLD_TIER_MAP, buildShelves, oldUnlockedIds, missingAfterMigration,
  streakSummary, targetsView, checkTargetChange, diffTargets, updatedLine, phaseSuggestion, weeklyRecap,
};
