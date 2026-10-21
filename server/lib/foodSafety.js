// FOOD SAFETY FILTER. One place decides whether a food may ever be shown to a person who avoids something.
//
//   allergy       (peanut, tree nut, milk, egg, gluten, soy, fish, shellfish, sesame, mustard)
//                 name match  +  "often made with" match (poha and peanuts, korma and cashews ...). Strict: both are blocked.
//   intolerance   (lactose, gluten sensitivity) name match only; lactose blocks high-lactose foods, not curd, paneer or ghee
//                 (say so in the app and let the person add those under "foods I avoid" if they bother them too)
//   religious     (beef, pork, no onion / garlic)
//   dislike       free text ("karela", "mushroom") with common spellings (brinjal = baingan = eggplant)
//   diet mode     vegan, jain, sattvic on top of the veg / egg / non-veg choice (see smartPlan buildPool for v / e / n)
//
// A food is only ever judged by what we can SEE: its name, the ingredient names of a recipe, and allergen tags the person
// filled in (server/data/foodTags.overrides.json). When a dish is commonly made with an allergen we treat it as unsafe.
// This is a planning aid, not a medical device: the app says so, and the person still reads labels.
//
// Used by: smartPlan.buildPool, autoPlan.buildAutoPlan, mealBuilder, healthyDiet, suggestions, swaps, templates, assistant and the
// manual "add to plan" route. The test suite plans many weeks for every allergen and asserts that nothing leaks.

const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

const GF_GRAIN = /\b(jowar|bajra|ragi|nachni|makki|akki|rice|sorghum|millet|buckwheat|kuttu|singhara|amaranth|rajgira|besan|corn|sabudana|samak)\b/;
const WHEAT_STRONG = /\b(wheat|atta|maida|bread|pav|bun|toast|pizza|pasta|noodles|chowmein|hakka|maggi|semolina|suji|sooji|rava|rawa|couscous|vermicelli|semiya|sevai|seviyan|biscuit|cookie|cake|pastry|barley|rye|seitan|burger|momos?|dumplings?|puff|samosa|kachori|manchurian|spring roll|naan|kulcha|bhatura|bhature|rumali|khakhra|thepla|mathri|fafda|bakarwadi|muesli|cornflakes|oats?|jalebi|gulab jamun|balushahi|malpua|ghevar|daliya|dalia|halwa|sheera|kesari|dabeli|papdi|golgappa|pani puri|puchka|kathi roll)\b/;
const WHEAT_WEAK = /\b(roti|rotis|chapati|chapatti|phulka|paratha|parantha|puri|poori|dhebra|sandwich|roll|wrap)\b/;
const glutenName = (t) => WHEAT_STRONG.test(t) || (WHEAT_WEAK.test(t) && !GF_GRAIN.test(t));

const MILK_BUTTER = /(?<!peanut )(?<!nut )(?<!cocoa )(?<!shea )butter(?!fly)/;
const MILK_MILK = /(?<!coconut )(?<!almond )(?<!soy )(?<!soya )(?<!oat )(?<!rice )(?<!cashew )milk/;
const milkName = (t) => MILK_MILK.test(t) || MILK_BUTTER.test(t)
  || /\b(dahi|curd|yogh?urt|paneer|cheese|ghee|cream|malai|khoa|khoya|mawa|lassi|chaas|chhaas|chaach|raita|kheer|rabri|basundi|kulfi|ice cream|whey|casein|shrikhand|mishti doi|rasmalai|rasgulla|sandesh|peda|burfi|barfi|kadhi|cottage|makhani|shahi|korma|tikka masala|cheesecake|custard(?! apple)|milkshake|phirni|payasam)\b/.test(t);

