// The FlexFit assistant: answers questions about YOUR day, week, goals and every feature, using your own data.
// No outside AI service is called (free, private, instant). It works by understanding what is being asked (intent scoring
// over keywords and phrases), pulling the matching numbers from a snapshot of your data, and writing a short, specific answer
// with next-step buttons.  `answer()` is pure so it can be tested without a database.
const n0 = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const r0 = (x) => Math.round(n0(x));
const r1 = (x) => Math.round(n0(x) * 10) / 10;
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// ---- what each feature is, where it lives, and how to use it (the "knows every feature" part) ----
const FEATURES = [
  { id: 'log-food', keys: ['log food', 'add food', 'log a meal', 'log meal', 'track food', 'add meal', 'type a meal', 'food log', 'how do i log'], page: 'foodLogger', label: 'Open Log Food',
    how: 'Open Log Food, pick the meal at the top (it stays pinned), then click the search box and type any word of the food, in English, Hindi or Telugu. Tap a result to add it, or use "Type a meal" to write something like "2 roti and dal".' },
  { id: 'barcode', keys: ['barcode', 'scan', 'scanner', 'packaged', 'food bar', 'product'], page: 'foodLogger', label: 'Open Log Food',
    how: 'On the phone app, open Food and tap the scan button, then point the camera at the barcode (or type the number). If the product is in the database you get its numbers; anything it is missing is highlighted so you only fill in the gaps, then save and it is remembered for next time.' },
  { id: 'auto-plan', keys: ['auto plan', 'plan my week', 'plan meals', 'meal plan', 'plan my meals', 'weekly plan', 'what to eat this week', 'plan from'], page: 'planner', label: 'Open Meal Planner',
    how: 'In the Meal Planner press "Plan my week from what I eat". It builds each day from foods you have really logged, in your usual portions, with a weekly limit per food (sweets stay rare), and checks calories, protein, carbs, fat, sugar and sodium for each day. Preview it first, then accept.' },
  { id: 'recipes', keys: ['recipe', 'meal prep', 'cook', 'batch'], page: 'recipes', label: 'Open Recipes', how: 'Recipes lets you save a dish with its ingredients, cook a batch, then eat portions of it so the calories per portion are exact.' },
  { id: 'water', keys: ['water', 'hydrat', 'drink', '250', 'glass'], page: 'water', label: 'Open Water', how: 'On Water, tap +250 ml to add a glass. Hover (or long-press on a phone) the button for 250 ml, 500 ml or 1 L. Your daily target comes from your body weight.' },
  { id: 'exercise', keys: ['exercise', 'workout', 'gym', 'training', 'activity', 'steps', 'walk', 'run'], page: 'exercise', label: 'Open Exercise', how: 'On Exercise, click the search box to find an activity, enter the minutes (or sets for lifting) and save. Steps are counted automatically on the phone.' },
  { id: 'weight', keys: ['weigh', 'weight', 'scale', 'import weight', 'health connect', 'cult'], page: 'weight', label: 'Open Weight', how: 'On Weight, add today\'s weigh-in with an optional note (for example "after a big dinner"). The chart shows a smoothed trend, so one noisy day does not mislead you. On Android you can import weights from Health Connect.' },
  { id: 'goals', keys: ['goal', 'target weight', 'journey', 'quest', 'level', 'xp', 'boss'], page: 'goals', label: 'Open Goals', how: 'Goals shows the daily quests, short- and long-term targets with progress, and your weight journey. Set your target weight and pace in Profile and everything recalculates.' },
  { id: 'habits', keys: ['habit', 'routine'], page: 'habit', label: 'Open Habits', how: 'Habits are things you want to repeat (daily, weekdays or weekly). Tick them off each day to build a streak.' },
  { id: 'tasks', keys: ['task', 'todo', 'to-do', 'reminder'], page: 'task', label: 'Open Tasks', how: 'Tasks are one-off or repeating to-dos with a date, a time and a priority. Reminders skip themselves when the task is already done.' },
  { id: 'progress', keys: ['progress', 'history', 'report', 'chart', 'trend', 'export', 'pdf'], page: 'progress', label: 'Open Progress', how: 'Progress shows history by day with charts, a custom date range, and reports you can export or email.' },
  { id: 'eating-out', keys: ['eating out', 'restaurant', 'dish', 'outside food', 'hotel'], page: 'foodLogger', label: 'Open Log Food', how: 'In Log Food open "Eating out" to look up a dish. You get a calorie range (small to large) and can add a buffer, because restaurant portions run bigger than home food.' },
  { id: 'fix-day', keys: ['fix my day', 'over budget', 'went over', 'ate too much', 'overate', 'cheat'], page: 'planner', label: 'Open Meal Planner', how: 'If a day goes over, press "Fix my day" on Home. It suggests swaps and half portions for what you logged, and a gentler plan for tomorrow, without punishing you.' },
  { id: 'profile', keys: ['profile', 'height', 'age', 'calorie target', 'change target', 'pace', 'dark mode', 'theme', 'logo', 'settings'], page: 'profile', label: 'Open Profile', how: 'Profile holds your height, age, weight, goal, pace and calorie mode (automatic or your own number). Dark mode is the moon/sun button in the menu.' },
  { id: 'health', keys: ['sleep', 'waist', 'measure', 'body fat', 'health log', 'blood'], page: 'health', label: 'Open Health', how: 'Health stores sleep and body measurements such as waist, hips and neck, which also give a body-fat estimate.' },
];

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\u0900-\u097f\u0c00-\u0c7f\s+.]/g, ' ').replace(/\s+/g, ' ').trim();
const has = (q, words) => words.some((w) => q.includes(w));

