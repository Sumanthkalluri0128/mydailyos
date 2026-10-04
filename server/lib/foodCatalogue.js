// Starter catalogue of everyday (mostly Indian) foods with household measures.
// Values are typical/approximate per the listed serving (IFCT / USDA style averages) — people can
// duplicate any food and tweak the numbers. Row: [name, servingSize, unit, kcal, P, C, F, fiber, sugar, "label:qty,label:qty"]
const ROWS = [
  // Breads & grains
  ['Roti / Chapati', 40, 'g', 120, 3.5, 20, 3, 2.5, 0.5, 'roti:40'],
  ['Phulka (no oil)', 30, 'g', 80, 2.8, 16, 0.5, 2, 0.3, 'phulka:30'],
  ['Plain paratha', 80, 'g', 260, 5.5, 36, 10.5, 3, 0.8, 'paratha:80'],
  ['Aloo paratha', 120, 'g', 300, 6.5, 42, 12, 3.5, 1.5, 'paratha:120'],
  ['Puri', 30, 'g', 100, 2, 12, 5, 1, 0.3, 'puri:30'],
  ['Naan', 90, 'g', 260, 8.5, 45, 5, 2, 3, 'naan:90'],
  ['Bajra roti', 50, 'g', 130, 4, 24, 2.5, 3, 0.3, 'roti:50'],
  ['Jowar roti', 50, 'g', 125, 3.5, 26, 1, 3, 0.3, 'roti:50'],
  ['Ragi roti', 50, 'g', 120, 3, 24, 1, 2.5, 0.3, 'roti:50'],
  ['Bread slice (white)', 28, 'g', 75, 2.5, 14, 1, 0.8, 1.5, 'slice:28'],
  ['Bread slice (brown)', 30, 'g', 70, 3, 12, 1, 2, 1.5, 'slice:30'],
  ['White rice (cooked)', 150, 'g', 195, 4, 43, 0.4, 0.6, 0, 'katori:150,cup:160'],
  ['Brown rice (cooked)', 150, 'g', 165, 3.5, 35, 1.3, 2.5, 0.3, 'katori:150,cup:160'],
  ['Jeera rice', 150, 'g', 230, 4, 40, 6, 1, 0.3, 'katori:150'],
  ['Lemon rice', 150, 'g', 240, 4, 38, 8, 1.5, 0.5, 'katori:150'],
  ['Curd rice', 200, 'g', 250, 7, 38, 7, 0.8, 3, 'katori:200'],
  ['Vegetable biryani', 250, 'g', 340, 7, 55, 10, 3, 3, 'plate:250'],
  ['Chicken biryani', 300, 'g', 490, 24, 58, 17, 2, 2, 'plate:300'],
  ['Veg fried rice', 200, 'g', 300, 6, 46, 10, 2, 2, 'plate:200'],
  ['Khichdi', 200, 'g', 230, 8, 38, 5, 3, 1, 'katori:200'],
  ['Quinoa (cooked)', 150, 'g', 180, 6.6, 32, 3, 3.8, 1, 'katori:150'],
  ['Oats (dry)', 40, 'g', 150, 5, 27, 3, 4, 0.5, 'tbsp:10,cup:80'],
  ['Cornflakes', 30, 'g', 110, 2, 25, 0.3, 0.8, 3, 'bowl:30'],
  ['Muesli', 40, 'g', 150, 4, 28, 2.5, 3, 7, 'bowl:40'],
  ['Daliya porridge', 200, 'g', 150, 5, 28, 2, 4, 1, 'bowl:200'],
  // South Indian & breakfast
  ['Idli', 40, 'g', 58, 2, 12, 0.4, 0.6, 0.1, 'idli:40'],
  ['Plain dosa', 90, 'g', 135, 3.4, 22, 3.6, 1, 0.5, 'dosa:90'],
  ['Masala dosa', 180, 'g', 330, 7, 48, 12, 3, 1.5, 'dosa:180'],
  ['Ragi dosa', 90, 'g', 120, 3, 22, 2.5, 2, 0.3, 'dosa:90'],
  ['Uttapam', 100, 'g', 190, 5, 30, 5, 2, 1, 'uttapam:100'],
  ['Medu vada', 40, 'g', 135, 4, 12, 8, 1.5, 0.3, 'vada:40'],
  ['Upma', 200, 'g', 230, 5, 33, 9, 3, 1, 'katori:200'],
  ['Poha', 150, 'g', 250, 4.5, 40, 8, 2, 1.5, 'katori:150'],
  ['Pongal', 200, 'g', 270, 7, 38, 10, 2, 0.5, 'katori:200'],
  ['Appam', 60, 'g', 120, 2, 24, 1.5, 0.8, 1, 'appam:60'],
  ['Sambar', 150, 'g', 85, 4, 12, 2.5, 3, 2, 'katori:150'],
  ['Rasam', 150, 'g', 40, 1, 7, 1, 1, 1.5, 'katori:150'],
  ['Coconut chutney', 30, 'g', 55, 0.8, 2.5, 4.8, 1.2, 0.5, 'tbsp:15,katori:60'],
  // Dals & legumes
  ['Dal tadka', 150, 'g', 150, 7.5, 18, 5, 4, 1.5, 'katori:150'],
  ['Toor dal (cooked)', 150, 'g', 125, 7.5, 21, 1, 4, 1, 'katori:150'],
  ['Moong dal (cooked)', 150, 'g', 120, 8, 20, 1, 4, 1, 'katori:150'],
  ['Dal makhani', 150, 'g', 230, 8, 22, 12, 5, 2, 'katori:150'],
  ['Chana masala', 150, 'g', 210, 9, 28, 7, 7, 4, 'katori:150'],
  ['Rajma masala', 150, 'g', 200, 9, 28, 5, 7, 2, 'katori:150'],
  ['Sprouts (moong)', 100, 'g', 30, 3, 6, 0.2, 1.8, 4, 'katori:100'],
  ['Soya chunks (dry)', 30, 'g', 104, 15.6, 9.9, 0.2, 4, 1, 'handful:30'],
  ['Tofu', 100, 'g', 76, 8, 1.9, 4.8, 0.3, 0.6, 'cup:120'],
  ['Sattu drink', 30, 'g', 110, 6, 18, 1.5, 4, 0.5, 'glass:30'],
  // Vegetable dishes
  ['Mixed vegetable curry', 150, 'g', 130, 3, 12, 8, 3, 3, 'katori:150'],
  ['Aloo gobi', 150, 'g', 140, 3.5, 17, 7, 3, 2, 'katori:150'],
  ['Aloo sabzi', 150, 'g', 160, 3, 24, 6, 2.5, 1.5, 'katori:150'],
  ['Bhindi fry', 100, 'g', 110, 2.5, 9, 7, 3, 2, 'katori:100'],
  ['Baingan bharta', 150, 'g', 120, 3, 11, 7, 4, 4, 'katori:150'],
  ['Palak paneer', 150, 'g', 240, 12, 8, 18, 3, 2, 'katori:150'],
  ['Paneer butter masala', 150, 'g', 330, 12, 10, 27, 2, 5, 'katori:150'],
  ['Paneer (plain)', 100, 'g', 265, 18, 1.2, 21, 0, 1, 'cube:20'],
  ['Mixed salad', 100, 'g', 25, 1, 5, 0.2, 1.5, 3, 'bowl:100'],
  ['Cucumber', 100, 'g', 15, 0.7, 3.6, 0.1, 0.5, 1.7, 'cup:100'],
  ['Tomato', 100, 'g', 18, 0.9, 3.9, 0.2, 1.2, 2.6, 'medium:120'],
  ['Boiled potato', 100, 'g', 87, 1.9, 20, 0.1, 1.8, 0.9, 'medium:150'],
  ['Sweet potato (boiled)', 100, 'g', 86, 1.6, 20, 0.1, 3, 4.2, 'medium:130'],
  ['Corn (boiled)', 100, 'g', 96, 3.4, 21, 1.5, 2.4, 4.5, 'cob:120'],
  // Non-veg & eggs
  ['Boiled egg', 50, 'g', 78, 6.3, 0.6, 5.3, 0, 0.6, 'egg:50'],
  ['Egg omelette (2 eggs)', 100, 'g', 190, 12.5, 1, 15, 0, 1, 'omelette:100'],
  ['Egg white', 33, 'g', 17, 3.6, 0.2, 0.1, 0, 0.2, 'white:33'],
  ['Egg curry', 200, 'g', 280, 15, 8, 20, 1.5, 3, 'katori:200'],
  ['Chicken breast (cooked)', 100, 'g', 165, 31, 0, 3.6, 0, 0, 'piece:120'],
  ['Chicken curry', 200, 'g', 290, 24, 7, 18, 1.5, 3, 'katori:200'],
  ['Butter chicken', 200, 'g', 380, 24, 10, 28, 1.5, 6, 'katori:200'],
  ['Tandoori chicken', 150, 'g', 245, 30, 4, 12, 0.5, 1, 'leg:150'],
  ['Chicken tikka', 100, 'g', 150, 24, 3, 4.5, 0.5, 1, 'piece:25'],
  ['Fish curry', 200, 'g', 240, 22, 6, 14, 1, 2, 'katori:200'],
  ['Grilled fish', 100, 'g', 140, 24, 0, 4, 0, 0, 'fillet:120'],
  ['Mutton curry', 200, 'g', 330, 26, 6, 22, 1, 2, 'katori:200'],
  ['Whey protein', 30, 'g', 120, 24, 3, 1.5, 0, 2, 'scoop:30'],
  // Dairy
  ['Milk (full cream)', 200, 'ml', 130, 6.6, 9.4, 7, 0, 9.4, 'glass:200,cup:150'],
  ['Milk (toned)', 200, 'ml', 120, 6.2, 9.6, 6, 0, 9.6, 'glass:200,cup:150'],
  ['Curd / Dahi', 100, 'g', 70, 3.5, 4.5, 4, 0, 4.5, 'katori:100,bowl:150'],
  ['Greek yogurt', 100, 'g', 59, 10, 3.6, 0.4, 0, 3.2, 'cup:170'],
  ['Buttermilk (chaas)', 200, 'ml', 40, 2, 4, 1.5, 0, 3.5, 'glass:200'],
  ['Lassi (sweet)', 250, 'ml', 200, 6, 30, 6, 0, 28, 'glass:250'],
  ['Cheese slice', 20, 'g', 62, 4, 0.5, 5, 0, 0.3, 'slice:20'],
  ['Ghee', 5, 'g', 45, 0, 0, 5, 0, 0, 'tsp:5,tbsp:14'],
  ['Butter', 5, 'g', 36, 0, 0, 4, 0, 0, 'tsp:5,tbsp:14'],
  // Fruit
  ['Banana', 120, 'g', 105, 1.3, 27, 0.4, 3.1, 14, 'banana:120'],
  ['Apple', 180, 'g', 95, 0.5, 25, 0.3, 4.4, 19, 'apple:180'],
  ['Orange', 130, 'g', 62, 1.2, 15, 0.2, 3.1, 12, 'orange:130'],
  ['Mango', 200, 'g', 120, 1.6, 30, 0.8, 3.4, 28, 'cup:165,mango:200'],
  ['Papaya', 150, 'g', 65, 1, 16, 0.3, 2.5, 11, 'katori:150'],
  ['Watermelon', 200, 'g', 60, 1.2, 15, 0.3, 0.8, 12, 'cup:150'],
  ['Grapes', 100, 'g', 69, 0.7, 18, 0.2, 0.9, 15, 'handful:50'],
  ['Guava', 100, 'g', 68, 2.6, 14, 1, 5.4, 9, 'guava:100'],
  ['Pomegranate', 100, 'g', 83, 1.7, 19, 1.2, 4, 14, 'katori:100'],
  ['Pineapple', 100, 'g', 50, 0.5, 13, 0.1, 1.4, 10, 'slice:80'],
  ['Dates', 7, 'g', 20, 0.2, 5.3, 0, 0.5, 4.6, 'date:7'],
  // Nuts & spreads
  ['Almonds', 12, 'g', 70, 2.5, 2.6, 6, 1.5, 0.5, 'almond:1.2'],
  ['Cashews', 15, 'g', 83, 2.7, 4.5, 6.7, 0.5, 1, 'cashew:1.5'],
  ['Walnuts', 30, 'g', 196, 4.6, 4.1, 19.6, 2, 0.8, 'walnut:4'],
  ['Peanuts', 30, 'g', 170, 7.7, 4.7, 14, 2.5, 1.2, 'handful:30'],
  ['Peanut butter', 16, 'g', 94, 4, 3, 8, 1, 1, 'tbsp:16'],
  // Snacks & sweets
  ['Samosa', 80, 'g', 210, 4, 22, 12, 2, 1, 'samosa:80'],
  ['Pakora / Bhajiya', 50, 'g', 150, 4, 12, 9, 2, 1, 'piece:25'],
  ['Bhel puri', 150, 'g', 230, 5, 38, 7, 3, 5, 'plate:150'],
  ['Pav bhaji', 250, 'g', 400, 9, 55, 16, 6, 8, 'plate:250'],
  ['Vada pav', 120, 'g', 290, 6, 40, 12, 3, 3, 'vada pav:120'],
  ['Dhokla', 50, 'g', 80, 3, 12, 2, 1, 3, 'piece:25'],
  ['Veg sandwich', 150, 'g', 250, 7, 36, 8, 3, 4, 'sandwich:150'],
  ['Veg burger', 180, 'g', 380, 10, 50, 16, 3, 7, 'burger:180'],
  ['Pizza slice', 100, 'g', 270, 11, 33, 10, 2, 4, 'slice:100'],
  ['French fries', 100, 'g', 312, 3.4, 41, 15, 3.8, 0.3, 'small:70,medium:115'],
  ['Instant noodles', 70, 'g', 310, 7, 44, 12, 2, 2, 'pack:70'],
  ['Potato chips', 28, 'g', 150, 2, 15, 10, 1, 0.1, 'small pack:28'],
  ['Marie biscuit', 7, 'g', 30, 0.5, 5, 0.8, 0.1, 1, 'biscuit:7'],
  ['Gulab jamun', 40, 'g', 150, 2, 22, 6, 0.2, 18, 'piece:40'],
  ['Jalebi', 50, 'g', 190, 1, 32, 6.5, 0, 22, 'piece:25'],
  ['Rasgulla', 50, 'g', 93, 2, 20, 0.5, 0, 17, 'piece:50'],
  ['Besan laddu', 40, 'g', 190, 3.5, 22, 10, 1.5, 14, 'laddu:40'],
  ['Kheer', 150, 'g', 220, 5, 33, 7, 0.3, 22, 'katori:150'],
  ['Suji halwa', 80, 'g', 260, 3, 38, 11, 1, 22, 'katori:80'],
  // Drinks & basics
  ['Chai (milk + sugar)', 150, 'ml', 70, 2, 10, 2.5, 0, 9, 'cup:150'],
  ['Filter coffee', 150, 'ml', 70, 2, 9, 3, 0, 8, 'cup:150'],
  ['Black coffee', 150, 'ml', 5, 0.3, 0, 0, 0, 0, 'cup:150'],
  ['Coconut water', 200, 'ml', 40, 1.4, 9, 0.4, 2.6, 7, 'glass:200'],
  ['Sugarcane juice', 200, 'ml', 150, 0.2, 38, 0.1, 0, 36, 'glass:200'],
  ['Cooking oil', 5, 'ml', 40, 0, 0, 4.5, 0, 0, 'tsp:5,tbsp:15'],
  ['Sugar', 4, 'g', 16, 0, 4, 0, 0, 4, 'tsp:4'],
  ['Honey', 7, 'g', 21, 0, 5.8, 0, 0, 5.8, 'tsp:7'],
];

