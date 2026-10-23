// Import food logs and weight history from another app's CSV (MyFitnessPal, HealthifyMe, any spreadsheet).
// Nothing is saved from here: this module only DETECTS columns, converts rows, finds duplicates and builds a dry-run summary.
// The person always sees the column mapping and a preview first. Export formats change, so detection is by column NAME synonyms
// (and the person can correct any column); no app-specific format is assumed to be exact.
const { norm } = require('./foodSafety');

const key = (h) => String(h || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, '');
const SYN = {
  date: ['date', 'day', 'logdate', 'entrydate', 'datelogged', 'eatendate'],
  meal: ['meal', 'mealtype', 'mealname', 'category', 'mealtime'],
  food: ['food', 'foodname', 'name', 'item', 'description', 'fooditem', 'dish'],
  quantity: ['quantity', 'qty', 'amount', 'servings', 'numberofservings', 'servingqty'],
  unit: ['unit', 'servingunit', 'servingsize', 'serving'],
  calories: ['calories', 'kcal', 'energy', 'energykcal', 'cal', 'calorie'],
  protein: ['protein', 'proteins', 'proteing'],
  carbohydrates: ['carbohydrates', 'carbs', 'carbohydrate', 'totalcarbohydrates', 'carbsg'],
  fat: ['fat', 'fats', 'totalfat'],
  fiber: ['fiber', 'fibre', 'dietaryfiber', 'dietaryfibre'],
  sugar: ['sugar', 'sugars', 'totalsugars'],
  sodium: ['sodium'],
  weight: ['weight', 'bodyweight', 'weightkg', 'weightlb', 'weightlbs', 'weighin', 'mass'],
};
const FOOD_FIELDS = ['date', 'meal', 'food', 'calories', 'protein', 'carbohydrates', 'fat', 'fiber', 'sugar', 'sodium'];
const WEIGHT_FIELDS = ['date', 'weight'];

/** headers -> { mapping: {field: columnIndex}, kind, source } (fields it could not find are simply absent). */
function detect(headers) {
  const keys = headers.map(key);
  const mapping = {};
  for (const [field, names] of Object.entries(SYN)) {
    const idx = keys.findIndex((k, i) => names.includes(k) && !Object.values(mapping).includes(i));
    if (idx >= 0) mapping[field] = idx;
  }
  // "Fat (g)" etc. already reduce to the plain key. Prefer an exact "protein" over "proteing" duplicates: first match wins.
  const hasFood = mapping.date !== undefined && mapping.calories !== undefined;
  const hasWeight = mapping.date !== undefined && mapping.weight !== undefined && mapping.calories === undefined;
  const kind = hasFood ? 'food' : hasWeight ? 'weight' : 'unknown';
  const hk = keys.join(' ');
  const source = 'generic'; // column names only; no app-specific format is assumed
  return { mapping, kind, source, missing: (kind === 'weight' ? WEIGHT_FIELDS : FOOD_FIELDS).filter((f) => mapping[f] === undefined && ['date', 'calories', 'weight'].includes(f)) };
}

const pad = (n) => String(n).padStart(2, '0');
const validYmd = (y, m, d) => { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; };
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

