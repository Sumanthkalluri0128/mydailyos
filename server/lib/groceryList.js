// The grocery list for a plan. Pure (no database) so it can be tested.
//   merge         the same food is added up; a recipe is expanded into its ingredients and merged with the same ingredient elsewhere
//   already have  foods that match what the person said they have at home move to `alreadyHave` (not the buying list)
//   people        quantities scale for who eats: adults 1 portion, kids 0.5, elders 0.8 (estimates); `perPerson` keeps one portion
//   batches       a dish cooked once and eaten twice is simply the sum of its portions, so the pot is bought for once
const { norm } = require('./foodSafety');

const round1 = (x) => Math.round(x * 10) / 10;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The "already have" entry that matches a food name (whole word or plural: "paneer" matches "Paneer bhurji", "egg" matches "Boiled eggs"). */
function matchHave(name, haveList = []) {
  const n = norm(name);
  for (const h of haveList.map(norm).filter((x) => x.length >= 3)) if (new RegExp(`\\b${esc(h)}(?:e?s)?\\b`).test(n)) return h;
  return null;
}

/** portions = adults + 0.5 kids + 0.8 elders */
const portionFactor = ({ adults = 1, kids = 0, elders = 0 } = {}) => Math.round((adults + kids * 0.5 + elders * 0.8) * 100) / 100;

/**
 * @param items      planned rows { foodId, foodName, quantity, servingUnit, calories }
 * @param recipes    [{ foodId, servings, ingredients: [{ foodId, foodName, quantity, servingUnit }] }]
 * @param foodsById  Map(id -> Food) for serving sizes and household units
 */
function buildGroceryList({ items = [], recipes = [], foodsById = new Map(), have = [], factor = 1 }) {
  const recipeByFood = new Map(recipes.map((r) => [String(r.foodId), r]));
  const groups = new Map();
  const bump = (key, name, unit, qty, kcal, fromRecipe) => {
    const g = groups.get(key) || { foodId: key, name, unit, quantity: 0, calories: 0, times: 0, fromRecipe: false };
    g.quantity += qty; g.calories += kcal; g.times += 1; g.fromRecipe = g.fromRecipe || fromRecipe;
    groups.set(key, g);
  };
  for (const it of items) {
    const rec = recipeByFood.get(String(it.foodId));
    const f = foodsById.get(String(it.foodId));
    if (rec && rec.ingredients && rec.ingredients.length) {
      const servings = (Number(it.quantity) || 0) / (Number(f && f.servingSize) || 1);
      rec.ingredients.forEach((ing, idx) => bump(String(ing.foodId), ing.foodName || 'Ingredient', ing.servingUnit || 'g', (Number(ing.quantity) / Math.max(rec.servings || 1, 0.25)) * servings, idx === 0 ? Number(it.calories) || 0 : 0, true));
    } else bump(String(it.foodId), it.foodName, it.servingUnit, Number(it.quantity) || 0, Number(it.calories) || 0, false);
  }
  const all = [...groups.values()].map((g) => {
    const f = foodsById.get(g.foodId);
    const unit = ((f && f.units) || [])[0];
    const q = g.quantity * factor;
    return { ...g, perPerson: round1(g.quantity), quantity: round1(q), calories: Math.round(g.calories), approx: unit && unit.quantity ? { count: round1(q / unit.quantity), label: unit.label } : null, have: matchHave(g.name, have) };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return { items: all.filter((g) => !g.have), alreadyHave: all.filter((g) => g.have).map((g) => ({ ...g, haveAs: g.have })) };
}

// Aisles: plain keyword rules on the food name. Anything unrecognised goes to "Other" rather than being guessed.
const AISLES = [
  ['Vegetables', /\b(onion|tomato|potato|aloo|carrot|beans?|cabbage|cauliflower|gobi|brinjal|baingan|okra|bhindi|spinach|palak|methi|lauki|bottle gourd|tinda|karela|capsicum|peas|corn|cucumber|salad|sabzi|vegetable|veg|mushroom|beetroot|radish|pumpkin|drumstick|sprouts?)\b/],
  ['Fruit', /\b(apple|banana|orange|mango|papaya|grapes?|guava|pomegranate|watermelon|pineapple|pear|melon|fruit|berries|lemon|dates?|raisins?|chikoo)\b/],
  ['Dairy and eggs', /\b(milk|curd|dahi|yogh?urt|paneer|cheese|butter|ghee|cream|lassi|chaas|buttermilk|egg|eggs|omelette|anda)\b/],
  ['Meat and fish', /\b(chicken|mutton|lamb|fish|prawns?|shrimp|crab|keema|salmon|tuna|pomfret|rohu|seafood)\b/],
  ['Pulses and dal', /\b(dal|dhal|lentils?|rajma|chole|chana|chickpeas?|moong|toor|masoor|urad|beans|soya|soy chunks?)\b/],
  ['Grains and flour', /\b(rice|roti|chapati|phulka|paratha|atta|flour|maida|besan|rava|sooji|semolina|poha|oats?|daliya|bread|pav|pasta|noodles|idli|dosa|upma|khichdi|pulao|biryani|ragi|jowar|bajra|millet|cornflakes|muesli|quinoa)\b/],
  ['Oils, spices and sauces', /\b(oil|spices?|masala|salt|pepper|jeera|haldi|turmeric|chutney|sauce|ketchup|pickle|achar|vinegar|mustard)\b/],
  ['Snacks and sweets', /\b(biscuits?|cookies?|chips|namkeen|chivda|mixture|laddu|barfi|halwa|jalebi|chocolate|sweets?|cake|nuts?|almonds?|cashews?|peanuts?|walnuts?|makhana|bhel)\b/],
  ['Drinks', /\b(tea|chai|coffee|juice|shake|soda|cola|water|drink|protein powder|whey)\b/],
];
const aisleOf = (name) => { const n = norm(name); for (const [a, re] of AISLES) if (re.test(n)) return a; return 'Other'; };
const AISLE_ORDER = [...AISLES.map((a) => a[0]), 'Other'];

/** Items -> [{ aisle, items }] in shop-walking order, items A to Z inside each aisle. */
function groupByAisle(items = []) {
  const by = new Map();
  for (const it of items) { const a = aisleOf(it.name); if (!by.has(a)) by.set(a, []); by.get(a).push({ ...it, aisle: a }); }
  return AISLE_ORDER.filter((a) => by.has(a)).map((a) => ({ aisle: a, items: by.get(a).sort((x, y) => x.name.localeCompare(y.name)) }));
}

/** Plain text for WhatsApp / notes. `checked` = Set of item foodIds already ticked (left out). */
function shareText(list, { from = '', to = '', checked = new Set() } = {}) {
  const lines = [`Grocery list${from ? ` (${from}${to && to !== from ? ` to ${to}` : ''})` : ''}`];
  for (const g of groupByAisle(list.items || [])) {
    const rows = g.items.filter((i) => !checked.has(i.foodId));
    if (!rows.length) continue;
    lines.push('', g.aisle.toUpperCase());
    for (const i of rows) lines.push(`[ ] ${i.name}: ${i.quantity} ${i.unit}${i.approx ? ` (about ${i.approx.count} ${i.approx.label})` : ''}`);
  }
  if ((list.alreadyHave || []).length) lines.push('', `Already at home: ${list.alreadyHave.map((i) => i.name).join(', ')}`);
  return lines.join('\n');
}

module.exports = { buildGroceryList, matchHave, portionFactor, aisleOf, groupByAisle, shareText, AISLE_ORDER };
