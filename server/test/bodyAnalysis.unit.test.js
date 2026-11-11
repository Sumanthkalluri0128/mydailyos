// Body analysis: what is really changing, how accurate the target is, sensible pace, the finish, and keeping it.
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../lib/bodyAnalysis');
const { addDays } = require('../lib/dates');
const today = '2026-11-10';

test('fat vs lean: ranges, verdicts, and tape-only readings stay honest', () => {
  const base = { hasData: true, waistChangeCm: -3, bfStart: 28, bfEnd: 26, fatMassChangeKg: -1.8, leanChangeKg: 0.1 };
  const e = A.fatLeanEstimate({ comp: base, strengthStatus: 'up' });
  assert.equal(e.ready, true); assert.equal(e.verdict, 'fat-loss');
  assert.ok(e.fatRange[0] < -1.8 && e.fatRange[1] > -1.8, 'a range, never a single exact number');
  assert.equal(A.fatLeanEstimate({ comp: { ...base, leanChangeKg: 0.6 } }).verdict, 'recomp');
  assert.equal(A.fatLeanEstimate({ comp: { ...base, leanChangeKg: -1.2 } }).verdict, 'muscle-loss');
  assert.equal(A.fatLeanEstimate({ comp: { ...base, fatMassChangeKg: -0.9, leanChangeKg: -0.5 }, strengthStatus: 'down' }).verdict, 'muscle-loss');
  const tape = A.fatLeanEstimate({ comp: { hasData: true, waistChangeCm: -2, fatMassChangeKg: null, leanChangeKg: null } });
  assert.equal(tape.tapeOnly, true); assert.equal(tape.confidence, 'low'); assert.equal(tape.fatRange, null); assert.equal(tape.verdict, 'fat-loss');
  assert.deepEqual(A.fatLeanEstimate({ comp: { hasData: false } }), { ready: false });
});

test('recomposition: a flat scale with a smaller waist and steady lifts is progress', () => {
  const comp = { hasData: true, waistChangeCm: -2, fatMassChangeKg: null };
  assert.equal(A.recompVerdict({ rateKgWk: -0.05, comp, strengthStatus: 'flat' }).recomp, true);
  assert.equal(A.recompVerdict({ rateKgWk: -0.05, comp, strengthStatus: 'down' }), null);
  assert.equal(A.recompVerdict({ rateKgWk: -0.5, comp, strengthStatus: 'up' }), null, 'a moving scale is not a recomposition');
  assert.equal(A.recompVerdict({ rateKgWk: 0, comp: { hasData: true, waistChangeCm: 0.2, fatMassChangeKg: null }, strengthStatus: 'up' }), null);
  assert.equal(A.recompVerdict({ rateKgWk: null, comp, strengthStatus: 'up' }), null);
});

test('ratios: waist-to-height bands, centimetres to half your height, waist-to-hip by sex', () => {
  const r = A.bodyRatios({ heightCm: 170, waistCm: 95, hipCm: 100, sex: 'male' });
  assert.equal(r.whtr, 0.56); assert.equal(r.band, 'raised'); assert.equal(r.cmToHalfHeight, 10); assert.equal(r.whrBand, 'raised');
  assert.equal(A.bodyRatios({ heightCm: 170, waistCm: 80 }).band, 'healthy');
  assert.equal(A.bodyRatios({ heightCm: 160, waistCm: 80, hipCm: 94, sex: 'female' }).whrBand, 'raised');
  assert.equal(A.bodyRatios({ heightCm: 0, waistCm: 80 }), null);
});

// ---- maintenance
const mk = (n, { weight = (i) => 80 - i * 0.04, cal = 2000 } = {}) => Array.from({ length: n }, (_, i) => ({ date: addDays('2026-10-01', i), calories: cal, weightKg: weight(i) }));
test('calibrated maintenance: needs enough data, gives a range, and says how sure it is', () => {
  assert.equal(A.calibratedMaintenance(mk(8)).ready, false);
  assert.ok(A.calibratedMaintenance(mk(8)).need.spanDays > 0);
  const m = A.calibratedMaintenance(mk(35), 2300);
  assert.equal(m.ready, true);
  assert.ok(m.low < m.estimate && m.estimate < m.high);
  assert.ok(Math.abs(m.estimate - (2000 + 0.04 * 7700)) <= 20, 'intake plus what the weight loss implies');
  assert.equal(m.confidence, 'high');
  assert.equal(m.diff, Math.round((m.estimate - 2300) / 10) * 10, 'the difference from the formula is reported');
  const noisy = A.calibratedMaintenance(mk(35, { weight: (i) => 80 - i * 0.04 + (i % 2 ? 1.2 : -1.2) }), 2300);
  assert.ok(noisy.high - noisy.low > m.high - m.low, 'noisier weights give a wider range');
  const sparse = mk(35).map((d, i) => (i % 3 ? { ...d, calories: 0 } : d));         // only every third day logged: 12 days, 34% of the window
  const sp = A.calibratedMaintenance(sparse);
  assert.equal(sp.ready, true); assert.equal(sp.confidence, 'low', 'mostly unlogged days: never a confident answer');
});

