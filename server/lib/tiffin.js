// Tiffin planner helpers (pure). Favourites first, then lunches you actually ate most often lately.
const norm = (s) => String(s || '').toLowerCase().trim();

/** favIds: ids in saved order; logs: past lunch logs; byId: Map(id -> food) of foods that are allowed (already safety-filtered). */
function pickTiffinQuick({ favIds = [], logs = [], byId = new Map(), limit = 6 }) {
  const favourites = favIds.map((id) => byId.get(String(id))).filter(Boolean);
  const favSet = new Set(favourites.map((f) => String(f._id)));
  const count = new Map();
  for (const l of logs) count.set(String(l.foodId), (count.get(String(l.foodId)) || 0) + 1);
  const recent = [...count.entries()].filter(([id]) => byId.has(id) && !favSet.has(id)).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, limit).map(([id]) => byId.get(id));
  return { favourites, recent };
}

/** A canteen dish typed by the person: nothing is estimated, only what they entered is stored. */
function favouriteFood({ name, calories, protein = 0, carbohydrates = 0, fat = 0 }) {
  return { name: String(name).trim(), brand: 'Canteen', servingSize: 1, servingUnit: 'serving', calories, protein, carbohydrates, fat, units: [{ label: 'serving', quantity: 1 }], notes: 'Canteen favourite (your own numbers)' };
}

module.exports = { pickTiffinQuick, favouriteFood, norm };
