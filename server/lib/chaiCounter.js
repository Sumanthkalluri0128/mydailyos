// Chai and coffee counter: calories worked out from the catalogue's own foods (milk and sugar), never a made-up number.
// Model: a cup is `cupMl` of drink; `milkShare` of it is milk (default 0.5: the catalogue's "Chai (no sugar)", 150 ml = 50 kcal, matches 75 ml of
// full-cream milk). Tea or coffee itself adds ~0. Sugar is counted per spoon from the catalogue's Sugar food (1 tsp = 4 g = 16 kcal).
const MILKS = {
  full: { label: 'Full-cream milk', food: 'Milk (full cream)' },
  toned: { label: 'Toned milk', food: 'Milk (toned)' },
  soy: { label: 'Soy milk', food: 'Soy milk' },
  none: { label: 'No milk (black)', food: null },
};
const CUPS = { cutting: 90, regular: 150, mug: 250 };
const DEFAULT_MILK_SHARE = 0.5;
const num = (x, d = 0) => (Number.isFinite(Number(x)) ? Number(x) : d);

/** kcal per ml for a catalogue milk and kcal per tsp of sugar, read from the foods list [{name, servingSize, calories}]. */
function readFoods(foods) {
  const by = new Map((foods || []).map((f) => [String(f.name).toLowerCase(), f]));
  const milk = {};
  for (const [id, m] of Object.entries(MILKS)) {
    const f = m.food ? by.get(m.food.toLowerCase()) : null;
    milk[id] = m.food ? (f && f.servingSize > 0 ? f.calories / f.servingSize : null) : 0;
  }
  const sugar = by.get('sugar');
  const sugarKcalTsp = sugar && sugar.servingSize > 0 ? sugar.calories : null; // the catalogue's Sugar serving is 1 tsp (4 g)
  return { milk, sugarKcalTsp, sugarGTsp: sugar ? sugar.servingSize : 4 };
}

/**
 * @param o { cups, sugarSpoons (per cup), milk: full|toned|soy|none, cupMl | cupSize, milkShare }
 * @returns { ok, kcal, perCupKcal, sugarKcal, milkKcal, sugarG, label } — ok:false when the catalogue lacks a needed food.
 */
function chaiNutrition(o, foods) {
  const cups = Math.min(20, Math.max(0, num(o.cups, 1)));
  const spoons = Math.min(6, Math.max(0, num(o.sugarSpoons, 0)));
  const milk = MILKS[o.milk] ? o.milk : 'full';
  const cupMl = CUPS[o.cupSize] || Math.min(500, Math.max(30, num(o.cupMl, CUPS.regular)));
  const share = Math.min(0.9, Math.max(0, num(o.milkShare, DEFAULT_MILK_SHARE)));
  const f = readFoods(foods);
  if (!(cups > 0)) return { ok: false, message: 'Add at least one cup.' };
  if (f.milk[milk] === null || (spoons > 0 && f.sugarKcalTsp === null)) return { ok: false, message: 'Milk or sugar is missing from the food list, so the calories cannot be worked out.' };
  const milkKcal = cupMl * share * (milk === 'none' ? 0 : f.milk[milk]);
  const sugarKcal = spoons * f.sugarKcalTsp;
  const perCup = milkKcal + sugarKcal;
  const r = (x) => Math.round(x);
  return {
    ok: true, cups, sugarSpoons: spoons, milk, cupMl,
    perCupKcal: r(perCup), kcal: r(perCup * cups), milkKcal: r(milkKcal * cups), sugarKcal: r(sugarKcal * cups), sugarG: Math.round(spoons * f.sugarGTsp * cups * 10) / 10,
    label: `${o.drink === 'coffee' ? 'Coffee' : 'Chai'} x${cups}${spoons ? `, ${spoons} sugar` : ', no sugar'}${milk === 'none' ? ', black' : `, ${MILKS[milk].label.toLowerCase()}`}`,
  };
}

/** Weekly "hidden calories": the sugar spoons in chai and coffee. Friendly wording only. logs: [{ date, chai: {cups, sugarKcal, sugarSpoons} }] */
function weeklyChai(logs) {
  const l = (logs || []).filter((x) => x.chai && x.chai.cups > 0);
  if (!l.length) return { cups: 0, sugarKcal: 0, note: '' };
  const cups = l.reduce((s, x) => s + x.chai.cups, 0);
  const sugarKcal = Math.round(l.reduce((s, x) => s + (x.chai.sugarKcal || 0), 0));
  const spoons = Math.round(l.reduce((s, x) => s + (x.chai.sugarSpoons || 0) * x.chai.cups, 0));
  const note = !sugarKcal ? `${cups} cup${cups === 1 ? '' : 's'} this week, all without sugar. Nice and light.`
    : `${cups} cup${cups === 1 ? '' : 's'} this week with ${spoons} spoon${spoons === 1 ? '' : 's'} of sugar, about ${sugarKcal} kcal. Half a spoon less per cup would save around ${Math.round(sugarKcal / 2)} kcal, if you ever want to.`;
  return { cups, sugarKcal, spoons, note };
}

module.exports = { MILKS, CUPS, chaiNutrition, weeklyChai, readFoods };
