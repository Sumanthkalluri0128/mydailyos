const test = require('node:test');
const assert = require('node:assert');
const S = require('../lib/simpleGoals');
const { buildAchievements } = require('../lib/achievements');
const { buildOutcomeBadges } = require('../lib/outcomes');
const { toneCheck } = require('../lib/safety');
const { levelFor, buildXp } = require('../lib/journey');
const { addDays } = require('../lib/dates');

const TODAY = '2026-10-21'; // a Wednesday
const T = { calories: 1800, direction: 'lose', protein: 120, waterMl: 3000, steps: 8000, exerciseMinutes: 30 };
const goodDay = (date) => ({ date, calories: 1700, protein: 125, waterMl: 3100, steps: 9000, exerciseMinutes: 30, tasksCompleted: 0, habitsCompleted: 0, weighIn: false });

test('etaRange: trend pace gives a range, never narrower than a week', () => {
  const r = S.etaRange({ remainingKg: 4, plannedPace: 0.5, observedRate: 0.5, today: TODAY });
  assert.equal(r.basis, 'trend');
  assert.ok(r.from < r.to);
  assert.ok(r.from > TODAY);
  const tiny = S.etaRange({ remainingKg: 0.1, plannedPace: 0.5, observedRate: 0.5, today: TODAY });
  assert.ok(new Date(tiny.to) - new Date(tiny.from) >= 7 * 86400000);
});
test('etaRange: no usable trend falls back to plan pace; reached returns reached', () => {
  assert.equal(S.etaRange({ remainingKg: 4, plannedPace: 0.5, observedRate: null, today: TODAY }).basis, 'plan');
  assert.equal(S.etaRange({ remainingKg: 4, plannedPace: 0.5, observedRate: -0.2, today: TODAY }).basis, 'plan');
  assert.equal(S.etaRange({ remainingKg: 0, today: TODAY }).reached, true);
});
test('goalCard: progress first, plain status, date range, no jargon', () => {
  const plan = { active: true, startKg: 80, targetKg: 74, startDate: addDays(TODAY, -28), paceKg: 0.5 };
  const g = S.goalCard({ plan, trendKg: 78, rate: -0.5, today: TODAY });
  assert.equal(g.progressLine, '2 kg done of 6 kg');
  assert.equal(g.pct, 33);
  assert.ok(['ahead', 'on', 'behind'].includes(g.status));
  assert.ok(g.eta && g.eta.from < g.eta.to);
  assert.match(g.eta.line, /^Likely to arrive \d/);
  assert.ok(!/ and /.test(g.eta.line));
  assert.ok(!/corridor/i.test(JSON.stringify(g)));
  assert.equal(S.goalCard({ plan: { active: false }, today: TODAY }).active, false);
});
test('goalCard: reached and maintain', () => {
  const plan = { active: true, startKg: 80, targetKg: 74, startDate: addDays(TODAY, -90), paceKg: 0.5 };
  const g = S.goalCard({ plan, trendKg: 73.9, rate: 0, today: TODAY });
  assert.equal(g.status, 'reached'); assert.equal(g.eta, null);
  const m = S.goalCard({ plan: { ...plan, targetKg: 80 }, trendKg: 80, today: TODAY });
  assert.equal(m.status, 'maintain');
});

test('dailyFocus: at most three quests, steps is a bonus, reward only when all three done', () => {
  const f = S.dailyFocus(goodDay(TODAY), T);
  assert.equal(f.total, 3);
  assert.ok(f.complete); assert.ok(f.reward); assert.equal(f.bonus.done, true);
  const part = S.dailyFocus({ ...goodDay(TODAY), waterMl: 500 }, T);
  assert.equal(part.done, 2); assert.equal(part.reward, null);
  const none = S.dailyFocus(null, { calories: 0 });
  assert.equal(none.total, 0); assert.ok(none.empty);
  // steps alone never completes or blocks
  const noSteps = S.dailyFocus({ ...goodDay(TODAY), steps: 0 }, T);
  assert.ok(noSteps.complete);
});

test('level: old XP formula is reproduced and the level never drops', () => {
  const days = Array.from({ length: 30 }, (_, i) => goodDay(addDays(TODAY, -i)));
  const streaks = { logging: { best: 30 } };
  const legacy = buildXp(days, T, streaks).xp;
  const lv = S.levelSummary({ days, targets: T, streaks, comebacks: 0 });
  assert.equal(lv.legacyXp, legacy);
  assert.ok(lv.xp >= levelFor(legacy).xp);
  assert.ok(lv.level >= levelFor(legacy).level);
  const withFloor = S.levelSummary({ days: [], targets: T, streaks: {}, floor: lv.xp });
  assert.equal(withFloor.level, lv.level);
  assert.ok(S.migrateLevel(5) > 0 && S.migrateLevel(1) === 0);
  assert.equal(levelFor(S.migrateLevel(7)).level, 7);
});

