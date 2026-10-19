// Parses the optional micronutrient fields of a food body. A field that is ABSENT stays absent (so an older client that
// doesn't send it can never wipe saved values); blank/null means "unknown" and is stored as null; 0 is a real zero.
const { KEYS } = require('./rda');
const { HttpError } = require('./http');

const MAX = { iron: 500, calcium: 20000, potassium: 20000, magnesium: 5000, zinc: 500, vitaminA: 100000, vitaminB12: 10000, vitaminC: 10000, vitaminD: 5000, folate: 10000 };

function parseMicros(body = {}) {
  const out = {};
  for (const k of KEYS) {
    if (!Object.prototype.hasOwnProperty.call(body, k)) continue;
    const raw = body[k];
    if (raw === null || raw === undefined || raw === '') { out[k] = null; continue; }
    const n = Number(String(raw).replace(/,/g, ''));
    if (!Number.isFinite(n) || n < 0 || n > MAX[k]) throw new HttpError(400, `${k} must be a number between 0 and ${MAX[k]}`);
    out[k] = Math.round(n * 100) / 100;
  }
  return out;
}
module.exports = { parseMicros, MAX };
