// The Body plan adapts to what the person actually does. These tests run real plans through lib/bodyPlanAdapt with made-up histories.
const test = require('node:test');
const assert = require('node:assert/strict');
const { bodyPlan } = require('../lib/bodyPlan');
const { adapt, applyAdapt, sessionHighlights, stepFor } = require('../lib/bodyPlanAdapt');
const { addDays, weekday } = require('../lib/dates');
const { SHAME } = require('../lib/safety');

const man = { sex: 'male', age: 30, heightCm: 178, currentWeightKg: 75, goals: {} };
const make = (profile = man, type = 'athletic', prefs = { place: 'gym', level: 'beginner', days: 3, minutes: 60 }) => bodyPlan({ profile, type, measures: {}, prefs });
const plan = make();
const prog = plan.training.program;
const WED = '2026-10-28';                      // this week's Monday is 2026-10-26
const MON = (k) => addDays('2026-10-26', -7 * k);
const base = { program: prog, prefs: { level: 'beginner', days: 3, limits: [] }, mode: plan.mode, today: WED, startedOn: addDays(WED, -21), maxDays: 4 };

const sess = (date, id, o = {}) => ({
  date, sessionId: id, status: o.status || 'done', feel: o.feel || 'good', phase: o.phase || 'build', pain: o.pain || [],
  exercises: prog.sessions.find((s) => s.id === id).exercises.map((e) => ({
    id: e.id, slot: e.slot, name: e.name, done: true,
    sets: Array.from({ length: e.sets }, () => ({ reps: o.reps ?? 9, weightKg: e.unit === 'seconds' ? 0 : (o.kg ?? 20) })),
  })),
});
const goodWeeks = (n, o = {}) => { const out = []; for (let k = 1; k <= n; k += 1) for (const [off, id] of [[0, 'A'], [2, 'B'], [4, 'C']]) out.push(sess(addDays(MON(k), off), id, o)); return out; };
const run = (sessions, extra = {}) => adapt({ ...base, sessions, ...extra });
const firstLoaded = prog.sessions[0].exercises.find((e) => e.unit !== 'seconds' && e.kind !== 'bodyweight');

test('a brand-new plan asks for the first session and sets no weights yet', () => {
  const a = run([], { startedOn: WED });
  assert.equal(a.tier, 'new');
  assert.equal(a.targets[firstLoaded.id].action, 'start');
  assert.equal(a.targets[firstLoaded.id].weightKg, null);
  assert.ok(a.todayPlan.text.length > 5);
});

test('every set at the top of the range adds the smallest step; reps restart at the bottom', () => {
  const a = run(goodWeeks(3, { reps: firstLoaded.repsHi, kg: 30 }));
  const t = a.targets[firstLoaded.id];
  assert.equal(t.action, 'addWeight');
  assert.ok(t.weightKg > 30 && t.weightKg <= 33, `step is small, got ${t.weightKg}`);
  assert.equal(t.reps, firstLoaded.repsLo);
});

test('mid-range reps ask for one more rep at the same weight', () => {
  const a = run(goodWeeks(3, { reps: firstLoaded.repsLo + 1, kg: 25 }));
  const t = a.targets[firstLoaded.id];
  assert.equal(t.action, 'addRep');
  assert.equal(t.weightKg, 25);
  assert.equal(t.reps, firstLoaded.repsLo + 2);
});

test('the weight step is +2 kg upper body, +5 kg lower body, and never more than 10 percent', () => {
  assert.equal(stepFor('hpress', 40), 2);
  assert.equal(stepFor('squat', 60), 5);
  assert.equal(stepFor('squat', 20), 2, 'the 10 percent cap wins over the usual step');
  assert.equal(stepFor('squat', 30), 2.5, 'lower body under 40 kg: 2.5');
  assert.ok(stepFor('hpress', 12) <= 1.5, 'a light weight cannot jump by a fifth');
});

test('reps dipping 2+ in two sessions in a row = keep the weight, one set fewer', () => {
  const ex = firstLoaded;
  const mk = (date, reps) => { const s = sess(date, prog.sessions[0].id, { reps, kg: 25 }); return s; };
  const hist = [mk(addDays(WED, -14), 11), mk(addDays(WED, -7), 9), mk(addDays(WED, -2), 7)];
  const a = run(hist, { startedOn: addDays(WED, -21) });
  const t = a.targets[ex.id];
  assert.equal(t.action, 'recover');
  assert.equal(t.weightKg, 25);
  assert.equal(t.sets, Math.max(2, ex.sets - 1));
});