test('weekly score: three labelled parts that match the old score components', () => {
  const days = Array.from({ length: 7 }, (_, i) => goodDay(addDays(TODAY, -i))).reverse();
  const w = S.weeklyScoreSimple(days, T, TODAY, {});
  assert.ok(w.score > 80);
  assert.deepEqual(w.parts.map((p) => p.id), ['food', 'movement', 'habits']);
  assert.ok(w.parts.every((p) => p.label && p.why));
  assert.equal(S.weeklyScoreSimple([], T, TODAY).score, null);
});

const emptyInputs = () => ({ streaks: { logging: 0, water: 0, habit: 0, workout: 0 }, totals: {}, outcomes: { direction: 'lose', lostKg: 0, lostPct: 0, waistLostCm: 0, deficitKg: 0, proteinWeeks: 0, muscleWeeks: 0, comebacks: 0 } });

test('badges: four shelves, rarity tiers, next and last', () => {
  const i = emptyInputs(); i.streaks.logging = 8; i.totals = { workouts: 12 }; i.outcomes.lostKg = 2.5;
  i.earnedAt = { workouts: '2026-10-01', 'log-streak': '2026-10-15' };
  const s = S.buildShelves(i);
  assert.deepEqual(s.shelves.map((x) => x.id), ['consistency', 'nutrition', 'training', 'milestones']);
  assert.equal(s.shelves.flatMap((x) => x.badges).find((b) => b.id === 'workouts').rarity, 'rare');
  assert.equal(s.last.id, 'log-streak');
  assert.ok(s.next && s.next.progress <= 1);
  assert.ok(s.total < 28, 'fewer badges than the 28 old ones');
});
test('badges: gaining or maintaining hides loss-only badges', () => {
  const i = emptyInputs(); i.outcomes.direction = 'gain';
  const ids = S.buildShelves(i).shelves.flatMap((x) => x.badges).map((b) => b.id);
  assert.ok(!ids.includes('weight-lost') && !ids.includes('waist') && !ids.includes('deficit'));
});

test('badge migration: every old badge that was earned is earned in the new shelves', () => {
  const scenarios = [
    { streakDays: 120, totals: { tasksCompleted: 120, workouts: 60, foodEntries: 80, weighIns: 12, waterLiters: 150, habitCompletions: 60 }, lostKg: 11, lostPct: 12, waist: 11 },
    { streakDays: 8, totals: { tasksCompleted: 12, workouts: 3, foodEntries: 10, weighIns: 2, waterLiters: 20, habitCompletions: 5 }, lostKg: 1.2, lostPct: 2.1, waist: 2 },
    { streakDays: 3, totals: {}, lostKg: 0, lostPct: 0, waist: 0 },
    { streakDays: 40, totals: { tasksCompleted: 1 }, lostKg: 0.5, lostPct: 2.5, waist: 0 }, // pct tier reached while kg tier is not
  ];
  for (const sc of scenarios) {
    const today = TODAY;
    const days = Array.from({ length: sc.streakDays }, (_, i) => ({ date: addDays(today, -i), waterMl: 4000, exerciseMinutes: 30, calories: 1500, tasksCompleted: 1, habitsCompleted: 1, weighIn: false })).reverse();
    const old = buildAchievements({ days, totals: sc.totals, goals: { waterTargetMl: 3000 }, today });
    const oc = buildOutcomeBadges({ direction: 'lose', startKg: 100, trendKg: 100 - sc.lostKg, startWaistCm: 100, waistCm: 100 - sc.waist, deficitKcal: 7700 * 2, proteinWeeks: 5, muscleWeeks: 2, comebacks: 2 });
    // The percentage outcome is measured against the real start weight; recompute so the fixture matches.
    const lostPct = oc.badges.find((b) => b.id === 'fat-pct').value;
    const i = {
      streaks: { logging: old.streaks.logging.best, water: old.streaks.water.best, habit: old.streaks.habit.best, workout: old.streaks.workout.best },
      totals: sc.totals,
      outcomes: { direction: 'lose', lostKg: oc.badges.find((b) => b.id === 'fat-kg').value, lostPct, waistLostCm: oc.badges.find((b) => b.id === 'waist').value, deficitKg: oc.deficitKg, proteinWeeks: 5, muscleWeeks: 2, comebacks: 2 },
    };
    const shelves = S.buildShelves(i);
    const missing = S.missingAfterMigration({ badges: old.badges, outcomeBadges: oc.badges }, shelves);
    assert.deepEqual(missing, [], `lost badges: ${missing.join(',')}`);
  }
});
test('every old badge id has a mapping to a real family', () => {
  const { STREAK_BADGES, TOTAL_BADGES } = require('../lib/achievements');
  const { FAMILIES: OF } = require('../lib/outcomes');
  const fams = new Set(S.FAMILIES.map((f) => f.id));
  for (const id of [...STREAK_BADGES, ...TOTAL_BADGES].map((b) => b.id)) { assert.ok(S.OLD_TO_NEW[id], `unmapped ${id}`); assert.ok(fams.has(S.OLD_TO_NEW[id][0])); }
  for (const f of OF) { assert.ok(S.OLD_TO_NEW[f.id], `unmapped ${f.id}`); assert.ok(fams.has(S.OLD_TO_NEW[f.id][0])); }
});

