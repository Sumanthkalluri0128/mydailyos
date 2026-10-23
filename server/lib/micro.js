// Micronutrients: daily card, weekly "low three weeks in a row" insight, confidence labels, sanity limits.
// Pure functions. NOTHING here invents a nutrient value: a missing value stays missing and the card says "not enough data".
const path = require('path');
const fs = require('fs');

const MICROS = [
  { id: 'iron', label: 'Iron', unit: 'mg', field: 'iron', hint: 'rajma, spinach, ragi, chana' },
  { id: 'calcium', label: 'Calcium', unit: 'mg', field: 'calcium', hint: 'curd, milk, paneer, ragi' },
  { id: 'potassium', label: 'Potassium', unit: 'mg', field: 'potassium', hint: 'banana, potato, coconut water, dal' },
  { id: 'magnesium', label: 'Magnesium', unit: 'mg', field: 'magnesium', hint: 'nuts, seeds, whole grains' },
  { id: 'zinc', label: 'Zinc', unit: 'mg', field: 'zinc', hint: 'pulses, nuts, seeds' },
  { id: 'vitaminA', label: 'Vitamin A', unit: 'µg RAE', field: 'vitaminA', hint: 'carrot, papaya, spinach, eggs' },
  { id: 'vitaminB12', label: 'Vitamin B12', unit: 'µg', field: 'vitaminB12', hint: 'milk, curd, eggs, fish' },
  { id: 'vitaminC', label: 'Vitamin C', unit: 'mg', field: 'vitaminC', hint: 'amla, guava, citrus, capsicum' },
  { id: 'vitaminD', label: 'Vitamin D', unit: 'µg', field: 'vitaminD', hint: 'sunlight, eggs, fish, fortified milk' },
  { id: 'folate', label: 'Folate', unit: 'µg', field: 'folate', hint: 'spinach, dal, rajma, oranges' },
];
const IDS = MICROS.map((m) => m.id);
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const r1 = (x) => Math.round(x * 10) / 10;

let RDA = null;
const loadRda = () => RDA || (RDA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'rdaIcmrNin.json'), 'utf8')));

/** { ok, ranges:{id:{min,max}} } for an adult; { ok:false, note } when out of scope (under 18, no age or sex). */
function rdaFor(profile = {}, table = loadRda()) {
  const age = Number(profile.age), sex = profile.sex;
  if (!(age >= 18)) return { ok: false, note: age > 0 ? 'Micronutrient ranges here are for adults. For under-18s, please follow your doctor or dietitian.' : 'Add your age and sex in your profile to see micronutrient ranges.' };
  if (sex !== 'male' && sex !== 'female') return { ok: false, note: 'Add your sex in your profile to see micronutrient ranges.' };
  const base = { ...table.adult[sex] };
  if (sex === 'female' && age >= 51) for (const [k, v] of Object.entries(table.overrides?.female_51_plus || {})) base[k] = v;
  const ranges = {};
  for (const id of IDS) ranges[id] = { min: base[id][0], max: base[id][1] };
  return { ok: true, ranges, source: table.source, verified: table.verified === true, note: 'Pregnancy, breastfeeding, under-18s and medical conditions are not covered: please follow your doctor or dietitian.' };
}

// ----------------------------------------------------------------------------------------------- overlay (catalogue values from data/foodMicros.json)
const norm = (n) => String(n || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
let OVERLAY = null;
function loadOverlay(file = path.join(__dirname, '..', 'data', 'foodMicros.json')) {
  if (OVERLAY && file.endsWith('foodMicros.json')) return OVERLAY;
  let j = { foods: {} };
  try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* no file yet: every catalogue food simply has no micronutrient data */ }
  const map = new Map(Object.entries(j.foods || {}).map(([k, v]) => [norm(k), v]));
  if (file.endsWith('foodMicros.json')) OVERLAY = map;
  return map;
}

/** Per-serving micronutrients of a food: its own fields (custom / imported foods) and, for catalogue foods, the reviewed data file.
 *  Returns { values:{id:number}, source:string } with only the nutrients that are really known. */