const INTENTS = [
  ['overview', ['how am i doing', 'how is my day', 'summary', 'overview', 'status', 'dashboard', 'update me', 'how was my day', 'today so far', 'am i on track', 'on track']],
  ['calories', ['calorie', 'kcal', 'budget', 'how much can i eat', 'how much more', 'left to eat', 'remaining', 'allowed']],
  ['protein', ['protein', 'macro', 'carb', 'fat ', 'fibre', 'fiber', 'sugar', 'sodium', 'salt', 'nutrient']],
  ['eat', ['what should i eat', 'what to eat', 'suggest', 'hungry', 'dinner', 'lunch', 'breakfast', 'snack', 'next meal', 'idea', 'craving', 'eat now']],
  ['water', ['water', 'hydrat', 'thirsty']],
  ['move', ['steps', 'exercise', 'workout', 'burn', 'active', 'gym', 'walk', 'move']],
  ['weight', ['weight', 'kg', 'scale', 'weigh', 'lose', 'losing', 'gain', 'fat loss', 'plateau', 'stuck', 'not losing', 'eta', 'when will i']],
  ['goals', ['goal', 'target', 'journey', 'quest', 'mission', 'level', 'xp', 'streak', 'achievement']],
  ['habits', ['habit', 'task', 'to do', 'todo', 'routine']],
  ['week', ['week', 'last 7', 'lately', 'recent', 'average', 'pattern', 'review', 'best day', 'worst day', 'consisten']],
  ['why', ['why am i', 'why is', 'what am i doing wrong', 'reason', 'improve', 'what should i change', 'change']],
  ['next', ['what next', "what's next", 'what should i do', 'priority', 'focus', 'now what', 'todo today', 'plan my day']],
  ['motivate', ['motivat', 'tired', 'lazy', 'give up', 'quit', 'sad', 'cheer', 'inspire', 'encourage', 'discouraged']],
  ['joke', ['joke', 'funny', 'laugh']],
  ['help', ['help', 'what can you do', 'what do you know', 'features', 'how do i use', 'guide']],
  ['hello', ['hello', 'hi ', 'hey', 'good morning', 'good evening', 'yo ']],
];

function score(q, words) { let s = 0; for (const w of words) if (q.includes(w)) s += w.includes(' ') ? 2 + w.split(' ').length : 1; return s; }

/** Best matching feature guide (or null) for "how do I…" style questions. */
function matchFeature(q) {
  const howish = has(q, ['how', 'where', 'what is', 'what does', 'explain', 'use', 'find', 'open', 'can i', 'do i', 'work', 'feature', 'scan', 'tell me about']);
  let best = null;
  for (const f of FEATURES) { const s = score(q, f.keys); if (s && (!best || s > best.s)) best = { f, s }; }
  return best && (howish || best.s >= 3) ? best.f : null;
}

function buildFacts(snap) {
  const t = snap.targets || {}, d = snap.today || {}, ranges = snap.ranges || null, bal = snap.balance || null;
  // Same budget model as the dashboard: base target + calories earned from activity above your normal baseline.
  const target = n0(bal ? bal.budget : t.calories);
  const eaten = n0(d.calories), burned = n0(d.caloriesBurned);
  const left = bal ? Math.round(bal.remaining) : target ? Math.round(target - eaten) : null;
  const proteinMin = ranges?.protein?.min ?? null, proteinGoal = ranges?.protein?.goal ?? n0(t.protein);
  return { target, baseTarget: n0(bal ? bal.target : t.calories), bonus: n0(bal?.bonus), eaten, burned, left, proteinMin, proteinGoal, proteinLeft: proteinGoal ? Math.max(0, r0(proteinGoal - n0(d.protein))) : null, hour: snap.hour ?? 12 };
}

const nextMeal = (h) => (h < 10 ? 'breakfast' : h < 15 ? 'lunch' : h < 18 ? 'snacks' : 'dinner');

function ideasText(snap, f, limit = 3) {
  const ideas = (snap.ideas || []).slice(0, limit);
  if (!ideas.length) return '';
  return ideas.map((i) => `${i.name}${i.qty ? ` (${i.qty})` : ''} — ${i.kcal} kcal, ${i.protein} g protein`).join('; ');
}


const MEAL_SHARE = { breakfast: 0.25, lunch: 0.34, dinner: 0.31, snacks: 0.10 };

