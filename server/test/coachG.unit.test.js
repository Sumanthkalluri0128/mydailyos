const test = require('node:test');
const assert = require('node:assert');
const G = require('../lib/coachG');
const { addDays } = require('../lib/dates');

const T = '2026-10-21'; // a Wednesday
const dayRows = (n, f) => Array.from({ length: n }, (_, i) => ({ date: addDays(T, -(n - 1 - i)), calories: 1800, waterMl: 2000, steps: 6000, exerciseMinutes: 0, sodium: 2000, carbohydrates: 220, protein: 80, ...f(i) }));

test('rough day: off by default, one action keeps the streak, wording stays kind', () => {
  assert.equal(G.roughDayView({ state: {}, day: null, today: T }).on, false);
  assert.equal(G.roughDayView({ state: { rough: { date: addDays(T, -1) } }, day: null, today: T }).on, false); // expires next day
  const none = G.roughDayView({ state: { rough: { date: T } }, day: { calories: 0, waterMl: 0, steps: 0, exerciseMinutes: 0 }, today: T });
  assert.equal(none.on, true); assert.equal(none.done, 0); assert.equal(none.actions.length, 3); assert.ok(none.keepsStreak);
  assert.ok(none.reminders.maxPerDay <= 2);
  const some = G.roughDayView({ state: { rough: { date: T } }, day: { calories: 300, waterMl: 800, steps: 0, exerciseMinutes: 10 }, today: T });
  assert.equal(some.done, 3);
  assert.deepEqual(G.roughKeptDates(['a', 'b'], { a: { waterMl: 800 }, b: { calories: 0, waterMl: 0, steps: 0 } }), ['a']);
  assert.doesNotMatch(JSON.stringify(none), /fail|lazy|bad|should have/i);
});

test('experiments: first one starts, manual tick, result next week with reward at 5+ days', () => {
  const ctx = { breakfastProtein: {}, byDate: {}, waterMl: 2000 };
  const a = G.rollExperiment({ state: {}, today: T, ctx, tipIds: ['protein-low'] });
  assert.equal(a.current.id, 'protein-breakfast'); assert.equal(a.current.days.length, 7); assert.equal(a.last, null);
  let st = G.tickExperiment(a.state, T, T);
  assert.equal(G.rollExperiment({ state: st, today: T, ctx }).current.doneDays, 1);
  st = G.tickExperiment(st, T, T); // tick again undoes
  assert.equal(G.rollExperiment({ state: st, today: T, ctx }).current.doneDays, 0);
  assert.equal(G.tickExperiment(st, addDays(T, 3), T), st); // future day cannot be ticked
  const bp = {}; for (let i = 0; i < 6; i += 1) bp[addDays(T, i)] = 20;
  const next = G.rollExperiment({ state: st, today: addDays(T, 7), ctx: { ...ctx, breakfastProtein: bp }, tipIds: [] });
  assert.equal(next.last.doneDays, 6); assert.equal(next.last.rewarded, true); assert.match(next.last.message, /Side quest complete/);
  assert.notEqual(next.current.id, 'protein-breakfast'); // not repeated straight away
  assert.equal(next.current.startDate, addDays(T, 7));
});
test('experiments: a week that did not fit is never called a failure; before/after metric needs 3+ days', () => {
  const base = G.rollExperiment({ state: {}, today: T, ctx: {}, tipIds: ['protein-low'] }).state;
  const none = G.rollExperiment({ state: base, today: addDays(T, 7), ctx: {} });
  assert.equal(none.last.doneDays, 0); assert.equal(none.last.rewarded, false); assert.doesNotMatch(none.last.message, /fail/i);
  const bp = {}; for (let i = -7; i < 7; i += 1) bp[addDays(T, i)] = i < 0 ? 8 : 18;
  const withData = G.rollExperiment({ state: base, today: addDays(T, 7), ctx: { breakfastProtein: bp } });
  assert.match(withData.last.message, /averaged 8 g the week before and 18 g/);
  const two = G.rollExperiment({ state: base, today: addDays(T, 7), ctx: { breakfastProtein: { [T]: 20, [addDays(T, 1)]: 20 } } });
  assert.doesNotMatch(two.last.message, /averaged/);
});
test('experiments: skip picks a different one', () => {
  const a = G.rollExperiment({ state: {}, today: T, ctx: {}, tipIds: [] });
  const s = G.skipExperiment(a.state, T, {}, []);
  assert.notEqual(s.exp.id, a.state.exp.id);
});