const DEFS = {
  peanut: {
    label: 'peanuts', name: (t) => /\b(peanuts?|groundnuts?|moongfali|mungfali|singdana|shengdana|chikki)\b/.test(t),
    may: (t) => /\b(poha|chivda|mixture|namkeen|bhel|sabudana|jhal muri|trail mix|kosambari|satay|sundal|energy bar|protein bar|granola)\b/.test(t) && 'often made with peanuts',
  },
  tree_nut: {
    label: 'tree nuts', name: (t) => /\b(almonds?|badam|cashews?|kaju|walnuts?|akhrot|pistachios?|pista|hazelnuts?|pecans?|macadamia|marzipan|nutella|dry fruits?|mixed nuts|trail mix)\b/.test(t) || /(?<!fox )(?<!pea)(?<!ground)\bnuts?\b/.test(t),
    may: (t) => /\b(korma|shahi|kofta|kheer|payasam|barfi|burfi|halwa|laddu|ladoo|pak|katli|pinni|rabri|basundi|kulfi|falooda|kashmiri pulao|phirni|sheer khurma|double ka meetha|granola|muesli|energy bar|protein bar|butter chicken|paneer butter masala|makhani)\b/.test(t) && 'often made with cashew or almond',
  },
  milk: {
    label: 'milk and dairy', name: milkName,
    may: (t) => /\b(paratha|parantha|naan|kulcha|bhatura|bhature|pav bhaji|bun maska|dal tadka|dal fry|pongal|ghee rice|sheera|halwa|laddu|ladoo|biryani|pulao|pulav|bread|pav|pizza|burger|cake|pastry|biscuit|cookie|chocolate|dabeli|vada pav|milk bread)\b/.test(t) && 'often made with ghee, butter or milk',
  },
  egg: {
    label: 'eggs', name: (t) => /\b(eggs?|omelette|omelet|anda|mayonnaise|mayo)\b/.test(t),
    may: (t) => /\b(cake|pastry|brownie|cookie|custard(?! apple)|pancake|waffle|muffin|donut|doughnut|cheesecake|egg roll|brioche|meringue|souffle)\b/.test(t) && 'often made with egg',
  },
  gluten: {
    label: 'gluten (wheat, barley, rye)', name: glutenName,
    may: (t) => /\b(pani puri|sev puri|dahi puri|papdi|dabeli|vada pav|misal pav|pav bhaji|dumpling|soy sauce|schezwan|chilli paneer|paneer chilli|gobi 65|chicken 65|lollipop|bread pakora|protein bar|beer|malt)\b/.test(t) && 'often made with wheat flour or wheat-based sauce',
  },
  soy: {
    label: 'soy', name: (t) => /\b(soya?|soybeans?|tofu|tempeh|edamame|soy sauce|nutrela|meal maker|miso)\b/.test(t),
    may: (t) => /\b(manchurian|hakka|chowmein|schezwan|chilli paneer|paneer chilli|fried rice|protein bar|protein powder|veg spring roll|momos?)\b/.test(t) && 'often made with soy sauce',
  },
  fish: {
    label: 'fish', name: (t) => /\b(fish|rohu|pomfret|surmai|hilsa|ilish|bangda|mackerel|sardine|tuna|salmon|bombay duck|bombil|kingfish|basa|tilapia|anchov\w*|machher|machli|meen|karimeen|bhetki|katla)\b/.test(t),
    may: (t) => /\b(worcestershire|caesar|fish sauce|thai curry)\b/.test(t) && 'often made with fish',
  },
  shellfish: {
    label: 'shellfish', name: (t) => /\b(prawns?|shrimps?|crabs?|lobster|squid|calamari|oysters?|mussels?|clams?|shellfish|jhinga|kekda)\b/.test(t),
    may: () => false,
  },
  sesame: {
    label: 'sesame', name: (t) => /\b(sesame|til|gingelly|tahini|gajak|rewri|hummus)\b/.test(t),
    may: (t) => /\b(burger|bagel|chikki|granola|energy bar|namkeen|mixture)\b/.test(t) && 'often topped or made with sesame',
  },
  mustard: {
    label: 'mustard', name: (t) => /\b(mustard|sarson|sarso|shorshe|rai|kasundi)\b/.test(t),
    may: (t) => /\b(sambar|rasam|poriyal|thoran|kootu|upma|avial|lemon rice|curd rice|puliyogare|tomato rice|tamarind rice|coconut rice|vangi bath|bisi bele bath|pickle|achar|khandvi|kadhi|undhiyu|machher jhol|mango rice|pongal|sundal|pappu)\b/.test(t) && 'often tempered with mustard seeds',
  },
};