/** What matters MOST right now, looking at calories, protein, water, steps, meals logged and the time of day together. */
function priority(snap, f) {
  const d = snap.today || {}, t = snap.targets || {}, h = f.hour, done = snap.mealsToday || {};
  const out = [];
  if (f.target && f.eaten > f.target * 1.05) out.push({ w: 10, text: `You're ${r0(f.eaten - f.target)} kcal over today. Keep what's left light (soup, salad, curd) and add a 15-minute walk. Tomorrow can absorb the rest.`, actions: [{ label: 'Fix my day', page: 'planner' }] });
  if (h >= 10 && h < 16 && !done.breakfast && f.eaten < 150) out.push({ w: 8, text: 'No breakfast logged and it\'s already late morning. A protein-first meal now keeps cravings down this afternoon.', actions: [{ label: 'What should I eat?', ask: 'What should I eat next?' }] });
  if (h >= 15 && !done.lunch && f.eaten < f.target * 0.2) out.push({ w: 8, text: 'You haven\'t logged lunch. Eat something real soon. A very low day usually ends in a big night.', actions: [{ label: 'What should I eat?', ask: 'What should I eat next?' }] });
  if (f.proteinMin && h >= 14 && n0(d.protein) < f.proteinMin * (h >= 18 ? 0.7 : 0.45)) out.push({ w: 7, text: `Protein is behind (${r0(d.protein)} g, minimum ${f.proteinMin} g). Make your next meal protein-first.`, actions: [{ label: 'Protein ideas', ask: 'How much protein do I need?' }] });
  if (t.waterMl) { const expect = t.waterMl * Math.min(1, Math.max(0, (h - 7) / 14)); if (n0(d.waterMl) < expect * 0.65) out.push({ w: 6, text: `Water is behind for this time of day (${r0(d.waterMl)} of ${t.waterMl} ml). A big glass now.`, actions: [{ label: 'Open Water', page: 'water' }] }); }
  if (t.steps && h >= 17 && n0(d.steps) < t.steps * 0.5) out.push({ w: 5, text: `Steps are at ${r0(d.steps)} of ${t.steps}. A 20-minute walk after dinner closes most of the gap.`, actions: [{ label: 'Open Exercise', page: 'exercise' }] });
  if (snap.sleepH && snap.sleepH < 6) out.push({ w: 4, text: `You slept about ${r1(snap.sleepH)} h. Expect stronger cravings today: lean on protein and fibre and keep an early night.`, actions: [] });
  out.sort((a, b) => b.w - a.w);
  if (!out.length) out.push({ w: 0, text: f.target && h >= 18 && f.left > 0 ? `You're on track. ${Math.max(0, f.left)} kcal left for dinner or a light snack.` : 'You\'re on track right now. Keep logging as you go.', actions: [{ label: 'Log food', page: 'foodLogger' }] });
  return out;
}

const SIT = [
  ['eatingOut', /(eating out|restaurant|hotel|dine out|party|wedding|buffet|biryani|ordering|swiggy|zomato|outside food)/],
  ['craving', /(crav|sweet|chocolate|ice ?cream|dessert|junk|chips|snack attack|something tasty)/],
  ['late', /(late night|midnight|can.?t sleep|after dinner|night hunger|hungry at night)/],
  ['postWorkout', /(after (the )?(gym|workout|run|training)|post.?workout|just worked out|recovery meal)/],
  ['skipped', /(skipped|missed|forgot to eat|didn.?t eat|haven.?t eaten)/],
  ['quick', /(quick|no time|10 min|in a hurry|busy|easy meal|lazy to cook)/],
  ['travel', /(travel|trip|flight|train|road trip|journey|airport)/],
  ['unwell', /(sick|fever|cold|unwell|low energy|weak|headache|period)/],
];
const sitOf = (q) => { const hit = SIT.find(([, re]) => re.test(q)); return hit ? hit[0] : null; };
const mealOf = (snap, f, q = '') => {
  const named = /(tonight|dinner|night)/.test(q) ? 'dinner' : /(lunch|afternoon)/.test(q) ? 'lunch' : /(breakfast|morning)/.test(q) ? 'breakfast' : /(snack|evening tea)/.test(q) ? 'snacks' : null;
  if (named && f.target) return { key: named, budget: Math.max(0, Math.min(f.left ?? 9999, Math.round(f.target * (MEAL_SHARE[named] || 0.3)))) };
  return mealOf0(snap, f);
};
const mealOf0 = (snap, f) => snap.meal || { key: nextMeal(f.hour), budget: f.left !== null ? Math.max(0, Math.min(f.left, Math.round(f.target * (MEAL_SHARE[nextMeal(f.hour)] || 0.3)))) : 500 };

