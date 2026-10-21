// THE PLANNING SENSEI'S QUESTIONS. Pure functions (no database) so the web app, the phone app and the tests all use the same rules.
//
//   QUESTIONS        what can be asked: one entry per topic, with its options, how an answer is cleaned and where it is stored
//   pickQuestions    which 3-4 to ask NOW. Skips what is known (diet once set), what was skipped recently, what the screen already
//                    decides, and what does not apply (no fish question for a vegetarian). Later sessions only ask what changed.
//   applyAnswer      cleans an answer and writes it into the Food Preferences object (never trusts the client)
//   usualFor         the "Use my usual" value for any question (last answer, else what the food log or profile suggests, else a safe default)
//   summaryChips     the editable chips on the "Your plan setup" card
//   deriveSettings   turns the stored answers into the settings the plan engine uses
//   planSafety       the doctor / dietitian note for pregnancy, under-18s and medical conditions (and the "no aggressive targets" rule)
//
// Health data (allergies, intolerances, health flags) lives only in the person's own Food Preferences document: it is part of the account
// export and is deleted with the account. An allergen in `avoid.allergies` is NEVER overridden: see lib/foodSafety.js.
const { ALLERGY_IDS, INTOLERANCE_IDS, RELIGIOUS_IDS, ALLERGEN_LABELS } = require('./foodSafety');
const { CUISINE_GROUPS } = require('./foodTags');

const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'];
const MAX_PER_SESSION = 4;
const MAX_PER_UPDATE = 3;
const SKIP_COOLDOWN_DAYS = 30;
const DAY = 86400000;

const DIET_OPTIONS = [
  { id: 'veg', label: 'Vegetarian', emoji: '🥦' }, { id: 'egg', label: 'Eggetarian', emoji: '🥚' }, { id: 'nonveg', label: 'Non-veg', emoji: '🍗' },
  { id: 'vegan', label: 'Vegan', emoji: '🌱' }, { id: 'jain', label: 'Jain', emoji: '🙏' }, { id: 'sattvic', label: 'Sattvic', emoji: '🪔' },
];
const labelOf = (arr, id) => (arr.find((o) => o.id === id) || {}).label || id;
const idsOf = (arr) => arr.map((o) => o.id);

const ALLERGY_OPTIONS = ALLERGY_IDS.map((id) => ({ id: `allergy:${id}`, label: ({ peanut: 'Peanuts', tree_nut: 'Tree nuts', milk: 'Milk / dairy', egg: 'Eggs', gluten: 'Gluten / wheat', soy: 'Soy', fish: 'Fish', shellfish: 'Shellfish', sesame: 'Sesame', mustard: 'Mustard' })[id] }));
const INTOLERANCE_OPTIONS = [{ id: 'intolerance:lactose', label: 'Lactose' }, { id: 'intolerance:gluten', label: 'Gluten sensitivity' }];
const RELIGIOUS_OPTIONS = [{ id: 'religious:beef', label: 'No beef' }, { id: 'religious:pork', label: 'No pork' }, { id: 'religious:no_onion_garlic', label: 'No onion / garlic' }];
const AVOID_IDS = [...ALLERGY_OPTIONS, ...INTOLERANCE_OPTIONS, ...RELIGIOUS_OPTIONS].map((o) => o.id);

const CUISINE_OPTIONS = [
  { id: 'north', label: 'North Indian' }, { id: 'punjabi', label: 'Punjabi' }, { id: 'gujarati', label: 'Gujarati' }, { id: 'maharashtrian', label: 'Maharashtrian' },
  { id: 'rajasthani', label: 'Rajasthani' }, { id: 'bihari-up', label: 'UP / Bihar' }, { id: 'bengali', label: 'Bengali' }, { id: 'odia', label: 'Odia' }, { id: 'assamese', label: 'Assamese' },
  { id: 'goan', label: 'Goan' }, { id: 'kashmiri', label: 'Kashmiri' }, { id: 'tamil', label: 'Tamil Nadu' }, { id: 'kerala', label: 'Kerala' }, { id: 'karnataka', label: 'Karnataka' },
  { id: 'andhra', label: 'Andhra' }, { id: 'telangana', label: 'Telangana' }, { id: 'hyderabadi', label: 'Hyderabadi' }, { id: 'indo-chinese', label: 'Indo-Chinese' },
];
const EQUIPMENT_OPTIONS = [
  { id: 'stove', label: 'Gas / induction stove' }, { id: 'pressure cooker', label: 'Pressure cooker' }, { id: 'microwave', label: 'Microwave' }, { id: 'air fryer', label: 'Air fryer' },
  { id: 'oven', label: 'Oven' }, { id: 'blender', label: 'Mixer / blender' }, { id: 'steamer', label: 'Steamer / idli cooker' }, { id: 'none', label: 'No stove (kettle / microwave only)' },
];
const PROTEIN_OPTIONS = [
  { id: 'dal', label: 'Dal', diets: 'all' }, { id: 'legumes', label: 'Rajma / chole / chana', diets: 'all' }, { id: 'paneer', label: 'Paneer', diets: 'dairy' }, { id: 'curd', label: 'Curd / yogurt', diets: 'dairy' },
  { id: 'soy', label: 'Soy / tofu', diets: 'all' }, { id: 'egg', label: 'Eggs', diets: 'egg' }, { id: 'chicken', label: 'Chicken', diets: 'nonveg' }, { id: 'fish', label: 'Fish', diets: 'nonveg' },
];
const FASTING_OPTIONS = [
  { id: 'none', label: 'No fasting' }, { id: 'window_12_20', label: 'Eating window 12 pm to 8 pm' }, { id: 'window_10_18', label: 'Eating window 10 am to 6 pm' }, { id: 'window_8_16', label: 'Eating window 8 am to 4 pm' },
  { id: 'vrat_mon', label: 'Monday vrat' }, { id: 'vrat_tue', label: 'Tuesday vrat' }, { id: 'vrat_wed', label: 'Wednesday vrat' }, { id: 'vrat_thu', label: 'Thursday vrat' }, { id: 'vrat_fri', label: 'Friday vrat' },
  { id: 'vrat_sat', label: 'Saturday vrat' }, { id: 'vrat_sun', label: 'Sunday vrat' }, { id: 'ramadan', label: 'Ramadan' },
];
const VRAT_DOW = { vrat_sun: 0, vrat_mon: 1, vrat_tue: 2, vrat_wed: 3, vrat_thu: 4, vrat_fri: 5, vrat_sat: 6 };
const HEALTH_OPTIONS = [
  { id: 'pregnant', label: 'Pregnant' }, { id: 'breastfeeding', label: 'Breastfeeding' }, { id: 'diabetes', label: 'Diabetes / pre-diabetes' }, { id: 'bp', label: 'High blood pressure' },
  { id: 'kidney', label: 'Kidney condition' }, { id: 'thyroid', label: 'Thyroid' }, { id: 'pcos', label: 'PCOS' }, { id: 'other', label: 'Another condition' }, { id: 'none', label: 'None of these' },
];
const STAPLES = ['Atta', 'Rice', 'Toor dal', 'Moong dal', 'Chana', 'Rajma', 'Paneer', 'Curd', 'Eggs', 'Onion', 'Tomato', 'Potato', 'Spinach', 'Besan', 'Oats', 'Milk'];
const LOVE_SUGGEST = ['Dal tadka', 'Paneer bhurji', 'Rajma', 'Idli', 'Dosa', 'Poha', 'Khichdi', 'Chole', 'Egg curry', 'Chicken curry', 'Fish curry', 'Curd rice'];
const DISLIKE_SUGGEST = ['Karela', 'Baingan', 'Bhindi', 'Lauki', 'Mushroom', 'Paneer', 'Fish', 'Egg', 'Cabbage', 'Spinach', 'Tofu', 'Spicy food'];

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => ({ id: String(a + i), label: String(a + i) }));

