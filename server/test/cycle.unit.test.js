// Optional cycle awareness: used only so the monthly water shift is not read as a stalled diet.
const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanStarts, cycleLength, cycleView, recentWaterWindow, cycleWait } = require('../lib/cycle');
const { weeklyDecision } = require('../lib/weeklyDecision');
const E = require('../lib/energy');
const { addDays } = require('../lib/dates');

test('cleaning: only real, past, recent, unique dates, oldest first', () => {
  const t = '2026-11-10';
  assert.deepEqual(cleanStarts(['2026-10-15', 'nope', '2026-11-20', '2026-09-17', '2026-10-15', '2020-01-01', null], t), ['2026-09-17', '2026-10-15']);
  assert.deepEqual(cleanStarts(undefined, t), []);
});

test('length: the median of her own recent gaps, else what she said, else 28', () => {
  assert.equal(cycleLength(['2026-07-01', '2026-07-30', '2026-08-28', '2026-09-27'], null), 29);      // gaps 29, 29, 30
  assert.equal(cycleLength(['2026-09-27'], 31), 31);
  assert.equal(cycleLength([], null), 28);
  assert.equal(cycleLength(['2026-07-01', '2026-09-20'], null), 28);                                   // an 81-day gap is a missed log, not a cycle
});

test('phase and water window follow the days since the last period', () => {
  const starts = ['2026-09-17', '2026-10-15'];                                                          // 28-day cycle
  const v = (d) => cycleView({ starts, today: d });
  assert.equal(v('2026-10-15').phase, 'period'); assert.equal(v('2026-10-15').waterWindow, true);      // day 1
  assert.equal(v('2026-10-19').phase, 'period'); assert.equal(v('2026-10-19').waterWindow, false);     // day 5
  assert.equal(v('2026-10-25').phase, 'follicular'); assert.equal(v('2026-10-25').waterWindow, false);
  assert.equal(v('2026-11-01').phase, 'luteal'); assert.equal(v('2026-11-01').waterWindow, false);     // day 18
  assert.equal(v('2026-11-07').waterWindow, true);                                                      // day 24: the week before the next period
  assert.equal(v('2026-11-07').nextStart, '2026-11-12');
  assert.equal(v('2026-11-07').daysToNext, 5);
});

test('unknown and stale logs never guess a phase', () => {
  assert.equal(cycleView({ starts: [], today: '2026-11-10' }).known, false);
  const stale = cycleView({ starts: ['2026-08-01'], today: '2026-11-10' });
  assert.equal(stale.stale, true); assert.equal(stale.phase, null); assert.equal(stale.waterWindow, false);
});

test('cycleWait: off means off; once per cycle; only while the water window explains it', () => {
  const starts = ['2026-09-17', '2026-10-15'];
  assert.equal(cycleWait({ enabled: false, starts, today: '2026-11-08' }).likely, false);
  const w = cycleWait({ enabled: true, starts, today: '2026-11-08' });
  assert.equal(w.likely, true); assert.equal(w.length, 28);
  assert.equal(cycleWait({ enabled: true, starts, today: '2026-11-08', waitedOn: '2026-11-01' }).likely, false);   // already waited this cycle
  assert.equal(cycleWait({ enabled: true, starts, today: '2026-11-08', waitedOn: '2026-10-05' }).likely, true);    // that was last cycle
  assert.equal(cycleWait({ enabled: true, starts, today: '2026-10-28' }).likely, false);                            // mid-cycle: a flat scale is a real flat scale
  assert.equal(recentWaterWindow({ starts, today: '2026-10-21', days: 5 }).yes, true);                              // the window ended 2 days ago: still counts
});

// ---- the weekly decision uses it
const START = '2026-01-05', TODAY = addDays(START, 34);
const profile = { age: 26, sex: 'female', heightCm: 165, currentWeightKg: 70, activityLevel: 'moderate', activityMode: 'manual', training: { weekdays: [0, 2, 4] }, goals: { targetWeightKg: 62, weeklyPaceKg: 0.5, stepsTarget: 10000, calorieMode: 'auto', calorieTarget: 1700 } };
const flat = () => { const t = E.expectedEnergy(profile).calorieTarget; return Array.from({ length: 35 }, (_, i) => ({ date: addDays(START, i), calories: t, protein: 110, steps: 10000, exerciseMinutes: 45, caloriesBurned: 300, weightKg: 70, weighIn: true })); };
const run = (cycle, extra = {}) => weeklyDecision({ profile, days: flat(), today: TODAY, strengthDates: new Set(flat().map((d) => d.date)), state: null, cycle, ...extra });