function scenarioAnswer(kind, snap, f, q = '') {
  const m = mealOf(snap, f, q), d = snap.today || {}, left = f.left ?? 0;
  const base = (txt, mood = 'think', actions = []) => ({ text: txt, mood, actions });
  if (kind === 'eatingOut') {
    const plan = Math.round(m.budget * 0.8);
    return base(`Eating out for ${m.key}? You have about ${m.budget} kcal for it. Restaurant portions run ~20% bigger than they look, so plan for ${plan} kcal "on paper".\n• Start with protein: tandoori/grilled chicken, paneer tikka, dal, egg dishes.\n• Take half the rice or bread and ask for sauces on the side.\n• Skip fried starters and sweet drinks. Water first.\n${f.proteinLeft > 25 ? `• You still need ${f.proteinLeft} g protein today, so it's worth ordering a protein dish.\n` : ''}Log it afterwards with Eating out, which gives a calorie range for the dish.`, 'eat', [{ label: 'Open Log food', page: 'foodLogger' }]);
  }
  if (kind === 'craving') {
    const room = Math.max(0, Math.min(180, Math.round(left * 0.35)));
    const sleep = snap.sleepH && snap.sleepH < 6 ? ` Short sleep (${r1(snap.sleepH)} h) makes cravings stronger, so you're not weak, you're tired.` : '';
    return base(left < 80
      ? `You're nearly out of budget (${Math.max(0, left)} kcal left). Try water, then green tea or a warm drink and wait 10 minutes. Most cravings pass.${sleep}`
      : `A treat of about ${room} kcal fits today.${sleep}\n• Curd with fruit or honey (~120 kcal)\n• 2 squares dark chocolate (~70 kcal)\n• Half a regular sweet instead of a whole one\nWait 10 minutes with a glass of water first. If you're still hungry, add protein (egg, curd, chana) rather than more sugar.`, 'think', [{ label: 'Log it', page: 'foodLogger' }]);
  }
  if (kind === 'late') return base(left > 150 ? `Late and hungry, with ${left} kcal left. Keep it under ~150 kcal: curd, a glass of milk, a boiled egg or roasted chana. Heavy meals late tend to cost sleep, and short sleep brings tomorrow's cravings.` : `You're at your budget. Water or herbal tea, and head to sleep. If this happens most nights, shift protein earlier in the day.`, 'sleep', [{ label: 'See my week', ask: 'How was my week?' }]);
  if (kind === 'postWorkout') {
    const mins = n0(d.exerciseMinutes);
    return base(`${mins ? `You trained ${r0(mins)} min today. ` : ''}After training, aim for 20-30 g protein within a couple of hours, with some carbs: eggs and toast, curd with fruit, paneer wrap, dal and rice.${f.proteinLeft ? ` You still need ${f.proteinLeft} g protein today, so this meal is a good place for it.` : ''} Drink water too.`, 'lift', [{ label: 'What should I eat?', ask: 'What should I eat next?' }]);
  }
  if (kind === 'skipped') {
    const mealsLeft = Math.max(1, ['breakfast', 'lunch', 'dinner', 'snacks'].filter((x) => !(snap.mealsToday || {})[x]).length - (f.hour >= 20 ? 1 : 0));
    return base(`Don't double up later. You have ${Math.max(0, left)} kcal left, which is about ${Math.round(Math.max(0, left) / mealsLeft)} kcal per remaining meal. Eat the next one at a normal size with protein first.`, 'eat', [{ label: 'What should I eat?', ask: 'What should I eat next?' }]);
  }
  if (kind === 'quick') return base(`Quick options for ${m.key} (about ${m.budget} kcal available):\n• Curd + banana + a handful of nuts (~300 kcal, ~14 g protein)\n• 2-3 egg bhurji with 1 roti (~350 kcal, ~20 g protein)\n• Sprouts chaat with lemon (~200 kcal, ~12 g protein)\n• Paneer or chicken wrap, no mayo (~400 kcal, ~25 g protein)\nPick the one closest to your budget and log it.`, 'eat', [{ label: 'Log food', page: 'foodLogger' }]);
  if (kind === 'travel') return base(`For travel, pack things that hold up: boiled eggs, fruit, roasted chana or nuts, and a water bottle. At stops pick grilled or dal-based dishes. Don't try to be perfect: log roughly with Eating out and keep within about ${r0(f.target)} kcal. Walking at stops counts toward steps.`, 'walk', [{ label: 'Open Log food', page: 'foodLogger' }]);
  return base('Take it easy. Prioritise water, simple food you can digest (khichdi, curd rice, soup, banana) and rest. Don\'t chase calorie or step goals today. If symptoms are strong or last more than a couple of days, please see a doctor.', 'love', []);
}

const { buildDietDay } = require('./healthyDiet');
const DIET_Q = /\b(diet plan|healthy diet|perfect diet|ideal diet|balanced diet|meal plan (for )?(today|tomorrow)|plan my (day|meals|diet)|what (should|can|do) i eat (today|tomorrow|all day|in a day)|full day (of )?(eating|meals)|suggest (a )?(diet|meal plan))\b/;
const MEAL_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' };

const A = {
  dietDay(snap, f, q = '') {
    const diet = /non[- ]?veg|chicken|fish|meat|mutton/.test(q) ? 'n' : /\begg/.test(q) ? 'e' : 'v';
    const variant = /another|different|else|new one|more|change/.test(q) ? 1 + (Date.now() % 7) : 0;
    const date = new Date().toISOString().slice(0, 10);
    const day = buildDietDay({ target: f.baseTarget || f.target || 1800, proteinGoal: f.proteinGoal || 0, diet, seed: `${date}|${variant}` });
    const lines = day.meals.map((m) => `${MEAL_LABEL[m.mealType]} (${m.kcal} kcal)\n${m.items.map((i) => `• ${i.servings !== 1 ? `${i.servings} × ` : ''}${i.name}`).join('\n')}`);
    const label = diet === 'n' ? 'non-vegetarian' : diet === 'e' ? 'egg-friendly vegetarian' : 'vegetarian';
    const text = `Here is a balanced ${label} day, about ${day.totals.kcal} kcal with ${day.totals.protein} g protein and ${day.totals.fiber} g fibre:\n\n${lines.join('\n\n')}\n\n${day.tips.slice(0, 2).join(' ')}\nAsk again for a different version any day, or say "non-veg" / "with eggs" to change the style.`;
    return { text, mood: 'eat', actions: [{ label: 'Add to my planner', healthy: true }, { label: 'Another version', ask: 'Give me another healthy diet plan' }], follow: ['Healthy non-veg diet plan', 'What should I eat next?', 'How am I doing?'] };
  },
  overview(snap, f) {
    const d = snap.today || {}; const bits = [];
    if (f.target) bits.push(`You've had ${r0(f.eaten)} of ${r0(f.target)} kcal (${pct(f.eaten, f.target)}%)${f.left !== null ? `, so about ${Math.max(0, f.left)} kcal left` : ''}.`);
    if (f.proteinGoal) bits.push(`Protein is ${r0(d.protein)} of ${f.proteinGoal} g${f.proteinLeft ? ` (${f.proteinLeft} g to go)` : ' — done'}.`);
    const w = snap.targets?.waterMl; if (w) bits.push(`Water ${r0(d.waterMl)} of ${w} ml.`);
    if (snap.targets?.steps) bits.push(`Steps ${r0(d.steps)} of ${snap.targets.steps}.`);
    const q = snap.journey?.today; if (q?.total) bits.push(`${q.done} of ${q.total} daily quests done.`);
    if (snap.streak?.current >= 2) bits.push(`${snap.streak.current}-day streak.`);
    const pri = priority(snap, f)[0];
    if (bits.length && pri) bits.push(`Focus now: ${pri.text}`);
    if (!bits.length) return { text: 'Nothing is logged yet today. Log your first meal or a glass of water and I can give you the full picture.', mood: 'think', actions: [{ label: 'Log food', page: 'foodLogger' }, { label: 'Add water', page: 'water' }] };
    const mood = f.target && f.eaten > f.target * 1.1 ? 'sad' : f.target && pct(f.eaten, f.target) >= 60 && pct(f.eaten, f.target) <= 105 ? 'thumbs' : 'hype';
    return { text: bits.join(' '), mood, actions: [...(pri?.actions || []).slice(0, 1), { label: 'See my week', ask: 'How was my week?' }], follow: ['What should I eat next?', 'What should I change?', 'How was my week?'] };
  },
  calories(snap, f) {
    if (!f.target) return { text: 'I need your height, age and weight to size your calorie budget. Add them in Profile and I will do the math for you.', mood: 'think', actions: [{ label: 'Open Profile', page: 'profile' }] };
    const over = f.eaten - f.target;
    const base = `Your budget today is ${r0(f.target)} kcal${f.bonus ? ` (${r0(f.baseTarget)} base + ${f.bonus} from activity)` : ''} and you've eaten ${r0(f.eaten)}.`;
    if (over > 0) return { text: `${base} That's ${r0(over)} kcal over. It's one day, not a failure. Make the rest light (clear soup, salad, buttermilk), walk after dinner, and tomorrow's plan can absorb a little of it. "Fix my day" shows exact swaps.`, mood: 'sad', actions: [{ label: 'Fix my day', page: 'planner' }] };
    const burn = f.bonus ? ` That includes ${f.bonus} kcal earned from activity above your normal baseline.` : '';
    return { text: `${base} That leaves about ${Math.max(0, f.left)} kcal.${burn}${f.proteinLeft ? ` Spend it protein-first: you still need ${f.proteinLeft} g.` : ''}`, mood: 'eat', actions: [{ label: 'What should I eat next?', ask: 'What should I eat next?' }] };
  },
  protein(snap, f) {
    const d = snap.today || {}, r = snap.ranges;
    if (!r) return { text: 'Add your height, age and weight in Profile and I will show your protein, carb and fat ranges.', mood: 'think', actions: [{ label: 'Open Profile', page: 'profile' }] };
    const row = (name, v, rg, unit = 'g') => `${name} ${r0(v)}${unit} (aim ${rg.min}–${rg.max}${unit})`;
    const lines = [row('Protein', d.protein, r.protein), row('Carbs', d.carbohydrates, r.carbs), row('Fat', d.fat, r.fat), `Fibre ${r1(d.fiber)} g (aim ${r.fiber.goal}+ g)`];
    const flags = [];
    if (n0(d.protein) < r.protein.min && f.hour >= 14) flags.push(`Protein is behind: ${r.protein.min - r0(d.protein)} g short of your minimum.`);
    if (n0(d.carbohydrates) > r.carbs.max) flags.push('Carbs are above your range today.');
    if (n0(d.fat) > r.fat.max) flags.push('Fat is above your range today.');
    const lim = snap.limits; if (lim && n0(d.sodium) > lim.sodiumMg) flags.push(`Sodium is ${r0(d.sodium)} mg, above the ${lim.sodiumMg} mg guide.`);
    if (lim && n0(d.sugar) > lim.sugar) flags.push(`Sugar is ${r0(d.sugar)} g against a ${lim.sugar} g guide.`);
    return { text: `${lines.join('. ')}. ${flags.join(' ') || 'Everything is inside range so far.'}`, mood: flags.length ? 'think' : 'thumbs', actions: flags.length ? [{ label: 'What should I eat next?', ask: 'What should I eat next?' }] : [] };
  },
  eat(snap, f) {
    const m = mealOf(snap, f), d = snap.today || {};
    if (f.left !== null && f.left < 60) return { text: `You're essentially at your budget (${Math.max(0, f.left)} kcal left). If you're still hungry: water first, then buttermilk, clear soup, cucumber or green tea. Real hunger at night usually means protein was low earlier.`, mood: 'think', actions: [{ label: 'Fix my day', page: 'planner' }] };
    const ideas = snap.ideas || [];
    const ctx = [];
    if (snap.targets?.waterMl && n0(d.waterMl) < snap.targets.waterMl * 0.4 && f.hour >= 11) ctx.push('Drink a glass of water first. You\'re behind on water, and thirst often feels like hunger.');
    if (n0(d.exerciseMinutes) > 20) ctx.push('You trained today, so a good portion of carbs with the protein is fine.');
    if (snap.sleepH && snap.sleepH < 6) ctx.push(`Short sleep (${r1(snap.sleepH)} h) means bigger appetite today: choose protein and fibre.`);
    if (f.hour >= 18 && n0(d.steps) < n0(snap.targets?.steps) * 0.5) ctx.push('A 15-minute walk after you eat will help digestion and your step goal.');
    const head = `For ${m.key} you have about ${m.budget} kcal${m.protein ? ` and ~${m.protein} g protein` : ''} to work with (not the whole day's ${Math.max(0, f.left)}).`;
    if (!ideas.length) return { text: `${head} Aim for a protein food (dal, paneer, egg, curd, chicken), a carb and some vegetables. Log a few more meals and I'll suggest from your own foods.${ctx.length ? `\n${ctx.join(' ')}` : ''}`, mood: 'eat', actions: [{ label: 'Log food', page: 'foodLogger' }, { label: 'Plan my week', page: 'planner' }], follow: ['I\'m eating out', 'Something quick, 10 minutes', 'I\'m craving something sweet'] };
    const by = (fn) => [...ideas].sort(fn)[0];
    const light = by((a, b) => a.kcal - b.kcal), prot = by((a, b) => b.protein - a.protein), bal = by((a, b) => Math.abs(a.kcal - m.budget * 0.85) - Math.abs(b.kcal - m.budget * 0.85));
    const seen = new Set(); const rows = [];
    for (const [label, it, why] of [['Light', light, 'leaves room for a snack later'], ['Balanced', bal, 'fits the meal best'], ['Protein-first', prot, 'best for fullness and muscle']]) {
      if (!it || seen.has(it.name)) continue; seen.add(it.name);
      rows.push(`• ${label}: ${it.name} (${it.qty}) · ${it.kcal} kcal · ${it.protein} g protein, ${why}`);
    }
    return { text: `${head} From foods you already eat:\n${rows.join('\n')}${ctx.length ? `\n\n${ctx.join(' ')}` : ''}`, mood: 'eat', actions: [{ label: 'Log food', page: 'foodLogger' }, { label: 'Plan my week', page: 'planner' }], follow: ['I\'m eating out', 'Something quick, 10 minutes', 'I\'m craving something sweet'] };
  },
  scenario(snap, f, q) { return { ...scenarioAnswer(sitOf(q) || 'quick', snap, f, q), follow: ['What should I eat next?', 'How am I doing today?'] }; },
  water(snap) {
    const t = n0(snap.targets?.waterMl), v = n0(snap.today?.waterMl);
    if (!t) return { text: `You've had ${r0(v)} ml. Add your weight in Profile and I'll set a daily target.`, mood: 'drink', actions: [{ label: 'Open Water', page: 'water' }] };
    const left = Math.max(0, t - v);
    return { text: left ? `Water: ${r0(v)} of ${t} ml (${pct(v, t)}%). ${left} ml to go${snap.hour >= 18 ? ', so a big glass now and one after dinner' : ', which is about ' + Math.ceil(left / 250) + ' glasses'}.` : `Water goal done: ${r0(v)} ml. 💧`, mood: 'drink', actions: [{ label: 'Open Water', page: 'water' }] };
  },
  move(snap) {
    const d = snap.today || {}, t = snap.targets || {};
    const bits = [];
    if (t.steps) bits.push(`Steps ${r0(d.steps)} of ${t.steps}${n0(d.steps) < t.steps ? ` (${t.steps - r0(d.steps)} to go, about ${Math.round((t.steps - n0(d.steps)) / 110)} min of walking)` : ' — done'}`);
    if (t.exerciseMinutes) bits.push(`exercise ${r0(d.exerciseMinutes)} of ${t.exerciseMinutes} min`);
    if (d.caloriesBurned) bits.push(`${r0(d.caloriesBurned)} kcal burned`);
    return { text: bits.length ? `${bits.join('; ')}. A 15-minute walk after a meal is the easiest win.` : 'No activity logged yet today. Even a 10-minute walk counts. Log it and I will count the calories.', mood: 'lift', actions: [{ label: 'Open Exercise', page: 'exercise' }] };
  },
  weight(snap) {
    const w = snap.weight || {};
    if (!w.latestKg) return { text: 'No weigh-ins yet. Add today\'s weight and in two weeks I can tell you your real trend.', mood: 'scale', actions: [{ label: 'Open Weight', page: 'weight' }] };
    const parts = [`Latest weight ${r1(w.latestKg)} kg${w.trendKg ? ` (trend ${r1(w.trendKg)} kg, which smooths out daily noise)` : ''}.`];
    if (w.targetKg) parts.push(`Target ${r1(w.targetKg)} kg, ${r1(Math.abs(w.latestKg - w.targetKg))} kg ${w.latestKg > w.targetKg ? 'to lose' : w.latestKg < w.targetKg ? 'to gain' : 'to go'}.`);
    if (Number.isFinite(w.ratePerWeek)) parts.push(`You're moving ${w.ratePerWeek > 0 ? '+' : ''}${r1(w.ratePerWeek)} kg/week over the last two weeks${w.paceKg ? ` against a plan of ${r1(w.paceKg)}` : ''}.`);
    if (w.etaWeeks) parts.push(`At that pace you'd arrive in about ${plural(w.etaWeeks, 'week')}.`);
    if (w.plateau) parts.push(`${w.plateau} Check the weekly review for what to adjust.`);
    return { text: parts.join(' '), mood: 'thumbs', actions: [{ label: 'Open Weight', page: 'weight' }, { label: 'Why am I stuck?', ask: 'What should I change?' }] };
  },
  goals(snap) {
    const j = snap.journey || {}, out = [];
    if (j.level) out.push(`Level ${j.level.level} (${j.level.rank}), ${j.level.xpToNext} XP to the next.`);
    if (snap.streak) out.push(`Streak ${snap.streak.current} days (best ${snap.streak.best}).`);
    const open = (j.goals || []).filter((g) => g.progress && g.progress.status !== 'done').slice(0, 3);
    for (const g of open) out.push(`"${g.title}" ${g.progress.pct}%${g.progress.daysLeft != null ? `, ${plural(g.progress.daysLeft, 'day')} left` : ''}${g.progress.status === 'behind' ? ' (behind)' : ''}.`);
    if (!open.length) out.push('You have no open goals. Add a daily, weekly and long-term one.');
    return { text: out.join(' '), mood: 'hype', actions: [{ label: 'Open Goals', page: 'goals' }] };
  },
  habits(snap) {
    const d = snap.today || {};
    if (!snap.habitCount && !d.tasksTotal) return { text: 'You have no habits or tasks set up yet. Start with one habit (like a 10-minute walk) so it is easy to keep.', mood: 'task', actions: [{ label: 'Open Habits', page: 'habit' }] };
    return { text: `Habits: ${n0(d.habitsCompleted)} of ${snap.habitCount || 0} done today. Tasks: ${n0(d.tasksCompleted)} of ${n0(d.tasksTotal)} done.`, mood: 'task', actions: [{ label: 'Open Habits', page: 'habit' }, { label: 'Open Tasks', page: 'task' }] };
  },
  week(snap, f) {
    const days = (snap.week || []).filter((x) => x.calories > 0);
    if (days.length < 2) return { text: 'I need at least two logged days to compare. Keep logging and I will give you a proper weekly review.', mood: 'think', actions: [] };
    const k = avg(days.map((x) => x.calories)), p = avg(days.map((x) => x.protein));
    const best = [...days].sort((a, b) => Math.abs(a.calories - f.target) - Math.abs(b.calories - f.target))[0];
    const worst = [...days].sort((a, b) => Math.abs(b.calories - f.target) - Math.abs(a.calories - f.target))[0];
    const over = days.filter((x) => f.target && x.calories > f.target * 1.1).length;
    const text = `Over ${plural(days.length, 'logged day')}: average ${r0(k)} kcal${f.target ? ` vs a ${r0(f.target)} target` : ''}, ${r0(p)} g protein, ${r0(avg((snap.week || []).map((x) => x.waterMl)))} ml water, ${r0(avg((snap.week || []).map((x) => x.steps)))} steps. Closest to plan: ${best.date}. Furthest: ${worst.date} (${r0(worst.calories)} kcal). ${over ? `${plural(over, 'day')} ran over by more than 10%.` : 'No day ran far over. Nice consistency.'}`;
    return { text, mood: 'chart', actions: [{ label: 'Open Progress', page: 'progress' }] };
  },
  why(snap, f) {
    const tips = [];
    const days = (snap.week || []).filter((x) => x.calories > 0);
    const w = snap.weight || {};
    if (days.length < 4) tips.push('Log more days. With fewer than four logged days of the last seven I can only guess.');
    if (f.target && days.length >= 4 && avg(days.map((x) => x.calories)) > f.target * 1.05) tips.push(`Your average intake (${r0(avg(days.map((x) => x.calories)))} kcal) is above your budget, which is the most common reason the scale stalls.`);
    if (f.proteinMin && days.length >= 3 && avg(days.map((x) => x.protein)) < f.proteinMin) tips.push(`Protein averages ${r0(avg(days.map((x) => x.protein)))} g, below your ${f.proteinMin} g minimum. Low protein means more hunger and less muscle kept.`);
    if (snap.weekendSkew) tips.push(snap.weekendSkew);
    if (snap.topFoods?.length) tips.push(`Your biggest calorie sources this week: ${snap.topFoods.slice(0, 3).map((x) => `${x.name} (${x.kcal} kcal)`).join(', ')}. A smaller portion of one of these changes the most.`);
    if (w.plateau) tips.push(w.plateau);
    if (n0(snap.steps7) && snap.targets?.steps && snap.steps7 < snap.targets.steps * 0.7) tips.push(`Steps average ${r0(snap.steps7)}, well under ${snap.targets.steps}. Walking is the easiest lever.`);
    if (!tips.length) tips.push('Nothing stands out as a problem. Stay consistent for two more weeks before changing anything; the scale lags behaviour.');
    return { text: tips.slice(0, 4).join(' '), mood: 'think', actions: [{ label: 'Plan my week', page: 'planner' }, { label: 'See my week', ask: 'How was my week?' }] };
  },
  next(snap, f) {
    const p = priority(snap, f); const q = (snap.journey?.today?.quests || []).filter((x) => !x.done).sort((a, b) => b.pct - a.pct)[0];
    const lines = p.slice(0, 2).map((x) => x.text);
    if (q && lines.length < 2) lines.push(`Quest: ${q.title} (${q.value}/${q.target} ${q.unit}).`);
    return { text: lines.join('\n'), mood: 'think', actions: p[0].actions || [], follow: ['What should I eat next?', 'How am I doing today?', 'What should I change?'], top: p[0].text };
  },
  motivate(snap) {
    const s = snap.streak?.current;
    return { text: `${s >= 3 ? `You have shown up ${s} days in a row, and that is the whole game. ` : 'Showing up on a bad day is worth more than a perfect day you skip. '}Do the smallest version today: log one meal and drink one glass of water. You can do bigger tomorrow.`, mood: 'love', actions: [{ label: 'Log food', page: 'foodLogger' }] };
  },
  joke() { return { text: 'Why did the banana go to the gym? To get more a-peeling! 🍌', mood: 'laugh', actions: [] }; },
  hello(snap) { return { text: `Hi${snap.name ? ` ${snap.name}` : ''}! Ask me anything about today, your week, your goals or how any feature works.`, mood: 'wave', actions: [{ label: 'How am I doing?', ask: 'How am I doing today?' }, { label: 'What should I eat?', ask: 'What should I eat next?' }] }; },
  help() { return { text: 'I can read your day and your week (calories, protein, carbs, fat, water, steps, weight trend, goals, habits), suggest what to eat from your own foods, explain why progress stalled, and walk you through any feature: logging food, barcode scanning, the weekly meal plan, recipes, water, exercise, reminders and reports.', mood: 'wave', actions: [{ label: 'How am I doing?', ask: 'How am I doing today?' }, { label: 'How do I plan my week?', ask: 'How do I plan my week?' }, { label: 'Why am I stuck?', ask: 'What should I change?' }] }; },
};

/** Chips that make sense right now (also shown before the person types anything). */
function suggestionsFor(snap) {
  const f = buildFacts(snap), out = [];
  out.push('How am I doing today?');
  if (f.left === null || f.left > 150) out.push('What should I eat next?'); else out.push('I went over, what now?');
  if (f.proteinLeft > 15) out.push('How much protein do I need?');
  out.push('How was my week?', 'What should I change?', 'How do I plan my week?', 'How do I scan a barcode?');
  return [...new Set(out)].slice(0, 6);
}

/**
 * @param question what the person typed
 * @param snap     data snapshot (see routes/assistantRoutes.js)
 * @returns { text, mood, actions: [{label, page?|ask?}], chips: [string], topic }
 */
function followChips(follow, general) { return [...new Set([...(follow || []), ...general])].slice(0, 6); }

function answer(question, snap) {
  const q = ` ${norm(question)} `;
  const f = buildFacts(snap || {});
  const chips = suggestionsFor(snap || {});
  if (!q.trim()) return { ...A.help(snap, f), chips, topic: 'help' };

  // "how do I…" about a feature wins over data answers when the wording is clearly about using the app
  const howTo = /\b(how (do|can|to|does)|where (do|can|is)|what is|explain|guide|show me how)\b/.test(q);
  const feat = matchFeature(q);
  if (feat && howTo) return { text: feat.how, mood: 'think', actions: [{ label: feat.label, page: feat.page }], chips, topic: `feature:${feat.id}` };

  if (DIET_Q.test(q)) { const r = A.dietDay(snap || {}, f, q.trim()); return { ...r, chips: followChips(r.follow, chips), topic: 'dietDay' }; }

  const sit = sitOf(q.trim());
  if (sit && !howTo) { const r = A.scenario(snap || {}, f, q.trim()); return { ...r, chips: followChips(r.follow, chips), topic: `scenario:${sit}` }; }

  let best = null;
  for (const [id, words] of INTENTS) { const s = score(q, words); if (s && (!best || s > best.s)) best = { id, s }; }
  if (/\b(went over|ate too much|overate|over budget|cheated|binge)\b/.test(q)) best = { id: 'calories', s: 99 };
  if (/\b(why|stuck|plateau|not losing|improve|change)\b/.test(q) && best?.id !== 'overview') best = { id: 'why', s: 98 };
  if (best) {
    let res = A[best.id](snap || {}, f, q.trim());
    if (best.s === 99 && f.target && f.eaten <= f.target) res = { ...res, text: `Good news: you're not over today. ${res.text}` };
    return { ...res, chips: followChips(res.follow, chips), topic: best.id };
  }
  if (feat) return { text: feat.how, mood: 'think', actions: [{ label: feat.label, page: feat.page }], chips, topic: `feature:${feat.id}` };
  return { text: 'I\'m not sure I understood that one. I can answer about your calories, protein, water, steps, weight, goals, habits and week, suggest what to eat, or explain any feature. Try one of these:', mood: 'think', actions: [], chips, topic: 'unknown' };
}

module.exports = { priority, answer, suggestionsFor, matchFeature, FEATURES, buildFacts };