// ---------------------------------------------------------------------------------------------------------------- questions
// type: single | multi | form | text | dates.  group: used for ordering and the summary card.
// `core` questions are asked in the first session in `rank` order; `changes` questions come back when they go stale (days).
const QUESTIONS = [
  { id: 'diet', group: 'basics', rank: 1, type: 'single', ask: 'How do you eat: vegetarian, eggetarian, non-veg, vegan, Jain or sattvic?', options: DIET_OPTIONS, usual: 'veg' },
  { id: 'avoid', group: 'safety', rank: 2, type: 'multi', ask: 'Any allergies, intolerances or religious rules I must keep out of every plan?', hint: 'Allergies are never overridden: those foods will not appear in any plan, swap or suggestion.', allowNone: true,
    groups: [{ id: 'allergy', label: 'Allergies', options: ALLERGY_OPTIONS }, { id: 'intolerance', label: 'Intolerances', options: INTOLERANCE_OPTIONS }, { id: 'religious', label: 'Religious / personal rules', options: RELIGIOUS_OPTIONS }], usual: [] },
  { id: 'health', group: 'safety', rank: 3, type: 'multi', ask: 'Is there anything your doctor has asked you to follow, or that I should be careful about?', hint: 'Optional and private. It only decides whether I show a "check with your doctor" note instead of firm targets.', options: HEALTH_OPTIONS, allowNone: true, usual: [], needsConsent: true },
  { id: 'cookTime', group: 'kitchen', rank: 4, type: 'form', ask: 'How long can you cook for each meal?', fields: [
    { id: 'breakfast', label: 'Breakfast', type: 'single', options: [{ id: '10', label: '10 min' }, { id: '20', label: '20 min' }, { id: '40', label: '40 min' }] },
    { id: 'lunch', label: 'Lunch', type: 'single', options: [{ id: '10', label: '10 min' }, { id: '20', label: '20 min' }, { id: '40', label: '40 min' }] },
    { id: 'dinner', label: 'Dinner', type: 'single', options: [{ id: '10', label: '10 min' }, { id: '20', label: '20 min' }, { id: '40', label: '40 min' }] }], usual: { breakfast: '20', lunch: '20', dinner: '40' } },
  { id: 'dislikes', group: 'tastes', rank: 5, type: 'text', ask: 'Anything you simply do not like or will not eat?', suggestions: DISLIKE_SUGGEST, max: 30, usual: [] },
  { id: 'cuisine', group: 'tastes', rank: 6, type: 'multi', ask: 'Which kinds of food feel like home?', hint: 'Pick as many as you like. Everyday staples fit every cuisine.', options: CUISINE_OPTIONS, usual: [] },
  { id: 'household', group: 'home', rank: 7, type: 'form', ask: 'Who eats with you? I will scale the shopping list.', fields: [
    { id: 'adults', label: 'Adults (including you)', type: 'single', options: range(1, 6) }, { id: 'kids', label: 'Kids', type: 'single', options: range(0, 4) }, { id: 'elders', label: 'Elders', type: 'single', options: range(0, 4) }], usual: { adults: '1', kids: '0', elders: '0' } },
  { id: 'eatingOut', group: 'home', rank: 8, type: 'form', ask: 'Which meals do you eat outside (tiffin, canteen, restaurant)?', fields: [
    { id: 'meals', label: 'Meals', type: 'multi', options: [{ id: 'breakfast', label: 'Breakfast' }, { id: 'lunch', label: 'Lunch' }, { id: 'dinner', label: 'Dinner' }, { id: 'none', label: 'None, I cook' }] },
    { id: 'kind', label: 'Where', type: 'single', options: [{ id: 'tiffin', label: 'Tiffin' }, { id: 'canteen', label: 'Canteen' }, { id: 'restaurant', label: 'Restaurant' }, { id: 'mixed', label: 'A mix' }] },
    { id: 'perWeek', label: 'Days a week', type: 'single', options: [{ id: '1', label: '1' }, { id: '2', label: '2' }, { id: '3', label: '3' }, { id: '5', label: '5' }, { id: '7', label: 'Every day' }] }], usual: { meals: ['none'], kind: 'tiffin', perWeek: '5' } },
  { id: 'protein', group: 'tastes', rank: 9, type: 'multi', ask: 'Which protein sources do you like, or want more of?', options: PROTEIN_OPTIONS, usual: [] },
  { id: 'kitchen', group: 'kitchen', rank: 10, type: 'form', ask: 'How comfortable are you in the kitchen, and what do you cook with?', fields: [
    { id: 'skill', label: 'Cooking skill', type: 'single', options: [{ id: 'beginner', label: 'Beginner' }, { id: 'ok', label: 'Comfortable' }, { id: 'confident', label: 'Confident' }] },
    { id: 'equipment', label: 'Kitchen', type: 'multi', options: EQUIPMENT_OPTIONS }], usual: { skill: 'ok', equipment: ['stove', 'pressure cooker'] } },
  { id: 'budget', group: 'home', rank: 11, type: 'single', ask: 'What budget should the plan respect?', options: [{ id: 'low', label: 'Keep it low' }, { id: 'medium', label: 'Medium' }, { id: 'flexible', label: 'Flexible' }], usual: 'medium' },
  { id: 'spiceOil', group: 'tastes', rank: 12, type: 'form', ask: 'How spicy and how oily do you like it?', fields: [
    { id: 'spice', label: 'Spice', type: 'single', options: [{ id: 'mild', label: 'Mild' }, { id: 'medium', label: 'Medium' }, { id: 'hot', label: 'Hot' }] },
    { id: 'oil', label: 'Oil', type: 'single', options: [{ id: 'light', label: 'Light' }, { id: 'regular', label: 'Regular' }] }], usual: { spice: 'medium', oil: 'light' } },
  { id: 'prep', group: 'kitchen', rank: 13, type: 'single', ask: 'Do you like to batch-cook and eat leftovers?', options: [{ id: 'fresh', label: 'I cook fresh' }, { id: 'twice', label: 'Cook once, eat twice' }, { id: 'sunday', label: 'Batch-cook on Sunday' }], usual: 'fresh' },
  { id: 'bigMeal', group: 'tastes', rank: 14, type: 'single', ask: 'Are you a big-breakfast or a big-dinner eater?', options: [{ id: 'breakfast', label: 'Big breakfast' }, { id: 'balanced', label: 'Balanced' }, { id: 'dinner', label: 'Big dinner' }], usual: 'balanced' },
  { id: 'snacks', group: 'tastes', rank: 15, type: 'form', ask: 'How do you snack, and how should I handle sweet cravings?', fields: [
    { id: 'style', label: 'Snack style', type: 'multi', options: [{ id: 'fruit', label: 'Fruit' }, { id: 'nuts', label: 'Nuts' }, { id: 'savoury', label: 'Savoury' }, { id: 'sweet', label: 'Sweet' }, { id: 'none', label: 'I do not snack' }] },
    { id: 'sweetPlan', label: 'Sweet cravings', type: 'single', options: [{ id: 'none', label: 'No sweets in the plan' }, { id: 'fruit', label: 'Fruit-based' }, { id: 'weekend', label: 'A weekend treat' }, { id: 'daily', label: 'A small one daily' }] }], usual: { style: ['fruit', 'nuts'], sweetPlan: 'fruit' } },
  { id: 'loves', group: 'tastes', rank: 16, type: 'text', ask: 'Which foods do you love? I will plan them more often.', suggestions: LOVE_SUGGEST, max: 20, usual: [] },
  { id: 'variety', group: 'tastes', rank: 17, type: 'single', ask: 'Do you want variety, or do you like repeating favourites?', options: [{ id: 'variety', label: 'Lots of variety' }, { id: 'repeat', label: 'Repeat my favourites' }], usual: 'variety' },
  { id: 'fasting', group: 'rhythm', rank: 18, type: 'multi', ask: 'Do you fast: an eating window, vrat days or Ramadan?', hint: 'Pick the eating window and any vrat days. Ramadan asks for the start date next.', options: FASTING_OPTIONS, usual: ['none'], changes: 30, exclusive: 'none' },
  { id: 'ramadanStart', group: 'rhythm', rank: 19, type: 'dates', ask: 'When does Ramadan start for you (and how many days)?', fields: [{ id: 'from', label: 'First fasting day' }, { id: 'days', label: 'Days', options: [{ id: '29', label: '29' }, { id: '30', label: '30' }] }], usual: null, conditional: true },
  { id: 'event', group: 'rhythm', rank: 20, type: 'single', ask: 'Any festival, wedding or trip coming up in the next two weeks?', options: [{ id: 'none', label: 'Nothing planned' }, { id: 'festival', label: 'A festival' }, { id: 'wedding', label: 'A wedding / feast' }, { id: 'travel', label: 'Travel' }], usual: 'none', changes: 7 },
  { id: 'eventDates', group: 'rhythm', rank: 21, type: 'dates', ask: 'Which days?', fields: [{ id: 'from', label: 'From' }, { id: 'to', label: 'To' }], usual: null, conditional: true },
  { id: 'have', group: 'home', rank: 22, type: 'text', ask: 'What do you already have at home? I will use it and leave it off the shopping list.', suggestions: STAPLES, max: 40, usual: [], changes: 7 },
  { id: 'scope', group: 'basics', rank: 99, type: 'form', ask: 'How many days and which meals shall I plan?', fields: [
    { id: 'days', label: 'Days', type: 'single', options: [{ id: '1', label: '1 day' }, { id: '3', label: '3 days' }, { id: '5', label: '5 days' }, { id: '7', label: 'Whole week' }] },
    { id: 'meals', label: 'Meals', type: 'multi', options: MEALS.map((m) => ({ id: m, label: m[0].toUpperCase() + m.slice(1) })) }], usual: { days: '7', meals: MEALS } },
];
const Q = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));

