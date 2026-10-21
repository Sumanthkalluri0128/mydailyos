// PLAN RULES. Turns the person's setup (lib/planQuestions.deriveSettings), the food tags and the food-safety filter into two decisions the
// planner asks about every candidate food:
//
//   poolOk(c)            may this food EVER appear for this person?  (allergens, diet mode, dislikes, no-stove kitchens, low budget, mild spice,
//                        foods marked "not available")  A "no" here is final: it applies to plans, swaps, add-ons and suggestions alike.
//   okFor(c, ctx)        may it appear in THIS meal on THIS day?     (cook time, vrat day, travel day)
//   bonus(c, s, ctx)     how much do we like it right now?           (cuisine, loved foods, ingredients at home, protein sources, feedback)
//                        together with the short reasons that become "Why this plate?".
//
// Missing tags never block a food (we do not guess), except where a rule cannot be promised without the tag (a "no stove" kitchen).
const T = require('./foodTags');
const { norm } = require('./foodSafety');
const Q = require('./planQuestions');

const NA_DAYS = 28;
const DAY = 86400000;

const VRAT_OK = /\b(sabudana|sago|kuttu|buckwheat|singhara|water chestnut|makhana|fox nuts?|samak|samvat|barnyard|rajgira|amaranth|sweet potato|shakarkand|potato|aloo|banana|apple|fruit|papaya|pomegranate|orange|grapes|melon|watermelon|mosambi|milk|curd|dahi|yogurt|yoghurt|buttermilk|chaas|lassi|paneer|almonds?|walnuts?|cashews?|pistachios?|peanuts?|dates|raisins|coconut|lauki|bottle gourd|pumpkin|kaddu|cucumber|tomato)\b/;
const VRAT_NO = /\b(wheat|atta|maida|rice|dal|rajma|chole|chana|egg|eggs|chicken|fish|mutton|onion|garlic|bread|roti|chapati|phulka|paratha|poha|upma|idli|dosa|biryani|noodles|pasta)\b/;
const VRAT_FORCE = /\b(samak|kuttu|singhara|rajgira|sabudana|sago)\b/;
const PORTABLE = /\b(thepla|khakhra|fruit|apple|banana|orange|nuts|almonds?|walnuts?|cashews?|roasted chana|makhana|boiled eggs?|sprouts|dry fruits?|dates|energy|sandwich|paratha|murmura|puffed rice|chikki|mathri|dhokla|bread|biscuit|cutlet)\b/;
const SWEET = /\b(halwa|laddu|ladoo|barfi|burfi|jalebi|gulab jamun|rasgulla|kheer|payasam|sandesh|peda|mishti|shrikhand|rabri|basundi|kulfi|ice cream|chikki|gajak|mysore pak|kaju katli|rasmalai|malpua|modak|puran poli|sheera|kesari|gud|jaggery|dark chocolate|chocolate)\b/;
const FRIED = /\b(fried|deep fried|pakora|pakoda|bhajiya|puri|poori|bhatura|samosa|kachori|vada|bonda|jalebi|fries|tikki)\b/;
const REFINED = /\b(maida|white bread|naan|kulcha|bhatura|white rice|noodles|pasta|biscuit|cake|pastry)\b/;

const SOURCE_RE = [
  ['dal', /\b(dal|dhal|daal|sambar|moong|lentils?|pappu|rasam)\b/], ['legumes', /\b(rajma|chole|chhole|chana|chickpeas?|lobia|sprouts?)\b/], ['paneer', /\bpaneer\b/], ['curd', /\b(curd|dahi|yogh?urt|raita|buttermilk|chaas|lassi)\b/],
  ['soy', /\b(soya?|tofu|nutrela)\b/], ['egg', /\b(eggs?|omelette|omelet|bhurji)\b/], ['chicken', /\b(chicken|tikka|tandoori)\b/], ['fish', /\b(fish|rohu|pomfret|surmai|hilsa|prawns?)\b/],
];
const sourceOf = (name) => { const t = norm(name); const hit = SOURCE_RE.find(([, re]) => re.test(t)); return hit ? hit[0] : ''; };

