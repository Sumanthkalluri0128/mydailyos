// FOOD TAGS: cuisine, diet, cook time, equipment, spice level, cost tier (plus allergens and "can be cooked in a batch").
//
// RULE (from the product brief): do not invent values. So a tag is only filled in when the food's NAME or its catalogue SECTION says
// it outright; everything else stays null and is listed in data/foodTags.gaps.csv for a person to fill in. Where each value came from is
// kept in `src` ('rule' = derived here, 'user' = from data/foodTags.overrides.json).
//
//   cuisine   from the catalogue section ("Telugu / Andhra / Telangana home food") or an explicit word in the name (Kerala, Chettinad,
//             Kolkata, Gujarati ...). Plain staples (roti, rice, dal, curd, fruit) are 'pan-indian'.
//   diet      'v' | 'e' | 'n' from the name (same words smartPlan.classify uses). Vegan / Jain / sattvic are judged by foodSafety.js.
//   cookMin   0 only when the food needs no cooking by definition (fruit, salad, curd, nuts, roasted snacks). Otherwise null.
//   equipment [] for the no-cook foods; explicit words only elsewhere (steamed, grilled, tandoori). Otherwise null.
//   spice     'hot' only for names that say so (chilli, Chettinad, Kolhapuri, 65 ...); 'mild' for bland basics. Otherwise null.
//   cost      'high' for clearly expensive ingredients (mutton, prawns, nuts ...), 'low' for everyday staples. Otherwise null.
//
// How the planner treats a null: it never blocks a food because a tag is missing (except for a hard rule such as "no stove", where an
// unknown food cannot be promised) and it never prints a number it does not have ("15-minute cook" only when cookMin is known).
const fs = require('fs');
const path = require('path');

const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const FIELDS = ['cuisine', 'diet', 'cookMin', 'equipment', 'spice', 'cost'];
const CUISINES = [
  'pan-indian', 'north-indian', 'punjabi', 'mughlai', 'gujarati', 'maharashtrian', 'rajasthani', 'bengali', 'east-indian', 'bihari-up', 'kashmiri', 'odia', 'assamese', 'goan',
  'south-indian', 'tamil', 'kerala', 'karnataka', 'telugu', 'hyderabadi', 'indo-chinese', 'western',
];
// What a person's choice in the app means in tag terms ("South Indian" = every southern tag)
const CUISINE_GROUPS = {
  north: ['north-indian', 'punjabi', 'mughlai', 'kashmiri', 'bihari-up'], punjabi: ['punjabi', 'north-indian'], gujarati: ['gujarati'], maharashtrian: ['maharashtrian'], rajasthani: ['rajasthani'],
  bengali: ['bengali', 'east-indian'], odia: ['odia', 'east-indian'], assamese: ['assamese', 'east-indian'], goan: ['goan'], kashmiri: ['kashmiri'],
  south: ['south-indian', 'tamil', 'kerala', 'karnataka', 'telugu', 'hyderabadi'], tamil: ['tamil', 'south-indian'], kerala: ['kerala', 'south-indian'], karnataka: ['karnataka', 'south-indian'],
  andhra: ['telugu', 'south-indian'], telangana: ['telugu', 'hyderabadi', 'south-indian'], hyderabadi: ['hyderabadi', 'telugu'], 'bihari-up': ['bihari-up', 'north-indian'], 'indo-chinese': ['indo-chinese'], western: ['western'],
};

