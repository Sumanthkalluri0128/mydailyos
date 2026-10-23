// Loads logged foods for a date range and builds the micronutrient day / week results (see lib/micro.js for the rules).
const Food = require('../models/Food');
const FoodLog = require('../models/FoodLog');
const Profile = require('../models/Profile');
const M = require('./micro');
const { addDays } = require('./dates');

const FIELDS = `name userId servingSize servingUnit calories sodium dataSource ${M.MICROS.map((m) => m.field).join(' ')}`;

/** date -> [{ servings, calories, micros }] for every food log in the range. Logs whose food was deleted count with no micronutrients. */
async function itemsByDate(uid, from, to) {
  const logs = await FoodLog.find({ userId: uid, date: { $gte: from, $lte: to } }).select('date foodId foodName servings nutritionTotal').lean();
  const ids = [...new Set(logs.map((l) => String(l.foodId)))];
  const foods = ids.length ? await Food.find({ _id: { $in: ids } }).select(FIELDS).lean() : [];
  const byId = new Map(foods.map((f) => [String(f._id), f]));
  const overlay = M.loadOverlay();
  const map = new Map();
  for (const l of logs) {
    const f = byId.get(String(l.foodId));
    const item = { servings: Number(l.servings) || 0, calories: Number(l.nutritionTotal?.calories) || 0, micros: f ? M.microsOf(f, overlay).values : {}, name: l.foodName, food: f };
    if (!map.has(l.date)) map.set(l.date, []);
    map.get(l.date).push(item);
  }
  return map;
}

async function microForDay(uid, date) {
  const [profile, map] = await Promise.all([Profile.findOne({ userId: uid }).select('age sex').lean(), itemsByDate(uid, addDays(date, -27), date)]);
  const rda = M.rdaFor(profile || {});
  const day = M.dayMicro(map.get(date) || []);
  const card = M.microCard(day, rda);
  // the person's own foods (last 28 days) first, for the low nutrients
  const seen = new Map();
  for (const items of map.values()) for (const i of items) if (i.food && !seen.has(String(i.food._id))) seen.set(String(i.food._id), { name: i.food.name, calories: Number(i.food.calories) || 0, micros: i.micros, mine: true });
  const low = card.rows.filter((r) => r.status === 'low').slice(0, 3).map((r) => M.sourcesFor(r.id, [...seen.values()]));
  return { ...card, date, low };
}

/** Four Mon-Sun-free rolling weeks ending `end`: averages, "low N weeks in a row", and foods to try. */
async function microForWeeks(uid, end, weeks = 4) {
  const from = addDays(end, -(weeks * 7 - 1));
  const [profile, map] = await Promise.all([Profile.findOne({ userId: uid }).select('age sex').lean(), itemsByDate(uid, from, end)]);
  const rda = M.rdaFor(profile || {});
  const out = [];
  for (let w = 0; w < weeks; w += 1) {
    const days = [];
    for (let i = 0; i < 7; i += 1) { const items = map.get(addDays(from, w * 7 + i)); if (items?.length) days.push(M.dayMicro(items)); }
    out.push(M.weekAverage(days));
  }
  const streaks = M.lowStreaks(out, rda);
  const mine = new Map();
  for (const items of map.values()) for (const i of items) if (i.food && !mine.has(String(i.food._id))) mine.set(String(i.food._id), { name: i.food.name, calories: Number(i.food.calories) || 0, micros: i.micros, mine: true });
  return { ok: rda.ok, note: rda.ok ? rda.note : rda.note, weeks: out, insights: streaks.map((s) => ({ ...s, sources: M.sourcesFor(s.id, [...mine.values()]) })) };
}
module.exports = { itemsByDate, microForDay, microForWeeks };
