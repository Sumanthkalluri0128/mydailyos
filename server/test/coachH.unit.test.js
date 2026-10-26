const test = require('node:test');
const assert = require('node:assert');
const H = require('../lib/coachH');
const T = require('../lib/toneLines');
const { toneCheck } = require('../lib/safety');
const { addDays } = require('../lib/dates');

const TODAY = '2026-10-21';

test('tone copy: three tones, every character covered, nothing shaming, calorie-floor wording absent', () => {
  assert.deepEqual(T.TONES, ['gentle', 'strict', 'funny']);
  const chars = ['asta', 'luffy', 'naruto', 'jinwoo', 'goku', 'kakashi', 'zoro', 'gojo', 'tanjiro', 'killua', 'vegeta', 'zenitsu', 'bakugo'];
  for (const tone of ['gentle', 'strict']) for (const c of chars) assert.ok(T.VOICE[tone][c].length >= 2, `${tone} ${c}`);
  const lines = [...JSON.stringify([T.MOOD, T.VOICE, T.NOTIFY, T.REVIEW, T.SUPPORT_NOTE]).matchAll(/"([^"]{6,})"/g)].map((m) => m[1]);
  assert.ok(lines.length > 150);
  for (const l of lines) assert.equal(toneCheck(l).ok, true, l);
  assert.equal(T.toneBundle('nonsense').tone, 'funny');
  assert.equal(T.toneBundle('gentle').notify.meal.title, 'A gentle reminder');
  assert.equal(T.reviewLine('strict', 'celebrate')[0], 'Strong week');
  // each tone gives different words for the same mood
  assert.notDeepEqual(T.MOOD.gentle.sad, T.MOOD.strict.sad);
});

test('plate balance: no numbers shown as calories, kind messages, habits', () => {
  const none = H.plateBalance({ logs: [] });
  assert.match(none.message, /Nothing logged yet/);
  const light = H.plateBalance({ logs: [{ name: 'Plain paratha', mealType: 'breakfast' }, { name: 'Rice', mealType: 'lunch' }, { name: 'Chai biscuits', mealType: 'snacks' }] });
  assert.match(light.message, /light on vegetables/);
  assert.equal(light.habits.find((h) => h.id === 'breakfast').done, true);
  const noProtein = H.plateBalance({ logs: [{ name: 'Mixed vegetable sabzi', mealType: 'lunch' }, { name: 'Apple', mealType: 'snacks' }] });
  assert.match(noProtein.message, /protein food/);
  const good = H.plateBalance({ logs: [{ name: 'Palak sabzi', mealType: 'lunch' }, { name: 'Dal tadka', mealType: 'lunch' }, { name: 'Roti', mealType: 'lunch' }], habitInputs: { waterGoalMet: true } });
  assert.match(good.message, /balanced/); assert.equal(good.habits.find((h) => h.id === 'water').done, true);
  assert.doesNotMatch(JSON.stringify(good), /kcal|calorie/i);
  assert.equal(H.groupOf('Apple juice'), 'other'); assert.equal(H.groupOf('Banana'), 'fruit');
  const heavy = H.plateBalance({ logs: [{ name: 'Rice' }, { name: 'Roti' }, { name: 'Poha' }, { name: 'Palak sabzi' }, { name: 'Dal' }, { name: 'Bread' }] });
  assert.match(heavy.message, /grains/);
});

test('craving swap: only foods already eaten, light, not junk; honest when none', () => {
  const recent = [
    { foodId: 'a', name: 'Roasted chana', calories: 120, protein: 7, fiber: 5, count: 4 },
    { foodId: 'b', name: 'Curd', calories: 90, protein: 5, fiber: 0, count: 6 },
    { foodId: 'c', name: 'Chips', calories: 150, protein: 2, fiber: 1, count: 9 },
    { foodId: 'd', name: 'Banana', calories: 100, protein: 1, fiber: 3, count: 1 },
    { foodId: 'e', name: 'Biryani', calories: 450, protein: 20, fiber: 2, count: 5 },
  ];
  const r = H.cravingSwap({ recent });
  assert.deepEqual(r.picks.map((p) => p.foodId), ['a', 'b']);
  assert.match(r.message, /okay too/);
  const none = H.cravingSwap({ recent: [recent[2], recent[4]] });
  assert.equal(none.picks.length, 0); assert.match(none.message, /Nothing from your own foods/);
  assert.match(H.cravingSwap({ recent, remainingKcal: 50 }).message, /small portion/);
});