const INTOLERANCE = {
  lactose: {
    label: 'lactose',
    name: (t) => MILK_MILK.test(t) || /\b(cream|malai|khoa|khoya|mawa|kheer|rabri|basundi|kulfi|ice cream|milkshake|shrikhand|rasmalai|peda|burfi|barfi|phirni|payasam|custard(?! apple)|lassi|whey|cheesecake|falooda|makhani|shahi|korma)\b/.test(t),
  },
  gluten: { label: 'gluten', name: glutenName },
};

const RELIGIOUS = {
  beef: { label: 'beef', name: (t) => /\b(beef|veal|steak|buff|buffalo|ox)\b/.test(t) },
  pork: { label: 'pork', name: (t) => /\b(pork|bacon|ham|sausages?|salami|lard|pig|pepperoni)\b/.test(t) },
  no_onion_garlic: { label: 'onion and garlic', name: (t) => /\b(onions?|pyaz|pyaaz|kanda|garlic|lehsun|lasun|do pyaza|hing no)\b/.test(t) },
};

// Jain and sattvic eating, judged by what the dish NAME says. Dishes that are normally made with onion or garlic but do not say so
// (a dal tadka, a masala) stay in; the plan tells the person to cook them without (see cookNote).
const JAIN_NO = /\b(onions?|pyaz|pyaaz|kanda|garlic|lehsun|lasun|potato|potatoes|aloo|batata|carrot|gajar|radish|mooli|beet|beetroot|ginger|adrak|sweet potato|shakarkand|yam|suran|jimikand|turnip|shalgam|arbi|arvi|colocasia|mushroom|do pyaza|tapioca|vada pav|pav bhaji|samosa|chaat)\b/;
const SATTVIC_NO = /\b(onions?|pyaz|pyaaz|kanda|garlic|lehsun|lasun|do pyaza|mushroom|vada pav|pav bhaji|chaat|momos?|manchurian|maggi|instant noodles|chips|cola|soda|coffee|energy drink|alcohol|beer|wine)\b/;
const AMBIGUOUS_ONION_GARLIC = /\b(masala|tadka|fry|curry|gravy|korma|makhani|kadai|kofta|jalfrezi|biryani|pulao|pulav|sambar|rasam|dal|chole|rajma|sabzi|sabji)\b/;
const DAIRY_VEGAN = (t) => milkName(t) || /\b(honey|shehad|mishti)\b/.test(t);
const VEGAN_MAY = /\b(paratha|parantha|naan|kulcha|bhatura|bhature|pav bhaji|bun maska|ghee rice|pongal|sheera|halwa|laddu|ladoo|sandesh|cake|pastry|biscuit|chocolate|bread|pav|pizza|burger|dabeli)\b/;

