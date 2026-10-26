const test = require('node:test');
const assert = require('node:assert');
const S = require('../lib/strength');
const P = require('../lib/programs');
const G = require('../lib/guided');
const { suggestWorkout } = require('../lib/workoutSuggest');
const { buildLogs } = require('../lib/workoutBuild');
const { muscleGroupsFor } = require('../lib/muscles');
const { ACTIVITIES } = require('../lib/activityCatalogue');
const { toneCheck } = require('../lib/safety');
const { computeRecords } = require('../lib/records');

const log = (activityName, date, sets) => ({ activityName, category: 'Strength', date, sets });

test('1RM: Epley and Brzycki match the published formulas', () => {
  assert.strictEqual(S.epley(100, 5), 116.7);
  assert.strictEqual(S.brzycki(100, 5), 112.5);
  assert.strictEqual(S.epley(100, 1), 100);
  assert.strictEqual(S.brzycki(100, 1), 100);
  assert.strictEqual(S.brzycki(100, 11), null); // not trusted above 10 reps
  assert.strictEqual(S.epley(0, 5), null);
  assert.match(S.FORMULAS.epley, /30/); assert.match(S.FORMULAS.brzycki, /37/);
  assert.deepStrictEqual(Object.keys(S.estimate1RM(60, 8)).sort(), ['brzycki', 'epley', 'formulas']);
});

test('records carry both estimates', () => {
  const r = computeRecords([log('Deadlift', '2026-10-01', [{ reps: 5, weightKg: 100 }])])[0];
  assert.strictEqual(r.best1RM, 116.7); assert.strictEqual(r.best1RMBrzycki, 112.5);
});

test('history groups sets per session with best set and volume', () => {
  const h = S.exerciseHistory([
    log('Squat', '2026-10-02', [{ reps: 5, weightKg: 60 }, { reps: 8, weightKg: 50 }]),
    log('Squat', '2026-09-25', [{ reps: 5, weightKg: 50 }]),
    log('Other', '2026-10-02', [{ reps: 5, weightKg: 999 }]),
  ], 'Squat');
  assert.deepStrictEqual(h.map((x) => x.date), ['2026-09-25', '2026-10-02']);
  assert.strictEqual(h[1].bestWeightKg, 60); assert.strictEqual(h[1].volumeKg, 700);
});

test('beat last time: reps first, small weight step when reps are high, bodyweight uses reps', () => {
  assert.strictEqual(S.beatLastTime([]), null);
  const a = S.beatLastTime([{ reps: 8, weightKg: 40 }]);
  assert.strictEqual(a.kind, 'reps'); assert.strictEqual(a.reps, 9); assert.strictEqual(a.weightKg, 40);
  const b = S.beatLastTime([{ reps: 12, weightKg: 40 }, { reps: 12, weightKg: 40 }]);
  assert.strictEqual(b.kind, 'weight'); assert.strictEqual(b.weightKg, 42.5);
  assert.strictEqual(S.beatLastTime([{ reps: 10, weightKg: 0 }]).reps, 11);
});

test('no extreme jumps: over 10% asks for confirmation but never blocks', () => {
  assert.strictEqual(S.checkJump(105, 100).needsConfirm, false);
  const j = S.checkJump(130, 100);
  assert.strictEqual(j.needsConfirm, true); assert.strictEqual(j.pct, 30); assert.ok(toneCheck(j.note).ok);
  assert.strictEqual(S.checkJump(90, 100).needsConfirm, false);
  assert.strictEqual(S.checkJump(50, 0).needsConfirm, false);
});

test('weekly volume per muscle counts only the last 7 days and uses catalogue data', () => {
  const logs = [
    log('Goblet Squat', '2026-10-20', [{ reps: 10, weightKg: 20 }, { reps: 10, weightKg: 20 }]),
    log('Push-ups', '2026-10-18', [{ reps: 10, weightKg: 0 }]),
    log('Goblet Squat', '2026-10-10', [{ reps: 10, weightKg: 20 }]), // older than 7 days
    log('Yoga', '2026-10-20', []),
  ];
  const v = S.weeklyMuscleVolume(logs, '2026-10-21');
  assert.strictEqual(v.legs.sets, 2); assert.strictEqual(v.legs.volumeKg, 400);
  assert.strictEqual(v.chest.sets, 1); assert.strictEqual(v.back.sets, 0);
  const custom = S.weeklyMuscleVolume([log('Zzz Move', '2026-10-20', [{ reps: 5, weightKg: 10 }])], '2026-10-21', new Map([['Zzz Move', { muscles: ['back'] }]]));
  assert.strictEqual(custom.back.sets, 1);
  const since = S.daysSinceTrained(logs, '2026-10-21');
  assert.strictEqual(since.legs, 1); assert.strictEqual(since.core, null);
});