test('festival/travel mode: widens, ends by itself, never below the floor, never lowers a target', () => {
  const ev = { kind: 'festival', from: TODAY, to: addDays(TODAY, 2), label: 'Diwali' };
  const profile = { sex: 'female' };
  const on = H.dayEffect({ event: ev, date: TODAY, target: 1800, profile });
  assert.equal(on.target, 1800 + 270); assert.equal(on.extra, 270); assert.equal(on.kind, 'festival');
  const after = H.dayEffect({ event: ev, date: addDays(TODAY, 3), target: 1800, profile });
  assert.equal(after.target, 1800); assert.equal(after.active, false);
  // a target below the floor is lifted to the floor, in every mode
  assert.equal(H.dayEffect({ event: null, date: TODAY, target: 900, profile }).target, 1200);
  assert.equal(H.dayEffect({ event: null, date: TODAY, target: 1100, profile: { sex: 'male' } }).target, 1500);
  assert.ok(H.dayEffect({ event: ev, date: TODAY, target: 900, profile }).target >= 1200);
  // cap
  assert.equal(H.dayEffect({ event: ev, date: TODAY, target: 4000, profile }).extra, 400);
  const trip = H.dayEffect({ event: { kind: 'trip', from: TODAY, to: TODAY }, date: TODAY, target: 2000, profile });
  assert.equal(trip.extra, 200);
  const v = H.eventView({ event: ev, today: TODAY, target: 1800, profile });
  assert.equal(v.on, true); assert.equal(v.eatingOutPadPct, 20); assert.equal(v.daysLeft, 3); assert.match(v.message, /switches off by itself/);
  assert.equal(H.eventView({ event: ev, today: addDays(TODAY, 5), target: 1800, profile }).on, false);
  assert.equal(H.eventView({ event: null, today: TODAY, target: 1800, profile }).on, false);
  assert.doesNotMatch(JSON.stringify(v), /cheat|guilt|fail|bad/i);
  // weekly extra sums only the window days
  assert.equal(H.weeklyExtra({ event: ev, weekStart: TODAY, target: 1800, profile }), 270 * 3);
});
test('festival window validation', () => {
  assert.match(H.validateWindow(null, TODAY), /Choose/);
  assert.match(H.validateWindow({ from: TODAY, to: addDays(TODAY, -1) }, TODAY), /after the start/);
  assert.match(H.validateWindow({ from: TODAY, to: addDays(TODAY, 40) }, TODAY), /three weeks/);
  assert.match(H.validateWindow({ from: addDays(TODAY, -9), to: addDays(TODAY, -5) }, TODAY), /already over/);
  assert.equal(H.validateWindow({ from: TODAY, to: addDays(TODAY, 4) }, TODAY), '');
});

test('diet break advice: only for a real plateau with a deficit; optional; floor-safe', () => {
  const pl = (o) => ({ status: 'plateau', weighIns: 6, spanDays: 20, ...o });
  const a = H.dietBreakAdvice({ plateau: pl(), tdee: 2300, target: 1800, direction: 'lose' });
  assert.equal(a.kind, 'maintenance-week'); assert.equal(a.days, 7); assert.equal(a.optional, true); assert.equal(a.kcal, 2300); assert.match(a.note, /optional/i);
  assert.equal(H.dietBreakAdvice({ plateau: pl({ spanDays: 14 }), tdee: 2300, target: 1800, direction: 'lose' }).kind, 'refeed');
  assert.equal(H.dietBreakAdvice({ plateau: pl({ status: 'on_track' }), tdee: 2300, target: 1800, direction: 'lose' }), null);
  assert.equal(H.dietBreakAdvice({ plateau: pl({ weighIns: 3 }), tdee: 2300, target: 1800, direction: 'lose' }), null);
  assert.equal(H.dietBreakAdvice({ plateau: pl(), tdee: 2300, target: 2250, direction: 'lose' }), null);
  assert.equal(H.dietBreakAdvice({ plateau: pl(), tdee: 2300, target: 1800, direction: 'gain' }), null);
  // a break lifts the target to maintenance, never lowers it
  const br = { from: TODAY, to: addDays(TODAY, 6) };
  assert.equal(H.dayEffect({ dietBreak: br, date: TODAY, target: 1800, tdee: 2300, profile: {} }).target, 2300);
  assert.equal(H.dayEffect({ dietBreak: br, date: TODAY, target: 2600, tdee: 2300, profile: {} }).target, 2600);
  assert.equal(H.weeklyExtra({ dietBreak: br, weekStart: TODAY, target: 1800, tdee: 2300, profile: {} }), 500 * 7);
});

test('weekly budget: extra widens, and the per-day figure never drops below the floor', () => {
  const wb = { budget: 12600, usedBeforeToday: 3600, daysLeft: 5, perDayLeft: 1800, dailyTarget: 1800, diffPerDay: 0 };
  const a = H.applyWeekExtra(wb, 810, { sex: 'female' });
  assert.equal(a.budget, 13410); assert.equal(a.perDayLeft, Math.round((13410 - 3600) / 5)); assert.equal(a.atFloor, false);
  const over = { budget: 12600, usedBeforeToday: 11000, daysLeft: 3, perDayLeft: 533, dailyTarget: 1800, diffPerDay: -1267 };
  const f = H.applyWeekExtra(over, 0, { sex: 'female' });
  assert.equal(f.perDayLeft, 1200); assert.equal(f.atFloor, true);
  assert.equal(H.applyWeekExtra(over, 0, { sex: 'male' }).perDayLeft, 1500);
  assert.equal(H.applyWeekExtra(null, 5), null);
});
