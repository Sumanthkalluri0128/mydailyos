// Glycemic index / load tags and pairing tips. Values come only from data/glycemic.json (published tables, source cited inside the file);
// a food that is not listed has NO tag. This is general information, not medical advice.
const fs = require('fs');
const path = require('path');
const { norm } = require('./foodSafety');

const FILE = path.join(__dirname, '..', 'data', 'glycemic.json');
let cache = null;
const load = () => {
  if (!cache) {
    try { cache = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { cache = { foods: {}, source: '', verified: false }; }
    cache.foods = Object.fromEntries(Object.entries(cache.foods || {}).map(([k, v]) => [norm(k), v])); // keys compared the same way names are
  }
  return cache;
};
const reload = () => { cache = null; return load(); };

const giBand = (gi) => (gi <= 55 ? 'low' : gi <= 69 ? 'medium' : 'high');
const glBand = (gl) => (gl <= 10 ? 'low' : gl <= 19 ? 'medium' : 'high');
const r1 = (x) => Math.round(x * 10) / 10;

/** { known, gi, giBand, gl, glBand, note, source } for a food ({ name, carbohydrates, fiber }). GL needs the carbohydrate value; without it only the GI is given. */
function glycemicOf(food, data = load()) {
  const hit = data.foods?.[norm(food?.name)];
  if (!hit || !Number.isFinite(Number(hit.gi))) return { known: false };
  const out = { known: true, gi: hit.gi, giBand: giBand(hit.gi), gl: null, glBand: null, note: hit.note || '', source: data.source || '', verified: !!data.verified };
  const carbs = Number(food.carbohydrates), fibre = Number(food.fiber) || 0;
  if (Number.isFinite(carbs) && carbs >= 0) { out.gl = r1((hit.gi * Math.max(0, carbs - fibre)) / 100); out.glBand = glBand(out.gl); }
  return out;
}

// Pairing tips: general, widely used advice. One tip per kind of food; skipped when the meal already has the helper.
const TIPS = [
  { id: 'rice', test: /\b(rice|pulao|biryani|poha|upma|khichdi|bread|toast|pav|cornflakes|noodles|pasta)\b/, helpers: /\b(dal|curd|dahi|raita|sprouts|paneer|egg|chicken|fish|salad|sabzi|vegetable)\b/, tip: 'Add dal, curd or a vegetable side to this. Protein and fibre slow the rise in blood sugar.' },
  { id: 'fruit', test: /\b(banana|mango|watermelon|grapes|pineapple|papaya|chikoo|sapota|jackfruit|dates|raisins)\b/, helpers: /\b(curd|dahi|nuts?|almonds?|walnuts?|paneer|milk)\b/, tip: 'Eat it with a handful of nuts or some curd, not on its own.' },
  { id: 'potato', test: /\b(potato|aloo|sweet potato|corn)\b/, helpers: /\b(dal|curd|dahi|paneer|egg|chicken|fish|salad|sabzi|vegetable|sprouts)\b/, tip: 'Pair it with protein and a salad or vegetables.' },
  { id: 'sweet', test: /\b(sugar|honey|jaggery|halwa|laddu|barfi|jalebi|gulab jamun|kheer|cake|juice|shake|lassi)\b/, helpers: null, tip: 'Best after a meal rather than on an empty stomach, and a small portion goes a long way.' },
];
/** The tip for a food name, or null. `mealNames` = names already in the same meal: a tip is dropped when the helper is there. */
function pairingTip(name, mealNames = []) {
  const n = norm(name);
  const meal = norm((mealNames || []).join(' '));
  for (const t of TIPS) if (t.test.test(n)) return t.helpers && t.helpers.test(meal) ? null : { id: t.id, text: t.tip };
  return null;
}

const DIABETES_NOTE = 'This view is general information, not medical advice. If you have diabetes or take medicines for it, please follow your doctor\'s or dietitian\'s advice. Glycemic values are averages and vary with cooking, ripeness and what else you eat.';

module.exports = { load, reload, glycemicOf, pairingTip, giBand, glBand, DIABETES_NOTE, TIPS };