test('every catalogue lift has muscle groups and names are unique', () => {
  const lifts = ACTIVITIES.filter((a) => a.muscles);
  assert.ok(lifts.length >= 20);
  assert.strictEqual(new Set(ACTIVITIES.map((a) => a.name)).size, ACTIVITIES.length);
  for (const a of lifts) assert.ok(a.muscles.length >= 1);
  assert.deepStrictEqual(muscleGroupsFor('Barbell Back Squat'), ['legs', 'glutes']);
  assert.deepStrictEqual(muscleGroupsFor('Walking - Brisk'), []);
});

test('deload: flat for 3 weeks nudges, 2 weeks watches, a gap never looks like a stall', () => {
  const today = '2026-10-28';
  const row = (date, best1RM) => ({ date, best1RM });
  const flat3 = [row('2026-10-01', 100), row('2026-10-08', 100), row('2026-10-15', 100), row('2026-10-22', 100)];
  assert.strictEqual(S.deloadStatus(flat3, today).status, 'deload');
  assert.strictEqual(S.deloadStatus(flat3.slice(1), today).status, 'watch');
  const rising = [row('2026-10-01', 100), row('2026-10-08', 105), row('2026-10-15', 110), row('2026-10-22', 115)];
  assert.strictEqual(S.deloadStatus(rising, today).status, 'ok');
  assert.strictEqual(S.deloadStatus([row('2026-10-01', 100), row('2026-10-22', 100)], today).status, 'ok');
  assert.ok(toneCheck(S.deloadStatus(flat3, today).text).ok);
  const t = S.deloadTarget(100, 3);
  assert.strictEqual(t.weightKg, 60); assert.strictEqual(t.sets, 2);
});

test('plate calculator in kg and lb, custom plates and impossible loads', () => {
  const kg = S.plateCalc(100);
  assert.deepStrictEqual(kg.perSide, [{ plate: 25, count: 1 }, { plate: 15, count: 1 }]); assert.strictEqual(kg.achieved, 100);
  assert.deepStrictEqual(S.plateCalc(135, { unit: 'lb' }).perSide, [{ plate: 45, count: 1 }]);
  assert.strictEqual(S.plateCalc(225, { unit: 'lb' }).perSide[0].count, 2);
  const odd = S.plateCalc(61, { plates: [10, 5] });
  assert.strictEqual(odd.achieved, 60); assert.match(odd.note, /short/);
  assert.strictEqual(S.plateCalc(15).achieved, 20); // lighter than the bar
  assert.strictEqual(S.plateCalc(60, { barWeight: 15 }).bar, 15);
  assert.strictEqual(S.plateCalc(-1).error, 'Enter a target weight');
  assert.strictEqual(S.lbToKg(100), 45.4); assert.strictEqual(S.kgToLb(100), 220.5);
});

test('new records: first time is not a record, beating the best is', () => {
  const prior = new Map([['Squat', { best1RM: 100, bestWeightKg: 80 }]]);
  assert.strictEqual(S.newRecords(prior, [{ activityName: 'Bench', sets: [{ reps: 5, weightKg: 50 }] }]).length, 0);
  assert.strictEqual(S.newRecords(prior, [{ activityName: 'Squat', sets: [{ reps: 5, weightKg: 70 }] }]).length, 0);
  const r = S.newRecords(prior, [{ activityName: 'Squat', sets: [{ reps: 5, weightKg: 90 }] }]);
  assert.strictEqual(r[0].kind, '1rm');
  assert.strictEqual(S.powerLevel([{ best1RM: 100.4 }, { best1RM: 50.2 }]), 151);
});

