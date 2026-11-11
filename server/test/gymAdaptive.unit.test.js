// Gym coach v2: effort (RPE) decides the size of the next jump; readiness changes today's session and flags a low-recovery week.
const test = require('node:test');
const assert = require('node:assert/strict');
const { bodyPlan } = require('../lib/bodyPlan');
const { adapt, applyAdapt } = require('../lib/bodyPlanAdapt');
const { addDays } = require('../lib/dates');

const man = { sex: 'male', age: 30, heightCm: 178, currentWeightKg: 75, goals: {} };
const plan = bodyPlan({ profile: man, type: 'athletic', measures: {}, prefs: { place: 'gym', level: 'beginner', days: 3, minutes: 60 } });
const prog = plan.training.program;
const WED = '2026-10-28';
const MON = (k) => addDays('2026-10-26', -7 * k);
const base = { program: prog, prefs: { level: 'beginner', days: 3, limits: [] }, mode: plan.mode, today: WED, startedOn: addDays(WED, -21), maxDays: 4 };
const sess = (date, id, o = {}) => ({
  date, sessionId: id, status: 'done', feel: 'good', phase: 'build', pain: [],
  exercises: prog.sessions.find((s) => s.id === id).exercises.map((e) => ({
    id: e.id, slot: e.slot, name: e.name, done: true,
    sets: Array.from({ length: e.sets }, () => ({ reps: o.reps ?? 9, weightKg: e.unit === 'seconds' ? 0 : (o.kg ?? 20), ...(o.rpe !== undefined ? { rpe: o.rpe } : {}) })),
  })),
});
const weeks = (n, o = {}) => { const out = []; for (let k = 1; k <= n; k += 1) for (const [off, id] of [[0, 'A'], [2, 'B'], [4, 'C']]) out.push(sess(addDays(MON(k), off), id, o)); return out; };
const lift = prog.sessions[0].exercises.find((e) => e.unit !== 'seconds' && e.kind !== 'bodyweight');
const run = (sessions, extra = {}) => adapt({ ...base, sessions, ...extra });
const entry = (date, o) => ({ date, sleepHours: 8, energy: 4, soreness: 2, stress: 2, ...o });

test('RPE: an easy top set gives a bigger (still capped) jump; no RPE behaves as before', () => {
  const plain = run(weeks(3, { reps: lift.repsHi, kg: 40 })).targets[lift.id];
  const easy = run(weeks(3, { reps: lift.repsHi, kg: 40, rpe: 6 })).targets[lift.id];
  assert.equal(plain.action, 'addWeight');
  assert.equal(easy.action, 'addWeight');
  assert.ok(easy.weightKg >= plain.weightKg && easy.weightKg <= 44, `capped at +10%, got ${easy.weightKg}`);
  assert.match(easy.note, /felt easy/);
});

test('RPE: a grinding top set holds the weight instead of adding load', () => {
  const t = run(weeks(3, { reps: lift.repsHi, kg: 40, rpe: 9.5 })).targets[lift.id];
  assert.equal(t.action, 'hold');
  assert.equal(t.weightKg, 40);
  assert.match(t.note, /limit/);
});

test('RPE: very easy mid-range reps ask for two more reps, normal effort asks for one', () => {
  const mid = Math.max(lift.repsLo, lift.repsHi - 3);
  const one = run(weeks(3, { reps: mid, kg: 40, rpe: 8 })).targets[lift.id];
  const two = run(weeks(3, { reps: mid, kg: 40, rpe: 6 })).targets[lift.id];
  assert.equal(one.reps, Math.min(lift.repsHi, mid + 1));
  assert.equal(two.reps, Math.min(lift.repsHi, mid + 2));
});

test('readiness: a red day lightens only TODAY, tomorrow keeps the weekly target', () => {
  const sessions = weeks(3, { reps: lift.repsHi, kg: 40 });
  const normal = run(sessions);
  const red = run(sessions, { readiness: [entry(WED, { sleepHours: 4, energy: 1, soreness: 5, stress: 5 })] });
  assert.equal(red.readiness.today.band, 'red');
  assert.equal(normal.targets[lift.id].weightKg, red.targets[lift.id].weightKg);     // the plan itself is untouched
  const shown = applyAdapt(prog, red);
  const orig = applyAdapt(prog, normal);
  const todaySid = red.todayPlan.kind === 'train' ? red.todayPlan.sessionId : null;
  assert.ok(todaySid, 'a lifting day was expected on Wednesday');
  const pick = (p, sid) => p.sessions.find((s) => s.id === sid).exercises.find((e) => e.next && e.next.weightKg > 0);
  assert.ok(pick(shown, todaySid).next.weightKg < pick(orig, todaySid).next.weightKg);
  assert.ok(pick(shown, todaySid).setsToday <= pick(orig, todaySid).setsToday);
  const otherSid = prog.sessions.find((s) => s.id !== todaySid).id;
  assert.equal(pick(shown, otherSid).next.weightKg, pick(orig, otherSid).next.weightKg);
});

test('readiness: green or missing changes nothing', () => {
  const sessions = weeks(3, { reps: lift.repsHi, kg: 40 });
  const none = applyAdapt(prog, run(sessions));
  const green = applyAdapt(prog, run(sessions, { readiness: [entry(WED)] }));
  assert.deepEqual(green.sessions.map((s) => s.exercises.map((e) => e.next && e.next.weightKg)), none.sessions.map((s) => s.exercises.map((e) => e.next && e.next.weightKg)));
});

test('readiness: a week of poor recovery brings an easy week with an honest reason', () => {
  const sessions = weeks(4, { reps: 9, kg: 20 });
  const bad = [0, 1, 2, 3].map((i) => entry(addDays(WED, -i), { sleepHours: 5, energy: 2, soreness: 4, stress: 4 }));
  const a = run(sessions, { readiness: bad });
  assert.equal(a.phase.key, 'easy');
  assert.match(a.phase.why, /sleep, energy and soreness/);
  assert.notEqual(run(sessions, { readiness: bad.slice(0, 2) }).phase.key, 'easy');       // two bad days are not a pattern
});
