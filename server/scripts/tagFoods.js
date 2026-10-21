#!/usr/bin/env node
// Food tag review tool.   node scripts/tagFoods.js                 rebuild data/foodTags.json and data/foodTags.gaps.csv
//                         node scripts/tagFoods.js --check         exit 1 when the generated files are out of date
//                         node scripts/tagFoods.js --import f.csv  merge the cells you filled in (cuisine, cookMin, equipment, spice, cost) into
//                                                                  data/foodTags.overrides.json, then rebuild
//
// Nothing is invented: a value is written only when the food's name or catalogue section says it (see lib/foodTags.js). Every food with an
// empty field is listed in the gaps file. cuisine = comma list from lib/foodTags.js CUISINES; cookMin = minutes (0 = no cooking);
// equipment = comma list (stove, pressure cooker, microwave, air fryer, oven, steamer, blender ...; leave empty for no-cook);
// spice = mild | medium | hot; cost = low | mid | high.
const fs = require('fs');
const path = require('path');
const { CATALOGUE } = require('../lib/foodCatalogue');
const { FOODS: CURATED } = require('../lib/healthyDiet');
const T = require('../lib/foodTags');

const LIB = path.join(__dirname, '..', 'lib');
const norm = T.norm;
const unq = (s) => s.replace(/\\(.)/g, '$1');

/** name -> catalogue section, read from the section comments in the catalogue source files (the order they are merged in). */
function sectionsByName() {
  const map = new Map();
  for (const file of ['foodCatalogue.js', 'indianFoods.js', 'indianFoods2.js', 'indianFoods3.js']) {
    let section = '';
    for (const line of fs.readFileSync(path.join(LIB, file), 'utf8').split('\n')) {
      const h = line.match(/^\s*\/\/\s*(?:-+\s*)?([A-Z][^\n]*)$/);
      if (h && /^\s{2}\/\//.test(line)) { section = h[1].trim(); continue; }
      const r = line.match(/^\s*\[\s*(['"])((?:\\.|(?!\1).)*)\1\s*,/);
      if (r) { const k = norm(unq(r[2])); if (!map.has(k)) map.set(k, section); }
    }
  }
  return map;
}

function build() {
  const sections = sectionsByName();
  const rows = [];
  const seen = new Set();
  for (const f of CATALOGUE) { const k = norm(f.name); if (seen.has(k)) continue; seen.add(k); rows.push({ name: f.name, section: sections.get(k) || '' }); }
  for (const f of CURATED) { const k = norm(f.name); if (seen.has(k)) continue; seen.add(k); rows.push({ name: f.name, section: 'Curated healthy pool' }); }
  const tags = {};
  for (const r of rows) tags[norm(r.name)] = { name: r.name, section: r.section, ...T.deriveTags(r.name, r.section) };
  return { rows, tags };
}

const csvCell = (v) => { const s = v === null || v === undefined ? '' : Array.isArray(v) ? v.join(',') : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function toCsv(rows, tags) {
  const head = ['name', 'section', 'missing', 'cuisine', 'cookMin', 'equipment', 'spice', 'cost'];
  const lines = [head.join(',')];
  for (const r of rows) {
    const t = T.tagsFor(r.name, r.section);
    const missing = T.missingFields(t);
    if (!missing.length) continue;
    lines.push([r.name, r.section, missing.join(' '), t.cuisine, t.cookMin, t.equipment, t.spice, t.cost].map(csvCell).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i += 1; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

function importCsv(file) {
  const [head, ...rows] = parseCsv(fs.readFileSync(file, 'utf8'));
  const idx = Object.fromEntries(head.map((h, i) => [h.trim(), i]));
  const ovPath = path.join(T.DATA_DIR, 'foodTags.overrides.json');
  const ov = fs.existsSync(ovPath) ? JSON.parse(fs.readFileSync(ovPath, 'utf8')) : {};
  const sections = sectionsByName();
  let changed = 0; const problems = [];
  for (const r of rows) {
    const name = r[idx.name]; if (!name) continue;
    const key = norm(name);
    const base = T.deriveTags(name, sections.get(key) || '');
    for (const f of ['cuisine', 'cookMin', 'equipment', 'spice', 'cost']) {
      if (idx[f] === undefined) continue;
      const raw = (r[idx[f]] || '').trim();
      if (raw === '') continue;
      const clean = T.CLEAN[f](raw);
      if (clean === null) { problems.push(`${name}: "${raw}" is not a valid ${f}`); continue; }
      if (JSON.stringify(clean) === JSON.stringify(base[f])) continue;     // same as what the rules already say
      (ov[key] ||= {})[f] = clean; changed += 1;
    }
  }
  fs.writeFileSync(ovPath, `${JSON.stringify(ov, null, 2)}\n`);
  return { changed, problems };
}

function write() {
  const { rows, tags } = build();
  const gen = { _note: 'Generated by scripts/tagFoods.js from food names and catalogue sections. Do not edit: put your values in foodTags.overrides.json (or fill foodTags.gaps.csv and import it).', count: rows.length, tags };
  fs.writeFileSync(path.join(T.DATA_DIR, 'foodTags.json'), `${JSON.stringify(gen, null, 1)}\n`);
  T.reloadTags();
  fs.writeFileSync(path.join(T.DATA_DIR, 'foodTags.gaps.csv'), toCsv(rows, tags));
  return rows;
}

function summary(rows) {
  const miss = { cuisine: 0, cookMin: 0, equipment: 0, spice: 0, cost: 0 };
  let complete = 0;
  for (const r of rows) { const m = T.missingFields(T.tagsFor(r.name, r.section)); if (!m.length) complete += 1; for (const f of m) miss[f] += 1; }
  return { foods: rows.length, complete, gaps: miss };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args[0] === '--check') {
    const { rows, tags } = build();
    const cur = (() => { try { return JSON.parse(fs.readFileSync(path.join(T.DATA_DIR, 'foodTags.json'), 'utf8')).tags; } catch { return null; } })();
    const same = cur && JSON.stringify(cur) === JSON.stringify(tags);
    console.log(same ? `foodTags.json is up to date (${rows.length} foods)` : 'foodTags.json is out of date: run  node scripts/tagFoods.js');
    process.exit(same ? 0 : 1);
  }
  if (args[0] === '--import') {
    if (!args[1]) { console.error('usage: node scripts/tagFoods.js --import data/foodTags.gaps.csv'); process.exit(2); }
    const r = importCsv(path.resolve(args[1]));
    console.log(`Imported ${r.changed} value(s).`); r.problems.forEach((p) => console.log(`  skipped: ${p}`));
  }
  const rows = write();
  const s = summary(rows);
  console.log(`Tagged ${s.foods} foods. Fully tagged: ${s.complete}. Still empty: ${Object.entries(s.gaps).map(([k, v]) => `${k} ${v}`).join(', ')}.`);
  console.log('Fill the blanks in data/foodTags.gaps.csv (or data/foodTags.overrides.json) and run:  node scripts/tagFoods.js --import data/foodTags.gaps.csv');
}

module.exports = { build, sectionsByName, toCsv, parseCsv, importCsv, summary };
