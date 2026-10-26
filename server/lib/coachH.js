// Coaching part 2 (Section H): gentle-mode plate balance, craving swap, festival/travel mode, diet break. Pure rules, kind wording.
// The calorie floor holds in every mode: nothing here ever lowers a target, and every result is clamped to the floor.
const { addDays, diffDays, weekday } = require('./dates');

const r10 = (x) => Math.round(x / 10) * 10;
const calorieFloor = (profile) => (profile && profile.sex === 'male' ? 1500 : 1200);

// ---------------------------------------------------------------- 9. gentle mode: plate balance (no numbers)
const GROUPS = [
  { id: 'veg', label: 'Vegetables', re: /\b(sabzi|sabji|salad|palak|spinach|bhindi|okra|gobi|cauliflower|cabbage|beans|carrot|brinjal|baingan|lauki|dudhi|tinda|karela|capsicum|peas|methi|saag|broccoli|cucumber|tomato|poriyal|thoran|kootu|stir.?fry|mixed veg|veg(etable)?s?|sambar|bharta|aloo gobi|bottle gourd|pumpkin|beetroot|raw papaya|drumstick|ridge gourd|turai|beans)\b/i },
  { id: 'fruit', label: 'Fruit', re: /\b(apple|banana|orange|mosambi|mango|papaya|guava|pears?|grapes?|watermelon|melon|pomegranate|berries|strawberr\w*|kiwi|pineapple|chikoo|sapota|peach|plum|lychee|fruit)\b/i, not: /\b(juice|shake|jam|cake|pie|ice ?cream|pudding|halwa|candy|smoothie|lassi|milkshake|barfi|kulfi|custard)\b/i },
  { id: 'protein', label: 'Protein', re: /\b(dal|dhal|daal|chicken|egg|eggs|omelette|fish|prawns?|mutton|paneer|tofu|soya|chana|chickpeas?|rajma|lobia|moong|sprouts|chole|keema|tikka|kebab|curd rice with|tuna|whey|pappu)\b/i },
  { id: 'grain', label: 'Grains', re: /\b(rice|roti|chapati|phulka|paratha|naan|idli|dosa|poha|upma|bread|toast|oats|noodles|pasta|puri|bhatura|khichdi|biryani|pulao|millet|ragi|jowar|bajra|cornflakes|muesli|sandwich|burger|pizza)\b/i },
  { id: 'dairy', label: 'Dairy', re: /\b(curd|dahi|yogurt|yoghurt|milk|buttermilk|chaas|lassi|raita|cheese)\b/i },
];
function groupOf(name) {
  const n = String(name || '');
  for (const g of GROUPS) if (g.re.test(n) && !(g.not && g.not.test(n))) return g.id;
  return 'other';
}
/**
 * @param logs  today's food entries [{name, mealType}]
 * @param habitInputs {waterGoalMet, stepsGoalMet}
 * Returns shares per group (0–1, of the foods recognised), a kind message and habit ticks. No calories anywhere.
 */
function plateBalance({ logs = [], habitInputs = {} } = {}) {
  const counts = Object.fromEntries([...GROUPS.map((g) => [g.id, 0]), ['other', 0]]);
  for (const l of logs) counts[groupOf(l.name)] += 1;
  const known = GROUPS.reduce((s, g) => s + counts[g.id], 0);
  const slices = GROUPS.map((g) => ({ id: g.id, label: g.label, items: counts[g.id], share: known ? Math.round((counts[g.id] / known) * 100) / 100 : 0 }));
  const has = (id) => counts[id] > 0;
  const meals = new Set(logs.map((l) => l.mealType));
  const heavyBig = (id) => known >= 3 && counts[id] / known > 0.5;
  let message;
  if (!logs.length) message = 'Nothing logged yet. A plate with some colour, some protein and some grains is a lovely start.';
  else if (known === 0) message = 'Thank you for logging. Add what the foods are, and I can show your plate.';
  else if (!has('veg') && !has('fruit')) message = 'Your plate so far is light on vegetables and fruit. A little of either at your next meal would round it out.';
  else if (!has('protein')) message = 'Nice colour today. A protein food, like dal, curd, egg or paneer, would balance it.';
  else if (heavyBig('grain')) message = 'Quite a lot of grains so far. Some vegetables or dal alongside would balance the plate.';
  else message = 'This is a nicely balanced plate. Lovely work.';
  const habits = [
    { id: 'breakfast', title: 'Had breakfast', done: meals.has('breakfast') },
    { id: 'veg', title: 'Vegetables or fruit', done: has('veg') || has('fruit') },
    { id: 'protein', title: 'A protein food', done: has('protein') },
    { id: 'water', title: 'Enough water', done: !!habitInputs.waterGoalMet },
  ];
  return { slices, message, habits, logged: logs.length, recognised: known };
}

