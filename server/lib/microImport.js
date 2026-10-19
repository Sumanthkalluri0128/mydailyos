// Reads data/micronutrients.csv and turns it into validated per-food updates. Pure (no database).
const fs = require('fs');
const path = require('path');
const { KEYS } = require('./rda');
const { MAX } = require('./microParse');

const FILE = path.join(__dirname, '..', 'data', 'micronutrients.csv');
const COLUMN = { sodium_mg: 'sodium', iron_mg: 'iron', calcium_mg: 'calcium', potassium_mg: 'potassium', magnesium_mg: 'magnesium', zinc_mg: 'zinc', vitaminA_ug_rae: 'vitaminA', vitaminB12_ug: 'vitaminB12', vitaminC_mg: 'vitaminC', vitaminD_ug: 'vitaminD', folate_ug: 'folate' };

/** Minimal RFC-4180 style parser (quotes, commas inside quotes, CRLF). */
function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  const s = String(text).replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i += 1; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i += 1; row.push(cell); cell = ''; if (row.some((x) => x !== '')) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell); if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

/** @returns {{updates: Array<{name, set}>, problems: string[]}} */
function buildUpdates(csvText) {
  const [head, ...body] = parseCsv(csvText);
  const problems = []; const updates = [];
  if (!head) return { updates, problems: ['empty file'] };
  const idx = Object.fromEntries(head.map((h, i) => [h.trim(), i]));
  if (idx.name === undefined) return { updates, problems: ['missing "name" column'] };
  const seen = new Set();
  body.forEach((r, n) => {
    const line = n + 2;
    const name = (r[idx.name] || '').trim();
    if (!name) return;
    if (seen.has(name.toLowerCase())) problems.push(`line ${line}: duplicate food "${name}"`);
    seen.add(name.toLowerCase());
    const set = {};
    for (const [col, key] of Object.entries(COLUMN)) {
      const raw = idx[col] === undefined ? '' : String(r[idx[col]] ?? '').trim();
      if (raw === '') continue; // blank = unknown: never written, never turned into 0
      const v = Number(raw.replace(/,/g, ''));
      const max = key === 'sodium' ? 100000 : MAX[key];
      if (!Number.isFinite(v) || v < 0 || v > max) { problems.push(`line ${line} (${name}): ${col} "${raw}" is not a number between 0 and ${max}`); continue; }
      set[key] = v;
    }
    if (!Object.keys(set).length) return;
    const source = idx.source === undefined ? '' : String(r[idx.source] || '').trim();
    if (!source) { problems.push(`line ${line} (${name}): has values but no source`); return; }
    const verified = /^(y|yes|true|1)$/i.test(idx.verified === undefined ? '' : String(r[idx.verified] || '').trim());
    updates.push({ name, set: { ...set, dataSource: source.slice(0, 160), verified } });
  });
  return { updates, problems };
}

function loadFile(file = FILE) { return buildUpdates(fs.readFileSync(file, 'utf8')); }

module.exports = { FILE, COLUMN, KEYS, parseCsv, buildUpdates, loadFile };