/** Options that make sense for this person (a vegetarian is not asked about fish). */
function optionsFor(q, prefs = {}) {
  if (q.id === 'protein') {
    const d = prefs.diet || 'veg';
    const dairy = d !== 'vegan', egg = d === 'egg' || d === 'nonveg', non = d === 'nonveg';
    return PROTEIN_OPTIONS.filter((o) => o.diets === 'all' || (o.diets === 'dairy' && dairy) || (o.diets === 'egg' && egg) || (o.diets === 'nonveg' && non)).map(({ id, label }) => ({ id, label }));
  }
  if (q.id === 'avoid' && (prefs.diet === 'vegan')) return undefined;
  return q.options;
}

// ---------------------------------------------------------------------------------------------------------------- cleaning
const text = (v, max = 40) => String(v ?? '').replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const pickOne = (v, ids) => (ids.includes(String(v)) ? String(v) : null);
const pickMany = (v, ids, max = 50) => [...new Set((Array.isArray(v) ? v : [v]).map(String).filter((x) => ids.includes(x)))].slice(0, max);
const textList = (v, max) => {
  const out = []; const seen = new Set();
  for (const x of Array.isArray(v) ? v : String(v ?? '').split(/[,\n]/)) { const t = text(x); const k = t.toLowerCase(); if (t.length >= 2 && !seen.has(k)) { seen.add(k); out.push(t); } if (out.length >= max) break; }
  return out;
};
const isoDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? String(v) : '');
const num = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