// common spellings, so "brinjal" also blocks baingan and eggplant
const SYNONYMS = [
  ['baingan', 'brinjal', 'eggplant', 'aubergine', 'bharta', 'vankaya', 'vangi', 'gutti vankaya', 'bagara baingan'],
  ['bhindi', 'okra', 'ladyfinger', 'ladys finger', 'lady finger'],
  ['lauki', 'doodhi', 'dudhi', 'bottle gourd', 'ghia'],
  ['karela', 'bitter gourd', 'bitter melon', 'kakarakaya'],
  ['turai', 'tori', 'ridge gourd', 'peerkangai'],
  ['tinda', 'apple gourd', 'round gourd'],
  ['kaddu', 'pumpkin', 'bhopla'],
  ['palak', 'spinach'],
  ['methi', 'fenugreek'],
  ['gobi', 'cauliflower', 'phool gobi'],
  ['cabbage', 'patta gobi', 'band gobi'],
  ['paneer', 'cottage cheese'],
  ['mushroom', 'khumb', 'khumbi'],
  ['capsicum', 'bell pepper', 'shimla mirch'],
  ['beetroot', 'beet', 'chukandar'],
  ['jackfruit', 'kathal', 'chakka'],
  ['raw banana', 'kela', 'plantain'],
  ['sprouts', 'sprouted'],
  ['curd', 'dahi', 'yogurt', 'yoghurt'],
  ['coriander', 'dhania', 'cilantro'],
  ['egg', 'eggs', 'anda'],
  ['chicken', 'murgh'],
  ['mutton', 'lamb', 'goat', 'gosht'],
  ['fish', 'machli', 'meen', 'machher'],
  ['coconut', 'nariyal', 'thengai'],
  ['soya', 'soy', 'soybean', 'nutrela', 'meal maker'],
  ['oats', 'oat', 'oatmeal'],
  ['upma', 'uppittu', 'uppumavu'],
  ['poha', 'aval', 'chivda'],
];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const stem = (w) => w.replace(/(ies)$/, 'y').replace(/(es|s)$/, '');

/** A regexp that matches a free-text dislike (and its spellings) as whole words in a normalised food name. */
function dislikeRegex(text) {
  const t = norm(text);
  if (t.length < 2) return null;
  const words = new Set([t]);
  for (const group of SYNONYMS) if (group.some((g) => norm(g) === t || stem(norm(g)) === stem(t))) group.forEach((g) => words.add(norm(g)));
  const parts = [...words].map((w) => w.split(' ').map((x) => `${esc(stem(x))}(?:e?s)?`).join(' '));
  return new RegExp(`\\b(?:${parts.join('|')})\\b`);
}

const ALLERGY_IDS = Object.keys(DEFS);
const INTOLERANCE_IDS = Object.keys(INTOLERANCE);
const RELIGIOUS_IDS = Object.keys(RELIGIOUS);
const DIET_MODES = ['vegan', 'jain', 'sattvic'];

/**
 * @param spec { allergies: [id], intolerances: [id], religious: [id], dislikes: [text], dietMode: 'vegan'|'jain'|'sattvic'|'' }
 * @returns { empty, test(foodOrName, extra?) -> null | { id, kind, reason }, ok(food), keep(list, getName?), mayNote(name) }
 *   extra: { ingredients: [names], tagAllergens: [ids] }   (a food object may also carry .ingredients / .tags.allergens)
 */