test('logging gap: only when the weight is clearly higher than the logged food allows', () => {
  const g = A.loggingGap({ avgIntake: 1700, expectedTdee: 2300, kgPerWeek: -0.1, loggedShare: 0.9 });
  assert.equal(g.likely, true); assert.ok(g.kcalPerDay >= 450); assert.deepEqual(g.fixes, ['weigh-food', 'oil', 'drinks', 'weekends']);
  assert.equal(A.loggingGap({ avgIntake: 1700, expectedTdee: 2300, kgPerWeek: -0.6, loggedShare: 0.9 }), null, 'losing as predicted: no gap');
  assert.equal(A.loggingGap({ avgIntake: 1700, expectedTdee: 2300, kgPerWeek: -0.1, loggedShare: 0.5 }), null, 'too few logged days to judge');
  assert.equal(A.loggingGap({}), null);
});

test('activity drop: a quiet fall in steps is found, normal variation is not', () => {
  const days = (a, b) => [...Array.from({ length: 14 }, (_, i) => ({ date: addDays(today, -27 + i), steps: a })), ...Array.from({ length: 14 }, (_, i) => ({ date: addDays(today, -13 + i), steps: b }))];
  const d = A.activityDrop({ days: days(9000, 6500), today });
  assert.equal(d.dropPct, 28); assert.equal(d.floor, 8000);
  assert.equal(A.activityDrop({ days: days(9000, 8500), today }), null);
  assert.equal(A.activityDrop({ days: days(2000, 1500), today }), null, 'a small absolute change is noise');
  assert.equal(A.activityDrop({ days: days(9000, 6500).slice(0, 10), today }), null);
});

test('pace by body size: leaner and lighter means slower; never above the safe limit', () => {
  const heavy = A.paceByBody({ weightKg: 110, heightCm: 175, chosenPace: 0.8 });
  const lean = A.paceByBody({ weightKg: 62, heightCm: 170, chosenPace: 0.8 });
  assert.ok(heavy.maxKgPerWeek > lean.maxKgPerWeek);
  assert.equal(lean.level, 'fast'); assert.equal(heavy.level, 'ok');
  assert.equal(A.paceByBody({ weightKg: 62, heightCm: 170, chosenPace: 0.05 }).level, 'slow');
  const bf = A.paceByBody({ weightKg: 80, heightCm: 178, sex: 'male', bodyFatPct: 12, chosenPace: 0.5 });
  assert.ok(bf.maxKgPerWeek <= 0.3, 'a lean person is held to a gentle pace');
  assert.equal(A.paceByBody({}), null);
});

test('taper: the last few kilos ease the pace in steps, and a long way to go means no easing', () => {
  assert.equal(A.taperPlan({ currentKg: 80, targetKg: 70, paceKg: 0.6 }), null);
  const a = A.taperPlan({ currentKg: 74.5, targetKg: 70, paceKg: 0.6 }), b = A.taperPlan({ currentKg: 72.5, targetKg: 70, paceKg: 0.6 }), c = A.taperPlan({ currentKg: 71, targetKg: 70, paceKg: 0.6 });
  assert.ok(a.pace > b.pace && b.pace > c.pace && c.pace >= 0.2);
  assert.ok(a.finishWeeks > 0);
  assert.equal(A.taperPlan({ currentKg: 70.2, targetKg: 70, paceKg: 0.6 }), null);
  assert.equal(A.taperPlan({ currentKg: 71, targetKg: 70, paceKg: 0.2 }), null, 'already gentle');
  assert.equal(A.taperPlan({ currentKg: 60, targetKg: 70, paceKg: 0.3, direction: 'gain' }), null);
});

test('plateau checks run cheapest first and name the next step', () => {
  assert.equal(A.plateauChecks({ weighIns14: 3 }).next, 'data');
  assert.equal(A.plateauChecks({ weighIns14: 9, waterLikely: true }).next, 'water');
  assert.equal(A.plateauChecks({ weighIns14: 9, loggedShare: 0.4 }).next, 'logging');
  assert.equal(A.plateauChecks({ weighIns14: 9, loggedShare: 0.9, gap: { kcalPerDay: 400 } }).items.find((i) => i.id === 'logging').status, 'maybe');
  assert.equal(A.plateauChecks({ weighIns14: 9, loggedShare: 0.9, drop: { dropPct: 25, floor: 8000 } }).next, 'activity');
  const adapted = A.plateauChecks({ weighIns14: 9, loggedShare: 0.9, maintenance: { ready: true, confidence: 'high', diff: -300, expected: 2300 } });
  assert.equal(adapted.next, 'adaptation');
  assert.equal(A.plateauChecks({ weighIns14: 9, loggedShare: 0.9 }).next, null);
});