test('hard sessions bring an easy week: lighter weights, fewer sets, and it stays easy until Sunday', () => {
  const hard = goodWeeks(3, { feel: 'hard', reps: 9, kg: 40 });
  const a = run(hard);
  assert.equal(a.phase.name, 'Easy week');
  const t = a.targets[firstLoaded.id];
  assert.equal(t.action, 'ease');
  assert.ok(t.weightKg <= 36.5 && t.weightKg >= 35, `about 90 percent of 40, got ${t.weightKg}`);
  assert.equal(t.sets, Math.max(2, firstLoaded.sets - 1));
  // First session of the easy week already logged: the rest of the week stays easy and the weight does not fall again.
  const mid = run([...hard, sess(addDays(WED, -2), 'A', { phase: 'easy', feel: 'easy', kg: 36 })]);
  assert.equal(mid.phase.name, 'Easy week');
  assert.equal(mid.targets[firstLoaded.id].weightKg, a.targets[firstLoaded.id].weightKg);
});

test('after an easy week the build resumes from the last normal weights, with no second easy week', () => {
  const sessions = [...goodWeeks(3, { reps: 10, kg: 30 }).filter((s) => s.date < MON(1)), ...goodWeeks(1, { phase: 'easy', feel: 'easy', reps: 10, kg: 27 })];
  const a = run(sessions);
  assert.notEqual(a.phase.name, 'Easy week');
  assert.ok(a.targets[firstLoaded.id].weightKg >= 30, 'back to the normal weight, not the light one');
});

test('the calendar easy week comes after 5 or 6 trained weeks', () => {
  const six = [];
  for (let k = 1; k <= 7; k += 1) for (const [off, id] of [[0, 'A'], [2, 'B'], [4, 'C']]) six.push(sess(addDays(MON(k), off), id, { reps: 9 }));
  const a = run(six, { startedOn: addDays(WED, -7 * 8) });
  assert.equal(a.phase.name, 'Easy week');
  assert.match(a.phase.why, /training week/);
});

test('after a break loads come back lighter: 0.95 (8-14 days), 0.9 (15-28), 0.8 (over 28)', () => {
  const at = (daysAgo) => { const a = run([sess(addDays(WED, -daysAgo), 'A', { reps: 10, kg: 40 })], { startedOn: addDays(WED, -daysAgo - 14) }); return a; };
  assert.equal(at(12).phase.loadFactor, 0.95);
  assert.equal(at(20).phase.loadFactor, 0.9);
  const long = at(40);
  assert.equal(long.phase.loadFactor, 0.8);
  assert.equal(long.tier, 'returning');
  assert.ok(long.targets[firstLoaded.id].weightKg <= 32.5, 'about 80 percent of 40');
});

test('a session not done slides along; Sunday stays a rest day; never three lifting days in a row', () => {
  const a = run([sess('2026-10-26', 'A')].concat(goodWeeks(3)));            // Mon done, Wed (today) B due, Fri C
  const day = (n) => a.week.days.find((d) => d.day === n);
  assert.equal(day('Mon').status, 'done');
  assert.equal(day('Sun').kind === 'train', false);
  const lifts = a.week.days.map((d) => (['done', 'today', 'planned', 'extra', 'partial'].includes(d.status) ? 1 : 0));
  for (let i = 0; i + 2 < 7; i += 1) assert.ok(lifts[i] + lifts[i + 1] + lifts[i + 2] < 3, 'no 3 in a row');
  // Thursday: Wed's session was not done, so it slides to today
  const t = adapt({ ...base, today: '2026-10-29', sessions: [sess('2026-10-26', 'A')].concat(goodWeeks(3)) });
  assert.equal(t.week.days.find((d) => d.day === 'Wed').status, 'notdone');
  assert.equal(t.todayPlan.kind, 'train');
  assert.equal(t.todayPlan.sessionId, 'B');
  assert.equal(t.week.days.find((d) => d.day === 'Thu').shifted, true);
  // Saturday with two owed and only one open day: do one, let the other go (no doubling up)
  const s = adapt({ ...base, today: '2026-10-31', sessions: [sess('2026-10-26', 'A')].concat(goodWeeks(3)) });
  assert.equal(s.week.days.filter((d) => ['today', 'planned'].includes(d.status)).length, 1);
});

test('extra weeks of 4 sessions with good recovery offer one more day, and stop at the maximum', () => {
  const sessions = [];
  for (let k = 1; k <= 4; k += 1) for (const [off, id] of [[0, 'A'], [1, 'B'], [3, 'C'], [4, 'A']]) sessions.push(sess(addDays(MON(k), off), id, { feel: 'easy' }));
  const a = run(sessions, { startedOn: addDays(WED, -28) });
  assert.equal(a.tier, 'ahead');
  const add = a.suggestions.find((x) => x.id === 'add-day');
  assert.ok(add && add.apply.prefs.days === 4);
  const capped = run(sessions, { startedOn: addDays(WED, -28), maxDays: 3 });
  assert.equal(capped.suggestions.some((x) => x.id === 'add-day'), false);
  assert.ok(capped.suggestions.some((x) => x.id === 'ahead-hold'));
});