const OWNED_ALIASES = { grill: ['oven', 'air fryer'], 'oven or air fryer or grill': ['oven', 'air fryer'], tawa: ['stove'], kadai: ['stove'], steamer: ['steamer', 'pressure cooker'] };
function equipmentOk(tagEq, settings) {
  if (tagEq === null || tagEq === undefined) return null;                  // unknown
  if (!tagEq.length) return true;                                         // needs nothing
  const owned = new Set(settings.equipment || []);
  if (!owned.size) return true;                                           // the person has not said: assume a normal kitchen
  if (settings.noStove) return tagEq.every((e) => ['microwave', 'kettle', 'none', 'toaster', 'blender'].includes(e) && (e !== 'microwave' || owned.has('microwave')) && (e !== 'blender' || owned.has('blender')));
  return tagEq.every((e) => e.split(' or ').some((alt) => { const a = alt.trim(); return owned.has(a) || (OWNED_ALIASES[a] || []).some((x) => owned.has(x)) || (a === 'stove'); }));
}

function createRules({ settings, excluder, tagsFor = T.tagsFor, now = Date.now(), today = '' } = {}) {
  const st = settings || null;
  const ex = excluder && !excluder.empty ? excluder : null;
  const active = !!(st || ex);
  const cache = new Map();
  const tagsOf = (c) => { let t = cache.get(c.key); if (!t) { t = tagsFor(c.name); cache.set(c.key, t); } return t; };
  const fb = new Map(((st && st.feedback) || []).map((f) => [f.key, f]));
  const fbOf = (c) => fb.get(norm(c.name)) || null;
  const naActive = (f) => f && f.na > 0 && f.at && now - Date.parse(f.at) < NA_DAYS * DAY;
  const haveTerms = ((st && st.have) || []).map((h) => norm(h)).filter((h) => h.length >= 3);
  const loveTerms = ((st && st.loves) || []).map((h) => norm(h)).filter((h) => h.length >= 3);
  const chosenSources = new Set((st && st.proteinSources) || []);
  const hasHave = (c) => { const n = norm(c.name); return haveTerms.find((h) => new RegExp(`\\b${h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(n)) || null; };
  const isLoved = (c) => { const n = norm(c.name); return loveTerms.some((l) => n.includes(l) || l.includes(n)); };

  /** Final yes/no for a food, whatever the meal. */
  function poolOk(c) {
    if (!active) return true;
    if (ex && ex.test(c.doc || c.name, { ingredients: c.doc && c.doc.ingredients })) return false;
    if (!st) return true;
    const tg = tagsOf(c);
    if (st.noStove || (st.equipment && st.equipment.length)) { const ok = equipmentOk(tg.equipment, st); if (ok === false) return false; if (ok === null && st.noStove && tg.cookMin !== 0) return false; }
    if (st.budget === 'low' && tg.cost === 'high') return false;
    if (st.spice === 'mild' && tg.spice === 'hot') return false;
    if (naActive(fbOf(c))) return false;
    return true;
  }

  const clockMeal = (m) => m;
  /** May this food be in this meal on this day? */
  function okFor(c, { meal, date }) {
    if (!st) return true;
    const tg = tagsOf(c);
    const cap = st.cookMax && st.cookMax[clockMeal(meal)];
    if (cap && tg.cookMin !== null && tg.cookMin > cap && !c.leftover) return false;
    const n = norm(c.name);
    if (Q.isVratDay(st, date) && !(VRAT_FORCE.test(n) || (VRAT_OK.test(n) && !VRAT_NO.test(n)))) return false;
    if (st.event && st.event.kind === 'travel' && Q.inEvent(st, date) && !(tg.cookMin === 0 || PORTABLE.test(n))) return false;
    return true;
  }

  /** Extra score and the reasons that explain it. Reasons are in priority order. */
  function bonus(c, s, { meal, role, date, goalProtein = 0, leftover = false } = {}) {
    const out = { sc: 0, reasons: [] };
    if (!st) return out;
    const tg = tagsOf(c);
    const n = norm(c.name);
    const f = fbOf(c);
    if (f) {
      if (f.loved) { out.sc += Math.min(1.6, 0.8 * f.loved); out.reasons.push({ p: 3, t: 'you marked this as a favourite' }); }
      if (f.heavy) out.sc -= Math.min(1.6, 0.8 * f.heavy) + (c.per.calories > 300 ? 0.3 : 0);
      if (f.long && (tg.cookMin === null || tg.cookMin >= 20)) out.sc -= Math.min(1.8, 0.9 * f.long);
    }
    const h = hasHave(c);
    if (h) { out.sc += 0.9; out.reasons.push({ p: 1, t: `uses the ${h} you already have` }); }
    if (isLoved(c)) { out.sc += 1.4; out.reasons.push({ p: 2, t: 'one of the foods you love' }); }
    const cm = T.cuisineMatch(tg, st.cuisines);
    if (cm === true && !(tg.cuisine || []).includes('pan-indian')) { out.sc += 0.9; out.reasons.push({ p: 6, t: 'fits the cuisine you like' }); }
    else if (cm === true) out.sc += 0.3;
    else if (cm === false) out.sc -= 0.5;
    if (chosenSources.size && (role === 'protein' || role === 'dairy' || role === 'snack')) { const src = sourceOf(c.name); if (src && chosenSources.has(src)) { out.sc += 0.8; out.reasons.push({ p: 5, t: `a ${({ dal: 'dal', legumes: 'rajma / chana', paneer: 'paneer', curd: 'curd', soy: 'soy', egg: 'egg', chicken: 'chicken', fish: 'fish' })[src]} dish, as you like` }); } else if (src) out.sc -= 0.3; }
    if (tg.spice === 'hot') out.sc += st.spice === 'hot' ? 0.3 : st.spice === 'medium' ? -0.5 : 0;
    if (st.oil === 'light' && (FRIED.test(n) || c.heavy)) out.sc -= 0.5;
    if (st.budget === 'medium' && tg.cost === 'high') out.sc -= 0.8;
    if (st.budget === 'low' && tg.cost === 'low') out.sc += 0.3;
    if (st.preferLowGi) { if (c.per.sugar > 10) out.sc -= 0.8; if (REFINED.test(n)) out.sc -= 0.4; }
    if (st.snackStyle && st.snackStyle.length && meal === 'snacks') {
      const want = (st.snackStyle.includes('fruit') && c.role === 'fruit') || (st.snackStyle.includes('nuts') && /\b(nuts|almonds?|walnuts?|cashews?|pistachios?|peanuts?|makhana|seeds?|dates)\b/.test(n)) || (st.snackStyle.includes('savoury') && /\b(roasted|chana|sprouts|popcorn|murmura|khakhra|makhana|sattu)\b/.test(n));
      if (want) out.sc += 0.5;
    }
    if (st.sweetPlan === 'fruit' && meal === 'snacks' && c.role === 'fruit') out.sc += 0.3;
    if (tg.cookMin !== null && tg.cookMin !== undefined) {
      const cap = st.cookMax && st.cookMax[meal];
      if (tg.cookMin === 0) out.reasons.push({ p: 7, t: 'no cooking' });
      else if (cap && tg.cookMin <= cap) { out.sc += 0.3; out.reasons.push({ p: 7, t: `about ${tg.cookMin} minutes to cook` }); }
    }
    if (st.skill === 'beginner' && tg.cookMin !== null && tg.cookMin > 30) out.sc -= 0.4;
    return out;
  }

  /** What the day is: fasting meals, eaten-out meals, festival room, travel, vrat. */
  function dayInfo(date, goal, floor) {
    if (!st) return { fasted: [], out: [], room: 0, vrat: false, ramadan: false, travel: false, festival: false };
    const fasted = Q.fastedMeals(st, date);
    const out = Q.outMeals(st, date).filter((m) => !fasted.includes(m));
    const festival = !!st.event && Q.inEvent(st, date) && (st.event.kind === 'festival' || st.event.kind === 'wedding');
    const room = festival ? Math.min(250, Math.round(goal * 0.14)) : 0;      // room kept free for the feast; the day still adds up to the same target
    return { fasted, out, room, vrat: Q.isVratDay(st, date), ramadan: Q.isRamadanDay(st, date), travel: !!st.event && st.event.kind === 'travel' && Q.inEvent(st, date), festival };
  }

  const isSweet = (c) => SWEET.test(norm(c.name));
  /** Dishes that can be cooked once and eaten twice. */
  const batchable = (c) => tagsOf(c).batchable && c.role === 'protein' && !c.egg;

  return { active, st, ex, tagsOf, poolOk, okFor, bonus, dayInfo, isSweet, batchable, sourceOf, hasHave, cookNote: (c) => (ex ? ex.cookNote(c.name) : '') };
}

module.exports = { createRules, sourceOf, SWEET, VRAT_OK, VRAT_NO, PORTABLE, NA_DAYS };