function microsOf(food, overlay = loadOverlay()) {
  const values = {}; let source = '';
  const row = !food.userId ? overlay.get(norm(food.name)) : null;
  for (const m of MICROS) {
    const own = food[m.field];
    if (isNum(own)) values[m.id] = own;
    else if (row && isNum(row[m.field])) values[m.id] = row[m.field];
  }
  if (row && row.source) source = row.source;
  else if (typeof food.dataSource === 'string') source = food.dataSource;
  return { values, source };
}

/** Sodium (mg per serving). A catalogue food that has none stored takes the reviewed value from data/foodMicros.json; otherwise unchanged. */
function sodiumFor(food, overlay = loadOverlay()) {
  const own = Number(food.sodium) || 0;
  if (own > 0 || food.userId) return own;
  const row = overlay.get(norm(food.name));
  return row && isNum(row.sodium) ? row.sodium : 0;
}

/** Verified (a named lab / database source) · Typical (approximate catalogue value) · Added by you (your own food). */
function confidenceOf(food, overlay = loadOverlay()) {
  if (food.userId) return { id: 'added', label: 'Added by you' };
  const { source } = microsOf(food, overlay);
  if (/\b(IFCT|USDA|FoodData|Open Food Facts|label)\b/i.test(source)) return { id: 'verified', label: 'Verified' };
  return { id: 'typical', label: 'Typical' };
}

// ----------------------------------------------------------------------------------------------- the day
const COVER_MIN = 0.6;
/**
 * @param items [{ servings, calories, micros:{id:number} }]  one per logged food (micros from microsOf; `calories` = the log's calories)
 * @returns per nutrient { total, coverage (share of logged calories whose food has this nutrient) , enough }
 */
function dayMicro(items) {
  const totalCal = items.reduce((s, i) => s + (Number(i.calories) || 0), 0);
  const out = {};
  for (const m of MICROS) {
    let total = 0, cal = 0;
    for (const i of items) {
      const v = i.micros?.[m.id];
      if (isNum(v)) { total += v * (Number(i.servings) || 0); cal += Number(i.calories) || 0; }
    }
    const coverage = totalCal > 0 ? cal / totalCal : 0;
    out[m.id] = { total: r1(total), coverage: Math.round(coverage * 100) / 100, enough: items.length > 0 && coverage >= COVER_MIN };
  }
  return { nutrients: out, loggedItems: items.length, totalCalories: Math.round(totalCal) };
}

/** 'low' | 'ok' | 'high'. High only when the range has a limit AND the nutrient is not the supplement-only kind (magnesium). */
function statusFor(id, value, range) {
  if (!range) return 'ok';
  if (value < range.min) return 'low';
  if (range.max != null && id !== 'magnesium' && value > range.max) return 'high';
  return 'ok';
}

/** The card: one row per nutrient with the same arrow style as macros (↓ low, ✓ ok, ↑ high, … not enough data). */
function microCard(day, rda) {
  if (!rda.ok) return { ok: false, note: rda.note, rows: [] };
  const rows = MICROS.map((m) => {
    const d = day.nutrients[m.id]; const range = rda.ranges[m.id];
    if (!d.enough) return { id: m.id, label: m.label, unit: m.unit, status: 'nodata', arrow: '…', range, coverage: d.coverage, line: 'Not enough data yet' };
    const status = statusFor(m.id, d.total, range);
    return { id: m.id, label: m.label, unit: m.unit, value: d.total, pct: Math.round((d.total / range.min) * 100), range, status, arrow: status === 'low' ? '↓' : status === 'high' ? '↑' : '✓', coverage: d.coverage };
  });
  const known = rows.filter((r) => r.status !== 'nodata');
  const inRange = known.filter((r) => r.status === 'ok').length;
  const mood = !known.length ? 'nodata' : inRange / known.length >= 0.7 ? 'victory' : known.some((r) => r.status === 'low') ? 'low' : 'ok';
  return { ok: true, rows, knownCount: known.length, inRange, mood, note: rda.note, source: rda.source, rdaVerified: rda.verified, emptyNote: known.length ? '' : 'Most foods you logged have no vitamin and mineral data yet, so nothing is shown instead of a misleading zero.' };
}

