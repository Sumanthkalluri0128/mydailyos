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

module.exports = { toCsv, cell };