// ---------------------------------------------------------------- 10. craving timer: swap from the person's own foods
/**
 * @param recent [{foodId, name, calories, protein, fiber, servingSize, servingUnit, count}] foods the person has actually logged
 * Only foods they already eat (logged 2+ times), light and filling, are offered. Allergen filtering is done by the route before this.
 */
function cravingSwap({ recent = [], remainingKcal = null }) {
  const ok = recent
    .filter((f) => f.count >= 2 && f.calories > 0 && f.calories <= 180 && !/\b(chips|cola|soda|biscuit|cookie|candy|chocolate|ice ?cream|fries)\b/i.test(f.name))
    .map((f) => ({ ...f, score: ((f.protein || 0) + (f.fiber || 0) * 2) / f.calories }));
  ok.sort((a, b) => b.score - a.score);
  const picks = ok.slice(0, 3).map((f) => ({ foodId: f.foodId, name: f.name, calories: Math.round(f.calories), protein: Math.round((f.protein || 0) * 10) / 10, servingSize: f.servingSize, servingUnit: f.servingUnit }));
  if (!picks.length) return { picks: [], message: 'Nothing from your own foods fits yet. A glass of water, a warm drink or a short walk can help, and it is also fine to simply have what you fancy.' };
  const room = remainingKcal !== null && remainingKcal < 100 ? ' A small portion is enough.' : '';
  return { picks, message: `Still craving something? These are foods you already enjoy and they are gentle and filling.${room} Or have what you fancy, in a small portion. That is okay too.` };
}

// ---------------------------------------------------------------- 12. festival and travel mode / 13. diet break
const EVENT_KINDS = {
  festival: { label: 'Festival', pct: 0.15, padPct: 20, scene: 'party' },
  wedding: { label: 'Wedding', pct: 0.15, padPct: 20, scene: 'party' },
  trip: { label: 'Trip', pct: 0.10, padPct: 25, scene: 'walk' },
};
const MAX_EXTRA = 400;
const inWin = (w, d) => !!(w && w.from && w.to && w.from <= d && d <= w.to);
/**
 * An active window widens that day's target (never lowers it) and raises the eating-out buffer; it ends by itself after `to`.
 * A diet break lifts the target to maintenance. The result is clamped to the calorie floor.
 */