test('weight jump: minimum data, steady, and cautious reasons', () => {
  const w = (n, f) => Array.from({ length: n }, (_, i) => ({ date: addDays(T, -(n - 1 - i) * 2), weightKg: f(i) }));
  assert.equal(G.explainJump({ weights: w(3, () => 80), days: [], today: T }).status, 'insufficient');
  assert.equal(G.explainJump({ weights: w(6, () => 80), days: [], today: T }).status, 'steady');
  const weights = w(6, (i) => (i === 5 ? 81.8 : 80));
  const days = dayRows(18, (i) => (i >= 15 ? { sodium: 4200, carbohydrates: 340, steps: 3000 } : {}));
  const r = G.explainJump({ weights, days, sleepByDate: { [T]: 5 }, today: T });
  assert.equal(r.status, 'jump'); assert.equal(r.direction, 'up');
  const ids = r.reasons.map((x) => x.id);
  assert.ok(ids.includes('sodium') && ids.includes('carbs'), ids.join());
  assert.ok(r.reasons.length <= 3);
  for (const x of r.reasons) assert.match(x.text, /may|likely|can/i);
  assert.match(r.reassure, /trend line/); assert.ok(r.series.length >= 4);
  const calm = G.explainJump({ weights, days: dayRows(18, () => ({})), today: T });
  assert.equal(calm.reasons.length, 0); assert.ok(calm.fallback);
  const down = G.explainJump({ weights: w(6, (i) => (i === 5 ? 78.5 : 80)), days: [], today: T });
  assert.equal(down.direction, 'down'); assert.match(down.headline, /noise/);
});

test('sleep-to-eating: only with enough days, and says the minimum', () => {
  const days = [], sleep = {};
  for (let i = 0; i < 12; i += 1) { const d = addDays(T, -i); const short = i < 6; days.push({ date: d, calories: short ? 2200 : 1900 }); sleep[d] = short ? 5 : 7.5; }
  const ok = G.sleepEating({ days, sleepByDate: sleep });
  assert.equal(ok.enough, true); assert.equal(ok.diffKcal, 300); assert.match(ok.message, /300 kcal more/);
  const few = G.sleepEating({ days: days.slice(0, 8), sleepByDate: sleep });
  assert.equal(few.enough, false); assert.match(few.message, /at least 5 days/);
  assert.equal(G.sleepEating({ days, sleepByDate: {} }).enough, false);
  const same = days.map((d) => ({ ...d, calories: 2000 }));
  assert.match(G.sleepEating({ days: same, sleepByDate: sleep }).message, /no clear difference/);
});

