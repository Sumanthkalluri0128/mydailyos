const KEYS = ['calories', 'protein', 'carbohydrates', 'fat', 'fiber', 'sugar', 'sodium'];
const round1 = (x) => Math.round(x * 10) / 10;

/** Per-serving values of a food scaled to `quantity` (in the food's own serving unit). */
function nutritionFor(food, quantity) {
  const servings = Number(quantity) / (Number(food.servingSize) || 1);
  const per = Object.fromEntries(KEYS.map((k) => [k, Number(food[k] || 0)]));
  const total = Object.fromEntries(KEYS.map((k) => [k, round1(per[k] * servings)]));
  return { servings, per, total };
}

/** Builds a FoodLog document body (no userId/clientId) for a food + quantity on a date/meal. */
function foodLogDoc(food, quantity, date, mealType) {
  const { servings, per, total } = nutritionFor(food, quantity);
  return {
    foodId: food._id, date, mealType, foodName: food.name, baseServingSize: food.servingSize, servingUnit: food.servingUnit,
    consumedQuantity: quantity, servings, nutritionPerServing: per, nutritionTotal: total, notes: '',
  };
}

module.exports = { KEYS, nutritionFor, foodLogDoc };
