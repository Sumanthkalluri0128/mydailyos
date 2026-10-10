// Gentle Indian-food swaps: a lighter or higher-protein choice for foods people log often. Estimates are per typical serving.
const RULES = [
  { re: /butter chicken|chicken tikka masala|chicken korma/i, to: 'tandoori chicken or chicken curry (home style)', saves: 220, why: 'same protein, far less cream and butter' },
  { re: /paneer butter masala|shahi paneer|paneer lababdar|malai kofta/i, to: 'palak paneer or paneer bhurji', saves: 200, why: 'less cream, more protein per calorie' },
  { re: /dal makhani/i, to: 'dal tadka', saves: 130, why: 'no butter and cream, same lentil protein' },
  { re: /biryani/i, to: 'a smaller portion with raita and a salad', saves: 200, why: 'rice and oil drive the calories, so portion matters most' },
  { re: /fried rice|schezwan rice|hakka noodles|schezwan noodles/i, to: 'veg or chicken soup with a half portion of rice', saves: 250, why: 'oil-heavy and easy to over-eat' },
  { re: /samosa|kachori|vada pav|bhajia|bajji|pakora|puff/i, to: 'roasted chana, sprouts chaat or a boiled egg', saves: 180, why: 'deep-fried snacks cost 250+ kcal for little protein' },
  { re: /\bpuri\b|poori|bhatura|kulcha|butter naan/i, to: 'phulka / roti', saves: 120, why: 'no frying, about 70 kcal each' },
  { re: /paratha/i, to: 'a dry roti with a spoon of ghee on the side', saves: 80, why: 'cooking oil adds up inside parathas' },
  { re: /cola|pepsi|thums up|sprite|fanta|packaged fruit juice|maaza|frooti|milkshake|frappe/i, to: 'buttermilk, nimbu pani without sugar, or a zero-sugar drink', saves: 120, why: 'liquid sugar does not fill you up' },
  { re: /gulab jamun|jalebi|rasmalai|brownie|pastry|cheesecake|donut|ice cream/i, to: 'a fruit-based sweet or one small piece', saves: 150, why: 'desserts are the easiest calories to halve' },
  { re: /maggi|noodles|instant/i, to: 'veg poha or upma with a boiled egg', saves: 100, why: 'more protein and fibre for the same calories' },
];

/** Returns the best swap for a food name, or null. */
function swapFor(name) {
  const r = RULES.find((x) => x.re.test(String(name || '')));
  return r ? { to: r.to, saves: r.saves, why: r.why } : null;
}
module.exports = { swapFor, RULES };
