// Minimal RFC-4180 CSV writer with spreadsheet-formula-injection protection.
function cell(value) {
  if (value === null || value === undefined) return '';
  let s = typeof value === 'number' ? String(value) : String(value);
  // A text cell starting with = + - @ would be executed as a formula by Excel/Sheets.
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers, rows) {
  const lines = [headers.map(cell).join(',')];
  for (const row of rows) lines.push(headers.map((h) => cell(row[h])).join(','));
  return lines.join('\r\n') + '\r\n';
}

/** RFC-4180 reader: quoted cells, doubled quotes, CRLF or LF, a leading byte-order mark. Returns an array of rows (arrays of strings). */
function parseCsv(text) {
  const t = String(text || '').replace(/^\uFEFF/, '');
  const rows = []; let row = [], c = '', q = false;
  for (let i = 0; i < t.length; i += 1) {
    const ch = t[i];
    if (q) { if (ch === '"' && t[i + 1] === '"') { c += '"'; i += 1; } else if (ch === '"') q = false; else c += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(c); c = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i += 1; row.push(c); rows.push(row); row = []; c = ''; }
    else c += ch;
  }
  if (c !== '' || row.length) { row.push(c); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim() !== ''));
}

module.exports = { toCsv, cell, parseCsv };