test('streak: one rest-day token per week bridges one quiet day; two in a row end it; comeback earns a bonus', () => {
  const d = (n) => addDays(TODAY, -n);
  const bridged = S.streakSummary([d(0), d(1), d(3), d(4), d(5)], TODAY); // quiet day at -2 (Mon)
  assert.equal(bridged.current, 5);
  assert.equal(bridged.restDays.length, 1);
  assert.equal(bridged.token.available, false);
  const broken = S.streakSummary([d(0), d(4), d(5)], TODAY); // two quiet days
  assert.equal(broken.current, 1);
  assert.equal(broken.token.available, true);
  const back = S.streakSummary([d(10), d(9), d(1), d(0)], TODAY); // gap of 7 days, returned
  assert.ok(back.comeback && back.comeback.bonusXp === S.COMEBACK_XP);
  const lv = S.levelSummary({ days: [], targets: T, streaks: {}, comebacks: back.comebacks });
  assert.equal(lv.newXp, S.COMEBACK_XP * back.comebacks);
});

test('targets: basic and advanced rows each have why + recommended; safety rules apply', () => {
  const profile = { currentWeightKg: 79, heightCm: 173, sex: 'male', goals: { targetWeightKg: 72, weeklyPaceKg: 0.5 } };
  const v = S.targetsView({ profile, target: 2000, direction: 'lose', energy: { autoTarget: 2000 }, floor: 1500 });
  assert.deepEqual(v.basic.map((r) => r.id), ['calories', 'protein', 'water', 'steps', 'goalWeight']);
  assert.ok(v.basic.every((r) => r.why));
  assert.ok(v.advanced.length >= 4);
  assert.equal(v.phase.id, 'cut');
  assert.equal(S.checkTargetChange('calories', 900, { floor: 1500 }).ok, false);
  assert.equal(S.checkTargetChange('calories', 1600, { floor: 1500 }).value, 1600);
  assert.equal(S.checkTargetChange('goalWeight', 50, { profile }).ok, false);
  assert.equal(S.checkTargetChange('water', 3010, {}).value, 3000);
  assert.equal(S.checkTargetChange('steps', 'abc', {}).ok, false);
});
test('target history: diff + calm line', () => {
  const entries = S.diffTargets({ calorieTarget: 1800, stepsTarget: 8000 }, { 'goals.calorieTarget': 1700, 'goals.stepsTarget': 8000, 'name': 'x' }, TODAY);
  assert.equal(entries.length, 1); assert.equal(entries[0].key, 'calorieTarget');
  assert.match(S.updatedLine(entries, TODAY), /Updated your calories target to 1700 because/);
  assert.equal(S.updatedLine(entries, addDays(TODAY, 30)), '');
});
test('phase suggestion and recap are gentle', () => {
  assert.equal(S.phaseSuggestion({ direction: 'lose', goal: { active: true, status: 'reached' } }).action, 'set-maintain');
  assert.equal(S.phaseSuggestion({ direction: 'lose', weeksSinceBreak: 13, goal: { active: true, status: 'on', pct: 40 } }).action, 'start-break');
  assert.equal(S.phaseSuggestion({ direction: 'lose', weeksSinceBreak: 2, goal: { active: true, status: 'on', pct: 40 } }), null);
  const days = Array.from({ length: 7 }, (_, i) => goodDay(addDays(TODAY, -i)));
  assert.equal(S.weeklyRecap({ days, targets: T, today: TODAY }).id, 'quests');
  assert.equal(S.weeklyRecap({ days: [], targets: T, today: TODAY }).id, 'fresh');
});

test('all user-facing copy passes the tone check', () => {
  const strings = [];
  const walk = (o) => { if (typeof o === 'string') strings.push(o); else if (typeof o === 'function') { try { strings.push(o('4-18 Mar 2027', 5, 7)); } catch { /* skip */ } } else if (o && typeof o === 'object') Object.values(o).forEach(walk); };
  walk(S.COPY);
  strings.push(S.updatedLine(S.diffTargets({ calorieTarget: 1800 }, { 'goals.calorieTarget': 1700 }, TODAY), TODAY));
  for (const s of strings) assert.equal(toneCheck(s).ok, true, s);
});