test('workouts logged elsewhere count; the ones the Body plan wrote itself are not counted twice', () => {
  const log = (date, extra = {}) => ({ date, category: 'Strength', durationMinutes: 45, sets: [], ...extra });
  const a = run(goodWeeks(3).concat([]), { activity: [log('2026-10-26')] });
  assert.equal(a.week.days.find((d) => d.day === 'Mon').status, 'done');
  const same = run(goodWeeks(3).concat([sess('2026-10-26', 'A')]), { activity: [log('2026-10-26')] });
  assert.equal(same.week.doneSoFar, 1, 'a Body plan session and its own log on the same day count once');
  const mine = run(goodWeeks(3), { activity: [log('2026-10-26', { clientId: 'bp-123' })] });
  assert.equal(mine.week.days.find((d) => d.day === 'Mon').status, 'notdone');
});

test('pain noted twice in two weeks offers to remove those moves; dizziness says stop and see a doctor', () => {
  const sessions = goodWeeks(3).concat([sess(addDays(WED, -5), 'A', { pain: ['knee'] }), sess(addDays(WED, -2), 'B', { pain: ['knee'] })]);
  const a = run(sessions);
  const s = a.suggestions.find((x) => x.id === 'pain-knee');
  assert.ok(s && s.apply.prefs.limits.includes('knee'));
  const d = run(goodWeeks(3).concat([sess(addDays(WED, -2), 'B', { pain: ['dizzy'] })]));
  assert.equal(d.suggestions[0].id, 'dizzy');
  assert.equal(d.suggestions[0].level, 'alert');
  assert.equal(d.suggestions[0].apply, undefined);
});

test('extra sets only go where a muscle is under its range, only when consistent and fresh, never above the range', () => {
  const healthy = run(goodWeeks(3, { feel: 'easy', reps: 9 }), { mode: 'recomp' });
  for (const b of healthy.boosted) {
    const v = prog.volume.find((x) => x.group === b.group);
    assert.ok(v.target[1] - v.weeklySets >= 1, `${b.group} had room`);
  }
  const tired = run(goodWeeks(3, { feel: 'hard', reps: 9 }), { mode: 'recomp' });
  assert.equal(tired.boosted.length, 0);
  const sporadic = run([...goodWeeks(1)].concat([]), { mode: 'recomp' });
  assert.equal(sporadic.boosted.length, 0);
});

test('cardio ramps from what was really done last week, +10 minutes, capped at the plan', () => {
  const c = prog.cardio;
  const none = run(goodWeeks(3));
  assert.equal(none.cardio.targetMin, c.startMinutes);
  const did = run(goodWeeks(3), { activity: [{ date: addDays(MON(1), 1), category: 'Cardio', durationMinutes: c.startMinutes + 20 }] });
  assert.ok(did.cardio.targetMin > c.startMinutes && did.cardio.targetMin <= c.weeklyEasyMinutes);
});

test('body feedback: losing too fast, stalled, on track, and not enough weigh-ins', () => {
  const series = (perWeek) => Array.from({ length: 8 }, (_, i) => ({ date: addDays(WED, -21 + i * 3), weightKg: 80 - (perWeek * (i * 3)) / 7 }));
  const lose = { mode: 'lose', paceKgPerWeek: 0.5, startedOn: addDays(WED, -28) };
  assert.equal(run(goodWeeks(3), { ...lose, weights: series(1.4) }).body.verdict, 'too-fast');
  assert.equal(run(goodWeeks(3), { ...lose, weights: series(0) }).body.verdict, 'stalled');
  assert.equal(run(goodWeeks(3), { ...lose, weights: series(0.5) }).body.verdict, 'on-track');
  assert.equal(run(goodWeeks(3), { ...lose, weights: [] }).body.verdict, 'need-data');
  assert.ok(run(goodWeeks(3), { ...lose, weights: series(0) }).suggestions.some((x) => x.id === 'steps-up'), 'steps come before cutting food');
});

test('applyAdapt puts today\'s target on every exercise and does not change the original program', () => {
  const before = JSON.stringify(prog);
  const a = run(goodWeeks(3, { reps: 10, kg: 25 }));
  const out = applyAdapt(prog, a);
  assert.equal(JSON.stringify(prog), before);
  assert.ok(out.sessions[0].exercises.every((e) => e.next && typeof e.setsToday === 'number'));
  assert.equal(out.week.length, 7);
  assert.ok(out.week.every((d) => typeof d.date === 'string'));
});