// ---- name rules ---------------------------------------------------------------------------------------------------------
const NONVEG = /\b(chicken|mutton|lamb|fish|prawns?|shrimp|crab|keema|beef|pork|meat|tuna|salmon|sausage|bacon|kebabs?|kababs?|seekh|rohu|pomfret|surmai|hilsa|ilish|squid|ham|mackerel|sardine|bangda|bombil|karimeen|nihari|haleem|rogan josh|machher|jhinga|goat|gosht)\b/i;
const EGG = /\b(eggs?|omelette|omelet|anda|egg)\b/i;
const FRUIT = /\b(apple|banana|orange|mosambi|sweet lime|mango|papaya|guava|pears?|grapes?|watermelon|muskmelon|melon|pomegranate|berries|berry|strawberr\w*|kiwi|pineapple|chikoo|sapota|peach|plum|lychee|litchi|custard apple|sitaphal|fruit)\b/i;
const NOT_FRUIT = /\b(juice|shake|jam|cake|pie|ice ?cream|pudding|halwa|candy|chaat|smoothie|lassi|milkshake|barfi|kulfi|custard|sherbet|syrup|pickle|dal|pappu|curry|sabzi|rice|panna|aam|gravy|masala|chutney|raita|kheer|laddu)\b/i;
const NO_COOK = /\b(salad|cucumber|tomato|curd|dahi|buttermilk|chaas|greek yogurt|yogurt|yoghurt|almonds?|walnuts?|cashews?|pistachios?|peanuts|dates|raisins|makhana \(roasted\)|roasted chana|murmura|puffed rice|coconut water|sugarcane juice|trail mix|fruit chaat|sprouts salad|chickpea salad|raita|lassi)\b/i;
const NOT_NO_COOK = /\b(curry|masala|fry|fried|rice|cooked|boiled|roasted(?! chana)|biryani|tikka|kheer|halwa|paneer|chicken|egg|laddu|barfi|chutney|pickle|soup|stew|vada|puri|samosa|tikki|pakora|bonda|kadhi|sambar|rasam|upma|poha|dosa|idli|sabzi|bhaji|paratha|chilla|kofta|korma|pulao|khichdi|porridge|chai|payasam|dal|dhal|daal|pappu|tadka|gravy|bharta|thoran|poriyal|kootu|usal|fritters?|pori|bajji|bhurji|omelette|cutlet|tikka|kebab|sandwich|toast|pizza|burger|noodles|pasta|momos?|roll|wrap)\b/i;
const MILD = /\b(banana|apple|orange|papaya|guava|pears?|grapes?|watermelon|melon|mosambi|curd|dahi|yogurt|yoghurt|buttermilk|milk|boiled egg|boiled potato|white rice|phulka|roti|chapati|idli|porridge|oats|bread slice|cornflakes|muesli|daliya|almonds?|walnuts?|cashews?|dates)\b/i;
const HOT = /\b(chilli|chili|chettinad|kolhapuri|schezwan|szechuan|65|vindaloo|mirchi|spicy|achari|andhra|gongura|guntur|pepper fry|rogan josh|lollipop)\b/i;
const HIGH_COST = /\b(mutton|lamb|prawns?|crab|lobster|pomfret|hilsa|ilish|salmon|almonds?|cashews?|pistachios?|walnuts?|dry fruits?|badam|kaju|pista|kaju katli|haleem|nihari|rogan josh|mackerel|surmai|bhetki|karimeen)\b/i;
const LOW_COST = /\b(roti|chapati|phulka|white rice|jeera rice|khichdi|poha|upma|idli|plain dosa|sambar|rasam|toor dal|moong dal|masoor dal|chana dal|urad dal|dal tadka|boiled potato|banana|seasonal)\b/i;
const BATCH = /\b(dal|dhal|sambar|rajma|chole|chana masala|curry|kadhi|khichdi|pulao|pulav|stew|soup|sabzi|sabji|kootu|poriyal|rasam|bhaji|bharta|aloo gobi|matar|korma|keema)\b/i;
const NOT_BATCH = /\b(salad|fry|fried|dosa|omelette|roti|chapati|phulka|puri|paratha|idli|vada|pakora|bhajiya|tikka|kebab|chilla|cheela|uttapam|sandwich|toast)\b/i;

