// Small dependency-free input validators. Every function either returns a
// clean value or throws HttpError(400) so routes stay short and consistent.
const { HttpError } = require('./http');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isValidDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const c = new Date(Date.UTC(y, m - 1, d));
  return c.getUTCFullYear() === y && c.getUTCMonth() === m - 1 && c.getUTCDate() === d;
}

function date(value, field = 'date') {
  if (!isValidDate(value)) throw new HttpError(400, `${field} must be a valid YYYY-MM-DD date`);
  return value;
}

function time(value, { optional = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return '';
    throw new HttpError(400, 'time is required');
  }
  if (typeof value !== 'string' || !TIME_RE.test(value)) throw new HttpError(400, 'time must be HH:mm (24h)');
  return value;
}

function number(value, field, { min = -Infinity, max = Infinity, required = true, def } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required && def === undefined) throw new HttpError(400, `${field} is required`);
    return def;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) throw new HttpError(400, `${field} must be a number`);
  if (n < min || n > max) throw new HttpError(400, `${field} must be between ${min} and ${max}`);
  return n;
}

function string(value, field, { max = 200, required = false, def = '' } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new HttpError(400, `${field} is required`);
    return def;
  }
  if (typeof value !== 'string') throw new HttpError(400, `${field} must be text`);
  const s = value.trim();
  if (required && !s) throw new HttpError(400, `${field} is required`);
  if (s.length > max) throw new HttpError(400, `${field} must be at most ${max} characters`);
  return s;
}

function oneOf(value, field, allowed, def) {
  if (value === undefined || value === null || value === '') {
    if (def !== undefined) return def;
    throw new HttpError(400, `${field} is required`);
  }
  if (!allowed.includes(value)) throw new HttpError(400, `${field} must be one of: ${allowed.join(', ')}`);
  return value;
}

/** Like number(), but `null`/'' is allowed and returned as null (used for clearable profile fields). */
function nullableNumber(value, field, opts = {}) {
  if (value === null || value === '') return null;
  return number(value, field, { ...opts, required: true });
}

function bool(value, field) {
  if (typeof value !== 'boolean') throw new HttpError(400, `${field} must be true or false`);
  return value;
}

/** Optional client-generated id used to make offline-queued writes idempotent. */
function clientId(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > 80 || !/^[\w.:-]+$/.test(value)) {
    throw new HttpError(400, 'clientId is invalid');
  }
  return value;
}

/** Escapes user input before it is used inside a RegExp (prevents ReDoS / regex injection). */
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function objectId(value, field = 'id') {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) throw new HttpError(400, `${field} is invalid`);
  return value;
}

module.exports = { isValidDate, date, time, number, nullableNumber, bool, string, oneOf, clientId, escapeRegex, objectId, TIME_RE };