test('program ramp: gentle weekly growth, one extra set at most, rest arc lighter, bodyweight needs no kit', () => {
  for (const prog of P.PROGRAMS) {
    assert.ok(prog.weeksCount >= 4 && prog.weeksCount <= 8);
    let prev = 0;
    for (const w of prog.weeks) {
      const load = P.weekLoad(w);
      if (w.rest) { assert.ok(load < prev * 0.6, 'rest arc is lighter'); continue; }
      if (prev) { assert.ok(load >= prev, 'never drops in a build week'); assert.ok(load / prev <= P.MAX_WEEKLY_REP_GROWTH, `${prog.id} week ${w.week} grows ${load / prev}`); }
      prev = load;
      for (const s of w.sessions) for (const e of s.exercises) assert.ok(e.sets <= 3, 'at most 3 sets for beginners');
    }
    for (const s of prog.weeks.flatMap((w) => w.sessions)) for (const e of s.exercises) {
      assert.ok(ACTIVITIES.some((a) => a.name === e.name), `${e.name} is in the catalogue`);
      if (prog.equipment === 'none') assert.ok(!/Dumbbell|Cable|Pulldown|Press|Barbell|Curl|Goblet|Deadlift/.test(e.name), `${e.name} needs no equipment`);
    }
  }
  assert.strictEqual(P.PROGRAMS.find((p) => p.id === 'bw-4').weeks.some((w) => w.rest), false);
  assert.ok(P.PROGRAMS.find((p) => p.id === 'bw-6').weeks[3].rest);
});

test('program text is calm and character names exist', () => {
  for (const prog of P.PROGRAMS) {
    assert.ok(toneCheck(`${prog.title} ${prog.summary}`).ok);
    for (const w of prog.weeks) { assert.ok(toneCheck(w.episode).ok); for (const s of w.sessions) assert.ok(['goku', 'vegeta', 'bakugo', 'zoro', 'kakashi'].includes(s.who)); }
  }
});

test('step goal rises 500 a week from the base and never passes the profile target', () => {
  assert.strictEqual(P.stepGoalForWeek(1, 3000, 10000), 3000);
  assert.strictEqual(P.stepGoalForWeek(2, 3000, 10000), 3500);
  assert.strictEqual(P.stepGoalForWeek(8, 3000, 10000), 6500);
  assert.strictEqual(P.stepGoalForWeek(8, 8000, 9000), 9000);
  assert.strictEqual(P.stepGoalForWeek(3, 12000, 10000), 10000);
  assert.strictEqual(P.stepGoalForWeek(2, null, null), 3500);
  assert.strictEqual(P.baseStepsFrom([4000, 5000, 0, 6000]), 5000);
  assert.strictEqual(P.baseStepsFrom([4000]), 3000);
});

test('week position and next session', () => {
  assert.strictEqual(P.weekOn('2026-10-05', '2026-10-04', 6), 0);
  assert.strictEqual(P.weekOn('2026-10-05', '2026-10-05', 6), 1);
  assert.strictEqual(P.weekOn('2026-10-05', '2026-10-12', 6), 2);
  assert.strictEqual(P.weekOn('2026-10-05', '2027-03-01', 6), 7);
  const prog = P.getProgram('bw-6');
  assert.strictEqual(P.nextSession(prog, 1, []).day, 1);
  assert.strictEqual(P.nextSession(prog, 1, [{ week: 1, day: 1 }]).day, 2);
  assert.strictEqual(P.nextSession(prog, 1, [{ week: 1, day: 1 }, { week: 1, day: 2 }, { week: 1, day: 3 }]), null);
  assert.strictEqual(P.getProgram('nope'), null);
});