test('a flat scale in the water window waits one week instead of climbing the ladder', () => {
  const d = run({ likely: true, day: 25, length: 28 });
  assert.equal(d.action, 'WAIT_CYCLE'); assert.equal(d.apply, null);
  assert.equal(d.state.cycleWaitedOn, TODAY);
  assert.equal(d.state.slowWeeks, 0, 'a waiting week does not count as a slow week');
});

test('without the cycle (or outside the window) the same flat scale is handled as before', () => {
  assert.notEqual(run(null).action, 'WAIT_CYCLE');
  assert.notEqual(run({ likely: false }).action, 'WAIT_CYCLE');
});

test('being on track is never turned into a wait, and under-eating still comes first', () => {
  const days = flat().map((d, i) => ({ ...d, weightKg: 70 - i * 0.07 }));
  const d = weeklyDecision({ profile, days, today: TODAY, strengthDates: new Set(days.map((x) => x.date)), state: null, cycle: { likely: true, day: 25, length: 28 } });
  assert.equal(d.action, 'ON_TRACK');
});

const { detectPlateau } = require('../lib/plateau');
const { cycleHint } = require('../lib/cycle');
test('a flat scale in the water window is not called a plateau, and no cut is suggested; with the log off nothing changes', () => {
  const weights = Array.from({ length: 6 }, (_, i) => ({ date: addDays('2026-10-20', i * 3), weightKg: 70 }));
  const p = { sex: 'female', currentWeightKg: 70, goals: { targetWeightKg: 62, weeklyPaceKg: 0.5 } };
  const base = detectPlateau({ weights, profile: p, today: '2026-11-04', target: 1700 });
  assert.equal(base.status, 'plateau');
  const w = detectPlateau({ weights, profile: p, today: '2026-11-04', target: 1700, cycle: { day: 24, length: 28 } });
  assert.equal(w.status, 'water_window'); assert.equal(w.suggestedKcalChange, 0); assert.match(w.message, /day 24 of a 28-day cycle/);
  assert.equal(detectPlateau({ weights, profile: p, today: '2026-11-04', target: 1700, cycle: null }).status, 'plateau');
  const H = require('../lib/coachH');
  assert.equal(H.dietBreakAdvice({ plateau: w, tdee: 2100, target: 1700, direction: 'lose' }), null, 'no diet-break advice for water');
  const starts = ['2026-09-17', '2026-10-15'];
  assert.ok(cycleHint({ enabled: true, starts, today: '2026-11-08' }));
  assert.equal(cycleHint({ enabled: false, starts, today: '2026-11-08' }), null);
  assert.equal(cycleHint({ enabled: true, starts, today: '2026-10-28' }), null);
});

const { waterPattern } = require('../lib/cycle');
// A person who holds about +0.9 kg on cycle days 22-26 every month, on a steady 0.05 kg/day loss.
function synth({ cycles = 4, len = 29, bump = (d) => (d >= 22 && d <= 26 ? 0.9 : 0), flat = false } = {}) {
  const starts = Array.from({ length: cycles + 1 }, (_, i) => addDays('2026-05-01', i * len));
  const weights = [];
  for (let i = 0; i < cycles * len; i += 2) { const date = addDays('2026-05-01', i); const day = (i % len) + 1; weights.push({ date, weightKg: 80 - i * 0.05 + (flat ? 0 : bump(day)) }); }
  return { starts, weights, today: addDays('2026-05-01', cycles * len) };
}
test('learns the person\'s own water window from their weigh-ins, and replaces the textbook window with it', () => {
  const { starts, weights, today } = synth();
  const p = waterPattern({ weights, starts, today });
  assert.equal(p.ready, true);
  assert.ok(p.fromDay >= 19 && p.fromDay <= 22, `window starts near day 22 (got ${p.fromDay})`);
  assert.ok(p.toDay >= 26 && p.toDay <= 29, `window ends near day 26-28 (got ${p.toDay})`);
  assert.ok(p.riseKg >= 0.6);
  const day = (d) => cycleView({ starts: [addDays('2026-10-01', 0)], today: addDays('2026-10-01', d - 1), personal: p });
  assert.equal(day(24).waterWindow, true); assert.equal(day(10).waterWindow, false);
  assert.equal(cycleView({ starts: ['2026-10-01'], today: '2026-10-02' }).waterWindow, true, 'without a learned pattern the textbook window is used');
});
test('no learned window without enough cycles or without a real monthly swing', () => {
  const a = synth({ cycles: 1 }); assert.equal(waterPattern({ weights: a.weights, starts: a.starts, today: a.today }).ready, false);
  const f = synth({ flat: true }); const p = waterPattern({ weights: f.weights, starts: f.starts, today: f.today });
  assert.equal(p.ready, false); assert.equal(p.flat, true);
  assert.equal(waterPattern({ weights: [], starts: [], today: '2026-11-10' }).ready, false);
});