// explicit regional words in the name
const NAME_CUISINE = [
  [/\b(punjabi|amritsari|makki di roti|sarson ka saag|chole bhature|lachha paratha|dal makhani|kadhi pakora|missi roti|pinni|butter chicken|chicken tikka masala|rajma chawal)\b/, ['punjabi', 'north-indian']],
  [/\b(gujarati|dhokla|thepla|dhebra|khakhra|fafda|undhiyu|khandvi|handvo|ghari|sev tameta|dal dhokli)\b/, ['gujarati']],
  [/\b(maharashtrian|misal|pav bhaji|vada pav|puran poli|modak|karanji|zunka|pithla|bakarwadi|thalipeeth|kolhapuri|sabudana khichdi|sabudana vada|dabeli|usal|sheera|shrikhand|basundi)\b/, ['maharashtrian']],
  [/\b(bengali|kolkata|machher|jhol|hilsa|ilish|luchi|mishti|sandesh|jhal muri|shukto|posto|shorshe|kosha|rasgulla|rasmalai)\b/, ['bengali', 'east-indian']],
  [/\b(kerala|malabar|thalassery|nadan|karimeen|puttu|avial|idiyappam|appam|moilee|kerala parotta|palada)\b/, ['kerala', 'south-indian']],
  [/\b(tamil|chettinad|madurai|pongal|sundal|puliyogare|kuzhambu|kootu|poriyal|rasam sadam)\b/, ['tamil', 'south-indian']],
  [/\b(karnataka|mysore|udupi|mangalore|bisi bele|vangi bath|ragi mudde|ragi ambali|akki roti|neer dosa|davanagere|kosambari|bonda soup)\b/, ['karnataka', 'south-indian']],
  [/\b(andhra|telangana|telugu|gongura|pesarattu|pappu|pulusu|uggani|gutti vankaya|royyala|chepala|vankaya|natu kodi|pachi pulusu|kodi)\b/, ['telugu', 'south-indian']],
  [/\b(hyderabadi|haleem|double ka meetha|mirchi ka salan|bagara baingan|khubani)\b/, ['hyderabadi', 'telugu']],
  [/\b(goan|goa|xacuti|vindaloo|bebinca)\b/, ['goan']],
  [/\b(rajasthani|dal baati|baati|churma|gatte|ker sangri|laal maas|bajre ka|ghevar|mawa kachori)\b/, ['rajasthani']],
  [/\b(kashmiri|rogan josh|dum aloo kashmiri|yakhni|gushtaba)\b/, ['kashmiri']],
  [/\b(awadhi|lucknowi|litti chokha|sattu paratha|bihari|banarasi|tehri)\b/, ['bihari-up', 'north-indian']],
  [/\b(odia|dalma|pakhala|chhena poda)\b/, ['odia', 'east-indian']],
  [/\b(assamese|masor tenga|khar)\b/, ['assamese', 'east-indian']],
  [/\b(manchurian|hakka|chowmein|chow mein|schezwan|spring roll|momos?|chilli paneer|paneer chilli|gobi 65|veg fried rice|chicken fried rice|egg fried rice|triple schezwan)\b/, ['indo-chinese']],
  [/\b(pizza|burger|french fries|fries|pasta|sandwich|mcaloo|mcchicken|mcveggie|mcspicy|hot dog|cornflakes|muesli|cake|pastry|brownie|cheesecake|donut|doughnut|hummus|cookie)\b/, ['western']],
  [/\b(idli|dosa|dosai|uttapam|sambar|rasam|medu vada|vada sambar|upma|rava idli|podi|adai|curd rice|lemon rice|tomato rice|coconut rice|tamarind rice|filter coffee)\b/, ['south-indian']],
];
const SECTION_CUISINE = [
  [/telugu|andhra|telangana/i, ['telugu', 'south-indian']],
  [/north indian/i, ['north-indian']],
  [/bengali/i, ['bengali', 'east-indian']],
];
const PAN = /\b(roti|chapati|chapatti|phulka|white rice|brown rice|jeera rice|dal tadka|toor dal|moong dal|masoor dal|chana dal|urad dal|khichdi|curd|dahi|buttermilk|raita|salad|boiled egg|boiled potato|mixed vegetable|aloo gobi|aloo sabzi|bhindi|palak|paneer|chicken curry|egg curry|egg bhurji|sprouts|fruit|banana|apple|orange|mango|papaya|guava|watermelon|grapes|pomegranate|almonds|walnuts|cashews|milk|tea|chai|coffee|poha|daliya|besan chilla|moong dal chilla|paratha|plain paratha|aloo paratha|boiled chickpeas|tandoori chicken|chicken tikka)\b/;

const EXPLICIT_EQUIP = [
  [/\b(steamed)\b/, ['steamer']], [/\b(grilled|tandoori|tikka|kebab|kabab|seekh)\b/, ['oven or air fryer or grill']], [/\b(baked)\b/, ['oven']],
];