/** -> { date: 'YYYY-MM-DD' | null, ambiguous: boolean }.  order is used for 03/04/2026 style dates: 'dmy' (default, India) or 'mdy'. */
function parseDate(raw, order = 'dmy') {
  const s = String(raw || '').trim().replace(/[T ]\d{1,2}:\d{2}.*$/, '');
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) return validYmd(+m[1], +m[2], +m[3]) ? { date: `${m[1]}-${pad(m[2])}-${pad(m[3])}`, ambiguous: false } : { date: null, ambiguous: false };
  m = /^(\d{1,2})[-/. ]([A-Za-z]{3,9})[-/. ,]*(\d{4})$/.exec(s) || null;
  if (m && MONTHS[m[2].slice(0, 4).toLowerCase()] || (m && MONTHS[m[2].slice(0, 3).toLowerCase()])) {
    const mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
    return validYmd(+m[3], mo, +m[1]) ? { date: `${m[3]}-${pad(mo)}-${pad(m[1])}`, ambiguous: false } : { date: null, ambiguous: false };
  }
  m = /^([A-Za-z]{3,9})[ ]+(\d{1,2}),?[ ]+(\d{4})$/.exec(s);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) { const mo = MONTHS[m[1].slice(0, 3).toLowerCase()]; return validYmd(+m[3], mo, +m[2]) ? { date: `${m[3]}-${pad(mo)}-${pad(m[2])}`, ambiguous: false } : { date: null, ambiguous: false }; }
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const a = +m[1], b = +m[2], y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    let d, mo, ambiguous = false;
    if (a > 12) { d = a; mo = b; } else if (b > 12) { d = b; mo = a; } else { ambiguous = a !== b; if (order === 'mdy') { mo = a; d = b; } else { d = a; mo = b; } }
    return validYmd(y, mo, d) ? { date: `${y}-${pad(mo)}-${pad(d)}`, ambiguous } : { date: null, ambiguous: false };
  }
  return { date: null, ambiguous: false };
}

const MEAL_WORDS = [['breakfast', /breakfast|morning meal|nashta|tiffin/], ['lunch', /lunch|afternoon|midday/], ['dinner', /dinner|supper|night/], ['snacks', /snack|brunch|evening|tea|other|dessert/]];
function parseMeal(raw) {
  const s = String(raw || '').toLowerCase();
  for (const [id, re] of MEAL_WORDS) if (re.test(s)) return { meal: id, guessed: false };
  return { meal: 'snacks', guessed: true };
}