/**
 * Applies one answer to a Food Preferences object (plain object). Returns { prefs, error }. Never mutates the input.
 * A value the question does not allow is dropped; if nothing valid is left the answer is rejected.
 */
function applyAnswer(prefs, qid, value) {
  const q = Q[qid];
  if (!q) return { error: 'Unknown question' };
  const p = JSON.parse(JSON.stringify(prefs || {}));
  p.avoid = { allergies: [], intolerances: [], religious: [], dislikes: [], ...(p.avoid || {}) };
  switch (qid) {
    case 'diet': { const v = pickOne(value, idsOf(DIET_OPTIONS)); if (!v) return { error: 'Choose one of the diet options' }; p.diet = v; break; }
    case 'avoid': {
      const list = pickMany(value, ['none', ...AVOID_IDS]);
      const real = list.filter((x) => x !== 'none');
      p.avoid.allergies = real.filter((x) => x.startsWith('allergy:')).map((x) => x.slice(8));
      p.avoid.intolerances = real.filter((x) => x.startsWith('intolerance:')).map((x) => x.slice(12));
      p.avoid.religious = real.filter((x) => x.startsWith('religious:')).map((x) => x.slice(10));
      break;
    }
    case 'health': { const list = pickMany(value, idsOf(HEALTH_OPTIONS)); p.health = { flags: list.filter((x) => x !== 'none') }; break; }
    case 'cookTime': { const v = value || {}; p.cookTime = { breakfast: num(v.breakfast, 5, 90, 20), lunch: num(v.lunch, 5, 90, 20), dinner: num(v.dinner, 5, 90, 40) }; break; }
    case 'dislikes': p.avoid.dislikes = textList(value, Q.dislikes.max); break;
    case 'cuisine': p.cuisines = pickMany(value, idsOf(CUISINE_OPTIONS)); break;
    case 'household': { const v = value || {}; p.household = { adults: num(v.adults, 1, 12, 1), kids: num(v.kids, 0, 8, 0), elders: num(v.elders, 0, 8, 0) }; break; }
    case 'eatingOut': {
      const v = value || {}; const meals = pickMany(v.meals, ['breakfast', 'lunch', 'dinner', 'none']).filter((m) => m !== 'none');
      p.eatingOut = { meals, kind: pickOne(v.kind, ['tiffin', 'canteen', 'restaurant', 'mixed']) || 'tiffin', perWeek: meals.length ? num(v.perWeek, 1, 7, 5) : 0 };
      break;
    }
    case 'protein': p.protein = { sources: pickMany(value, idsOf(PROTEIN_OPTIONS)) }; break;
    case 'kitchen': {
      const v = value || {}; const eq = pickMany(v.equipment, idsOf(EQUIPMENT_OPTIONS));
      p.kitchen = { skill: pickOne(v.skill, ['beginner', 'ok', 'confident']) || 'ok', equipment: eq.includes('none') ? ['none'] : eq };
      break;
    }
    case 'budget': { const v = pickOne(value, ['low', 'medium', 'flexible']); if (!v) return { error: 'Choose a budget level' }; p.budget = v; break; }
    case 'spiceOil': { const v = value || {}; p.spice = pickOne(v.spice, ['mild', 'medium', 'hot']) || 'medium'; p.oil = pickOne(v.oil, ['light', 'regular']) || 'light'; break; }
    case 'prep': { const v = pickOne(value, ['fresh', 'twice', 'sunday']); if (!v) return { error: 'Choose one option' }; p.prep = v; break; }
    case 'bigMeal': { const v = pickOne(value, ['breakfast', 'balanced', 'dinner']); if (!v) return { error: 'Choose one option' }; p.bigMeal = v; break; }
    case 'snacks': { const v = value || {}; p.snacks = { style: pickMany(v.style, ['fruit', 'nuts', 'savoury', 'sweet', 'none']).filter((x) => x !== 'none'), sweetPlan: pickOne(v.sweetPlan, ['none', 'fruit', 'weekend', 'daily']) || 'fruit' }; break; }
    case 'loves': p.loves = textList(value, Q.loves.max); break;
    case 'variety': { const v = pickOne(value, ['variety', 'repeat']); if (!v) return { error: 'Choose one option' }; p.variety = v; break; }
    case 'fasting': {
      let list = pickMany(value, idsOf(FASTING_OPTIONS));
      if (list.includes('none') && list.length > 1) list = list.filter((x) => x !== 'none');
      const wins = list.filter((x) => x.startsWith('window_')); if (wins.length > 1) list = list.filter((x) => !x.startsWith('window_') || x === wins[wins.length - 1]);
      p.fasting = { options: list.length ? list : ['none'] };
      if (!list.includes('ramadan')) p.ramadan = { from: '', days: 30 };
      break;
    }
    case 'ramadanStart': { const v = value || {}; const from = isoDate(v.from); if (!from) return { error: 'Choose the first fasting day' }; p.ramadan = { from, days: num(v.days, 28, 31, 30) }; break; }
    case 'event': { const v = pickOne(value, ['none', 'festival', 'wedding', 'travel']); if (!v) return { error: 'Choose one option' }; p.event = { kind: v, from: v === 'none' ? '' : (p.event && p.event.from) || '', to: v === 'none' ? '' : (p.event && p.event.to) || '' }; break; }
    case 'eventDates': { const v = value || {}; const from = isoDate(v.from); const to = isoDate(v.to) || from; if (!from) return { error: 'Choose the first day' }; if (to < from) return { error: 'The last day cannot be before the first' }; p.event = { ...(p.event || { kind: 'festival' }), from, to }; break; }
    case 'have': p.have = textList(value, Q.have.max); break;
    case 'scope': { const v = value || {}; const meals = pickMany(v.meals, MEALS); p.scope = { days: num(v.days, 1, 7, 7), meals: meals.length ? meals : MEALS }; break; }
    default: return { error: 'Unknown question' };
  }
  return { prefs: p };
}