function toFood(row) {
  const [name, servingSize, servingUnit, calories, protein, carbohydrates, fat, fiber, sugar, units] = row;
  return {
    name, servingSize, servingUnit, calories, protein, carbohydrates, fat, fiber, sugar,
    units: String(units || '').split(',').filter(Boolean).map((u) => {
      const i = u.lastIndexOf(':');
      return { label: u.slice(0, i), quantity: Number(u.slice(i + 1)) };
    }),
    notes: 'Typical values — approximate. Duplicate to adjust.',
  };
}

// Merge the extended Indian catalogue, de-duplicating by normalised name (the first definition wins).
const norm = (n) => String(n).toLowerCase().replace(/[^a-z0-9]+/g, '');
const seen = new Set();
const CATALOGUE = [...ROWS, ...require('./indianFoods'), ...require('./indianFoods2')]
  .filter((r) => { const k = norm(r[0]); if (seen.has(k)) return false; seen.add(k); return true; })
  .map(toFood);

/** Adds any catalogue food that's missing (matched by name). Never overwrites or removes anything. */
async function seedFoods(Food = require('../models/Food')) {
  let added = 0;
  for (const f of CATALOGUE) {
    const r = await Food.updateOne({ name: f.name, userId: null }, { $setOnInsert: { ...f, userId: null } }, { upsert: true });
    if (r.upsertedCount) added += 1;
  }
  return { added, total: CATALOGUE.length };
}

module.exports = { CATALOGUE, seedFoods };
