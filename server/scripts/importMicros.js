#!/usr/bin/env node
// Micronutrient data tool (re-runnable, nothing is invented).
//   node scripts/importMicros.js                  rebuild data/foodMicros.template.csv: every catalogue food, with the values already known
//   node scripts/importMicros.js --import f.csv   merge the rows you filled in into data/foodMicros.json, then rebuild the template
//   node scripts/importMicros.js --check          validate data/foodMicros.json (sources present, no negatives, plausible limits); exit 1 on problems
//
// Where the numbers come from: Indian Food Composition Tables 2017 (IFCT, NIN Hyderabad) first, USDA FoodData Central where IFCT lacks the item.
// Both are free; this tool has no internet access of its own: copy the per-SERVING value (IFCT and USDA list per 100 g: scale to the catalogue serving)
// into the CSV and write where it came from in `source` (for example "IFCT 2017 T12 A015" or "USDA FDC 173757"). A row with values but no source is
// REJECTED. Leave a cell empty when you do not know it. Units: iron, calcium, potassium, magnesium, zinc, vitaminC, sodium in mg; vitaminA in ug RAE;
// vitaminB12, vitaminD, folate in ug.
const fs = require('fs');
const path = require('path');
const { CATALOGUE } = require('../lib/foodCatalogue');
const { MICROS, auditMicros } = require('../lib/micro');

const DATA = path.join(__dirname, '..', 'data');
const JSON_FILE = path.join(DATA, 'foodMicros.json');
const TEMPLATE = path.join(DATA, 'foodMicros.template.csv');
const COLS = [...MICROS.map((m) => m.field), 'sodium'];
const norm = (n) => String(n || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

const read = () => { try { return JSON.parse(fs.readFileSync(JSON_FILE, 'utf8')); } catch { return { foods: {} }; } };
const csvCell = (s) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i += 1; row.push(cell); cell = ''; if (row.some((x) => x !== '')) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell); if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

function buildTemplate(db) {
  const head = ['name', 'serving', ...COLS, 'source'];
  const lines = [head.join(',')];
  const known = new Map(Object.entries(db.foods || {}).map(([k, v]) => [norm(k), v]));
  for (const f of CATALOGUE) {
    const k = known.get(norm(f.name)) || {};
    lines.push([f.name, `${f.servingSize} ${f.servingUnit}`, ...COLS.map((c) => (k[c] ?? (c === 'sodium' && f.sodium > 0 ? '' : ''))), k.source || ''].map(csvCell).join(','));
  }
  fs.writeFileSync(TEMPLATE, `${lines.join('\n')}\n`);
  return CATALOGUE.length;
}

function importCsv(file, db) {
  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  const head = rows.shift().map((h) => h.trim());
  const idx = Object.fromEntries(head.map((h, i) => [h, i]));
  if (idx.name === undefined) throw new Error('The CSV needs a "name" column');
  const valid = new Set(CATALOGUE.map((f) => norm(f.name)));
  const out = { accepted: 0, rejected: [] };
  db.foods = db.foods || {};
  for (const r of rows) {
    const name = (r[idx.name] || '').trim(); if (!name) continue;
    const vals = {}; let n = 0;
    for (const c of COLS) {
      const raw = idx[c] === undefined ? '' : String(r[idx[c]] ?? '').trim();
      if (raw === '') continue;
      const x = Number(raw);
      if (!Number.isFinite(x) || x < 0) { out.rejected.push(`${name}: ${c} "${raw}" is not a number of 0 or more`); vals.__bad = true; continue; }
      vals[c] = x; n += 1;
    }
    if (vals.__bad) continue;
    if (!n) continue;
    const source = idx.source === undefined ? '' : String(r[idx.source] || '').trim();
    if (!source) { out.rejected.push(`${name}: has values but no source`); continue; }
    if (!valid.has(norm(name))) { out.rejected.push(`${name}: not in the catalogue`); continue; }
    db.foods[name] = { ...(db.foods[name] || {}), ...vals, source };
    out.accepted += 1;
  }
  return out;
}

function check(db) {
  const issues = [];
  for (const [name, row] of Object.entries(db.foods || {})) if (!row.source) issues.push({ name, type: 'micro_no_source', msg: 'no source' });
  const fake = Object.keys(db.foods || {}).map((name) => ({ name, userId: null, servingSize: 1, servingUnit: 'serving' }));
  return [...issues.filter((i) => i.type === 'micro_no_source'), ...auditMicros(fake, new Map(Object.entries(db.foods || {}).map(([k, v]) => [norm(k), v])))].filter((x, i, a) => a.findIndex((y) => y.name === x.name && y.type === x.type) === i);
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const db = read();
  if (argv.includes('--check')) {
    const issues = check(db);
    console.log(`${Object.keys(db.foods || {}).length} food(s) with micronutrient data, ${issues.length} issue(s)`);
    issues.forEach((i) => console.log(` - ${i.name}: ${i.msg}`));
    process.exit(issues.length ? 1 : 0);
  }
  const at = argv.indexOf('--import');
  if (at >= 0) {
    const r = importCsv(path.resolve(argv[at + 1] || ''), db);
    fs.writeFileSync(JSON_FILE, `${JSON.stringify(db, null, 2)}\n`);
    console.log(`Accepted ${r.accepted} row(s); rejected ${r.rejected.length}`);
    r.rejected.slice(0, 50).forEach((m) => console.log(` - ${m}`));
  }
  console.log(`Template written for ${buildTemplate(db)} foods: ${path.relative(process.cwd(), TEMPLATE)}`);
}
module.exports = { parseCsv, importCsv, check, COLS };
