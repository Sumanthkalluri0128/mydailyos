// A small schema layer for request bodies (zod-shaped, no dependency). One declaration says what a route accepts; anything else is
// refused with a clear 400 BEFORE the handler runs, and unknown keys are dropped so a handler can never see fields it did not ask for.
//   router.post('/rough', body(s.object({ on: s.boolean(), today: s.date() })), handler)
// Types are forgiving about how they arrive ("7" for 7, "true" for true) because phones and forms send both.
const { isValidDate } = require('./validate');

const fail = (msg) => ({ ok: false, error: msg });
const good = (value) => ({ ok: true, value });
const missing = (v) => v === undefined || v === null || v === '';

const make = (parse, optional) => ({ parse, optional });

const s = {
  string({ min = 0, max = 200, oneOf, optional = true, trim = true } = {}) {
    return make((v, path) => {
      if (typeof v !== 'string') return fail(`${path} must be text`);
      const t = trim ? v.trim() : v;
      if (t.length < min) return fail(`${path} must be at least ${min} characters`);
      if (t.length > max) return fail(`${path} must be at most ${max} characters`);
      if (oneOf && !oneOf.includes(t)) return fail(`${path} must be one of: ${oneOf.join(', ')}`);
      return good(t);
    }, optional);
  },
  number({ min = -Infinity, max = Infinity, int = false, optional = true } = {}) {
    return make((v, path) => {
      const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
      if (typeof n !== 'number' || !Number.isFinite(n)) return fail(`${path} must be a number`);
      if (int && !Number.isInteger(n)) return fail(`${path} must be a whole number`);
      if (n < min || n > max) return fail(`${path} must be between ${min} and ${max}`);
      return good(n);
    }, optional);
  },
  /** Anything JSON (number, text, true/false, list, object) up to a size: for fields whose type depends on the caller. */
  any({ maxJson = 5000, optional = true } = {}) {
    return make((v, path) => {
      let size = 0; try { size = JSON.stringify(v).length; } catch { return fail(`${path} is not valid`); }
      return size > maxJson ? fail(`${path} is too large`) : good(v);
    }, optional);
  },
  boolean({ optional = true } = {}) {
    return make((v, path) => (typeof v === 'boolean' ? good(v) : v === 'true' ? good(true) : v === 'false' ? good(false) : fail(`${path} must be true or false`)), optional);
  },
  date({ optional = true } = {}) {
    return make((v, path) => (typeof v === 'string' && isValidDate(v) ? good(v) : fail(`${path} must be a date like 2026-11-05`)), optional);
  },
  array(item, { max = 100, optional = true } = {}) {
    return make((v, path) => {
      if (!Array.isArray(v)) return fail(`${path} must be a list`);
      if (v.length > max) return fail(`${path} can have at most ${max} items`);
      const out = [];
      for (let i = 0; i < v.length; i += 1) { const r = item.parse(v[i], `${path}[${i}]`); if (!r.ok) return r; out.push(r.value); }
      return good(out);
    }, optional);
  },
  object(shape, { strict = false, passthrough = false, optional = true } = {}) {
    return make((v, path) => {
      if (typeof v !== 'object' || v === null || Array.isArray(v)) return fail(`${path || 'body'} must be an object`);
      const out = passthrough ? { ...v } : {};            // passthrough: keep fields the schema does not name (checked ones are still cleaned)
      for (const [key, rule] of Object.entries(shape)) {
        const at = path ? `${path}.${key}` : key;
        if (missing(v[key])) { if (!rule.optional) return fail(`${at} is required`); continue; }
        const r = rule.parse(v[key], at); if (!r.ok) return r;
        out[key] = r.value;
      }
      if (strict) { const extra = Object.keys(v).filter((k) => !(k in shape)); if (extra.length) return fail(`${path ? `${path}.` : ''}${extra[0]} is not allowed`); }
      return good(out);
    }, optional);
  },
  required(rule) { return { ...rule, optional: false }; },
};

/** Express middleware: validate req.body (a missing body counts as {}). On success req.body becomes the cleaned copy. */
const body = (schema) => (req, res, next) => {
  const r = schema.parse(req.body == null ? {} : req.body, '');
  if (!r.ok) return res.status(400).json({ success: false, message: r.error });
  req.body = r.value;
  return next();
};

module.exports = { s, body };
