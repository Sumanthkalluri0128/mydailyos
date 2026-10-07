// The shared catalogue (≈500 foods) rarely changes, so keep it in memory for a few minutes instead of re-reading it from the
// database on every "type what you ate" / "suggest" request. A person's own foods are always read fresh.
const TTL_MS = 5 * 60 * 1000;
let cache = { at: 0, foods: null, pending: null };

async function catalogueFoods(Food, { now = Date.now, ttl = TTL_MS } = {}) {
  if (cache.foods && now() - cache.at < ttl) return cache.foods;
  if (cache.pending) return cache.pending; // several requests at once share one query
  cache.pending = Food.find({ $or: [{ userId: null }, { userId: { $exists: false } }] })
    .select('name brand servingSize servingUnit units calories protein carbohydrates fat fiber sugar sodium barcode notes')
    .lean()
    .then((foods) => { cache = { at: now(), foods, pending: null }; return foods; })
    .catch((e) => { cache.pending = null; throw e; });
  return cache.pending;
}
const clearFoodCache = () => { cache = { at: 0, foods: null, pending: null }; };

module.exports = { catalogueFoods, clearFoodCache, TTL_MS };