test('goal-date range: minimum data, direction, cone ordering, open-ended later end', () => {
  const mk = (n, f) => Array.from({ length: n }, (_, i) => ({ date: addDays(T, -(n - 1) * 3 + i * 3), weightKg: f(i) }));
  assert.equal(G.goalRange({ weights: mk(4, () => 80), goalKg: 70, today: T }).status, 'insufficient');
  assert.equal(G.goalRange({ weights: mk(9, () => 80), goalKg: 0, today: T }).status, 'no_goal');
  const noise = [0.2, -0.3, 0.1, 0.25, -0.2, 0.15, -0.1, 0.2, -0.25];
  const r = G.goalRange({ weights: mk(9, (i) => 85 - i * 0.2 + noise[i]), goalKg: 78, today: T });
  assert.equal(r.status, 'ok');
  assert.ok(r.earliest <= r.likely && (r.latest === null || r.likely <= r.latest), `${r.earliest} ${r.likely} ${r.latest}`);
  assert.ok(r.cone.length >= 3); for (const c of r.cone) assert.ok(c.fast <= c.mid + 0.01 && c.mid <= c.slow + 0.01 && c.fast >= 78);
  const flat = G.goalRange({ weights: mk(9, (i) => 85 + noise[i]), goalKg: 78, today: T });
  assert.ok(['not_moving', 'ok'].includes(flat.status));
  const wrong = G.goalRange({ weights: mk(9, (i) => 80 + i * 0.3), goalKg: 75, today: T });
  assert.equal(wrong.status, 'not_moving'); assert.ok(!wrong.likely);
  assert.equal(G.goalRange({ weights: mk(9, (i) => 78 - i * 0.01), goalKg: 78, today: T }).status, 'arrived');
  // gaining direction works too
  const gain = G.goalRange({ weights: mk(9, (i) => 60 + i * 0.25), goalKg: 66, today: T });
  assert.equal(gain.status, 'ok'); assert.ok(gain.likely > T);
});

test('learning coach: weights stay in range, smoothed, resettable by dropping state, ranking follows acceptance', () => {
  let l = {};
  assert.equal(G.learnWeight(l, 'swap'), 1);
  l = G.learnRecord(l, 'a', 'shown'); assert.ok(G.learnWeight(l, 'a') < 1.0 && G.learnWeight(l, 'a') >= 0.6);
  for (let i = 0; i < 6; i += 1) { l = G.learnRecord(l, 'a', 'shown'); l = G.learnRecord(l, 'a', 'accepted'); l = G.learnRecord(l, 'b', 'shown'); }
  assert.ok(G.learnWeight(l, 'a') > 1 && G.learnWeight(l, 'a') <= 1.4);
  assert.ok(G.learnWeight(l, 'b') < 1);
  const ranked = G.rankByLearning([{ id: 'b', impact: 60 }, { id: 'a', impact: 50 }], l, (x) => x.id);
  assert.equal(ranked[0].id, 'a');
  assert.deepEqual(G.rankByLearning([{ id: 'b', impact: 60 }, { id: 'a', impact: 50 }], {}, (x) => x.id).map((x) => x.id), ['b', 'a']);
  for (let i = 0; i < 200; i += 1) l = G.learnRecord(l, 'c', 'shown');
  assert.ok(l.c.shown <= 41); assert.deepEqual(G.learnRecord(l, 'x', 'bogus'), l);
});

test('treat allowance: off, within, used up, never a failure; set aside inside the weekly budget', () => {
  assert.equal(G.treatView({ treat: {}, today: T }).on, false);
  const mon = G.mondayOf(T);
  const t = G.treatView({ treat: { weeklyKcal: 500, entries: [{ date: mon, name: 'Gulab jamun', kcal: 150 }, { date: addDays(mon, -3), name: 'old', kcal: 999 }] }, today: T });
  assert.equal(t.used, 150); assert.equal(t.left, 350); assert.match(t.message, /350 left/);
  const over = G.treatView({ treat: { weeklyKcal: 200, entries: [{ date: mon, name: 'Pizza', kcal: 600 }] }, today: T });
  assert.equal(over.left, 0); assert.doesNotMatch(over.message, /over|fail|exceed|bad/i); assert.match(over.message, /nothing to worry about/);
  const wb = { budget: 14000, usedBeforeToday: 4000, daysLeft: 5, perDayLeft: 2000, dailyTarget: 2000, diffPerDay: 0 };
  const a = G.applyTreat(wb, t);
  assert.equal(a.treatReserved, 350); assert.equal(a.perDayLeft, Math.round((14000 - 4000 - 350) / 5));
  assert.equal(G.applyTreat(wb, { on: false }), wb);
});