/** Tags that the NAME (and optionally the catalogue section) says outright. Anything not stated stays null. */
function deriveTags(name, section = '') {
  const t = norm(name);
  const src = {};
  const out = { cuisine: null, diet: null, cookMin: null, equipment: null, spice: null, cost: null, allergens: [], batchable: false, src };
  // diet
  out.diet = NONVEG.test(t) ? 'n' : EGG.test(t) && !/\b(paneer|eggplant)\b/.test(t) ? 'e' : 'v'; src.diet = 'rule';
  // cuisine: explicit words first, then the section, then universal staples
  let cu = null;
  for (const [re, tags] of NAME_CUISINE) if (re.test(t)) { cu = tags; break; }
  if (!cu) for (const [re, tags] of SECTION_CUISINE) if (re.test(section)) { cu = tags; break; }
  if (!cu && PAN.test(t)) cu = ['pan-indian'];
  if (cu) { out.cuisine = cu; src.cuisine = 'rule'; }
  // no-cook foods
  const fruit = FRUIT.test(t) && !NOT_FRUIT.test(t);
  if ((fruit || NO_COOK.test(t)) && !NOT_NO_COOK.test(t)) { out.cookMin = 0; out.equipment = []; src.cookMin = 'rule'; src.equipment = 'rule'; }
  if (out.equipment === null) for (const [re, eq] of EXPLICIT_EQUIP) if (re.test(t)) { out.equipment = eq; src.equipment = 'rule'; break; }
  // spice
  if (HOT.test(t)) { out.spice = 'hot'; src.spice = 'rule'; } else if (MILD.test(t) && !NOT_NO_COOK.test(t.replace(/\b(boiled|roasted)\b/g, ''))) { out.spice = 'mild'; src.spice = 'rule'; }
  // cost
  if (HIGH_COST.test(t)) { out.cost = 'high'; src.cost = 'rule'; } else if (LOW_COST.test(t) && !NONVEG.test(t)) { out.cost = 'low'; src.cost = 'rule'; }
  out.batchable = BATCH.test(t) && !NOT_BATCH.test(t);
  return out;
}

// ---- stored data ----------------------------------------------------------------------------------------------------------
const DATA_DIR = path.join(__dirname, '..', 'data');
const readJson = (f, fallback) => { try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')); } catch { return fallback; } };
let GENERATED = null, OVERRIDES = null;
const generated = () => (GENERATED ||= readJson('foodTags.json', { tags: {} }).tags || {});
const overrides = () => (OVERRIDES ||= readJson('foodTags.overrides.json', {}));
const reloadTags = () => { GENERATED = null; OVERRIDES = null; };

const CLEAN = {
  cuisine: (v) => { const a = (Array.isArray(v) ? v : String(v || '').split(/[,;|]/)).map((x) => norm(x).replace(/ /g, '-')).filter((x) => CUISINES.includes(x)); return a.length ? a : null; },
  diet: (v) => (['v', 'e', 'n'].includes(String(v).toLowerCase()) ? String(v).toLowerCase() : null),
  cookMin: (v) => { const n = Number(v); return v === '' || v === null || v === undefined || !Number.isFinite(n) || n < 0 || n > 240 ? null : Math.round(n); },
  equipment: (v) => { if (v === null || v === undefined || v === '') return null; const a = (Array.isArray(v) ? v : String(v).split(/[,;|]/)).map((x) => String(x).trim().toLowerCase()).filter(Boolean); return a; },
  spice: (v) => (['mild', 'medium', 'hot'].includes(String(v).toLowerCase()) ? String(v).toLowerCase() : null),
  cost: (v) => (['low', 'mid', 'high'].includes(String(v).toLowerCase()) ? String(v).toLowerCase() : null),
};

/** Merged tags for a food name: person's overrides > generated file > rules. Missing = null (never a guess). */
function tagsFor(name, section = '') {
  const key = norm(name);
  const base = generated()[key] ? { ...deriveTags(name, section), ...generated()[key] } : deriveTags(name, section);
  const ov = overrides()[key];
  const src = { ...(base.src || {}) };
  const out = { ...base, src };
  if (ov && typeof ov === 'object') {
    for (const f of FIELDS) { if (ov[f] === undefined || ov[f] === '') continue; const c = CLEAN[f](ov[f]); if (c !== null) { out[f] = c; src[f] = 'user'; } }
    if (Array.isArray(ov.allergens)) out.allergens = ov.allergens;
    if (typeof ov.batchable === 'boolean') out.batchable = ov.batchable;
  }
  return out;
}

/** True when this food fits any of the chosen cuisines (a choice such as 'south' covers every southern tag). null = unknown. */
function cuisineMatch(tags, chosen = []) {
  if (!chosen.length) return null;
  if (!tags.cuisine) return null;
  const want = new Set(chosen.flatMap((c) => CUISINE_GROUPS[c] || [c]));
  if (tags.cuisine.includes('pan-indian')) return true;
  return tags.cuisine.some((c) => want.has(c));
}

/** Fields still empty for a food (what the gaps file lists). */
const missingFields = (tags) => ['cuisine', 'cookMin', 'equipment', 'spice', 'cost'].filter((f) => tags[f] === null || tags[f] === undefined);

module.exports = { deriveTags, tagsFor, cuisineMatch, missingFields, reloadTags, norm, FIELDS, CUISINES, CUISINE_GROUPS, CLEAN, DATA_DIR };