test('diet fatigue: a worn-out week scores high and suggests a break sooner; a fresh one does not', () => {
  const tired = Array.from({ length: 7 }, () => ({ sleepHours: 5, energy: 1.5, soreness: 4.5, stress: 4.5 }));
  const fresh = Array.from({ length: 7 }, () => ({ sleepHours: 8, energy: 4.5, soreness: 1.5, stress: 1.5 }));
  const t = A.fatigueScore({ readiness: tired, strengthStatus: 'down', adherence7: 0.5, adherencePrev: 0.9, weeksInDeficit: 8 });
  const f = A.fatigueScore({ readiness: fresh, strengthStatus: 'up', adherence7: 0.9, adherencePrev: 0.9, weeksInDeficit: 8 });
  assert.equal(t.band, 'high'); assert.equal(t.breakSuggested, true); assert.ok(t.reasons.includes('sleep') && t.reasons.includes('strength'));
  assert.ok(f.score < 35 && f.breakSuggested === false);
  assert.equal(A.fatigueScore({ readiness: tired, strengthStatus: 'down', weeksInDeficit: 2 }).breakSuggested, false, 'not after only two weeks');
  assert.equal(A.fatigueScore({}).score, 0);
});

test('goal realism: too low, too fast, too soon, ok; milestones every 2-3 kg; a review every 4 weeks', () => {
  const g = A.goalRealism({ heightCm: 175, weightKg: 90, targetKg: 78, paceKg: 0.5, today });
  assert.equal(g.verdict, 'ok'); assert.equal(g.remainingKg, 12);
  assert.deepEqual(g.milestones.map((m) => m.lostKg), [3, 6, 9, 12]);
  assert.equal(g.milestones[g.milestones.length - 1].goal, true);
  assert.equal(A.goalRealism({ heightCm: 175, weightKg: 70, targetKg: 52, paceKg: 0.5, today }).verdict, 'too-low');
  assert.equal(A.goalRealism({ heightCm: 175, weightKg: 90, targetKg: 78, paceKg: 1.2, today }).verdict, 'too-fast');
  assert.equal(A.goalRealism({ heightCm: 175, weightKg: 90, targetKg: 78, paceKg: 0.5, byDate: addDays(today, 70), today }).verdict, 'ambitious');
  assert.equal(A.goalRealism({ heightCm: 175, weightKg: 90, targetKg: 95, paceKg: 0.5, today }), null);
  assert.ok(A.goalRealism({ heightCm: 175, weightKg: 90, targetKg: 78, paceKg: 0.5, startDate: addDays(today, -30), today }).nextReviewDate > today);
});

test('maintenance phase: food rises gradually to maintenance, a band is set, and regain is caught early and gently', () => {
  const m = A.maintenancePhase({ currentKg: 70.3, targetKg: 70, calorieTarget: 1700, maintenanceKcal: 2150 });
  assert.equal(m.active, true); assert.deepEqual(m.band, { low: 68.5, high: 71.5 });
  assert.ok(m.ramp.length >= 3 && m.ramp[0].kcal > 1700 && m.ramp[m.ramp.length - 1].kcal === 2150);
  for (let i = 1; i < m.ramp.length; i += 1) assert.ok(m.ramp[i].kcal - m.ramp[i - 1].kcal <= 130, 'never a big jump');
  assert.equal(A.maintenancePhase({ currentKg: 75, targetKg: 70, calorieTarget: 1700, maintenanceKcal: 2150 }), null, 'not at the goal yet');
  assert.equal(A.regainGuard({ trendKg: 71, band: m.band }).state, 'in-band');
  assert.equal(A.regainGuard({ trendKg: 71.9, band: m.band }).state, 'watch');
  const act = A.regainGuard({ trendKg: 72.6, band: m.band });
  assert.equal(act.state, 'act'); assert.ok(act.action.kcal <= 150);
});

test('scenarios: each lever shows its real effect on the date, capped at the safe pace', () => {
  const s = A.scenarios({ currentKg: 85, targetKg: 75, paceKg: 0.5, today, weightKg: 85 });
  assert.equal(s.baseline.weeks, 20);
  const by = Object.fromEntries(s.rows.map((r) => [r.id, r]));
  assert.ok(by.both.weeksSaved > by.steps.weeksSaved && by.both.weeksSaved > by.cut.weeksSaved);
  assert.ok(by.steps.weeksSaved > 0 && by['more-cut'].weeksSaved > by.cut.weeksSaved);
  const light = A.scenarios({ currentKg: 55, targetKg: 50, paceKg: 0.5, today, weightKg: 55 });
  assert.ok(light.rows.every((r) => r.pace <= 0.55 + 1e-9) && light.rows.some((r) => r.capped));
  assert.equal(A.scenarios({ currentKg: 70, targetKg: 75, paceKg: 0.5, today }), null);
});