function dayEffect({ event = null, dietBreak = null, date, target, tdee = null, profile = {} }) {
  const floor = calorieFloor(profile);
  const base = Math.max(Number(target) || 0, floor);
  let eff = base; let kind = null; let label = '';
  if (inWin(event, date) && EVENT_KINDS[event.kind]) {
    const k = EVENT_KINDS[event.kind];
    eff = Math.max(eff, base + Math.min(MAX_EXTRA, r10(base * k.pct)));
    kind = event.kind; label = event.label || k.label;
  }
  if (inWin(dietBreak, date) && tdee) { eff = Math.max(eff, r10(tdee)); kind = kind || 'diet-break'; label = label || 'Diet break'; }
  return { active: eff > base || kind !== null, kind, label, target: eff, extra: eff - base, floor };
}
function eventView({ event, dietBreak, today, target, tdee, profile }) {
  const e = inWin(event, today) && EVENT_KINDS[event.kind] ? event : null;
  const b = inWin(dietBreak, today) ? dietBreak : null;
  if (!e && !b) return { on: false };
  const d = dayEffect({ event: e, dietBreak: b, date: today, target, tdee, profile });
  const k = e ? EVENT_KINDS[e.kind] : null;
  const endsOn = e ? e.to : b.to;
  const left = diffDays(today, endsOn) + 1;
  return {
    on: true, kind: e ? e.kind : 'diet-break', label: e ? (e.label || k.label) : 'Diet break', endsOn, daysLeft: left, scene: k ? k.scene : 'health',
    todayTarget: d.target, extraToday: d.extra, eatingOutPadPct: k ? k.padPct : 15,
    message: e ? `${e.label || k.label} mode is on until ${endsOn}. Enjoy it. Your budget has some extra room and your estimates get a bigger safety margin. It switches off by itself.`
      : `Diet break until ${endsOn}: eating around maintenance for a little while. It is optional, and it ends by itself.`,
  };
}
/** Extra kcal the window adds to the week that starts on `weekStart` (Mon..Sun). */
function weeklyExtra({ event, dietBreak, weekStart, target, tdee, profile }) {
  let total = 0;
  for (let i = 0; i < 7; i += 1) total += dayEffect({ event, dietBreak, date: addDays(weekStart, i), target, tdee, profile }).extra;
  return total;
}
function validateWindow(w, today) {
  if (!w || !w.from || !w.to) return 'Choose a start and end date.';
  if (w.to < w.from) return 'The end date must be after the start date.';
  if (diffDays(w.from, w.to) > 20) return 'Festival and travel mode can last up to three weeks. Pick shorter dates.';
  if (w.to < today) return 'Those dates are already over.';
  return '';
}

// 13. plateau: optional maintenance week or small refeed
function dietBreakAdvice({ plateau, tdee, target, direction }) {
  if (!plateau || plateau.status !== 'plateau' || direction !== 'lose' || !tdee || !target) return null;
  if (plateau.weighIns < 4) return null;
  if (target >= tdee - 100) return null;                    // already near maintenance: a break would change nothing
  const longPlateau = plateau.spanDays >= 18;
  const kcal = r10(tdee);
  return longPlateau
    ? { kind: 'maintenance-week', days: 7, kcal, optional: true, title: 'A maintenance week, if you like',
      reasoning: `Your weight has been flat for about ${Math.round(plateau.spanDays / 7)} weeks. Eating around maintenance (about ${kcal} kcal) for a week can ease diet fatigue and help show whether the plateau is real or just water.`,
      note: 'This is optional. The evidence is modest, so do it only if it feels right. Your weight may rise a little from water and settle again.' }
    : { kind: 'refeed', days: 2, kcal, optional: true, title: 'A small refeed, if you like',
      reasoning: `Your weight has been flat for a couple of weeks. One or two days at maintenance (about ${kcal} kcal) can give your appetite and energy a lift.`,
      note: 'This is optional. First check that oil, drinks and weekends are logged, because that is the most common reason.' };
}

/** Adds a festival / diet-break window's extra kcal to the weekly budget, and keeps the per-day figure at or above the calorie floor in every mode. */
function applyWeekExtra(wb, extra, profile = {}) {
  if (!wb) return wb;
  const floor = calorieFloor(profile);
  const budget = wb.budget + (extra || 0);
  const raw = Math.round((budget - wb.usedBeforeToday - (wb.treatReserved || 0)) / wb.daysLeft);
  const perDayLeft = Math.max(floor, raw);
  return { ...wb, budget, extraBudget: extra || 0, perDayLeft, atFloor: raw < floor, diffPerDay: perDayLeft - wb.dailyTarget };
}

module.exports = { applyWeekExtra, calorieFloor, GROUPS, groupOf, plateBalance, cravingSwap, EVENT_KINDS, MAX_EXTRA, dayEffect, eventView, weeklyExtra, validateWindow, dietBreakAdvice };