/** "1,234.5" / "1234,5" / "12 g" / "" -> number or null. */
function num(raw) {
  if (raw === undefined || raw === null) return null;
  let s = String(raw).trim().replace(/[^\d.,-]/g, '');
  if (!s || s === '-') return null;
  if (/,\d{1,2}$/.test(s) && !/\./.test(s)) s = s.replace(',', '.'); else s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const LB_TO_KG = 0.45359237, ST_TO_KG = 6.35029318;
/** weight cell + the header text / unit column -> kilograms (null when it cannot be read). Pounds are recognised by "lb" in the header or cell. */
function toKg(raw, header = '', unitCol = '') {
  const n = num(raw);
  if (n === null) return null;
  const ctx = `${header} ${unitCol} ${raw}`.toLowerCase();
  const kg = /\b(lbs?|pounds?)\b|lb\b/.test(ctx) ? n * LB_TO_KG : /\b(st|stone)\b/.test(ctx) ? n * ST_TO_KG : n;
  return kg >= 20 && kg <= 400 ? Math.round(kg * 100) / 100 : null;
}

const dupKey = (date, meal, name, kcal) => `${date}|${meal}|${norm(name)}|${Math.round(kcal)}`;

/**
 * Turns CSV rows into food-log rows. Rows without a readable date or calories are skipped with a reason; macros that are blank are left
 * at 0 and counted in `blankMacros` (never made up). existing = [{date, mealType, foodName, calories}] already in the app.
 */
function buildFood(rows, mapping, { order = 'dmy', existing = [], mealDefault = 'snacks' } = {}) {
  const seen = new Set(existing.map((e) => dupKey(e.date, e.mealType, e.foodName, e.calories)));
  const out = [], problems = [], dupes = [];
  let ambiguousDates = 0, guessedMeals = 0, blankMacros = 0;
  const cell = (r, f) => (mapping[f] === undefined ? '' : r[mapping[f]]);
  rows.forEach((r, i) => {
    const line = i + 2;
    const d = parseDate(cell(r, 'date'), order);
    if (!d.date) { problems.push({ line, message: `Could not read the date "${cell(r, 'date')}".` }); return; }
    const kcal = num(cell(r, 'calories'));
    if (kcal === null || kcal < 0 || kcal > 10000) { problems.push({ line, message: `Calories "${cell(r, 'calories')}" could not be used.` }); return; }
    const name = String(cell(r, 'food') || '').trim().slice(0, 120) || 'Imported entry';
    const mealRaw = cell(r, 'meal');
    const mm = mapping.meal === undefined || String(mealRaw).trim() === '' ? { meal: mealDefault, guessed: mapping.meal !== undefined } : parseMeal(mealRaw);
    if (d.ambiguous) ambiguousDates += 1;
    if (mm.guessed) guessedMeals += 1;
    const n = {};
    for (const f of ['protein', 'carbohydrates', 'fat', 'fiber', 'sugar', 'sodium']) {
      const v = num(cell(r, f));
      if (v === null) { if (mapping[f] !== undefined || ['protein', 'carbohydrates', 'fat'].includes(f)) blankMacros += 1; n[f] = 0; } else n[f] = Math.max(0, Math.min(100000, v));
    }
    const row = { line, date: d.date, mealType: mm.meal, name, calories: Math.round(kcal * 10) / 10, ...n };
    const k = dupKey(row.date, row.mealType, row.name, row.calories);
    if (seen.has(k)) { dupes.push(row); return; }
    seen.add(k); out.push(row);
  });
  return { rows: out, problems, duplicates: dupes, ambiguousDates, guessedMeals, blankMacros };
}

/** Weight rows. existing = [{date, weightKg}] ; a same-day weight within 0.05 kg counts as a duplicate. */
function buildWeight(rows, mapping, { order = 'dmy', existing = [], headers = [] } = {}) {
  const byDate = new Map(existing.map((e) => [e.date, e.weightKg]));
  const out = [], problems = [], dupes = [];
  let ambiguousDates = 0;
  const h = headers[mapping.weight] || '';
  rows.forEach((r, i) => {
    const line = i + 2;
    const d = parseDate(r[mapping.date], order);
    if (!d.date) { problems.push({ line, message: `Could not read the date "${r[mapping.date]}".` }); return; }
    const kg = toKg(r[mapping.weight], h, mapping.unit !== undefined ? r[mapping.unit] : '');
    if (kg === null) { problems.push({ line, message: `Weight "${r[mapping.weight]}" could not be used (expected 20 to 400 kg).` }); return; }
    if (d.ambiguous) ambiguousDates += 1;
    const row = { line, date: d.date, weightKg: kg };
    const old = byDate.get(row.date);
    if (old !== undefined && Math.abs(old - kg) < 0.05) { dupes.push(row); return; }
    byDate.set(row.date, kg); out.push(row);
  });
  return { rows: out, problems, duplicates: dupes, ambiguousDates };
}

/** The dry-run summary shown before anything is saved. */
function summarize(kind, built, { sample = 8 } = {}) {
  const dates = built.rows.map((r) => r.date).sort();
  const s = {
    kind, toImport: built.rows.length, duplicates: built.duplicates.length, problems: built.problems.length,
    from: dates[0] || null, to: dates[dates.length - 1] || null, days: new Set(dates).size,
    ambiguousDates: built.ambiguousDates || 0, sample: built.rows.slice(0, sample), problemSample: built.problems.slice(0, 5),
  };
  if (kind === 'food') { s.totalKcal = Math.round(built.rows.reduce((t, r) => t + r.calories, 0)); s.guessedMeals = built.guessedMeals; s.blankMacros = built.blankMacros; }
  return s;
}

/** Cult.fit: no public export was found. This text is shown in the import screen instead of pretending. */
const CULT_NOTE = 'cult.fit does not offer a food or weight export that we could find. If you can get a spreadsheet or CSV from them, this screen can read it. Otherwise your weight history can be typed in or pasted as "date, weight" lines.';

module.exports = { detect, parseDate, parseMeal, num, toKg, buildFood, buildWeight, summarize, dupKey, SYN, FOOD_FIELDS, WEIGHT_FIELDS, CULT_NOTE };
