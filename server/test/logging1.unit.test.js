// Section E: repeat preview, voice text, shared pot, ingredient parsing with cooked-weight factors, chai counter.
const test = require('node:test');
const assert = require('node:assert/strict');
const { pickRepeat, applyEdits } = require('../lib/repeatMeal');
const { normalizeSpoken } = require('../lib/voiceText');
const { potFrom, eatenServings, scaleNutrition, afterEating } = require('../lib/sharedPot');
const { parseIngredients, yieldFor, toGrams } = require('../lib/ingredientParse');
const { chaiNutrition, weeklyChai } = require('../lib/chaiCounter');
const { parseMealText } = require('../lib/foodParse');
const { englishify } = require('../lib/foodAliases');
const { CATALOGUE } = require('../lib/foodCatalogue');

const foods = CATALOGUE.map((f, i) => ({ ...f, _id: String(i + 1) }));

test('repeat: yesterday vs last time', () => {
  const logs = [
    { _id: 'a', date: '2026-10-20', mealType: 'lunch', consumedQuantity: 1, nutritionTotal: { calories: 300 } },
    { _id: 'b', date: '2026-10-18', mealType: 'lunch', consumedQuantity: 2, nutritionTotal: { calories: 200 } },
    { _id: 'c', date: '2026-10-21', mealType: 'dinner', consumedQuantity: 1, nutritionTotal: { calories: 500 } },
  ];
  assert.equal(pickRepeat(logs, { meal: 'lunch', today: '2026-10-22', mode: 'yesterday' }), null);
  assert.equal(pickRepeat(logs, { meal: 'lunch', today: '2026-10-22', mode: 'last' }).date, '2026-10-20');
  assert.equal(pickRepeat(logs, { meal: 'dinner', today: '2026-10-22', mode: 'yesterday' }).kcal, 500);
  assert.equal(pickRepeat(logs, { meal: 'brunch', today: '2026-10-22' }), null);
  assert.equal(pickRepeat(logs, { meal: 'lunch', today: '2026-10-20', mode: 'last' }).date, '2026-10-18'); // never today or later
});
test('repeat: edits only change known ids with valid numbers', () => {
  const out = applyEdits([{ _id: 'a', consumedQuantity: 1 }, { _id: 'b', consumedQuantity: 2 }], [{ id: 'a', quantity: 3 }, { id: 'b', quantity: -1 }, { id: 'zz', quantity: 9 }]);
  assert.deepEqual(out.map((o) => o.consumedQuantity), [3, 2]);
});

test('voice: English, Hindi, Telugu, Tamil, Devanagari', () => {
  assert.deepEqual(normalizeSpoken('maine nashta mein do roti aur ek katori dal khaya'), { text: '2 roti, 1 katori dal', meal: 'breakfast' });
  assert.deepEqual(normalizeSpoken('I had one and a half cup rice for lunch'), { text: '1.5 cup rice', meal: 'lunch' });
  assert.equal(normalizeSpoken('दो रोटी और दाल').text, '2 roti, dal');
  assert.equal(normalizeSpoken('రెండు ఇడ్లీ మరియు ఒకటి టీ').text, '2 idli, 1 chai');
  assert.equal(normalizeSpoken('இரண்டு தோசை').text, '2 dosa');
  assert.equal(normalizeSpoken('tea with milk').text, 'tea with milk'); // not split into two foods
  assert.equal(normalizeSpoken('').text, '');
});
test('voice: spoken text reaches the meal parser', () => {
  const t = normalizeSpoken('two roti and dal for lunch');
  const r = parseMealText(englishify(t.text), foods);
  assert.equal(t.meal, 'lunch');
  assert.ok(r.items.length >= 1);
});

test('shared pot: servings, weight and scaling', () => {
  assert.deepEqual(potFrom({ servings: 8, totalG: 2000 }), { ok: true, servings: 8, totalG: 2000, servingG: 250 });
  assert.equal(potFrom({ servings: 6 }).servingG, null);
  assert.equal(potFrom({ totalG: 1500 }).ok, false);               // weight alone cannot give servings
  assert.equal(potFrom({ recipeServings: 4 }).servings, 4);
  assert.equal(eatenServings({ servingG: 250 }, { grams: 375 }).servings, 1.5);
  assert.equal(eatenServings({ servingG: null }, { grams: 100 }).ok, false);
  assert.equal(eatenServings({}, { servings: 2 }).servings, 2);
  assert.equal(eatenServings({}, {}).ok, false);
  assert.deepEqual(scaleNutrition({ calories: 200, protein: 10 }, 1.5), { calories: 300, protein: 15 });
  assert.deepEqual(afterEating(3, 1), { left: 2, over: false });
  assert.deepEqual(afterEating(1, 2.5), { left: 0, over: true });
});