test('session highlights: first time, heavier, more reps', () => {
  const ex = prog.sessions[0].exercises[0];
  const first = sessionHighlights([], sess('2026-10-20', prog.sessions[0].id));
  assert.ok(first.some((h) => /First time/.test(h.text)));
  const prior = [sess('2026-10-13', prog.sessions[0].id, { kg: 20, reps: 8 })];
  const heavier = sessionHighlights(prior, sess('2026-10-20', prog.sessions[0].id, { kg: 25, reps: 8 }));
  assert.ok(heavier.some((h) => /Heaviest yet/.test(h.text)));
  const more = sessionHighlights(prior, sess('2026-10-20', prog.sessions[0].id, { kg: 20, reps: 10 }));
  assert.ok(more.some((h) => /More reps/.test(h.text)));
  assert.ok(ex);
});

test('no shaming words anywhere, output is plain JSON, and weeks with nothing logged still work', () => {
  const cases = [run([], { startedOn: WED }), run(goodWeeks(3)), run(goodWeeks(3, { feel: 'hard' })), run([sess(addDays(WED, -40), 'A')]), run([], { startedOn: addDays(WED, -30) })];
  for (const a of cases) {
    const text = JSON.stringify(a);
    assert.equal(SHAME.test(text), false, `shaming word: ${(text.match(SHAME) || [])[0]}`);
    assert.doesNotThrow(() => JSON.parse(text));
    assert.ok(text.length < 250000);
  }
  assert.equal(adapt({}), null);
});

test('the week always starts on a Monday and keeps a full rest day', () => {
  const a = run(goodWeeks(3));
  assert.equal(weekday(a.weekStart), 1);
  assert.equal(a.week.days[6].kind === 'train', false);
});

test('works for every body goal, place and day count (no crashes, a target for every exercise)', () => {
  for (const type of ['lean', 'athletic', 'muscular', 'balanced']) for (const place of ['gym', 'home', 'both']) for (const days of [2, 4, 6]) {
    const p = make(man, type, { place, level: 'intermediate', days, minutes: 45 });
    const program = p.training.program;
    const a = adapt({ program, prefs: { level: 'intermediate', days, limits: [] }, mode: p.mode, today: WED, startedOn: addDays(WED, -14), sessions: [], maxDays: 6 });
    const ids = program.sessions.flatMap((s) => [...s.exercises, ...(s.homeBackup ? s.homeBackup.exercises : []), ...s.quick.exercises]).map((e) => e.id);
    for (const id of ids) assert.ok(a.targets[id], `${type}/${place}/${days} missing target ${id}`);
  }
});

test('a 5, 6 or 7 day plan keeps every scheduled day on the week (nothing quietly drops to 4)', () => {
  for (const days of [4, 5, 6, 7]) {
    const p = make(man, 'athletic', { place: 'gym', level: 'intermediate', days, minutes: 60 });
    const program = p.training.program;
    const a = adapt({ program, prefs: { level: 'intermediate', days, limits: [] }, mode: p.mode, today: '2026-10-26', startedOn: '2026-10-26', sessions: [], maxDays: 7 });
    const planned = a.week.days.filter((d) => ['today', 'planned'].includes(d.status));
    assert.equal(planned.length, days, `${days}-day plan shows ${planned.length} days on Monday`);
    assert.equal(a.week.days.filter((d) => d.status === 'spare').length, 0);
    assert.equal(new Set(planned.map((d) => d.sessionId)).size, days);
  }
});

test('HRX classes and gym sessions count as strength training, not cardio', () => {
  const rows = [
    { date: '2026-10-26', category: 'Cult.fit', activityName: 'Cult – HRX Workout', durationMinutes: 45, clientId: 'a' },
    { date: '2026-10-27', category: 'Cult.fit', activityName: 'Cult – Adidas Strength+', durationMinutes: 40, clientId: 'b' },
    { date: '2026-10-28', category: 'Other', activityName: 'Gym session', durationMinutes: 60, clientId: 'c' },
    { date: '2026-10-28', category: 'Cult.fit', activityName: 'Cult – Dance Fitness', durationMinutes: 45, clientId: 'd' },
  ];
  const a = run([], { activity: rows });
  assert.equal(a.cardio.doneMin, 45, 'only the dance class is cardio');
  assert.ok(a.week.doneSoFar >= 3, `three strength sessions counted, got ${a.week.doneSoFar}`);
});