function makeExcluder(spec = {}) {
  const allergies = (spec.allergies || []).filter((x) => DEFS[x]);
  const intol = (spec.intolerances || []).filter((x) => INTOLERANCE[x]);
  const relig = (spec.religious || []).filter((x) => RELIGIOUS[x]);
  const dislikes = (spec.dislikes || []).map((d) => ({ text: String(d).trim(), re: dislikeRegex(d) })).filter((d) => d.re);
  const mode = DIET_MODES.includes(spec.dietMode) ? spec.dietMode : '';
  const empty = !allergies.length && !intol.length && !relig.length && !dislikes.length && !mode;

  const judge = (t, loose) => {
    for (const id of allergies) {
      const d = DEFS[id];
      if (d.name(t)) return { id, kind: 'allergy', reason: `contains ${d.label}` };
      const m = d.may(t);
      if (m) return { id, kind: 'allergy', reason: `${m} (${d.label})` };
    }
    for (const id of intol) if (INTOLERANCE[id].name(t)) return { id, kind: 'intolerance', reason: `contains ${INTOLERANCE[id].label}` };
    for (const id of relig) if (RELIGIOUS[id].name(t)) return { id, kind: 'religious', reason: `has ${RELIGIOUS[id].label}` };
    if (mode === 'vegan') { if (DAIRY_VEGAN(t)) return { id: 'vegan', kind: 'diet', reason: 'has dairy or honey' }; if (VEGAN_MAY.test(t)) return { id: 'vegan', kind: 'diet', reason: 'often made with ghee, butter or milk' }; }
    if (mode === 'jain' && JAIN_NO.test(t)) return { id: 'jain', kind: 'diet', reason: 'has onion, garlic or a root vegetable' };
    if (mode === 'sattvic' && SATTVIC_NO.test(t)) return { id: 'sattvic', kind: 'diet', reason: 'has onion, garlic or an excluded ingredient' };
    for (const d of dislikes) if (d.re.test(t)) return { id: d.text, kind: 'dislike', reason: `you do not like ${d.text}` };
    return null;
  };

  const test = (food, extra = {}) => {
    if (empty && !extra.tagAllergens && !(food && food.tags && food.tags.allergens)) return null;
    const name = typeof food === 'string' ? food : food?.name || food?.foodName || '';
    const ingredients = extra.ingredients || (food && food.ingredients) || [];
    const hit = judge(norm(name));
    if (hit) return hit;
    for (const ing of ingredients) { const h = judge(norm(ing)); if (h) return { ...h, reason: `${h.reason} (ingredient: ${ing})` }; }
    const tagA = extra.tagAllergens || food?.tags?.allergens || [];
    for (const id of tagA) if (allergies.includes(id) || intol.includes(id)) return { id, kind: 'allergy', reason: `tagged as containing ${DEFS[id]?.label || id}` };
    return null;
  };
  const ok = (food, extra) => !test(food, extra);
  const keep = (list, getName = (f) => f.name, extraOf) => (empty && !extraOf ? list : list.filter((f) => !test(getName(f), extraOf ? extraOf(f) : { ingredients: f && f.ingredients })));
  /** A short reminder for Jain / sattvic dishes whose usual recipe has onion or garlic. */
  const cookNote = (name) => ((mode === 'jain' || mode === 'sattvic') && AMBIGUOUS_ONION_GARLIC.test(norm(name)) ? `cook it without onion and garlic${mode === 'jain' ? ', no root vegetables' : ''}` : '');
  return { empty, test, ok, keep, cookNote, spec: { allergies, intolerances: intol, religious: relig, dislikes: dislikes.map((d) => d.text), dietMode: mode } };
}

/** Builds the excluder from a stored FoodPreference document / plain object. */
function excluderFromPrefs(prefs) {
  const a = (prefs && prefs.avoid) || {};
  return makeExcluder({
    allergies: a.allergies, intolerances: a.intolerances, religious: a.religious, dislikes: a.dislikes,
    dietMode: ['vegan', 'jain', 'sattvic'].includes(prefs?.diet) ? prefs.diet : '',
  });
}

/** Every allergen a dish name (or a recipe's ingredient names) points to: { contains: [ids], may: [ids] }. For labels such as "contains milk, gluten". */
function allergensOf(names) {
  const list = Array.isArray(names) ? names : [names];
  const contains = new Set(), may = new Set();
  for (const raw of list) {
    const t = norm(raw);
    for (const id of ALLERGY_IDS) { if (DEFS[id].name(t)) contains.add(id); else if (DEFS[id].may(t)) may.add(id); }
  }
  return { contains: [...contains], may: [...may].filter((id) => !contains.has(id)) };
}

/** The last gate before anything is shown or saved. Returns the items that are NOT safe (an empty list means all clear). */
function findViolations(items, excluder, getName = (i) => i.foodName || i.name) {
  if (!excluder || excluder.empty) return [];
  const bad = [];
  for (const it of items) { const hit = excluder.test(getName(it), { ingredients: it.ingredients, tagAllergens: it.allergens }); if (hit && hit.kind !== 'dislike') bad.push({ item: it, ...hit }); }
  return bad;
}

module.exports = { allergensOf, makeExcluder, excluderFromPrefs, findViolations, dislikeRegex, norm, ALLERGY_IDS, INTOLERANCE_IDS, RELIGIOUS_IDS, DIET_MODES, ALLERGEN_LABELS: Object.fromEntries(ALLERGY_IDS.map((k) => [k, DEFS[k].label])), DEFS, JAIN_NO, SATTVIC_NO, SYNONYMS };