test('top leaks: weekends, snacks, heavy days; ranked by weekly calories; quiet when there is nothing to say', () => {
  const days = Array.from({ length: 14 }, (_, i) => { const d = addDays('2026-10-27', i); const we = [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay()); return { date: d, calories: we ? 2700 : 1800 }; });
  const rows = days.flatMap((d) => [{ date: d.date, mealType: 'snack', calories: 500 }, { date: d.date, mealType: 'lunch', calories: d.calories - 500 }]);
  const leaks = A.topLeaks({ days, rows, target: 1800 });
  assert.ok(leaks.length >= 2 && leaks.length <= 3);
  assert.deepEqual(leaks.map((l) => l.weeklyKcal), [...leaks.map((l) => l.weeklyKcal)].sort((a, b) => b - a));
  assert.ok(leaks.some((l) => l.id === 'weekend'));
  assert.deepEqual(A.topLeaks({ days: days.map((d) => ({ ...d, calories: 1800 })), rows: [], target: 1800 }), []);
  assert.deepEqual(A.topLeaks({ days: days.slice(0, 3), rows, target: 1800 }), []);
});

test('protein spread and fibre', () => {
  const rows = [];
  for (let i = 0; i < 6; i += 1) for (const m of ['breakfast', 'lunch', 'dinner']) rows.push({ date: addDays('2026-11-01', i), mealType: m, protein: m === 'dinner' ? 35 : 8, fiber: 6 });
  const out = A.proteinFibre({ rows });
  assert.ok(out.find((x) => x.id === 'protein-spread'));
  assert.equal(out.find((x) => x.id === 'fibre-low').vars.avg, 18);
  assert.deepEqual(A.proteinFibre({ rows: rows.map((r) => ({ ...r, protein: 30, fiber: 12 })) }), []);
});

test('learned effects: only from judged changes, and only a "best" when it is repeated', () => {
  const e = (action, verdict, before, now) => ({ action, after: { verdict, rateBefore: before, rateNow: now } });
  assert.equal(A.learnedEffects([e('LADDER_STEPS', 'better', -0.1, -0.3)]), null);
  const l = A.learnedEffects([e('LADDER_STEPS', 'better', -0.1, -0.3), e('LADDER_STEPS', 'better', -0.2, -0.4), e('LADDER_CUT', 'same', -0.3, -0.3), { action: 'LADDER_CUT', undone: true, after: { verdict: 'better', rateBefore: 0, rateNow: -1 } }]);
  assert.equal(l.best, 'steps');
  assert.equal(l.rows.find((r) => r.kind === 'cut').n, 1);
});

test('restriction pattern: only a persistent or swinging pattern is flagged', () => {
  const day = (i, c) => ({ date: addDays('2026-10-27', i), calories: c });
  assert.equal(A.restrictionPattern({ days: Array.from({ length: 10 }, (_, i) => day(i, 1800)), target: 1800, floor: 1400 }).flagged, false);
  assert.equal(A.restrictionPattern({ days: Array.from({ length: 10 }, (_, i) => day(i, 900)), target: 1800, floor: 1400 }).flagged, true);
  const swing = Array.from({ length: 10 }, (_, i) => day(i, i % 2 ? 2800 : 800));
  assert.equal(A.restrictionPattern({ days: swing, target: 1800, floor: 1400 }).flagged, true);
  assert.equal(A.restrictionPattern({ days: [day(0, 900)], target: 1800, floor: 1400 }).flagged, false);
});

const { safetyReport, toneCheck } = require('../lib/safety');
test('safety: a minor is told kindly, a restriction pattern gets a supportive notice, and neither shames', () => {
  const p = { currentWeightKg: 70, heightCm: 170, age: 16, goals: { targetWeightKg: 62 } };
  const minor = safetyReport({ profile: p });
  assert.ok(minor.flags.find((f) => f.id === 'minor')); assert.equal(minor.level, 'alert');
  assert.equal(safetyReport({ profile: { ...p, age: 30 } }).flags.find((f) => f.id === 'minor'), undefined);
  const r = safetyReport({ profile: { ...p, age: 30 }, restriction: { flagged: true } });
  const f = r.flags.find((x) => x.id === 'restriction-pattern');
  assert.ok(f); assert.equal(f.severity, 'notice');
  for (const x of [...minor.flags, f]) assert.equal(toneCheck(`${x.title} ${x.detail}`).ok, true, `${x.id} must not shame`);
  assert.equal(safetyReport({ profile: { ...p, age: 30 }, restriction: { flagged: false } }).flags.find((x) => x.id === 'restriction-pattern'), undefined);
});