test('ingredients: cups to grams, raw to cooked, oil', () => {
  const r = parseIngredients('2 cups rice, 1 cup toor dal, 2 tbsp oil, 1 tsp ghee', foods, { servings: 4 });
  const rice = r.items.find((i) => /rice/i.test(i.foodName));
  const dal = r.items.find((i) => /toor/i.test(i.foodName));
  assert.equal(rice.foodName, 'White rice (cooked)');
  assert.equal(rice.rawG, 380);
  assert.ok(rice.factor >= 2.4 && rice.factor <= 3.2);
  assert.equal(rice.quantity, Math.round(380 * rice.factor));
  assert.ok(dal.factor >= 2.5 && dal.quantity > 500);
  assert.equal(r.items.find((i) => /oil/i.test(i.foodName)).quantity, 30);   // 2 tbsp = 30 ml
  assert.ok(r.oilTspPerServing > 1.5);
});
test('ingredients: calories of the pot are kept when raw becomes cooked', () => {
  const rice = foods.find((f) => f.name === 'White rice (cooked)');
  const y = yieldFor(rice.name, (rice.calories / rice.servingSize) * 100);
  const kcal = (190 * y.factor / rice.servingSize) * rice.calories;
  assert.ok(Math.abs(kcal - 190 * 3.6) < 40, `${kcal}`);      // ~360 kcal per 100 g raw rice
});
test('ingredients: never guesses weights or loose matches', () => {
  const r = parseIngredients('1 cup mystery flour, 1 onion, 1 cup cooked rice', foods);
  assert.deepEqual(r.unmatched, ['1 cup mystery flour']);
  const onion = r.items.find((i) => /onion/i.test(i.raw));
  assert.equal(onion.quantity, null);
  assert.ok(onion.warnings.length);
  const cooked = r.items.find((i) => /cooked rice/.test(i.raw));
  assert.equal(cooked.factor, null);                              // already cooked: no yield factor
  assert.equal(toGrams('cup', 1, 'unknown flour', { servingUnit: 'g', units: [] }), null);
  assert.equal(yieldFor('Boiled egg', 150), null);
});

const chaiFoods = foods;
test('chai: calories come from the catalogue milk and sugar', () => {
  const plain = chaiNutrition({ cups: 1, sugarSpoons: 0, milk: 'full' }, chaiFoods);
  assert.ok(plain.ok);
  assert.ok(Math.abs(plain.kcal - 50) <= 3, `plain chai ${plain.kcal}`);   // catalogue "Chai (no sugar)" = 50 kcal / 150 ml
  const sweet = chaiNutrition({ cups: 3, sugarSpoons: 2, milk: 'toned' }, chaiFoods);
  assert.equal(sweet.sugarKcal, 3 * 2 * 16);
  assert.equal(sweet.cups, 3);
  assert.ok(sweet.kcal > sweet.sugarKcal);
  assert.equal(chaiNutrition({ cups: 1, milk: 'none', sugarSpoons: 0 }, chaiFoods).kcal, 0);
  assert.equal(chaiNutrition({ cups: 0 }, chaiFoods).ok, false);
  assert.equal(chaiNutrition({ cups: 1, sugarSpoons: 1 }, []).ok, false);  // no foods -> refuses instead of inventing
  assert.ok(chaiNutrition({ cups: 1, cupSize: 'cutting', milk: 'full' }, chaiFoods).kcal < plain.kcal);
});
test('chai: weekly note is kind and exact', () => {
  assert.equal(weeklyChai([]).note, '');
  const w = weeklyChai([{ chai: { cups: 2, sugarKcal: 64, sugarSpoons: 2 } }, { chai: { cups: 1, sugarKcal: 16, sugarSpoons: 1 } }]);
  assert.equal(w.cups, 3); assert.equal(w.sugarKcal, 80); assert.equal(w.spoons, 5);
  assert.ok(!/bad|guilt|too much|cheat/i.test(w.note));
  assert.match(weeklyChai([{ chai: { cups: 4, sugarKcal: 0, sugarSpoons: 0 } }]).note, /without sugar/);
});