test('daily suggestion explains itself and respects recovery', () => {
  const base = { minutes: 20, sleepHours: 7, daysSince: { legs: 3, back: 1, chest: 2, shoulders: 1, core: 2 } };
  const s = suggestWorkout(base);
  assert.strictEqual(s.title, 'Legs day'); assert.match(s.reasons.join(' '), /Legs rested for 3 days/); assert.match(s.reasons.join(' '), /slept 7 h/);
  assert.strictEqual(s.items.length, 3); assert.strictEqual(s.intensity, 'normal');
  assert.strictEqual(suggestWorkout({ ...base, minutes: 10 }).items.length, 2);
  assert.strictEqual(suggestWorkout({ ...base, minutes: 40 }).items.length, 5);
  const tired = suggestWorkout({ ...base, sleepHours: 5 });
  assert.strictEqual(tired.intensity, 'easy'); assert.strictEqual(tired.items[0].sets, 2); assert.match(tired.reasons.join(' '), /5 h/);
  const rest = suggestWorkout({ ...base, sleepHours: 5, yesterday: { minutes: 75, strengthSets: 20 } });
  assert.strictEqual(rest.type, 'stretch');
  assert.strictEqual(suggestWorkout({ ...base, daysSince: { legs: 1, back: 0, chest: 1, shoulders: 1, core: 0 } }).type, 'stretch');
  assert.ok(!suggestWorkout({ minutes: 20 }).reasons.some((r) => /slept/.test(r)), 'unknown sleep is never invented');
  assert.match(suggestWorkout({ ...base, yesterdaySteps: 1500 }).walkTip, /walk/);
  assert.strictEqual(suggestWorkout({ ...base, equipment: 'gym' }).items[0].name, 'Goblet Squat');
  const prog = suggestWorkout({ ...base, programSession: P.nextSession(P.getProgram('bw-6'), 2, []) });
  assert.strictEqual(prog.type, 'program'); assert.match(prog.reasons[0], /episode 2, day 1/);
  for (const x of [s, tired, rest, prog]) for (const r of x.reasons) assert.ok(toneCheck(r).ok, r);
  assert.strictEqual(suggestWorkout({ ...base, daysSince: { core: null, legs: 1, back: 1, chest: 1, shoulders: 1 } }).reasons[0], 'Core has not been logged recently, so it is up next.');
});

test('guided sessions: 3-10 minutes, cues in order, breathing phases', () => {
  assert.strictEqual(G.buildGuided('meditate', 1).minutes, 3);
  assert.strictEqual(G.buildGuided('meditate', 99).minutes, 10);
  for (const kind of ['meditate', 'stretch']) for (const m of [3, 5, 10]) {
    const g = G.buildGuided(kind, m);
    assert.strictEqual(g.totalSec, m * 60);
    assert.ok(g.cues.every((c, i) => i === 0 || c.atSec >= g.cues[i - 1].atSec));
    assert.ok(g.cues[g.cues.length - 1].atSec < g.totalSec);
    for (const c of g.cues) assert.ok(toneCheck(c.text).ok, c.text);
    assert.match(g.note, /Stop if you feel pain/);
  }
  assert.strictEqual(G.cueAt(G.buildGuided('stretch', 5), 0).title, 'Neck side tilt');
  assert.deepStrictEqual([0, 4, 6, 12, 16].map((s) => G.breathPhase(s).phase), ['inhale', 'hold', 'exhale', 'inhale', 'hold']);
  assert.strictEqual(G.breathPhase(1).progress, 0.25); assert.strictEqual(G.breathPhase(9).progress, 0.5);
  assert.ok(ACTIVITIES.some((a) => a.name === G.ACTIVITY_NAME.meditate) && ACTIVITIES.some((a) => a.name === G.ACTIVITY_NAME.stretch));
});

test('workout logs: duration estimated from sets, calories from MET, bad sets dropped', () => {
  const logs = buildLogs({ userId: 'u', date: '2026-10-21', weightKg: 70, label: 'x', clientId: 'c1', items: [
    { activityId: 'a', activityName: 'Squat', met: 5, sets: [{ reps: 5, weightKg: 60 }, { reps: 5, weightKg: 60 }, { reps: 0, weightKg: 60 }, { reps: 5, weightKg: -3 }] },
    { activityId: 'b', activityName: 'Plank', met: 3.8, durationMinutes: 4, sets: [] },
  ] });
  assert.strictEqual(logs[0].sets.length, 3); assert.strictEqual(logs[0].sets[2].weightKg, 0);
  assert.strictEqual(logs[0].durationMinutes, 5); // 3 sets x 90 s = 4.5 min, rounded
  assert.strictEqual(Math.round(logs[0].caloriesBurned), Math.round(5 * 3.5 * 70 / 200 * 5));
  assert.strictEqual(logs[1].durationMinutes, 4); assert.strictEqual(logs[1].clientId, 'c1#1');
});