// ----------------------------------------------------------------------------------------------- the week
/**
 * @param weeks oldest -> newest: [{ nutrients: day-like { id:{total,enough} } averages }] each week = average of its days that had enough data
 * A nutrient is "low" in a week when its average is below the RDA minimum with enough data. Returns the nutrients low for 2+ weeks in a row up to now.
 */
function lowStreaks(weeks, rda) {
  if (!rda.ok) return [];
  const out = [];
  for (const m of MICROS) {
    let run = 0;
    for (let i = weeks.length - 1; i >= 0; i -= 1) {
      const w = weeks[i]?.[m.id];
      if (w && w.enough && w.avg < rda.ranges[m.id].min * 0.7) run += 1; else break;
    }
    if (run >= 2) out.push({ id: m.id, label: m.label, weeks: run, line: `Low on ${m.label.toLowerCase()} ${run} weeks in a row` });
  }
  return out;
}

/** Average a week of day results (only days with enough data count). */
function weekAverage(dayResults) {
  const out = {};
  for (const m of MICROS) {
    const ok = dayResults.map((d) => d.nutrients[m.id]).filter((n) => n.enough);
    out[m.id] = { enough: ok.length >= 3, days: ok.length, avg: ok.length ? r1(ok.reduce((s, n) => s + n.total, 0) / ok.length) : 0 };
  }
  return out;
}

/**
 * Where to get more of a nutrient: the person's OWN logged foods first (ranked by amount per 100 kcal), then the catalogue.
 * @param foods [{ name, calories, micros, mine:boolean }]  Only foods with a real value count; name-based hints are shown last and labelled.
 */
function sourcesFor(id, foods, limit = 4) {
  const m = MICROS.find((x) => x.id === id);
  const withVal = foods.filter((f) => isNum(f.micros?.[id]) && f.micros[id] > 0 && f.calories > 0)
    .map((f) => ({ name: f.name, mine: !!f.mine, per100kcal: r1((f.micros[id] / f.calories) * 100) }))
    .sort((a, b) => Number(b.mine) - Number(a.mine) || b.per100kcal - a.per100kcal);
  const picks = withVal.slice(0, limit);
  return { id, label: m.label, foods: picks, hint: picks.length ? '' : `Often found in: ${m.hint}.`, fromData: picks.length > 0 };
}

// ----------------------------------------------------------------------------------------------- audit
const MAX_PER_SERVING = { iron: 60, calcium: 2500, potassium: 4500, magnesium: 800, zinc: 60, vitaminA: 30000, vitaminB12: 200, vitaminC: 2000, vitaminD: 250, folate: 2000 };
function auditMicros(foods, overlay = loadOverlay()) {
  const issues = [];
  for (const f of foods) {
    const { values, source } = microsOf(f, overlay);
    const ids = Object.keys(values);
    if (!ids.length) continue;
    for (const id of ids) {
      const x = values[id];
      if (x < 0) issues.push({ name: f.name, type: 'micro_negative', msg: `${id} is negative (${x})` });
      else if (x > MAX_PER_SERVING[id]) issues.push({ name: f.name, type: 'micro_implausible', msg: `${id} ${x} per serving is above the plausible limit ${MAX_PER_SERVING[id]}` });
    }
    if (!f.userId && !source) issues.push({ name: f.name, type: 'micro_no_source', msg: 'has micronutrient values but no source' });
    if (isNum(f.sodium) && f.sodium > (Number(f.servingSize) || 0) * 1000 * 1.02 && ['g'].includes(String(f.servingUnit).toLowerCase())) issues.push({ name: f.name, type: 'sodium_implausible', msg: 'sodium exceeds the weight of the serving' });
  }
  return issues;
}

module.exports = { MICROS, IDS, COVER_MIN, MAX_PER_SERVING, rdaFor, loadRda, loadOverlay, microsOf, sodiumFor, confidenceOf, dayMicro, statusFor, microCard, lowStreaks, weekAverage, sourcesFor, auditMicros };