// ---------------------------------------------------------------------------------------------------------------- usual values
/** The answer "Use my usual" saves: the last answer, else a hint from the profile / food log, else a safe default. */
function usualFor(qid, prefs = {}, ctx = {}) {
  const q = Q[qid]; if (!q) return null;
  const a = prefs.avoid || {};
  switch (qid) {
    case 'diet': return prefs.diet || ctx.inferredDiet || 'veg';
    case 'avoid': return prefs.avoid ? [...(a.allergies || []).map((x) => `allergy:${x}`), ...(a.intolerances || []).map((x) => `intolerance:${x}`), ...(a.religious || []).map((x) => `religious:${x}`)] : [];
    case 'health': return (prefs.health && prefs.health.flags) || [];
    case 'cookTime': return prefs.cookTime ? Object.fromEntries(Object.entries(prefs.cookTime).map(([k, v]) => [k, String(v)])) : q.usual;
    case 'dislikes': return a.dislikes || [];
    case 'cuisine': return prefs.cuisines || [];
    case 'household': return prefs.household ? Object.fromEntries(Object.entries(prefs.household).map(([k, v]) => [k, String(v)])) : q.usual;
    case 'eatingOut': return prefs.eatingOut ? { meals: prefs.eatingOut.meals.length ? prefs.eatingOut.meals : ['none'], kind: prefs.eatingOut.kind, perWeek: String(prefs.eatingOut.perWeek || 5) } : q.usual;
    case 'protein': return (prefs.protein && prefs.protein.sources) || ctx.inferredProtein || [];
    case 'kitchen': return prefs.kitchen || q.usual;
    case 'budget': return prefs.budget || q.usual;
    case 'spiceOil': return prefs.spice ? { spice: prefs.spice, oil: prefs.oil || 'light' } : q.usual;
    case 'prep': return prefs.prep || q.usual;
    case 'bigMeal': return prefs.bigMeal || q.usual;
    case 'snacks': return prefs.snacks || q.usual;
    case 'loves': return prefs.loves || [];
    case 'variety': return prefs.variety || q.usual;
    case 'fasting': return (prefs.fasting && prefs.fasting.options) || q.usual;
    case 'ramadanStart': return prefs.ramadan && prefs.ramadan.from ? { from: prefs.ramadan.from, days: String(prefs.ramadan.days || 30) } : null;
    case 'event': return 'none';                                    // an event is never "usual": the default is that nothing is planned
    case 'eventDates': return null;
    case 'have': return prefs.have || [];
    case 'scope': return prefs.scope ? { days: String(prefs.scope.days), meals: prefs.scope.meals } : { days: String(ctx.days || 7), meals: ctx.meals || MEALS };
    default: return q.usual;
  }
}

// ---------------------------------------------------------------------------------------------------------------- what to ask now
const asked = (prefs, id) => (prefs.answered || {})[id] || null;
const ageDays = (iso, now) => (iso ? (now - Date.parse(iso)) / DAY : Infinity);

/** Is the question already known / not needed? Returns a reason string, or '' when it should be considered. */
function skipReason(q, prefs, ctx, now) {
  const a = asked(prefs, q.id);
  if (q.id === 'diet' && prefs.diet) return 'diet is already set';
  if (q.id === 'health' && ((ctx.age && ctx.age < 18) || (prefs.health && prefs.health.flags) || a)) return 'health note is already covered';
  if (q.id === 'scope') return 'the screen decides days and meals';
  if (q.id === 'ramadanStart') { const f = (prefs.fasting && prefs.fasting.options) || []; if (!f.includes('ramadan') || (prefs.ramadan && prefs.ramadan.from)) return 'not fasting for Ramadan or date known'; }
  if (q.id === 'eventDates') { const k = prefs.event && prefs.event.kind; if (!k || k === 'none' || (prefs.event.from && !(a && a.stale))) return 'no event or dates known'; }
  if (q.id === 'event' && (ctx.events || []).some((e) => e.endDate >= ctx.today && e.startDate <= addDaysIso(ctx.today, 14))) return 'the profile already has an upcoming event';
  if (q.id === 'protein' && (prefs.diet === 'vegan' && false)) return '';
  if (q.id === 'health' && ctx.age && ctx.age < 18) return 'under 18 note applies automatically';
  if (a && a.skipped && ageDays(a.at, now) < SKIP_COOLDOWN_DAYS && !(ctx.boost || {})[q.id]) return 'skipped recently';
  if (a && !a.skipped && !q.changes && !(ctx.boost || {})[q.id]) return 'already answered';
  if (a && !a.skipped && q.changes && ageDays(a.at, now) < q.changes && !(ctx.boost || {})[q.id]) return 'answered recently';
  return '';
}

function addDaysIso(s, n) { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

/**
 * Which questions to ask now (3 or 4 at most). Pure: pass `now` (ms) and a `ctx` with { today, age, events, boost, mode, inferredDiet }.
 *   mode 'setup'   (first session): core questions by rank, safety first
 *   mode 'update'  (later "Improve my plan"): only what changed (stale event / have / fasting), what feedback pointed at, and one new topic
 * Conditional follow-ups (Ramadan dates, event dates) come right after their parent and count towards the limit.
 */
function pickQuestions({ prefs = {}, ctx = {}, now = Date.now() } = {}) {
  const setupDone = !!(prefs.sensei && prefs.sensei.completedAt) || ctx.mode === 'update';
  const limit = setupDone ? MAX_PER_UPDATE : MAX_PER_SESSION;
  const boost = ctx.boost || {};
  const scored = [];
  for (const q of QUESTIONS) {
    if (q.conditional) continue;
    if (skipReason(q, prefs, ctx, now)) continue;
    const a = asked(prefs, q.id);
    let score = q.rank;
    if (boost[q.id]) score -= 100 + boost[q.id];                         // feedback pointed here ("too long to cook" -> cook time)
    else if (setupDone) {
      if (q.changes && a) score -= 50;                                   // a "what changed" question that went stale
      else if (q.changes && !a) score += 0;
      else if (a) continue;                                              // known and not a changing topic
      else score += 20;                                                  // a never-asked topic: at most one of them (below)
    }
    scored.push({ q, score, fresh: !a });
  }
  scored.sort((x, y) => x.score - y.score);
  const chosen = []; let freshInUpdate = 0;
  for (const s of scored) {
    if (chosen.length >= limit) break;
    if (setupDone && s.fresh && !boost[s.q.id] && !s.q.changes) { if (freshInUpdate >= 1) continue; freshInUpdate += 1; }
    chosen.push(s.q);
  }
  // follow-ups
  const out = [];
  for (const q of chosen) {
    out.push(q);
    if (q.id === 'fasting') { /* the Ramadan date is asked right after the answer: see followUp() */ }
  }
  return out.slice(0, limit);
}

/** The question to ask right after an answer, if the answer needs one (Ramadan start, event dates). Otherwise null. */
function followUp(qid, prefs) {
  if (qid === 'fasting' && prefs.fasting && prefs.fasting.options.includes('ramadan') && !(prefs.ramadan && prefs.ramadan.from)) return Q.ramadanStart;
  if (qid === 'event' && prefs.event && prefs.event.kind && prefs.event.kind !== 'none' && !prefs.event.from) return Q.eventDates;
  return null;
}

/** Marks a question as answered / skipped. `usual` = the person tapped "Use my usual". */
function markAnswered(prefs, qid, { skipped = false, usual = false, now = Date.now() } = {}) {
  const p = JSON.parse(JSON.stringify(prefs || {}));
  p.answered = { ...(p.answered || {}), [qid]: { at: new Date(now).toISOString(), skipped: !!skipped, usual: !!usual } };
  return p;
}

// ---------------------------------------------------------------------------------------------------------------- summary
const joinLabels = (ids, list) => ids.map((i) => labelOf(list, i)).join(', ');
const MEAL_LETTER = { breakfast: 'B', lunch: 'L', dinner: 'D', snacks: 'S' };

/** The chips on "Your plan setup": every one opens its question again (editable). Empty topics show as "Not set". */
function summaryChips(prefs = {}, ctx = {}) {
  const a = prefs.avoid || {};
  const avoidIds = [...(a.allergies || []).map((x) => `allergy:${x}`), ...(a.intolerances || []).map((x) => `intolerance:${x}`), ...(a.religious || []).map((x) => `religious:${x}`)];
  const allAvoid = [...ALLERGY_OPTIONS, ...INTOLERANCE_OPTIONS, ...RELIGIOUS_OPTIONS];
  const sc = prefs.scope || { days: ctx.days || 7, meals: ctx.meals || MEALS };
  const ct = prefs.cookTime;
  const chips = [
    { id: 'scope', emoji: '📅', label: 'Plan', value: `${sc.days} day${sc.days === 1 ? '' : 's'} · ${sc.meals.map((m) => MEAL_LETTER[m]).join(' ')}` },
    { id: 'diet', emoji: '🥗', label: 'Diet', value: prefs.diet ? labelOf(DIET_OPTIONS, prefs.diet) : '' },
    { id: 'avoid', emoji: '🚫', label: 'Never', value: avoidIds.length ? joinLabels(avoidIds, allAvoid) : (asked(prefs, 'avoid') && !asked(prefs, 'avoid').skipped ? 'Nothing to keep out' : '') },
    { id: 'dislikes', emoji: '👎', label: 'Dislikes', value: (a.dislikes || []).join(', ') },
    { id: 'loves', emoji: '❤️', label: 'Loves', value: (prefs.loves || []).join(', ') },
    { id: 'cuisine', emoji: '🍛', label: 'Cuisine', value: joinLabels(prefs.cuisines || [], CUISINE_OPTIONS) },
    { id: 'cookTime', emoji: '⏱️', label: 'Cook time', value: ct ? `B ${ct.breakfast} · L ${ct.lunch} · D ${ct.dinner} min` : '' },
    { id: 'kitchen', emoji: '🍳', label: 'Kitchen', value: prefs.kitchen ? `${labelOf([{ id: 'beginner', label: 'Beginner' }, { id: 'ok', label: 'Comfortable' }, { id: 'confident', label: 'Confident' }], prefs.kitchen.skill)}${prefs.kitchen.equipment && prefs.kitchen.equipment.length ? ` · ${joinLabels(prefs.kitchen.equipment, EQUIPMENT_OPTIONS)}` : ''}` : '' },
    { id: 'household', emoji: '👨‍👩‍👧', label: 'Eating', value: prefs.household ? `${prefs.household.adults} adult${prefs.household.adults === 1 ? '' : 's'}${prefs.household.kids ? ` · ${prefs.household.kids} kid${prefs.household.kids === 1 ? '' : 's'}` : ''}${prefs.household.elders ? ` · ${prefs.household.elders} elder${prefs.household.elders === 1 ? '' : 's'}` : ''}` : '' },
    { id: 'budget', emoji: '💰', label: 'Budget', value: prefs.budget ? { low: 'Low', medium: 'Medium', flexible: 'Flexible' }[prefs.budget] : '' },
    { id: 'eatingOut', emoji: '🍱', label: 'Eating out', value: prefs.eatingOut ? (prefs.eatingOut.meals.length ? `${prefs.eatingOut.meals.join(', ')} · ${prefs.eatingOut.perWeek}×/week (${prefs.eatingOut.kind})` : 'I cook everything') : '' },
    { id: 'protein', emoji: '💪', label: 'Protein', value: prefs.protein && prefs.protein.sources.length ? joinLabels(prefs.protein.sources, PROTEIN_OPTIONS) : '' },
    { id: 'spiceOil', emoji: '🌶️', label: 'Spice and oil', value: prefs.spice ? `${prefs.spice} · ${prefs.oil === 'regular' ? 'regular' : 'light'} oil` : '' },
    { id: 'prep', emoji: '🥘', label: 'Leftovers', value: prefs.prep ? { fresh: 'Cook fresh', twice: 'Cook once, eat twice', sunday: 'Sunday batch-cook' }[prefs.prep] : '' },
    { id: 'bigMeal', emoji: '🍽️', label: 'Big meal', value: prefs.bigMeal ? { breakfast: 'Breakfast', balanced: 'Balanced', dinner: 'Dinner' }[prefs.bigMeal] : '' },
    { id: 'snacks', emoji: '🍎', label: 'Snacks', value: prefs.snacks ? `${prefs.snacks.style.length ? prefs.snacks.style.join(', ') : 'none'} · sweets: ${prefs.snacks.sweetPlan}` : '' },
    { id: 'variety', emoji: '🔀', label: 'Variety', value: prefs.variety ? { variety: 'Lots of variety', repeat: 'Repeat favourites' }[prefs.variety] : '' },
    { id: 'fasting', emoji: '🌙', label: 'Fasting', value: prefs.fasting && prefs.fasting.options.some((x) => x !== 'none') ? joinLabels(prefs.fasting.options, FASTING_OPTIONS) : (asked(prefs, 'fasting') ? 'None' : '') },
    { id: 'event', emoji: '🎉', label: 'Coming up', value: prefs.event && prefs.event.kind && prefs.event.kind !== 'none' ? `${prefs.event.kind}${prefs.event.from ? ` ${prefs.event.from}${prefs.event.to && prefs.event.to !== prefs.event.from ? ` to ${prefs.event.to}` : ''}` : ''}` : '' },
    { id: 'have', emoji: '🧺', label: 'At home', value: (prefs.have || []).join(', ') },
  ];
  return chips.map((c) => ({ ...c, set: !!c.value, value: c.value || 'Not set' }));
}

// ---------------------------------------------------------------------------------------------------------------- settings
const mealClock = { breakfast: 8, lunch: 13, snacks: 17, dinner: 20 };
const WINDOWS = { window_12_20: [12, 20], window_10_18: [10, 18], window_8_16: [8, 16] };
const SHARES = {
  balanced: { breakfast: 0.25, lunch: 0.34, dinner: 0.30, snacks: 0.11 },
  breakfast: { breakfast: 0.32, lunch: 0.30, dinner: 0.26, snacks: 0.12 },
  dinner: { breakfast: 0.20, lunch: 0.30, dinner: 0.38, snacks: 0.12 },
};
const dowOf = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();

/** The settings the plan engine reads, derived from the stored answers. Everything is optional: no answer means no rule. */
function deriveSettings(prefs = {}, ctx = {}) {
  const a = prefs.avoid || {};
  const diet = prefs.diet || ctx.inferredDiet || '';
  const dietCode = diet === 'nonveg' ? 'n' : diet === 'egg' ? 'e' : diet ? 'v' : null;     // vegan / jain / sattvic / veg all plan as vegetarian
  const f = (prefs.fasting && prefs.fasting.options) || [];
  const winId = f.find((x) => x.startsWith('window_'));
  const eatingOut = prefs.eatingOut && prefs.eatingOut.meals && prefs.eatingOut.meals.length ? prefs.eatingOut : null;
  const hh = prefs.household || { adults: 1, kids: 0, elders: 0 };
  const eq = (prefs.kitchen && prefs.kitchen.equipment) || [];
  const event = prefs.event && prefs.event.kind && prefs.event.kind !== 'none' && prefs.event.from ? { kind: prefs.event.kind, from: prefs.event.from, to: prefs.event.to || prefs.event.from } : null;
  return {
    diet: dietCode, dietMode: ['vegan', 'jain', 'sattvic'].includes(diet) ? diet : '',
    meals: (prefs.scope && prefs.scope.meals) || MEALS, days: (prefs.scope && prefs.scope.days) || ctx.days || 7,
    shares: SHARES[prefs.bigMeal] || SHARES.balanced,
    exclusions: { allergies: a.allergies || [], intolerances: a.intolerances || [], religious: a.religious || [], dislikes: a.dislikes || [] },
    loves: (prefs.loves || []).map((x) => x.toLowerCase()),
    cuisines: prefs.cuisines || [],
    cookMax: prefs.cookTime ? { breakfast: prefs.cookTime.breakfast, lunch: prefs.cookTime.lunch, dinner: prefs.cookTime.dinner, snacks: 10 } : null,
    skill: (prefs.kitchen && prefs.kitchen.skill) || '', equipment: eq, noStove: eq.includes('none'),
    portions: { adults: hh.adults, kids: hh.kids, elders: hh.elders, factor: Math.round((hh.adults + hh.kids * 0.5 + hh.elders * 0.8) * 100) / 100 },
    budget: prefs.budget || '',
    out: eatingOut ? { meals: eatingOut.meals, kind: eatingOut.kind, perWeek: eatingOut.perWeek } : null,
    proteinSources: (prefs.protein && prefs.protein.sources) || [],
    spice: prefs.spice || '', oil: prefs.oil || '',
    prep: prefs.prep || 'fresh',
    fasting: {
      window: winId ? { startH: WINDOWS[winId][0], endH: WINDOWS[winId][1] } : null,
      vratDays: f.filter((x) => VRAT_DOW[x] !== undefined).map((x) => VRAT_DOW[x]),
      ramadan: f.includes('ramadan') && prefs.ramadan && prefs.ramadan.from ? { from: prefs.ramadan.from, to: addDaysIso(prefs.ramadan.from, (prefs.ramadan.days || 30) - 1) } : null,
    },
    event,
    snackStyle: (prefs.snacks && prefs.snacks.style) || [], sweetPlan: (prefs.snacks && prefs.snacks.sweetPlan) || 'none',
    have: (prefs.have || []).map((x) => x.toLowerCase()),
    variety: prefs.variety || 'variety',
    feedback: prefs.feedback || [],
    preferLowGi: ((prefs.health && prefs.health.flags) || []).includes('diabetes'),
  };
}

/** Which of the day's meals are eaten outside (deterministic: weekdays first). */
function outMeals(settings, date) {
  if (!settings.out) return [];
  const dow = dowOf(date);
  const order = [1, 2, 3, 4, 5, 6, 0];                          // Mon..Sun
  const days = new Set(order.slice(0, Math.min(7, settings.out.perWeek)));
  return days.has(dow) ? settings.out.meals : [];
}

/** True when a date is a vrat (fasting-food) day, or inside Ramadan. */
const isVratDay = (settings, date) => settings.fasting.vratDays.includes(dowOf(date));
const isRamadanDay = (settings, date) => !!settings.fasting.ramadan && date >= settings.fasting.ramadan.from && date <= settings.fasting.ramadan.to;
const inEvent = (settings, date) => !!settings.event && date >= settings.event.from && date <= settings.event.to;
/** Meals skipped on a day because of fasting (eating window, Ramadan lunch). */
function fastedMeals(settings, date) {
  const out = new Set();
  const w = settings.fasting.window;
  if (w) for (const m of MEALS) { const h = mealClock[m]; if (h < w.startH || h > w.endH) out.add(m); }
  if (isRamadanDay(settings, date)) { out.add('lunch'); }
  return [...out];
}

// ---------------------------------------------------------------------------------------------------------------- safety
const MEDICAL = ['diabetes', 'bp', 'kidney', 'thyroid', 'pcos', 'other'];
/**
 * Pregnancy, under 18 and medical conditions: a short "check with a doctor or dietitian" note, and no aggressive targets (the plan is sized
 * for maintenance, never a deficit). Estimates in this app are for healthy adults.
 */
function planSafety(profile = {}, prefs = {}) {
  const flags = (prefs.health && prefs.health.flags) || [];
  const reasons = [];
  const age = Number(profile.age);
  if (Number.isFinite(age) && age > 0 && age < 18) reasons.push('under18');
  if (flags.includes('pregnant')) reasons.push('pregnant');
  if (flags.includes('breastfeeding')) reasons.push('breastfeeding');
  if (flags.some((x) => MEDICAL.includes(x))) reasons.push('medical');
  if (!reasons.length) return { flagged: false, reasons: [], note: '', maintenanceOnly: false };
  const who = reasons.includes('under18') ? 'Because you are under 18' : reasons.includes('pregnant') ? 'Because you are pregnant' : reasons.includes('breastfeeding') ? 'Because you are breastfeeding' : 'Because of your health condition';
  return {
    flagged: true, reasons, maintenanceOnly: true,
    note: `${who}, please check this plan with a doctor or dietitian before you change how you eat. The numbers here are general estimates for healthy adults, so I am keeping your plan at a steady, comfortable level instead of a calorie cut.`,
  };
}

const isSetupDone = (prefs) => !!(prefs && prefs.sensei && prefs.sensei.completedAt);

module.exports = {
  QUESTIONS, Q, MEALS, MAX_PER_SESSION, MAX_PER_UPDATE, SKIP_COOLDOWN_DAYS, DIET_OPTIONS, CUISINE_OPTIONS, PROTEIN_OPTIONS, FASTING_OPTIONS, HEALTH_OPTIONS, AVOID_IDS, SHARES, WINDOWS, VRAT_DOW,
  optionsFor, applyAnswer, usualFor, pickQuestions, followUp, markAnswered, summaryChips, deriveSettings, outMeals, isVratDay, isRamadanDay, inEvent, fastedMeals, planSafety, isSetupDone,
  ALLERGEN_LABELS, CUISINE_GROUPS,
};
